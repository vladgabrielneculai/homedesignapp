import { useState } from 'react'
import { deleteBlob, putBlob } from '../lib/blobStore'
import { uid } from '../lib/geometry'
import { readPlanFile, useBlobUrl } from '../lib/underlay'
import { useDesign, useStore } from '../state/store'

/** Build-tab section for importing a floor plan image or PDF to trace over. */
export function UnderlayPanel() {
  const design = useDesign()
  const tool = useStore((s) => s.tool)
  const { updateDesign, setTool } = useStore.getState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const u = design?.underlay
  const thumb = useBlobUrl(u?.key)
  if (!design) return null

  const importFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const img = await readPlanFile(file)
      const key = `underlay:${uid()}`
      await putBlob(key, img.blob)
      // Until the scale is set, guess that the drawing is about 12 m wide and centre it on the home.
      const scale = 12 / img.w
      const pts = design.walls.flatMap((w) => [w.a, w.b])
      const cx = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 6
      const cy = pts.length ? pts.reduce((s, p) => s + p.y, 0) / pts.length : (img.h * scale) / 2
      updateDesign((d) => ({
        ...d,
        underlay: { key, name: img.name, w: img.w, h: img.h, scale, x: cx - (img.w * scale) / 2, y: cy - (img.h * scale) / 2, opacity: 0.6, visible: true, calibrated: false },
      }))
      setTool('calibrate')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    if (!u || !confirm('Remove the imported floor plan? Your walls and rooms stay.')) return
    updateDesign((d) => ({ ...d, underlay: undefined }))
    if (tool === 'calibrate' || tool === 'moveUnderlay') setTool('select')
    // Delete the image unless another design (e.g. a duplicated variant) still uses it.
    const used = useStore.getState().projects.some((p) => p.variants.some((v) => v.design.underlay?.key === u.key))
    if (!used) deleteBlob(u.key).catch(() => {})
  }

  const set = (patch: Partial<NonNullable<typeof u>>, record = true) => updateDesign((d) => (d.underlay ? { ...d, underlay: { ...d.underlay, ...patch } } : d), { record })

  return (
    <>
      <h3>Floor plan to trace</h3>
      {!u ? (
        <>
          <p className="muted small">Import a plan of your home (photo, scan or PDF from the architect or estate agent), set its scale, then draw walls over it.</p>
          <label className={'btn full' + (busy ? ' disabled' : '')}>
            {busy ? 'Reading…' : 'Import plan image or PDF…'}
            <input type="file" accept="image/*,application/pdf,.pdf" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
        </>
      ) : (
        <div className="underlay-box">
          <div className="underlay-head">
            {thumb ? <img src={thumb} alt="" /> : <span className="underlay-thumb" />}
            <div>
              <strong title={u.name}>{u.name}</strong>
              <span className="muted small">
                {u.calibrated ? `${(u.w * u.scale).toFixed(1)} × ${(u.h * u.scale).toFixed(1)} m` : 'Scale not set yet'}
              </span>
            </div>
          </div>
          {!u.calibrated && tool !== 'calibrate' && (
            <p className="banner warn small">Set the scale so walls you trace have the right size.</p>
          )}
          <div className="btn-row">
            <button className={'btn small' + (tool === 'calibrate' ? ' active' : u.calibrated ? '' : ' primary')} onClick={() => setTool(tool === 'calibrate' ? 'select' : 'calibrate')}>
              {tool === 'calibrate' ? 'Cancel scale' : 'Set scale'}
            </button>
            <button className={'btn small' + (tool === 'moveUnderlay' ? ' active' : '')} onClick={() => setTool(tool === 'moveUnderlay' ? 'select' : 'moveUnderlay')}>
              {tool === 'moveUnderlay' ? 'Done moving' : 'Move'}
            </button>
            <button className="btn small" onClick={() => set({ visible: !u.visible })}>
              {u.visible ? 'Hide' : 'Show'}
            </button>
          </div>
          <label className="range-field">
            <span>Opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={u.opacity} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => set({ opacity: Number(e.target.value) }, false)} />
            <em>{Math.round(u.opacity * 100)}%</em>
          </label>
          <div className="btn-row">
            <label className="btn small">
              Replace…
              <input type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <button className="btn small danger" onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
    </>
  )
}
