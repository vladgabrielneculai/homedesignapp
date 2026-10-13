import { useMemo, useState } from 'react'
import { CATALOG, CATEGORIES, type Category, type CatalogEntry } from '../catalog/catalog'
import { FLOORS, PAINT_SWATCHES, STYLE_PRESETS, stripPreset } from '../catalog/styles'
import { itemColor, mix } from '../lib/colors'
import { useDesign, useStore } from '../state/store'
import { floorPatternUrl } from '../three/textures'
import type { StyleSettings, Tool } from '../types'
import { PlanSymbol } from './PlanSymbol'

type Tab = 'build' | 'furnish' | 'style'

const TOOLS: { id: Tool; label: string; key: string; icon: string; help: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: '⬚', help: 'Select, move and rotate things' },
  { id: 'room', label: 'Room', key: 'M', icon: '▭', help: 'Drag to draw a rectangular room' },
  { id: 'wall', label: 'Wall', key: 'W', icon: '╱', help: 'Click to draw walls corner by corner' },
  { id: 'door', label: 'Door', key: 'D', icon: '◜', help: 'Click a wall to add a door' },
  { id: 'window', label: 'Window', key: 'N', icon: '▤', help: 'Click a wall to add a window' },
]

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('furnish')
  return (
    <aside className="sidebar">
      <div className="tabs" role="tablist">
        {(['build', 'furnish', 'style'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'build' ? 'Build' : t === 'furnish' ? 'Furnish' : 'Style'}
          </button>
        ))}
      </div>
      <div className="sidebar-body">
        {tab === 'build' && <BuildPanel />}
        {tab === 'furnish' && <FurnishPanel />}
        {tab === 'style' && <StylePanel />}
      </div>
    </aside>
  )
}

function BuildPanel() {
  const tool = useStore((s) => s.tool)
  const snapOn = useStore((s) => s.snap)
  const { setTool, setSnap } = useStore.getState()
  return (
    <div className="panel">
      <h3>Tools</h3>
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button key={t.id} className={'tool-btn' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} title={`${t.help} (${t.key})`}>
            <span className="tool-icon">{t.icon}</span>
            <span>{t.label}</span>
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={snapOn} onChange={(e) => setSnap(e.target.checked)} /> Snap to 10 cm grid
      </label>
      <h3>Tips</h3>
      <ul className="tips">
        <li>
          Use <b>Room</b> for quick rectangles, or <b>Wall</b> for any shape. Click the first corner again to close a loop.
        </li>
        <li>Select a wall to drag its corners. Connected walls move with it.</li>
        <li>Drag doors and windows along their wall to reposition them.</li>
        <li>
          Hold <kbd>Space</kbd> or use the right mouse button to pan while drawing.
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo
        </li>
      </ul>
    </div>
  )
}

function CatalogThumb({ e, style }: { e: CatalogEntry; style: StyleSettings }) {
  const pad = 0.12
  const size = Math.max(e.w, e.d) + pad * 2
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="catalog-thumb" aria-hidden>
      <PlanSymbol e={e} color={itemColor({ id: '', catalogId: e.id, x: 0, y: 0, rotation: 0 }, e, style)} />
    </svg>
  )
}

function FurnishPanel() {
  const design = useDesign()
  const placing = useStore((s) => s.placeCatalogId)
  const { startPlacing } = useStore.getState()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter((c) => (cat === 'All' || c.category === cat) && (!q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)))
  }, [query, cat])
  if (!design) return null

  return (
    <div className="panel">
      <input className="input" type="search" placeholder="Search furniture…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        {(['All', ...CATEGORIES] as const).map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <p className="muted small">Click an item and then click the plan to place it, or drag it onto the plan.</p>
      <div className="catalog-grid">
        {list.map((e) => (
          <button
            key={e.id}
            className={'catalog-card' + (placing === e.id ? ' active' : '')}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData('text/catalog-id', e.id)
              ev.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => startPlacing(e.id)}
            title={`${e.name} — ${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} × ${Math.round(e.h * 100)} cm`}
          >
            <CatalogThumb e={e} style={design.style} />
            <span className="catalog-name">{e.name}</span>
            <span className="catalog-dims">
              {Math.round(e.w * 100)}×{Math.round(e.d * 100)} cm
            </span>
            {e.model && <span className="badge">3D model</span>}
          </button>
        ))}
        {!list.length && <p className="muted">Nothing matches “{query}”.</p>}
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
      <code>{value}</code>
    </label>
  )
}

