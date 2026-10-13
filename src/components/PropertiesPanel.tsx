import { useState } from 'react'
import { getEntry } from '../catalog/catalog'
import { formatPrice, productCatalogId } from '../catalog/products'
import { FLOORS, PAINT_SWATCHES } from '../catalog/styles'
import { roleColor } from '../lib/colors'
import { clampOpening, pointInPolygon, polygonArea, uid, wallAngle, wallLength } from '../lib/geometry'
import { wallInRoom } from '../lib/roomFocus'
import { useDesign, useFocusRoom, useStore } from '../state/store'
import { floorPatternUrl } from '../three/textures'
import type { Design, FloorId } from '../types'
import { ProductDialog } from './ProductDialog'

function NumberField({ label, value, step = 0.01, min, max, unit = 'm', onChange }: { label: string; value: number; step?: number; min?: number; max?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : v)
        }}
      />
      <em>{unit}</em>
    </label>
  )
}

export function deleteSelection() {
  const { selection, updateDesign, select } = useStore.getState()
  if (!selection) return
  updateDesign((d) => {
    switch (selection.kind) {
      case 'item':
        return { ...d, items: d.items.filter((i) => i.id !== selection.id) }
      case 'wall':
        return { ...d, walls: d.walls.filter((w) => w.id !== selection.id), openings: d.openings.filter((o) => o.wallId !== selection.id) }
      case 'opening':
        return { ...d, openings: d.openings.filter((o) => o.id !== selection.id) }
      case 'room':
        return { ...d, rooms: d.rooms.filter((r) => r.id !== selection.id) }
    }
  })
  select(null)
}

export function duplicateSelectedItem() {
  const { selection, updateDesign, select } = useStore.getState()
  if (selection?.kind !== 'item') return
  const id = uid()
  updateDesign((d) => {
    const src = d.items.find((i) => i.id === selection.id)
    return src ? { ...d, items: [...d.items, { ...src, id, x: src.x + 0.3, y: src.y + 0.3 }] } : d
  })
  select({ kind: 'item', id })
}

export function rotateSelectedItem(delta: number) {
  const { selection, updateDesign } = useStore.getState()
  if (selection?.kind !== 'item') return
  updateDesign((d) => ({
    ...d,
    items: d.items.map((i) => (i.id === selection.id ? { ...i, rotation: (((i.rotation + delta) % 360) + 360) % 360 } : i)),
  }))
}

export function nudgeSelectedItem(dx: number, dy: number) {
  const { selection, updateDesign } = useStore.getState()
  if (selection?.kind !== 'item') return
  updateDesign((d) => ({ ...d, items: d.items.map((i) => (i.id === selection.id ? { ...i, x: i.x + dx, y: i.y + dy } : i)) }))
}

export function PropertiesPanel() {
  const design = useDesign()
  const selection = useStore((s) => s.selection)
  const focus = useFocusRoom()
  if (!design) return null
  return (
    <aside className="properties">
      {!selection && (focus ? <RoomProps id={focus.id} design={design} /> : <Summary design={design} />)}
      {selection?.kind === 'item' && <ItemProps id={selection.id} design={design} />}
      {selection?.kind === 'wall' && <WallProps id={selection.id} design={design} />}
      {selection?.kind === 'opening' && <OpeningProps id={selection.id} design={design} />}
      {selection?.kind === 'room' && <RoomProps id={selection.id} design={design} />}
    </aside>
  )
}

