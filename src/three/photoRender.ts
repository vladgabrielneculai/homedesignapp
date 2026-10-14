import type { LiveView } from './Viewer3D'
import { TracerSession } from './tracer'

/** Photo-realistic stills of a live 3D view: samples accumulate until the target count is reached. */

export interface PhotoOptions {
  width: number
  height: number
  samples: number
}

export interface PhotoProgress {
  phase: 'preparing' | 'rendering' | 'done'
  samples: number
  total: number
}

export interface PhotoJob {
  stop: () => void
  dispose: () => void
  /** Edge-aware smoothing of the remaining grain (display only; the samples are untouched). */
  setDenoise: (on: boolean) => void
}

/** Set while a photo is rendering, so the live ray-traced view pauses and leaves it the GPU. */
export const photoBusy = { active: false }

export async function startPhoto(view: LiveView, canvas: HTMLCanvasElement, opts: PhotoOptions, onProgress: (p: PhotoProgress) => void): Promise<PhotoJob> {
  onProgress({ phase: 'preparing', samples: 0, total: opts.samples })
  const session = await TracerSession.create(canvas, opts.width, opts.height)
  // Let the dialog paint "Preparing…" before the (synchronous) scene build.
  await new Promise((r) => setTimeout(r, 30))
  session.setScene(view)
  photoBusy.active = true

  let raf = 0
  let stopped = false
  const tick = () => {
    if (stopped) return
    session.step()
    const samples = session.samples
    if (samples >= opts.samples) {
      photoBusy.active = false
      // A last AI clean-up of the finished image (when the device supports it).
      session.denoiseNow()
      onProgress({ phase: 'done', samples, total: opts.samples })
      return
    }
    onProgress({ phase: 'rendering', samples, total: opts.samples })
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      photoBusy.active = false
      cancelAnimationFrame(raf)
      session.denoiseNow()
    },
    setDenoise: (on) => {
      session.denoise = on
      session.redraw()
    },
    dispose: () => {
      stopped = true
      photoBusy.active = false
      cancelAnimationFrame(raf)
      session.dispose()
    },
  }
}