function StylePanel() {
  const design = useDesign()
  const { updateDesign, checkpoint } = useStore.getState()
  if (!design) return null
  const style = design.style

  const setStyle = (patch: Partial<StyleSettings>, record = true) =>
    updateDesign((d) => ({ ...d, style: { ...d.style, ...patch, presetId: patch.presetId ?? 'custom' } }), { record })

  return (
    <div className="panel">
      <h3>Style presets</h3>
      <p className="muted small">Applies wall paint, flooring and a coordinated furniture palette to the whole variant.</p>
      <div className="preset-grid">
        {STYLE_PRESETS.map((p) => (
          <button
            key={p.presetId}
            className={'preset-card' + (style.presetId === p.presetId ? ' active' : '')}
            onClick={() =>
              updateDesign((d) => ({
                ...d,
                style: stripPreset(p),
                // Presets reset per-item colors and room/wall overrides so the look is coherent.
                items: d.items.map(({ color: _c, ...it }) => (void _c, it)),
                walls: d.walls.map(({ color: _c, ...w }) => (void _c, w)),
                rooms: d.rooms.map((r) => (r.floor === 'tile' || r.floor === 'marble' ? r : { ...r, floor: undefined })),
              }))
            }
          >
            <div className="preset-swatches">
              <span style={{ background: p.wallColor }} />
              <span style={{ backgroundImage: `url(${floorPatternUrl(p.floor)})`, backgroundSize: 'cover' }} />
              <span style={{ background: p.primary }} />
              <span style={{ background: p.wood }} />
              <span style={{ background: p.accent }} />
            </div>
            <strong>{p.name}</strong>
            <span className="muted small">{p.description}</span>
          </button>
        ))}
      </div>

      <h3>Wall paint</h3>
      <div className="swatches">
        {PAINT_SWATCHES.map((c) => (
          <button
            key={c}
            className={'swatch' + (style.wallColor === c ? ' active' : '')}
            style={{ background: c }}
            onClick={() => setStyle({ wallColor: c })}
            aria-label={`Wall color ${c}`}
          />
        ))}
      </div>
      <ColorField label="Custom wall color" value={style.wallColor} onChange={(v) => setStyle({ wallColor: v }, false)} />

      <h3>Default flooring</h3>
      <div className="floor-grid">
        {FLOORS.map((f) => (
          <button key={f.id} className={'floor-card' + (style.floor === f.id ? ' active' : '')} onClick={() => setStyle({ floor: f.id })}>
            <span className="floor-swatch" style={{ backgroundImage: `url(${floorPatternUrl(f.id)})` }} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>

      <h3>Furniture palette</h3>
      <div onPointerDown={() => checkpoint()}>
        <ColorField label="Upholstery" value={style.primary} onChange={(v) => setStyle({ primary: v }, false)} />
        <ColorField label="Wood" value={style.wood} onChange={(v) => setStyle({ wood: v }, false)} />
        <ColorField label="Metal" value={style.metal} onChange={(v) => setStyle({ metal: v }, false)} />
        <ColorField label="Accent" value={style.accent} onChange={(v) => setStyle({ accent: v }, false)} />
      </div>
      <div className="palette-preview" style={{ background: `linear-gradient(90deg, ${style.primary}, ${mix(style.primary, '#ffffff', 0.3)}, ${style.wood}, ${style.accent})` }} />
    </div>
  )
}
