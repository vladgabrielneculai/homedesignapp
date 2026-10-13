import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { getEntry } from '../catalog/catalog'
import { bounds, pointInPolygon, polygonArea, polygonCentroid } from '../lib/geometry'
import type { Design, Pt } from '../types'
import { HouseScene, LocalEnvironment, RoomLights, SunLight } from './HouseScene'

/** Canvases register here so toolbar buttons can grab a PNG of any open 3D view. */
const canvases = new Map<string, HTMLCanvasElement>()

export function capture3D(key: string, maxWidth?: number): string | null {
  const c = canvases.get(key)
  if (!c) return null
  if (!maxWidth || c.width <= maxWidth) return c.toDataURL('image/png')
  const scale = maxWidth / c.width
  const out = document.createElement('canvas')
  out.width = Math.round(c.width * scale)
  out.height = Math.round(c.height * scale)
  out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.8)
}

const EYE_HEIGHT = 1.6

function designFrame(design: Design) {
  const pts = [...design.walls.flatMap((w) => [w.a, w.b]), ...design.items.map((i) => ({ x: i.x, y: i.y }))]
  const b = pts.length ? bounds(pts) : { minX: -3, minY: -3, maxX: 3, maxY: 3 }
  const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2)
  const radius = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2)
  const biggest = [...design.rooms].sort((a, c) => polygonArea(c.points) - polygonArea(a.points))[0]
  const look = biggest ? polygonCentroid(biggest.points) : { x: center.x, y: center.z }
  const eye = biggest ? standingSpot(design, biggest.points) : look
  return { center, radius, eye: new THREE.Vector3(eye.x, EYE_HEIGHT, eye.y), look: new THREE.Vector3(look.x, EYE_HEIGHT - 0.1, look.y) }
}

/** The most open floor spot in a room (farthest from furniture and walls), for the eye-level camera. */
function standingSpot(design: Design, poly: Pt[]): Pt {
  const b = bounds(poly)
  const center = polygonCentroid(poly)
  let best = center
  let bestScore = -Infinity
  for (let x = b.minX + 0.4; x <= b.maxX - 0.4; x += 0.2)
    for (let y = b.minY + 0.4; y <= b.maxY - 0.4; y += 0.2) {
      const p = { x, y }
      if (!pointInPolygon(p, poly)) continue
      let clear = Math.min(x - b.minX, b.maxX - x, y - b.minY, b.maxY - y)
      for (const it of design.items) {
        const e = getEntry(it.catalogId)
        if (e.symbol === 'rug' || (it.elevation ?? 0) > 1.8) continue
        clear = Math.min(clear, Math.hypot(it.x - x, it.y - y) - Math.max(e.w, e.d) / 2)
      }
      // Prefer open spots, then ones with a good view across the room.
      const score = Math.min(clear, 1.2) + Math.hypot(x - center.x, y - center.y) * 0.15
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
  return best
}

type Frame = ReturnType<typeof designFrame>

function CameraRig({ frame, eyeLevel, steep, resetToken, controls }: { frame: Frame; eyeLevel: boolean; steep?: boolean; resetToken: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const { center, radius, eye } = frame
    if (eyeLevel) {
      // Stand in the room and look across it; orbiting a target 0.6 m ahead feels like turning your head.
      // Look towards the room's middle (or north if standing on it).
      const dir = new THREE.Vector3(frame.look.x - eye.x, 0, frame.look.z - eye.z)
      if (dir.lengthSq() < 0.01) dir.set(0, 0, -1)
      dir.normalize().multiplyScalar(0.6)
      camera.position.copy(eye)
      controls.current?.target.set(eye.x + dir.x, eye.y - 0.05, eye.z + dir.z)
      camera.fov = 65
    } else if (steep) {
      camera.position.set(center.x + radius * 0.55, radius * 1.9 + 2.5, center.z + radius * 1.05)
      controls.current?.target.copy(center)
      camera.fov = 45
    } else {
      camera.position.set(center.x + radius * 0.9, radius * 1.35 + 1.5, center.z + radius * 1.35)
      controls.current?.target.copy(center)
      camera.fov = 45
    }
    camera.near = 0.05
    camera.far = 500
    camera.updateProjectionMatrix()
    controls.current?.update()
    invalidate()
    // Only re-frame when explicitly asked (project switch, view switch or reset), not on every edit.
  }, [resetToken, eyeLevel, camera])
  return null
}

function RegisterCanvas({ id }: { id: string }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    canvases.set(id, gl.domElement)
    return () => {
      if (canvases.get(id) === gl.domElement) canvases.delete(id)
    }
  }, [gl, id])
  return null
}

const PREF_KEY = 'home-designer-view-prefs'