function Summary({ design }: { design: Design }) {
  const area = design.rooms.reduce((s, r) => s + polygonArea(r.points), 0)
  const wallLen = design.walls.reduce((s, w) => s + wallLength(w), 0)
  return (
    <div className="panel">
      <h3>Overview</h3>
      <dl className="stats">
        <div>
          <dt>Floor area</dt>
          <dd>{area.toFixed(1)} m²</dd>
        </div>
        <div>
          <dt>Rooms</dt>
          <dd>{design.rooms.length}</dd>
        </div>
        <div>
          <dt>Walls</dt>
          <dd>{wallLen.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Doors / windows</dt>
          <dd>
            {design.openings.filter((o) => o.type === 'door').length} / {design.openings.filter((o) => o.type === 'window').length}
          </dd>
        </div>
        <div>
          <dt>Furniture</dt>
          <dd>{design.items.length}</dd>
        </div>
      </dl>
      {!!design.rooms.length && (
        <>
          <h3>Rooms</h3>
          <ul className="room-list">
            {design.rooms.map((r) => (
              <li key={r.id}>
                <button className="link" onClick={() => useStore.getState().select({ kind: 'room', id: r.id })}>
                  {r.name}
                </button>
                <span>{polygonArea(r.points).toFixed(1)} m²</span>
                <button className="btn small" onClick={() => useStore.getState().focusRoom(r.id)} title={`Show only ${r.name} in the plan and 3D view`}>
                  Edit alone
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">Select something on the plan or in the 3D view to edit it.</p>
    </div>
  )
}

function ItemProps({ id, design }: { id: string; design: Design }) {
  const item = design.items.find((i) => i.id === id)
  const { updateDesign, checkpoint } = useStore.getState()
  const products = useStore((s) => s.products)
  const [editingProduct, setEditingProduct] = useState(false)
  if (!item) return null
  const product = products.find((p) => productCatalogId(p) === item.catalogId)
  const entry = getEntry(item.catalogId)
  const set = (patch: Partial<typeof item>, record = true) => updateDesign((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }), { record })
  const color = item.color ?? roleColor(entry, design.style)
  const colorable = entry.colorRole !== 'fixed'
  return (
    <div className="panel">
      <h3>{entry.name}</h3>
      <p className="muted small">
        {entry.category} · {Math.round(entry.w * 100)} × {Math.round(entry.d * 100)} × {Math.round(entry.h * 100)} cm
      </p>
      <div className="field-row">
        <NumberField label="X" value={item.x} step={0.05} onChange={(x) => set({ x })} />
        <NumberField label="Y" value={item.y} step={0.05} onChange={(y) => set({ y })} />
      </div>
      <label className="range-field">
        <span>Rotation</span>
        <input type="range" min={0} max={359} step={1} value={item.rotation} onPointerDown={() => checkpoint()} onChange={(e) => set({ rotation: Number(e.target.value) }, false)} />
        <em>{Math.round(item.rotation)}°</em>
      </label>
      <NumberField label="Height above floor" value={item.elevation ?? 0} step={0.05} min={0} max={3} onChange={(v) => set({ elevation: v || undefined })} />
      {entry.tabletop && (
        <div className="btn-row">
          {[
            ['Floor', 0],
            ['Coffee table', 0.42],
            ['Side table', 0.55],
            ['Table', 0.75],
            ['Counter', 0.92],
          ].map(([label, h]) => (
            <button key={label} className={'chip' + ((item.elevation ?? 0) === h ? ' active' : '')} onClick={() => set({ elevation: (h as number) || undefined })}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button className="btn small" onClick={() => rotateSelectedItem(-90)}>
          ↺ 90°
        </button>
        <button className="btn small" onClick={() => rotateSelectedItem(90)}>
          ↻ 90°
        </button>
        <button className="btn small" onClick={duplicateSelectedItem}>
          Duplicate
        </button>
      </div>
      {colorable && (
        <>
          <h4>Color / finish</h4>
          <div className="swatches">
            {[design.style.primary, design.style.wood, design.style.metal, design.style.accent, ...PAINT_SWATCHES.slice(0, 2), '#2f3e5c', '#6e4a33', '#3b4a3f', '#9b2f3a', '#d9a441', '#1c1c1e'].map((c, i) => (
              <button key={c + i} className={'swatch' + (color === c ? ' active' : '')} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Color ${c}`} />
            ))}
          </div>
          <div className="btn-row">
            <label className="color-field compact">
              <input type="color" value={color} onPointerDown={() => checkpoint()} onChange={(e) => set({ color: e.target.value }, false)} />
              <span>Custom</span>
            </label>
            {item.color && (
              <button className="btn small" onClick={() => set({ color: undefined })}>
                Use style color
              </button>
            )}
          </div>
        </>
      )}
      {entry.product && (
        <div className="product-box">
          {entry.product.photo && <img src={entry.product.photo} alt="" />}
          <div>
            <strong>{entry.product.store}</strong>
            {entry.product.price !== undefined && <span>{formatPrice(entry.product.price, entry.product.currency)}</span>}
            {entry.product.url && (
              <a href={entry.product.url} target="_blank" rel="noreferrer noopener">
                View in store ↗
              </a>
            )}
            <button className="link small" onClick={() => setEditingProduct(true)}>
              Edit product
            </button>
          </div>
        </div>
      )}
      {editingProduct && product && <ProductDialog product={product} onClose={() => setEditingProduct(false)} />}
      {entry.model && (
        <p className="muted small credit">
          3D model: {entry.model.credit}, {entry.model.license}.{' '}
          <a href={entry.model.source} target="_blank" rel="noreferrer">
            Source
          </a>
        </p>
      )}
      <button className="btn danger full" onClick={deleteSelection}>
        Delete item
      </button>
    </div>
  )
}

function WallProps({ id, design }: { id: string; design: Design }) {
  const wall = design.walls.find((w) => w.id === id)
  const { updateDesign } = useStore.getState()
  if (!wall) return null
  const len = wallLength(wall)
  const setLength = (L: number) => {
    const ang = wallAngle(wall)
    const b = { x: wall.a.x + Math.cos(ang) * L, y: wall.a.y + Math.sin(ang) * L }
    updateDesign((d) => {
      const walls = d.walls.map((w) => (w.id === id ? { ...w, b } : w))
      const nw = walls.find((w) => w.id === id)!
      return { ...d, walls, openings: d.openings.map((o) => (o.wallId === id ? clampOpening(o, nw) : o)) }
    })
  }
  const set = (patch: Partial<typeof wall>) => updateDesign((d) => ({ ...d, walls: d.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }))
  const count = design.openings.filter((o) => o.wallId === id).length
  return (
    <div className="panel">
      <h3>Wall</h3>
      <NumberField label="Length" value={len} step={0.05} min={0.2} onChange={setLength} />
      <NumberField label="Thickness" value={wall.thickness} step={0.01} min={0.05} max={0.6} onChange={(thickness) => set({ thickness })} />
      <NumberField label="Height" value={wall.height} step={0.05} min={1} max={6} onChange={(height) => set({ height })} />
      <h4>Paint (this wall)</h4>
      <div className="swatches">
        {PAINT_SWATCHES.map((c) => (
          <button key={c} className={'swatch' + (wall.color === c ? ' active' : '')} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Wall color ${c}`} />
        ))}
      </div>
      <div className="btn-row">
        <label className="color-field compact">
          <input type="color" value={wall.color ?? design.style.wallColor} onChange={(e) => set({ color: e.target.value })} />
          <span>Accent wall color</span>
        </label>
        {wall.color && (
          <button className="btn small" onClick={() => set({ color: undefined })}>
            Use style paint
          </button>
        )}
      </div>
      <p className="muted small">
        {count} {count === 1 ? 'opening' : 'openings'} on this wall. Drag the blue handles on the plan to move its corners.
      </p>
      <button className="btn danger full" onClick={deleteSelection}>
        Delete wall
      </button>
    </div>
  )
}

function OpeningProps({ id, design }: { id: string; design: Design }) {
  const o = design.openings.find((x) => x.id === id)
  const { updateDesign } = useStore.getState()
  const wall = o && design.walls.find((w) => w.id === o.wallId)
  if (!o || !wall) return null
  const set = (patch: Partial<typeof o>) => updateDesign((d) => ({ ...d, openings: d.openings.map((x) => (x.id === id ? clampOpening({ ...x, ...patch }, wall) : x)) }))
  return (
    <div className="panel">
      <h3>{o.type === 'door' ? 'Door' : 'Window'}</h3>
      <div className="segmented">
        <button className={o.type === 'door' ? 'active' : ''} onClick={() => set({ type: 'door', sill: 0, height: 2.1 })}>
          Door
        </button>
        <button className={o.type === 'window' ? 'active' : ''} onClick={() => set({ type: 'window', sill: 0.9, height: 1.3 })}>
          Window
        </button>
      </div>
      <NumberField label="Width" value={o.width} step={0.05} min={0.3} max={wallLength(wall)} onChange={(width) => set({ width })} />
      <NumberField label="Height" value={o.height} step={0.05} min={0.3} max={wall.height} onChange={(height) => set({ height })} />
      {o.type === 'window' && <NumberField label="Sill height" value={o.sill} step={0.05} min={0} max={wall.height - 0.2} onChange={(sill) => set({ sill })} />}
      <NumberField label="Position" value={o.offset} step={0.05} min={0} max={wallLength(wall)} onChange={(offset) => set({ offset })} />
      <button className="btn danger full" onClick={deleteSelection}>
        Delete {o.type}
      </button>
    </div>
  )
}

function RoomProps({ id, design }: { id: string; design: Design }) {
  const room = design.rooms.find((r) => r.id === id)
  const focused = useStore((s) => s.focusRoomId === id)
  const { updateDesign, focusRoom } = useStore.getState()
  if (!room) return null
  const set = (patch: Partial<typeof room>) => updateDesign((d) => ({ ...d, rooms: d.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  const active: FloorId | undefined = room.floor
  const roomWalls = design.walls.filter((w) => wallInRoom(w, room.points))
  const paint = roomWalls.length && roomWalls.every((w) => w.color === roomWalls[0].color) ? roomWalls[0].color : undefined
  const setPaint = (color: string | undefined) => {
    const ids = new Set(roomWalls.map((w) => w.id))
    updateDesign((d) => ({ ...d, walls: d.walls.map((w) => (ids.has(w.id) ? { ...w, color } : w)) }))
  }
  const items = design.items.filter((it) => pointInPolygon(it, room.points)).length
  return (
    <div className="panel">
      <h3>Room</h3>
      {focused ? (
        <button className="btn full" onClick={() => focusRoom(null)}>
          ← Show the whole home
        </button>
      ) : (
        <button className="btn primary full" onClick={() => focusRoom(id)} title="Hide the rest of the home in the plan and 3D view">
          Edit this room alone
        </button>
      )}
      <label className="text-field">
        <span>Name</span>
        <input className="input" value={room.name} onChange={(e) => updateDesign((d) => ({ ...d, rooms: d.rooms.map((r) => (r.id === id ? { ...r, name: e.target.value } : r)) }), { record: false })} />
      </label>
      <p className="muted small">
        Area {polygonArea(room.points).toFixed(1)} m² · {items} {items === 1 ? 'item' : 'items'}
      </p>
      <h4>Flooring</h4>
      <div className="floor-grid">
        <button className={'floor-card' + (!active ? ' active' : '')} onClick={() => set({ floor: undefined })}>
          <span className="floor-swatch" style={{ backgroundImage: `url(${floorPatternUrl(design.style.floor)})` }} />
          <span>Style default</span>
        </button>
        {FLOORS.map((f) => (
          <button key={f.id} className={'floor-card' + (active === f.id ? ' active' : '')} onClick={() => set({ floor: f.id })}>
            <span className="floor-swatch" style={{ backgroundImage: `url(${floorPatternUrl(f.id)})` }} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      {!!roomWalls.length && (
        <>
          <h4>Wall paint (this room)</h4>
          <div className="swatches">
            {PAINT_SWATCHES.map((c) => (
              <button key={c} className={'swatch' + (paint === c ? ' active' : '')} style={{ background: c }} onClick={() => setPaint(c)} aria-label={`Paint room walls ${c}`} />
            ))}
          </div>
          <div className="btn-row">
            <label className="color-field compact">
              <input type="color" value={paint ?? design.style.wallColor} onChange={(e) => setPaint(e.target.value)} />
              <span>Custom color</span>
            </label>
            {roomWalls.some((w) => w.color) && (
              <button className="btn small" onClick={() => setPaint(undefined)}>
                Use style paint
              </button>
            )}
          </div>
          <p className="muted small">Walls shared with a neighbouring room change color on both sides.</p>
        </>
      )}
      {focused && (
        <p className="muted small">
          Furniture you place inside this room stays with it. To change one wall only, click it on the plan.
        </p>
      )}
      <button
        className="btn danger full"
        onClick={() => {
          useStore.getState().select({ kind: 'room', id })
          deleteSelection()
        }}
      >
        Remove room floor
      </button>
      <p className="muted small">Removing the room keeps its walls.</p>
    </div>
  )
}
