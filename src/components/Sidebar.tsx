import { useMemo, useState } from 'react'
import { CATALOG, CATEGORIES, type Category, type CatalogEntry } from '../catalog/catalog'
import { formatPrice, productEntry } from '../catalog/products'
import { FLOORS, PAINT_SWATCHES, STYLE_PRESETS, stripPreset } from '../catalog/styles'
import { itemColor, mix } from '../lib/colors'
import { useDesign, useStore } from '../state/store'
import { floorPatternUrl } from '../three/textures'
import type { Product, StyleSettings, Tool } from '../types'
import { PlanSymbol } from './PlanSymbol'
import { ProductDialog } from './ProductDialog'
import { UnderlayPanel } from './UnderlayPanel'
import { ThumbnailStudio, useCatalogThumb } from '../three/ThumbnailStudio'

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
      <UnderlayPanel />
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

/** Product photo, else the rendered 3D preview, else the plan symbol while the preview is being made. */
function CardImage({ e, style }: { e: CatalogEntry; style: StyleSettings }) {
  const photo = e.product?.photo
  const render = useCatalogThumb(e, style, !photo)
  if (photo) return <img src={photo} alt="" className="catalog-photo" />
  if (render) return <img src={render} alt="" className="catalog-render" draggable={false} />
  return <CatalogThumb e={e} style={style} />
}

function FurnishPanel() {
  const design = useDesign()
  const placing = useStore((s) => s.placeCatalogId)
  const products = useStore((s) => s.products)
  const { startPlacing } = useStore.getState()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...products.map(productEntry), ...CATALOG]
    return all.filter(
      (c) =>
        (cat === 'All' || c.category === cat) &&
        (!q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.product?.store.toLowerCase().includes(q)),
    )
  }, [query, cat, products])
  if (!design) return null
  const showProducts = cat === 'All' || cat === 'My products'

  return (
    <div className="panel">
      <input className="input" type="search" placeholder="Search furniture or stores…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        {(['All', ...CATEGORIES] as const).map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
            {c === 'My products' && products.length > 0 && <span className="chip-count">{products.length}</span>}
          </button>
        ))}
      </div>
      {showProducts && (
        <button className="btn add-product" onClick={() => setEditing('new')}>
          + Add a product from a shop
        </button>
      )}
      {cat === 'My products' && !products.length && (
        <div className="empty-hint">
          <strong>Use real furniture from IKEA or any store</strong>
          <ol>
            <li>Open the product page and copy its name, price, link and measurements.</li>
            <li>Pick what it looks like and its color, and add a photo if you like.</li>
            <li>If the store offers a 3D model download (.glb, .obj, .fbx), upload it to see the real piece.</li>
          </ol>
          It's placed at its exact size, and the <b>Shopping list</b> adds up what your design costs.
        </div>
      )}
      <p className="muted small">Click an item and then click the plan to place it, or drag it onto the plan. Wall pieces snap to the nearest wall.</p>
      <ThumbnailStudio />
      <div className="catalog-grid">
        {list.map((e) => (
          <div key={e.id} className="catalog-cell">
            <button
              className={'catalog-card' + (placing === e.id ? ' active' : '')}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.setData('text/catalog-id', e.id)
                ev.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => startPlacing(e.id)}
              title={`${e.name} — ${Math.round(e.w * 100)} × ${Math.round(e.d * 100)} × ${Math.round(e.h * 100)} cm`}
            >
              <CardImage e={e} style={design.style} />
              <span className="catalog-name">{e.name}</span>
              <span className="catalog-dims">
                {Math.round(e.w * 100)}×{Math.round(e.d * 100)} cm
              </span>
              {e.product && (
                <span className="catalog-store">
                  {e.product.store}
                  {e.product.price !== undefined && ` · ${formatPrice(e.product.price, e.product.currency)}`}
                </span>
              )}
              {e.model && <span className="badge">3D model</span>}
              {e.userModel && <span className="badge">Your 3D</span>}
              {!e.model && !e.userModel && e.category === 'Modern' && <span className="badge new">New</span>}
            </button>
            {e.product && (
              <button
                className="edit-product"
                title="Edit product"
                aria-label={`Edit ${e.name}`}
                onClick={() => setEditing(products.find((p) => productEntry(p).id === e.id) ?? null)}
              >
                ✎
              </button>
            )}
          </div>
        ))}
        {!list.length && query && <p className="muted">Nothing matches “{query}”.</p>}
      </div>
      {editing && <ProductDialog product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
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
