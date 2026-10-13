import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { itemEntry } from '../catalog/catalog'
import { bounds, pointInPolygon, polygonArea, polygonCentroid } from '../lib/geometry'
import type { Design, Pt } from '../types'
import { HouseScene, LocalEnvironment, RoomLights, SunLight } from './HouseScene'
import { computeSun, defaultSite, Garden, Ground, horizonColor, SkyDome, type SunState, type SunTime } from './Outdoors'
import { dayOfYear, formatHour, MONTHS } from '../lib/sun'
import { SunPanel } from '../components/SunPanel'
import { ModelToolbar } from '../components/ModelToolbar'
import { useStore } from '../state/store'
import type { SolidMesh } from '../types'
import { ModelTools } from './ModelTools'
import { getViewStyle, GradientBackground, SketchEdges, StyleMaterials, VIEW_STYLES, type ViewStyle } from './viewStyles'


const MOON = new THREE.Vector3(0.4, 0.8, 0.45).normalize()

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
  const pts = [
    ...design.walls.flatMap((w) => [w.a, w.b]),
    ...design.items.map((i) => ({ x: i.x, y: i.y })),
    ...(design.shapes ?? []).map((sh) => ({ x: sh.position[0], y: sh.position[2] })),
  ]
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
        const e = itemEntry(it)
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
    camera.far = 4000
    camera.updateProjectionMatrix()
    controls.current?.update()
    invalidate()
    // Only re-frame when explicitly asked (project switch, view switch or reset), not on every edit.
  }, [resetToken, eyeLevel, camera])
  return null
}

const STD_VIEWS = ['Iso', 'Top', 'Front', 'Back', 'Left', 'Right'] as const
type StdView = (typeof STD_VIEWS)[number]

/** SketchUp's standard camera views (front = looking at the plan's bottom edge, north up on top view). */
function StandardView({ view, token, frame, controls }: { view: StdView; token: number; frame: Frame; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const { center, radius } = frame
    const d = radius * 2.6 + 3
    const dirs: Record<StdView, [number, number, number]> = {
      Iso: [0.75, 0.8, 1],
      Top: [0, 1, 0.0001],
      Front: [0, 0.18, 1],
      Back: [0, 0.18, -1],
      Left: [-1, 0.18, 0],
      Right: [1, 0.18, 0],
    }
    const dir = new THREE.Vector3(...dirs[view]).normalize()
    camera.position.copy(center).addScaledVector(dir, d)
    controls.current?.target.copy(center)
    camera.fov = 45
    camera.updateProjectionMatrix()
    controls.current?.update()
    invalidate()
  }, [view, token, frame, camera, controls, invalidate])
  return null
}

function selectShapeClick(id: string, add: boolean) {
  const s = useStore.getState()
  const cur = s.selection?.kind === 'shapes' ? s.selection.ids : []
  const ids = add ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]
  s.select(ids.length ? { kind: 'shapes', ids } : null)
}

/** What the photo renderer needs from a live 3D view. */
export interface LiveView {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: SunState
  size: { width: number; height: number }
}

const liveViews = new Map<string, () => LiveView>()

export function getLiveView(id: string): LiveView | null {
  return liveViews.get(id)?.() ?? null
}

function RegisterCanvas({ id, sun }: { id: string; sun: SunState }) {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)
  const sunRef = useRef(sun)
  useEffect(() => {
    sunRef.current = sun
  }, [sun])
  useEffect(() => {
    canvases.set(id, gl.domElement)
    const read = () => {
      const st = get()
      return { scene: st.scene, camera: st.camera as THREE.PerspectiveCamera, sun: sunRef.current, size: { width: st.size.width, height: st.size.height } }
    }
    liveViews.set(id, read)
    return () => {
      if (canvases.get(id) === gl.domElement) canvases.delete(id)
      if (liveViews.get(id) === read) liveViews.delete(id)
    }
  }, [gl, id, get])
  return null
}

const PREF_KEY = 'home-designer-view-prefs'

interface ViewPrefs extends SunTime {
  /** Older preference, replaced by `style`. */
  realistic?: boolean
  style?: ViewStyle
}

