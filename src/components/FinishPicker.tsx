import { useEffect, useState } from 'react'
import { PAINT_SWATCHES } from '../catalog/styles'
import { getPattern, PATTERNS, type PatternGroup } from '../catalog/wallFinishes'
import { deleteBlob, putBlob } from '../lib/blobStore'
import { uid } from '../lib/geometry'
import { loadImage, photoToDataUrl } from '../lib/images'
import { useStore } from '../state/store'
import { patternThumb } from '../three/wallTextures'
import type { StyleSettings, Wallpaper, WallFinish } from '../types'

type Tab = 'paint' | PatternGroup | 'upload'

const TABS: { id: Tab; label: string }[] = [
  { id: 'paint', label: 'Paint' },
  { id: 'wallpaper', label: 'Wallpaper' },
  { id: 'material', label: 'Materials' },
  { id: 'upload', label: 'Uploads' },
]

function tabOf(f: WallFinish | undefined): Tab {
  if (!f || f.kind === 'paint') return 'paint'
  if (f.kind === 'image') return 'upload'
  return getPattern(f.id)?.group ?? 'wallpaper'
}

/**
 * Picks a wall finish: paint, a built-in wallpaper or material, or an uploaded wallpaper.
 * `value` undefined means the style's default paint (or a mix, when several walls are edited).
 */