function loadPrefs(): { realistic: boolean } {
  try {
    return { realistic: true, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
  } catch {
    return { realistic: true }
  }
}

export interface Viewer3DProps {
  id: string
  design: Design
  /** Changing this re-frames the camera. */
  frameKey: string
  label?: string
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  compact?: boolean
  /** Showing a single room: look down more steeply so its walls don't hide the inside. */
  singleRoom?: boolean
}

export function Viewer3D({ id, design, frameKey, label, selectedItemId, onSelectItem, compact, singleRoom }: Viewer3DProps) {
  const [lowWalls, setLowWalls] = useState(!!singleRoom)
  // Open a single room with the walls cut down so nothing hides behind the near wall.
  const [wasSingle, setWasSingle] = useState(singleRoom)
  if (wasSingle !== singleRoom) {
    setWasSingle(singleRoom)
    setLowWalls(!!singleRoom)
  }
  const [evening, setEvening] = useState(false)
  const [eyeLevel, setEyeLevel] = useState(false)
  const [realistic, setRealistic] = useState(() => (compact ? false : loadPrefs().realistic))
  const [resetToken, setResetToken] = useState(0)
  const controls = useRef<OrbitControlsImpl | null>(null)
  const frame = useMemo(() => designFrame(design), [design])
  // Camera placement is only recomputed on project/variant switch or "Reset view", not on every edit.
  const [framed, setFramed] = useState(frame)
  const latestFrame = useRef(frame)
  latestFrame.current = frame

  useEffect(() => {
    setFramed(latestFrame.current)
    setResetToken((t) => t + 1)
  }, [frameKey])

  const toggleRealistic = () => {
    setRealistic((v) => {
      if (!compact)
        try {
          localStorage.setItem(PREF_KEY, JSON.stringify({ realistic: !v }))
        } catch {
          /* preference only */
        }
      return !v
    })
  }

  const sky = evening ? '#1b2130' : '#dfe6ec'
  const walls = lowWalls && !eyeLevel

  return (
    <div className="viewer3d">
      <Canvas
        // Remount when switching effects so the renderer's tone mapping matches the pipeline.
        key={realistic ? 'fx' : 'plain'}
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: !realistic, toneMapping: realistic ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping }}
        camera={{ fov: 45, position: [10, 10, 10] }}
        onPointerMissed={() => onSelectItem?.(null)}
      >
        <color attach="background" args={[sky]} />
        <fog attach="fog" args={[sky, framed.radius * 5, framed.radius * 12]} />
        <hemisphereLight args={['#f4f7ff', '#a89f92', evening ? 0.06 : 0.55]} />
        <SunLight center={framed.center} radius={framed.radius} intensity={evening ? 0.12 : 2.4} color={evening ? '#9db4ff' : '#fff4e0'} />
        <LocalEnvironment intensity={evening ? 0.05 : 0.3} />
        {evening && <RoomLights design={design} />}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[framed.center.x, -0.01, framed.center.z]} receiveShadow>
          <circleGeometry args={[framed.radius * 6, 64]} />
          <meshStandardMaterial color={evening ? '#3a4038' : '#cfd6cc'} roughness={1} />
        </mesh>
        <HouseScene design={design} options={{ lowWalls: walls, evening, selectedItemId, onSelectItem }} />
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          {...(eyeLevel
            ? { minDistance: 0.6, maxDistance: 0.6, enableZoom: false, screenSpacePanning: false, minPolarAngle: Math.PI * 0.2, maxPolarAngle: Math.PI * 0.8, rotateSpeed: -0.5 }
            : { minDistance: 1, maxDistance: framed.radius * 6, maxPolarAngle: Math.PI / 2 - 0.05, minPolarAngle: 0, rotateSpeed: 1 })}
        />
        <CameraRig frame={framed} eyeLevel={eyeLevel} steep={singleRoom} resetToken={resetToken} controls={controls} />
        <RegisterCanvas id={id} />
        {realistic && (
          <EffectComposer multisampling={0}>
            <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={1} quality="medium" halfRes />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
      {label && <div className="viewer-label">{label}</div>}
      {eyeLevel && <div className="viewer-hint">Drag to look around · right-drag (or two fingers) to walk</div>}
      <div className={'viewer-tools' + (compact ? ' compact' : '')}>
        <button className={eyeLevel ? 'active' : ''} onClick={() => setEyeLevel((v) => !v)} title="Stand inside the room at eye height">
          {eyeLevel ? 'Overview' : 'Eye level'}
        </button>
        {!eyeLevel && (
          <button className={lowWalls ? 'active' : ''} onClick={() => setLowWalls((v) => !v)} title="Lower the walls so you can see inside">
            Cutaway
          </button>
        )}
        <button className={evening ? 'active' : ''} onClick={() => setEvening((v) => !v)} title="Switch between daylight and evening lighting">
          {evening ? 'Evening' : 'Daylight'}
        </button>
        <button className={realistic ? 'active' : ''} onClick={toggleRealistic} title="Ambient occlusion and film tone mapping (turn off on slow computers)">
          Realistic
        </button>
        <button
          onClick={() => {
            setFramed(frame)
            setResetToken((t) => t + 1)
          }}
          title="Reset camera"
        >
          Reset view
        </button>
      </div>
    </div>
  )
}
