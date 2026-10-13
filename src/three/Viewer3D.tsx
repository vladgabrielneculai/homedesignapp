import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { bounds } from '../lib/geometry'
import type { Design } from '../types'
import { HouseScene, LocalEnvironment, SunLight } from './HouseScene'

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

function designFrame(design: Design) {
  const pts = [...design.walls.flatMap((w) => [w.a, w.b]), ...design.items.map((i) => ({ x: i.x, y: i.y }))]
  const b = pts.length ? bounds(pts) : { minX: -3, minY: -3, maxX: 3, maxY: 3 }
  const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2)
  const radius = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2)
  return { center, radius }
}

function CameraRig({ center, radius, resetToken, controls }: { center: THREE.Vector3; radius: number; resetToken: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.set(center.x + radius * 0.9, radius * 1.35 + 1.5, center.z + radius * 1.35)
    camera.near = 0.05
    camera.far = 500
    camera.updateProjectionMatrix()
    controls.current?.target.copy(center)
    controls.current?.update()
    // Only re-frame when explicitly asked (project switch / reset button), not on every edit.
  }, [resetToken, camera])
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

export interface Viewer3DProps {
  id: string
  design: Design
  /** Changing this re-frames the camera. */
  frameKey: string
  label?: string
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  compact?: boolean
}

export function Viewer3D({ id, design, frameKey, label, selectedItemId, onSelectItem, compact }: Viewer3DProps) {
  const [lowWalls, setLowWalls] = useState(false)
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

  return (
    <div className="viewer3d">
      <Canvas
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 45, position: [10, 10, 10] }}
        onPointerMissed={() => onSelectItem?.(null)}
      >
        <color attach="background" args={['#dfe6ec']} />
        <fog attach="fog" args={['#dfe6ec', framed.radius * 5, framed.radius * 12]} />
        <hemisphereLight args={['#f4f7ff', '#a89f92', 0.55]} />
        <SunLight center={framed.center} radius={framed.radius} />
        <LocalEnvironment />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[framed.center.x, -0.01, framed.center.z]} receiveShadow>
          <circleGeometry args={[framed.radius * 6, 64]} />
          <meshStandardMaterial color="#cfd6cc" roughness={1} />
        </mesh>
        <HouseScene design={design} options={{ lowWalls, selectedItemId, onSelectItem }} />
        <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={1} maxDistance={framed.radius * 6} enableDamping />
        <CameraRig center={framed.center} radius={framed.radius} resetToken={resetToken} controls={controls} />
        <RegisterCanvas id={id} />
      </Canvas>
      {label && <div className="viewer-label">{label}</div>}
      <div className={'viewer-tools' + (compact ? ' compact' : '')}>
        <button className={lowWalls ? 'active' : ''} onClick={() => setLowWalls((v) => !v)} title="Lower the walls so you can see inside">
          {lowWalls ? 'Full walls' : 'Cutaway'}
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
