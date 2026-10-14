import { useEffect, useRef, useState } from 'react'
import { download, safeName } from '../lib/export'
import { startPhoto, type PhotoJob, type PhotoProgress } from '../three/photoRender'
import { getLiveView } from '../three/Viewer3D'

const QUALITIES = [
  { id: 'draft', label: 'Draft', samples: 48, hint: 'quick look, some grain' },
  { id: 'good', label: 'Good', samples: 256, hint: 'clean for sharing' },
  { id: 'best', label: 'Best', samples: 1024, hint: 'print quality, slow' },
] as const

const SIZES = [
  { id: 'view', label: 'Like the view', long: 1600 },
  { id: 'hd', label: 'Full HD', long: 1920 },
  { id: '4k', label: '4K', long: 3840 },
] as const

/** Renders a photo-realistic image of a 3D view with the path tracer. */
export function PhotoDialog({ viewId, name, onClose }: { viewId: string; name: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const jobRef = useRef<PhotoJob | null>(null)
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]['id']>('good')
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('view')
  const [progress, setProgress] = useState<(PhotoProgress & { elapsed: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState(0)
  const [smooth, setSmooth] = useState(true)
  const smoothRef = useRef(smooth)
  useEffect(() => {
    smoothRef.current = smooth
  }, [smooth])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Render when asked; changing quality or size during a render restarts it.
  useEffect(() => {
    if (!run) return
    const view = getLiveView(viewId)
    const stage = stageRef.current
    if (!view || !stage) {
      setError('Open the 3D view to render a photo.')
      return
    }
    const q = QUALITIES.find((x) => x.id === quality)!
    const long = SIZES.find((x) => x.id === size)!.long
    const aspect = view.size.width / Math.max(1, view.size.height)
    const width = aspect >= 1 ? long : Math.round(long * aspect)
    const height = aspect >= 1 ? Math.round(long / aspect) : long
    let cancelled = false
    // A fresh canvas each run: a canvas whose WebGL context was released can't get a new one.
    const canvas = document.createElement('canvas')
    stage.replaceChildren(canvas)
    canvasRef.current = canvas
    setProgress(null)
    setError(null)
    const t0 = Date.now()
    startPhoto(view, canvas, { width, height, samples: q.samples }, (p) => !cancelled && setProgress({ ...p, elapsed: (Date.now() - t0) / 1000 })).then(
      (job) => {
        if (cancelled) job.dispose()
        else {
          jobRef.current = job
          job.setDenoise(smoothRef.current)
        }
      },
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'The photo renderer could not start on this device.'),
    )
    return () => {
      cancelled = true
      jobRef.current?.dispose()
      jobRef.current = null
    }
  }, [viewId, quality, size, run])

  const pct = progress ? Math.min(100, Math.round((progress.samples / progress.total) * 100)) : 0
  const eta = progress && progress.phase === 'rendering' && progress.samples > 2 ? (progress.elapsed / progress.samples) * (progress.total - progress.samples) : null
  const status = !run
    ? 'Choose quality and size, then press Render.'
    : !progress || progress.phase === 'preparing'
      ? 'Preparing the scene…'
      : progress.phase === 'done'
        ? `Done · ${progress.samples} samples`
        : `Rendering · ${progress.samples} / ${progress.total} samples${eta !== null ? ` · about ${eta < 60 ? `${Math.ceil(eta)} s` : `${Math.ceil(eta / 60)} min`} left` : ''}`

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal photo-modal" role="dialog" aria-modal="true" aria-labelledby="photo-title">
        <header className="modal-head">
          <h2 id="photo-title">Photo render</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="photo-stage" ref={stageRef}>
            {!run && <span className="photo-placeholder">The rendered photo appears here</span>}
          </div>
          <div className="photo-progress" aria-live="polite">
            <div className="bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">{error ?? status}</span>
          </div>
          <div className="photo-opts">
            <div className="segmented small">
              {QUALITIES.map((q) => (
                <button key={q.id} className={quality === q.id ? 'active' : ''} onClick={() => setQuality(q.id)} title={q.hint}>
                  {q.label}
                </button>
              ))}
            </div>
            <label className="check small">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(e) => {
                  setSmooth(e.target.checked)
                  jobRef.current?.setDenoise(e.target.checked)
                }}
              />{' '}
              Denoise
            </label>
            <div className="segmented small">
              {SIZES.map((s) => (
                <button key={s.id} className={size === s.id ? 'active' : ''} onClick={() => setSize(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            The image keeps getting cleaner as samples add up; you can save it at any point. It uses the camera, time of day and lights of the 3D view, so set those
            up first (eye level gives the most natural photos).
          </p>
        </div>
        <footer className="modal-foot">
          <button className={'btn' + (run ? '' : ' primary')} onClick={() => setRun((r) => r + 1)}>
            {run ? 'Restart' : 'Render'}
          </button>
          {progress?.phase === 'rendering' && (
            <button
              className="btn"
              onClick={() => {
                jobRef.current?.stop()
                setProgress((p) => p && { ...p, phase: 'done' })
              }}
            >
              Stop here
            </button>
          )}
          <span className="spacer" />
          <button
            className="btn primary"
            disabled={!run || !progress || progress.phase === 'preparing'}
            onClick={() => canvasRef.current && download(`${safeName(name)}-photo.png`, canvasRef.current.toDataURL('image/png'))}
          >
            Save image
          </button>
        </footer>
      </div>
    </div>
  )
}