export function FinishPicker({ value, style, onChange, mixed }: { value: WallFinish | undefined; style: StyleSettings; onChange: (f: WallFinish | undefined) => void; mixed?: boolean }) {
  const [tab, setTab] = useState<Tab>(tabOf(value))
  const wallpapers = useStore((s) => s.wallpapers)
  const [uploading, setUploading] = useState<Wallpaper | 'new' | null>(null)
  const paint = value?.kind === 'paint' ? value.color : undefined
  const pattern = value?.kind === 'pattern' ? value : undefined
  const patternDef = pattern && getPattern(pattern.id)

  return (
    <div className="finish-picker">
      <div className="segmented small full">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'paint' && (
        <>
          <div className="swatches">
            {PAINT_SWATCHES.map((c) => (
              <button key={c} className={'swatch' + (paint === c ? ' active' : '')} style={{ background: c }} onClick={() => onChange({ kind: 'paint', color: c })} aria-label={`Paint ${c}`} />
            ))}
          </div>
          <div className="btn-row">
            <label className="color-field compact">
              <input type="color" value={paint ?? style.wallColor} onChange={(e) => onChange({ kind: 'paint', color: e.target.value })} />
              <span>Custom color</span>
            </label>
            {(value || mixed) && (
              <button className="btn small" onClick={() => onChange(undefined)}>
                Use style paint
              </button>
            )}
          </div>
        </>
      )}

      {(tab === 'wallpaper' || tab === 'material') && (
        <>
          <div className="finish-grid">
            {PATTERNS.filter((p) => p.group === tab).map((p) => {
              const active = pattern?.id === p.id
              return (
                <button key={p.id} className={'finish-card' + (active ? ' active' : '')} onClick={() => onChange({ kind: 'pattern', id: p.id, color: active ? pattern?.color : undefined })} title={`${p.name} · repeats every ${Math.round(p.size * 100)} cm`}>
                  <img src={patternThumb(p.id, active ? pattern?.color : undefined)} alt="" />
                  <span>{p.name}</span>
                </button>
              )
            })}
          </div>
          {patternDef?.tint && pattern && (
            <div className="btn-row">
              <label className="color-field compact">
                <input type="color" value={pattern.color ?? patternDef.color} onChange={(e) => onChange({ ...pattern, color: e.target.value })} />
                <span>{patternDef.name} color</span>
              </label>
              {pattern.color && (
                <button className="btn small" onClick={() => onChange({ kind: 'pattern', id: pattern.id })}>
                  Original
                </button>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'upload' && (
        <>
          {wallpapers.length ? (
            <div className="finish-grid">
              {wallpapers.map((w) => {
                const active = value?.kind === 'image' && value.id === w.id
                return (
                  <div key={w.id} className={'finish-card' + (active ? ' active' : '')}>
                    <button className="finish-card-main" onClick={() => onChange({ kind: 'image', id: w.id })} title={`${w.name} · repeats every ${Math.round(w.width * 100)} cm`}>
                      <img src={w.thumb} alt="" />
                      <span>{w.name}</span>
                    </button>
                    <button className="finish-edit" onClick={() => setUploading(w)} aria-label={`Edit ${w.name}`} title="Edit">
                      ✎
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted small">Upload a photo of a wallpaper or tile from a shop. It repeats across the wall at its real size.</p>
          )}
          <button className="btn small full" onClick={() => setUploading('new')}>
            + Upload wallpaper or tile image
          </button>
        </>
      )}
      {uploading && (
        <WallpaperDialog
          wallpaper={uploading === 'new' ? undefined : uploading}
          onClose={(saved) => {
            setUploading(null)
            if (saved) onChange({ kind: 'image', id: saved.id })
          }}
        />
      )}
    </div>
  )
}

function WallpaperDialog({ wallpaper, onClose }: { wallpaper?: Wallpaper; onClose: (saved?: Wallpaper) => void }) {
  const { saveWallpaper, deleteWallpaper } = useStore.getState()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(wallpaper?.thumb ?? null)
  const [aspect, setAspect] = useState(wallpaper?.aspect ?? 1)
  const [name, setName] = useState(wallpaper?.name ?? '')
  const [width, setWidth] = useState(wallpaper ? String(Math.round(wallpaper.width * 1000) / 10) : '53')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = async (f: File) => {
    setError(null)
    const url = URL.createObjectURL(f)
    try {
      const img = await loadImage(url)
      setAspect(img.height / img.width)
      setFile(f)
      setPreview(await photoToDataUrl(f, 160))
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that image.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const save = async () => {
    const wm = parseFloat(width.replace(',', '.')) / 100
    if (!(wm > 0.02 && wm < 20)) return setError('Enter how wide one repeat of the pattern is, in centimetres.')
    if (!wallpaper && !file) return setError('Choose an image first.')
    setBusy(true)
    try {
      let key = wallpaper?.key ?? ''
      if (file) {
        key = `wallpaper:${uid()}`
        await putBlob(key, file)
        if (wallpaper) deleteBlob(wallpaper.key).catch(() => {})
      }
      const saved: Wallpaper = {
        id: wallpaper?.id ?? uid(),
        name: name.trim() || 'Wallpaper',
        key,
        thumb: preview ?? '',
        width: wm,
        aspect,
        createdAt: wallpaper?.createdAt ?? Date.now(),
      }
      saveWallpaper(saved)
      onClose(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the image.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wp-title">
        <header className="modal-head">
          <h2 id="wp-title">{wallpaper ? 'Edit wallpaper' : 'Upload a wallpaper or tile'}</h2>
          <button className="btn ghost icon" onClick={() => onClose()} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="photo-row">
            {preview ? <img src={preview} alt="" className="photo-preview" /> : <div className="photo-preview empty">No image</div>}
            <div className="stack">
              <label className="btn small">
                {wallpaper || file ? 'Replace image…' : 'Choose image…'}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
              </label>
              <span className="muted small">Use a straight-on photo of one repeat (a product image from the shop works well).</span>
            </div>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sandberg Kim, sage" />
            </label>
            <label className="field span-2">
              <span>Width of one repeat (cm)</span>
              <input className="input" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
              <span className="muted small">
                Wallpaper rolls are usually 53 cm wide; for tiles, enter the size of the area in the photo. Height follows the image ({Math.round(parseFloat(width) * aspect) || '–'} cm).
              </span>
            </label>
          </div>
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          {wallpaper && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Delete "${wallpaper.name}"? Walls using it go back to paint.`)) {
                  deleteWallpaper(wallpaper.id)
                  onClose()
                }
              }}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={() => onClose()}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {wallpaper ? 'Save' : 'Add wallpaper'}
          </button>
        </footer>
      </div>
    </div>
  )
}