function loadPrefs(): ViewPrefs {
  const now = new Date()
  const base: ViewPrefs = { month: now.getMonth() + 1, day: now.getDate(), hour: 15 }
  try {
    const p: ViewPrefs = { ...base, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
    if (!p.style) p.style = p.realistic === false ? 'shaded' : 'realistic'
    return p
  } catch {
    return { ...base, style: 'realistic' }
  }
}

function savePrefs(patch: Partial<ViewPrefs>) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPrefs(), ...patch }))
  } catch {
    /* preference only */
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
  /** Shows a "Photo" button that asks for a path-traced render of this view. */
  onPhoto?: (viewId: string) => void
  /** Showing a single room: look down more steeply so its walls don't hide the inside. */
  singleRoom?: boolean
}

export function Viewer3D({ id, design, frameKey, label, selectedItemId, onSelectItem, compact, singleRoom, onPhoto }: Viewer3DProps) {
  const [lowWalls, setLowWalls] = useState(!!singleRoom)
  // Open a single room with the walls cut down so nothing hides behind the near wall.
  const [wasSingle, setWasSingle] = useState(singleRoom)
  if (wasSingle !== singleRoom) {
    setWasSingle(singleRoom)
    setLowWalls(!!singleRoom)
  }
  const [sunTime, setSunTime] = useState<SunTime>(() => {
    const p = loadPrefs()
    return { month: p.month, day: p.day, hour: p.hour }
  })
  const [sunOpen, setSunOpen] = useState(false)
  const site = useMemo(() => design.site ?? defaultSite(), [design.site])
  const sun = useMemo(() => computeSun(site, sunTime, dayOfYear(sunTime.month, sunTime.day)), [site, sunTime])
  const evening = sun.night
  const [eyeLevel, setEyeLevel] = useState(false)
  const [viewStyle, setViewStyle] = useState<ViewStyle>(() => (compact ? 'shaded' : (loadPrefs().style ?? 'realistic')))
  const styleInfo = getViewStyle(viewStyle)
  const realistic = viewStyle === 'realistic'
  const edges = styleInfo.edges
  const [resetToken, setResetToken] = useState(0)
  const [shapePreview, setShapePreview] = useState<{ shapeId: string; mesh: SolidMesh } | null>(null)
  const [stdView, setStdView] = useState<{ name: StdView; token: number } | null>(null)
  const modelTool = useStore((s) => s.modelTool)
  const selection = useStore((s) => s.selection)
  const selectedShapeIds = !compact && selection?.kind === 'shapes' ? selection.ids : []
  const modeling = !compact
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

  const changeStyle = (v: ViewStyle) => {
    setViewStyle(v)
    if (!compact) savePrefs({ style: v })
  }
  const changeSunTime = (t: SunTime) => {
    setSunTime(t)
    if (!compact) savePrefs(t)
  }

  const horizon = horizonColor(sun)
  const walls = lowWalls && !eyeLevel

  return (
    <div className="viewer3d" onPointerDownCapture={compact ? undefined : () => useStore.getState().setModelKeys(true)}>
      <Canvas
        // Remount when switching styles so the renderer's tone mapping and materials match the style.
        key={viewStyle}
        shadows={edges ? false : 'percentage'}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: !realistic, toneMapping: realistic ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping }}
        camera={{ fov: 45, position: [10, 10, 10] }}
        onPointerMissed={() => (compact || modelTool === 'select') && onSelectItem?.(null)}
      >
        {edges ? (
          <GradientBackground top={styleInfo.background[0]} bottom={styleInfo.background[1]} />
        ) : (
          <>
            <color attach="background" args={[horizon]} />
            <fog attach="fog" args={[horizon, framed.radius * 4 + 25, framed.radius * 9 + 70]} />
            <SkyDome sun={sun} />
          </>
        )}
        {styleInfo.faces && <StyleMaterials faces={styleInfo.faces} />}
        {edges ? (
          <>
            {/* Flat, even light like SketchUp: faces stay readable from every side. */}
            <hemisphereLight args={['#ffffff', '#9a958c', 1.6]} />
            <directionalLight position={[framed.center.x + 8, 14, framed.center.z + 11]} intensity={1.5} />
          </>
        ) : (
          <>
            {/* With ceilings on, the sky can't reach in: stronger fill stands in for light bouncing around the room. */}
            <hemisphereLight args={[evening ? '#3a4a70' : '#dfe9ff', '#8a8272', 0.08 + (eyeLevel ? 0.75 : 0.42) * sun.daylight]} />
            {/* moonlight keeps night scenes readable */}
            <SunLight center={framed.center} radius={framed.radius} dir={sun.altitude > -1 ? sun.dir : MOON} intensity={sun.altitude > -1 ? sun.intensity : 0.15} color={sun.altitude > -1 ? sun.color : '#9db4ff'} />
            <LocalEnvironment intensity={0.05 + (eyeLevel ? 0.6 : 0.27) * sun.daylight} />
          </>
        )}
        {evening && !edges && <RoomLights design={design} />}
        {!edges && <Ground center={framed.center} radius={framed.radius} night={sun.daylight < 0.3} />}
        {!compact && !edges && <Garden design={design} />}
        <HouseScene
          design={design}
          options={{
            lowWalls: walls,
            ceilings: eyeLevel,
            evening,
            selectedItemId,
            onSelectItem: modelTool === 'select' || compact ? onSelectItem : undefined,
            selectedShapeIds,
            shapeEdges: !realistic,
            shapePreview,
            onSelectShape: modeling && modelTool === 'select' ? selectShapeClick : undefined,
          }}
        />
        {modeling && <ModelTools design={design} onPreview={setShapePreview} />}
        {stdView && <StandardView view={stdView.name} token={stdView.token} frame={framed} controls={controls} />}
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          // SketchUp navigation: middle button orbits (Shift+middle pans), wheel zooms at the cursor; the
          // left button orbits only with the Select tool so it stays free for the drawing tools.
          mouseButtons={{ LEFT: modelTool === 'select' || compact || eyeLevel ? THREE.MOUSE.ROTATE : (-1 as THREE.MOUSE), MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }}
          zoomToCursor={!eyeLevel}
          {...(eyeLevel
            ? { minDistance: 0.6, maxDistance: 0.6, enableZoom: false, screenSpacePanning: false, minPolarAngle: Math.PI * 0.2, maxPolarAngle: Math.PI * 0.8, rotateSpeed: -0.5 }
            : { minDistance: 1, maxDistance: framed.radius * 6, maxPolarAngle: Math.PI / 2 - 0.05, minPolarAngle: 0, rotateSpeed: 1 })}
        />
        <CameraRig frame={framed} eyeLevel={eyeLevel} steep={singleRoom} resetToken={resetToken} controls={controls} />
        <RegisterCanvas id={id} sun={sun} />
        {realistic && (
          <EffectComposer multisampling={0}>
            <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={1} quality="medium" halfRes />
            {/* lamps, lit ceiling fixtures and the sun disc glow softly */}
            <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.45} />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        )}
        {edges && (
          <EffectComposer multisampling={4} enableNormalPass>
            <SketchEdges sketchy={viewStyle === 'sketchy'} />
          </EffectComposer>
        )}
      </Canvas>
      {label && <div className="viewer-label">{label}</div>}
      {modeling && <ModelToolbar />}
      {sunOpen && !compact && <SunPanel site={site} time={sunTime} sun={sun} onTime={changeSunTime} onClose={() => setSunOpen(false)} />}
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
        {compact ? (
          <button className={evening ? 'active' : ''} onClick={() => changeSunTime({ ...sunTime, hour: evening ? 15 : 21 })} title="Switch between daylight and evening lighting">
            {evening ? 'Evening' : 'Daylight'}
          </button>
        ) : (
          <button className={sunOpen ? 'active' : ''} onClick={() => setSunOpen((v) => !v)} title="Sun position: location, date, time and which way the home faces">
            {evening ? '☾' : '☀'} {formatHour(sunTime.hour)} · {sunTime.day} {MONTHS[sunTime.month - 1]}
          </button>
        )}
        {onPhoto && (
          <button className="photo-btn" onClick={() => onPhoto(id)} title="Render a photo-realistic image of this view (takes a little while)">
            📷 Photo
          </button>
        )}
        <select className="style-select" value={viewStyle} onChange={(e) => changeStyle(e.target.value as ViewStyle)} title={styleInfo.hint} aria-label="Display style">
          {VIEW_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!compact && !eyeLevel && (
          <select
            className="style-select"
            value=""
            onChange={(e) => {
              setStdView({ name: e.target.value as StdView, token: Date.now() })
            }}
            title="Standard views"
            aria-label="Standard views"
          >
            <option value="" disabled>
              Views
            </option>
            {STD_VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => {
            setFramed(frame)
            setStdView(null)
            setResetToken((t) => t + 1)
          }}
          title="Zoom extents: show the whole design"
        >
          Reset view
        </button>
      </div>
    </div>
  )
}
