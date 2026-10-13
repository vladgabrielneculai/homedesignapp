import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { CatalogEntry } from '../catalog/catalog'
import { getBlob, putBlob } from '../lib/blobStore'
import { itemColor, paletteFor } from '../lib/colors'
import type { StyleSettings } from '../types'
import { LocalEnvironment } from './HouseScene'
import { ProceduralItem } from './Procedural'
import { fitObject } from './userModels'

/**
 * Rendered 3D previews for the furniture catalog. Requests are queued and drawn one by one in a small
 * hidden canvas, in the current style's colors, then cached in memory and in IndexedDB so they only
 * get rendered once per item and color scheme.
 */

const VERSION = 1
const SIZE = 224

interface Job {
  key: string
  entry: CatalogEntry
  style: StyleSettings
}

const urls = new Map<string, string>()
const queue: Job[] = []
const queued = new Set<string>()
const listeners = new Set<() => void>()
let version = 0

function notify() {
  version++
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function thumbKey(e: CatalogEntry, style: StyleSettings): string {
  const colors = [style.primary, style.wood, style.metal, style.accent].join()
  const shape = [e.builder, e.w, e.d, e.h, e.color, e.plain, e.userModel?.key, e.userModel?.rotation, e.userModel?.upAxis].join()
  return `thumb:v${VERSION}:${e.id}:${hash(colors + shape)}`
}

function request(job: Job) {
  if (urls.has(job.key) || queued.has(job.key)) return
  queued.add(job.key)
  getBlob(job.key)
    .catch(() => undefined)
    .then((blob) => {
      if (blob) {
        urls.set(job.key, URL.createObjectURL(blob))
        queued.delete(job.key)
        notify()
      } else {
        queue.push(job)
        notify()
      }
    })
}

/** URL of the rendered preview of a catalog entry, once it is ready. */
export function useCatalogThumb(e: CatalogEntry, style: StyleSettings, enabled = true): string | undefined {
  const key = thumbKey(e, style)
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (enabled) request({ key, entry: e, style })
  }, [key, e, style, enabled])
  return enabled ? urls.get(key) : undefined
}

function useQueueHead(): Job | undefined {
  useSyncExternalStore(subscribe, () => version)
  return queue[0]
}

function finish(job: Job, blob: Blob | null) {
  queue.shift()
  queued.delete(job.key)
  if (blob) {
    urls.set(job.key, URL.createObjectURL(blob))
    putBlob(job.key, blob).catch(() => {})
  }
  notify()
}

function ModelSubject({ entry }: { entry: CatalogEntry }) {
  const { scene } = useGLTF(import.meta.env.BASE_URL + entry.model!.url)
  const object = useMemo(() => fitObject(scene, entry, { hide: entry.model!.hide }), [scene, entry])
  return <primitive object={object} />
}

/** Frames the item, renders one frame and hands back the image. */
function Shot({ job }: { job: Job }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const e = job.entry
    const cam = camera as THREE.PerspectiveCamera
    const radius = 0.5 * Math.hypot(e.w, e.h, e.d)
    const dir =
      e.symbol === 'rug'
        ? new THREE.Vector3(0.3, 1.4, 0.9)
        : e.mount === 'wall'
          ? new THREE.Vector3(0.45, 0.22, 1)
          : new THREE.Vector3(0.8, 0.62, 1)
    dir.normalize()
    const target = new THREE.Vector3(0, e.h / 2, 0)
    cam.fov = 28
    cam.near = 0.01
    cam.far = 100
    cam.position.copy(target).addScaledVector(dir, (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.02)
    cam.lookAt(target)
    cam.updateProjectionMatrix()
    let cancelled = false
    // Two frames so textures and shadow maps are uploaded before the capture.
    const r1 = requestAnimationFrame(() => {
      gl.render(scene, cam)
      requestAnimationFrame(() => {
        if (cancelled) return
        gl.render(scene, cam)
        gl.domElement.toBlob((b) => !cancelled && finish(job, b), 'image/webp', 0.9)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(r1)
    }
  }, [job, gl, scene, camera])
  return null
}

function Subject({ job }: { job: Job }) {
  const { entry, style } = job
  const palette = useMemo(() => paletteFor(style), [style])
  const color = itemColor({ id: '', catalogId: entry.id, x: 0, y: 0, rotation: 0 }, entry, style)
  const elevation = entry.mount === 'ceiling' ? (entry.defaultElevation ?? 0) : 0
  return (
    <group>
      {entry.model ? <ModelSubject entry={entry} /> : <ProceduralItem e={entry} pal={palette} mainColor={color} elevation={elevation} />}
      <Shot job={job} />
    </group>
  )
}

function Studio() {
  const job = useQueueHead()
  if (!job) return null
  return (
    <Suspense fallback={null}>
      <Subject key={job.key} job={job} />
    </Suspense>
  )
}

/** Hidden renderer that works through the thumbnail queue. Mount it where the catalog is shown. */
export function ThumbnailStudio() {
  const pending = useQueueHead()
  const [active, setActive] = useState(false)
  // Keep the canvas once created; it is cheap and avoids re-creating the WebGL context.
  useEffect(() => {
    if (pending) setActive(true)
  }, [pending])
  if (!active) return null
  return (
    <div className="thumb-studio" aria-hidden="true">
      <Canvas
        frameloop="never"
        shadows
        dpr={1}
        style={{ width: SIZE, height: SIZE }}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: 28, position: [2, 2, 2] }}
      >
        <LocalEnvironment intensity={0.7} />
        <hemisphereLight args={['#ffffff', '#b8b0a4', 0.5]} />
        <directionalLight position={[2.5, 5, 3.5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-radius={6}>
          <orthographicCamera attach="shadow-camera" args={[-3, 3, 3, -3, 0.1, 20]} />
        </directionalLight>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial opacity={0.18} />
        </mesh>
        <Studio />
      </Canvas>
    </div>
  )
}
