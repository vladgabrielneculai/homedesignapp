import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { photoBusy } from './photoRender'
import { TracerSession } from './tracer'
import { getLiveView } from './Viewer3D'

/**
 * Live ray tracing over a 3D view: whenever the camera stops moving, the path tracer takes over and
 * refines the image (real bounced light, soft window light, reflections) until it is clean. Moving the
 * camera or editing the design shows the fast view again instantly and the tracer restarts.
 */

const MAX_SAMPLES = 600
/** Camera must be still this long before tracing starts (orbit damping counts as moving). */
const SETTLE_MS = 160

function hashString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h
}

function hashNumber(h: number, n: number): number {
  return Math.imul(h ^ Math.round(n * 1000), 16777619)
}

/** Cheap fingerprint of everything the tracer depends on, to notice edits, loaded models and sun moves. */
function sceneSignature(scene: THREE.Scene, sun: { dir: THREE.Vector3; night: boolean }): number {
  let h = 2166136261
  h = hashNumber(hashNumber(hashNumber(h, sun.dir.x), sun.dir.y), sun.dir.z)
  h = hashNumber(h, sun.night ? 1 : 0)
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noPick || o.userData.isSkyDome) return
    const m = o as THREE.Mesh
    if (m.isMesh) {
      h = hashString(h, m.geometry.uuid)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        h = hashString(h, mat.uuid)
        const c = (mat as THREE.MeshStandardMaterial).color
        if (c) h = hashNumber(h, c.getHex())
      }
      const e = m.matrixWorld.elements
      for (const i of [0, 2, 5, 12, 13, 14]) h = hashNumber(h, e[i])
    } else if ((o as THREE.Light).isLight) h = hashNumber(h, (o as THREE.Light).intensity)
    for (const c of o.children) visit(c)
  }
  visit(scene)
  return h
}

export interface TraceStatus {
  state: 'starting' | 'tracing' | 'done' | 'moving' | 'paused' | 'error'
  samples: number
  /** Samples of the last AI-denoised image shown, if any. */
  ai?: number
  message?: string
}

/**
 * `paused`: something is being edited (a modeling tool is active or an object is selected), so the
 * fast view with its outlines and highlights is shown; tracing picks up again afterwards.
 */
export function LiveTrace({ viewId, paused, onStatus }: { viewId: string; paused: boolean; onStatus: (s: TraceStatus) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const status = useRef(onStatus)
  const pausedRef = useRef(paused)
  useEffect(() => {
    status.current = onStatus
    pausedRef.current = paused
  }, [onStatus, paused])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let session: TracerSession | null = null
    let alive = true
    let raf = 0
    let lastMove = performance.now()
    let lastSig = 0
    let sigAt = 0
    let sceneDue = Infinity
    let built = false
    let shown = false
    let lastReport = ''
    let aiSamples = 0
    const show = (v: boolean) => {
      if (v !== shown) {
        shown = v
        setVisible(v)
      }
    }
    const report = (s: TraceStatus) => {
      if (s.state === 'moving' || s.state === 'starting') aiSamples = 0
      s.ai = aiSamples || undefined
      const key = `${s.state}:${s.state === 'tracing' ? s.samples : ''}:${s.ai ?? ''}`
      if (key === lastReport) return
      lastReport = key
      status.current(s)
    }
    const size = () => {
      const r = canvas.parentElement!.getBoundingClientRect()
      const k = Math.min(window.devicePixelRatio || 1, 1.25)
      return [Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k))] as const
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const view = getLiveView(viewId)
      if (!session || !view || photoBusy.active) return
      const now = performance.now()
      session.setSize(...size())
      // Notice edits and models finishing loading (checked a few times a second).
      if (now - sigAt > 400) {
        sigAt = now
        const sig = sceneSignature(view.scene, view.sun)
        if (sig !== lastSig) {
          lastSig = sig
          sceneDue = now + (built ? 300 : 0)
          aiSamples = 0
          show(false)
        }
      }
      if (session.syncCamera(view.camera)) {
        lastMove = now
        show(false)
        report({ state: 'moving', samples: 0 })
      }
      if (now - lastMove < SETTLE_MS) return
      if (pausedRef.current) {
        show(false)
        report({ state: 'paused', samples: session.samples })
        return
      }
      if (now >= sceneDue) {
        sceneDue = Infinity
        try {
          session.setScene(view)
          built = true
        } catch (e) {
          console.error('Ray tracing could not build the scene:', e)
          built = false
          show(false)
          report({ state: 'error', samples: 0, message: e instanceof Error ? e.message : String(e) })
          return
        }
      }
      if (!built || sceneDue !== Infinity) return
      if (session.samples >= MAX_SAMPLES) {
        show(true)
        report({ state: 'done', samples: session.samples })
        return
      }
      session.step()
      if (session.samples >= 2) show(true)
      report({ state: 'tracing', samples: session.samples })
    }

    report({ state: 'starting', samples: 0 })
    TracerSession.create(canvas, ...size()).then(
      (s) => {
        if (!alive) return s.dispose()
        session = s
        s.onAiImage = (n) => {
          aiSamples = n
          lastReport = ''
        }
        raf = requestAnimationFrame(loop)
      },
      (e) => report({ state: 'error', samples: 0, message: e instanceof Error ? e.message : 'Ray tracing is not supported on this device.' }),
    )
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      session?.dispose()
    }
  }, [viewId])

  return <canvas ref={ref} className={'live-trace' + (visible ? ' on' : '')} aria-hidden="true" />
}
