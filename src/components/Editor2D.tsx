import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEntry, surfaceHeight } from '../catalog/catalog'
import { getFloor } from '../catalog/styles'
import { makeOpening, makeRectRoom, WALL_HEIGHT, WALL_THICKNESS } from '../catalog/templates'
import { itemColor } from '../lib/colors'
import {
  bounds,
  clampOpening,
  dist,
  inFootprint,
  nearestWall,
  pointInPolygon,
  orthoAssist,
  polygonArea,
  polygonCentroid,
  snap,
  snapPt,
  snapToEndpoints,
  uid,
  wallAngle,
  wallLength,
} from '../lib/geometry'
import { itemInRoom, wallSpan } from '../lib/roomFocus'
import { useDesign, useFocusRoom, useProject, useStore } from '../state/store'
import { floorPatternUrl } from '../three/textures'
import type { Design, Opening, Pt, Room, Wall } from '../types'
import { PlanSymbol } from './PlanSymbol'

const GRID = 0.1
const MIN_SCALE = 8
const MAX_SCALE = 400

/** SVG elements register here so the toolbar can export the plan as PNG. */
export const planSvgs = new Map<string, SVGSVGElement>()

interface View {
  cx: number
  cy: number
  scale: number // pixels per meter
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | { kind: 'item'; id: string; dx: number; dy: number; moved: boolean }
  | { kind: 'rotate'; id: string }
  | { kind: 'endpoint'; ends: { wallId: string; end: 'a' | 'b' }[]; roomPts: { roomId: string; index: number }[]; moved: boolean }
  | { kind: 'opening'; id: string; moved: boolean }
  | { kind: 'roomRect'; start: Pt }

const deg = (r: number) => (r * 180) / Math.PI

/**
 * Where a wall-mounted item dropped near p should go: flat against the closest wall (within 1.5 m),
 * kept inside the wall's length and facing into the room on the side the cursor is on.
 */
function wallSnap(design: Design, p: Pt, catalogId: string): { x: number; y: number; rotation: number } | null {
  const e = getEntry(catalogId)
  if (e.mount !== 'wall') return null
  const hit = nearestWall(p, design.walls, 1.5)
  if (!hit) return null
  const w = hit.wall
  const len = wallLength(w)
  const ang = wallAngle(w)
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  const half = Math.min(e.w / 2, len / 2)
  const t = Math.max(half, Math.min(len - half, hit.t * len))
  const base = { x: w.a.x + cos * t, y: w.a.y + sin * t }
  let nx = -sin
  let ny = cos
  if ((p.x - base.x) * nx + (p.y - base.y) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  const off = w.thickness / 2 + e.d / 2 + 0.003
  // The item's back points along (sin r, -cos r); make it point at the wall (-n).
  const rotation = ((((Math.atan2(-nx, ny) * 180) / Math.PI) % 360) + 360) % 360
  return { x: base.x + nx * off, y: base.y + ny * off, rotation: Math.round(rotation * 100) / 100 }
}

/** Height a tabletop item dropped at p should sit at: the highest surface under it, or the floor. */
function elevationAt(design: Design, p: Pt, catalogId: string, ignoreId?: string): number | undefined {
  if (!getEntry(catalogId).tabletop) return undefined
  let h = 0
  for (const it of design.items) {
    if (it.id === ignoreId) continue
    const e = getEntry(it.catalogId)
    const top = surfaceHeight(e)
    if (top !== null && inFootprint(p, it, e.w, e.d, it.rotation)) h = Math.max(h, (it.elevation ?? 0) + top)
  }
  return h || undefined
}

function fitView(design: Design, w: number, h: number, room?: Room): View {
  const pts = room ? room.points : [...design.walls.flatMap((x) => [x.a, x.b]), ...design.items.map((i) => ({ x: i.x, y: i.y }))]
  if (!pts.length) return { cx: 5, cy: 4, scale: 60 }
  const b = bounds(pts)
  const pad = 1.2
  const scale = Math.min(w / (b.maxX - b.minX + pad * 2), h / (b.maxY - b.minY + pad * 2))
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)) }
}

/**
 * What the plan draws: everything, or only one room's floor, walls, openings and furniture.
 * The selected wall or item stays visible so dragging it out of the room doesn't make it vanish.
 */
function visiblePart(design: Design, room: Room | undefined, selectedId: string | undefined): { design: Design; spans: Map<string, [number, number]> } {
  const spans = new Map<string, [number, number]>()
  if (!room) return { design, spans }
  // Walls keep their real ends (so editing works as usual); only the stretch around the room is drawn.
  const walls = design.walls.filter((w) => {
    const span = wallSpan(w, room.points) ?? (w.id === selectedId ? [0, wallLength(w)] : null)
    if (span) spans.set(w.id, span)
    return !!span
  })
  return {
    spans,
    design: {
      ...design,
      walls,
      openings: design.openings.filter((o) => {
        const span = spans.get(o.wallId)
        return o.id === selectedId || (!!span && o.offset + o.width / 2 > span[0] && o.offset - o.width / 2 < span[1])
      }),
      rooms: [room],
      items: design.items.filter((it) => it.id === selectedId || itemInRoom(it, room.points)),
    },
  }
}

export function Editor2D() {
  const fullDesign = useDesign()
  const focus = useFocusRoom()
  const project = useProject()
  const { tool, selection, placeCatalogId, snap: snapOn } = useStore()
  const { updateDesign, checkpoint, select, setTool, focusRoom } = useStore.getState()
  const visible = useMemo(
    () => fullDesign && visiblePart(fullDesign, focus, selection && selection.kind !== 'room' ? selection.id : undefined),
    [fullDesign, focus, selection],
  )
  const design = visible?.design

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 }) // measured by the ResizeObserver below
  const [view, setView] = useState<View>({ cx: 5, cy: 4, scale: 60 })
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [chain, setChain] = useState<Pt[]>([]) // wall tool points
  const [rect, setRect] = useState<{ a: Pt; b: Pt } | null>(null)
  const drag = useRef<Drag | null>(null)
  const spaceDown = useRef(false)

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the plan when a project, variant or focused room is opened.
  const frameKey = `${project?.id}:${project?.activeVariantId}:${focus?.id ?? ''}`
  const fittedFor = useRef<string>('')
  useEffect(() => {
    if (!design || size.w < 50) return
    if (fittedFor.current === frameKey) return
    fittedFor.current = frameKey
    setView(fitView(design, size.w, size.h, focus))
  }, [frameKey, design, size, focus])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    planSvgs.set('main', svg)
    return () => {
      planSvgs.delete('main')
    }
  }, [])

  // Reset in-progress drawing when tool changes.
  useEffect(() => {
    setChain([])
    setRect(null)
  }, [tool])

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = svgRef.current!.getBoundingClientRect()
      return { x: (clientX - r.left - size.w / 2) / view.scale + view.cx, y: (clientY - r.top - size.h / 2) / view.scale + view.cy }
    },
    [size, view],
  )

  const grid = snapOn ? GRID : 0

  const finishChain = useCallback(() => {
    setChain([])
  }, [])

  // Keyboard handling for drawing tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = e.type === 'keydown'
      if (e.type !== 'keydown') return
      if (e.key === 'Escape') {
        if (chain.length) finishChain()
        else if (rect) setRect(null)
        else if (tool !== 'select') setTool('select')
        else select(null)
      }
      if (e.key === 'Enter' && chain.length) finishChain()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [chain, rect, tool, finishChain, setTool, select])

  // Wheel zoom (non-passive so we can prevent page scroll).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015)
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
        const mx = e.clientX - r.left - size.w / 2
        const my = e.clientY - r.top - size.h / 2
        const wx = mx / v.scale + v.cx
        const wy = my / v.scale + v.cy
        return { scale, cx: wx - mx / scale, cy: wy - my / scale }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [size])

  const hoverWall = useMemo(() => {
    if (!design || !cursor || (tool !== 'door' && tool !== 'window')) return null
    return nearestWall(cursor, design.walls, 0.5)
  }, [design, cursor, tool])

  if (!design) return null
  const s = view.scale
  const px = (n: number) => n / s // convert screen pixels to meters

  const placeItemAt = (catalogId: string, p: Pt) => {
    const id = uid()
    const snapped = snapPt(p, grid ? 0.05 : 0)
    const onWall = wallSnap(design, p, catalogId)
    const at = onWall ?? { ...snapped, rotation: 0 }
    const elevation = elevationAt(design, at, catalogId) ?? getEntry(catalogId).defaultElevation
    updateDesign((d) => ({ ...d, items: [...d.items, { id, catalogId, x: at.x, y: at.y, rotation: at.rotation, elevation }] }))
    select({ kind: 'item', id })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
      return
    }
    switch (tool) {
      case 'select':
        select(null)
        drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
        break
      case 'place':
        if (placeCatalogId) {
          placeItemAt(placeCatalogId, p)
          if (!e.shiftKey) setTool('select')
          else useStore.getState().startPlacing(placeCatalogId)
        }
        break
      case 'wall': {
        const pt0 = snapToEndpoints(p, design.walls, px(12), grid)
        if (!chain.length) {
          setChain([pt0])
          break
        }
        const last = chain[chain.length - 1]
        const pt = orthoAssist(last, pt0)
        if (dist(last, pt) < 0.05) {
          finishChain()
          break
        }
        const wall: Wall = { id: uid(), a: last, b: pt, thickness: WALL_THICKNESS, height: WALL_HEIGHT }
        updateDesign((d) => ({ ...d, walls: [...d.walls, wall] }))
        // Closing the loop on the first point ends the chain.
        if (chain.length > 1 && dist(pt, chain[0]) < 0.01) finishChain()
        else setChain([...chain, pt])
        break
      }
      case 'room': {
        const a = snapToEndpoints(p, design.walls, px(12), grid)
        setRect({ a, b: a })
        drag.current = { kind: 'roomRect', start: a }
        break
      }
      case 'door':
      case 'window': {
        const hit = nearestWall(p, design.walls, 0.5)
        if (!hit) break
        const len = wallLength(hit.wall)
        const o = clampOpening(makeOpening(hit.wall.id, tool, snap(hit.t * len, grid ? 0.05 : 0)), hit.wall)
        updateDesign((d) => ({ ...d, openings: [...d.openings, o] }))
        select({ kind: 'opening', id: o.id })
        setTool('select')
        break
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY)
    setCursor(p)
    const dr = drag.current
    if (!dr) return
    switch (dr.kind) {
      case 'pan':
        setView({ ...dr.view, cx: dr.view.cx - (e.clientX - dr.sx) / dr.view.scale, cy: dr.view.cy - (e.clientY - dr.sy) / dr.view.scale })
        break
      case 'item': {
        if (!dr.moved) {
          checkpoint()
          dr.moved = true
        }
        const step = grid ? 0.05 : 0
        const x = snap(p.x - dr.dx, step)
        const y = snap(p.y - dr.dy, step)
        updateDesign(
          (d) => ({
            ...d,
            items: d.items.map((it) => {
              if (it.id !== dr.id) return it
              const onWall = wallSnap(d, { x: p.x - dr.dx, y: p.y - dr.dy }, it.catalogId)
              if (onWall) return { ...it, ...onWall }
              return { ...it, x, y, elevation: getEntry(it.catalogId).tabletop ? elevationAt(d, { x, y }, it.catalogId, it.id) : it.elevation }
            }),
          }),
          { record: false },
        )
        break
      }
      case 'rotate': {
        const it = design.items.find((i) => i.id === dr.id)
        if (!it) break
        let a = deg(Math.atan2(p.y - it.y, p.x - it.x)) + 90
        a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15
        a = ((a % 360) + 360) % 360
        updateDesign((d) => ({ ...d, items: d.items.map((x) => (x.id === dr.id ? { ...x, rotation: a } : x)) }), { record: false })
        break
      }
      case 'endpoint': {
        if (!dr.moved) {
          checkpoint()
          dr.moved = true
        }
        const others = design.walls.filter((w) => !dr.ends.some((x) => x.wallId === w.id))
        const np = snapToEndpoints(p, others, px(12), grid)
        updateDesign(
          (d) => {
            const walls = d.walls.map((w) => {
              const hit = dr.ends.filter((x) => x.wallId === w.id)
              if (!hit.length) return w
              const nw = { ...w }
              for (const h of hit) nw[h.end] = np
              return nw
            })
            return {
              ...d,
              walls,
              rooms: d.rooms.map((r) => {
                const hits = dr.roomPts.filter((x) => x.roomId === r.id)
                if (!hits.length) return r
                return { ...r, points: r.points.map((pt, i) => (hits.some((h) => h.index === i) ? np : pt)) }
              }),
              // Keep doors and windows inside walls that just got shorter.
              openings: d.openings.map((o) => {
                if (!dr.ends.some((x) => x.wallId === o.wallId)) return o
                const w = walls.find((x) => x.id === o.wallId)
                return w ? clampOpening(o, w) : o
              }),
            }
          },
          { record: false },
        )
        break
      }
      case 'opening': {
        const o = design.openings.find((x) => x.id === dr.id)
        const w = o && design.walls.find((x) => x.id === o.wallId)
        if (!o || !w) break
        if (!dr.moved) {
          checkpoint()
          dr.moved = true
        }
        const len = wallLength(w)
        const ang = wallAngle(w)
        const t = (p.x - w.a.x) * Math.cos(ang) + (p.y - w.a.y) * Math.sin(ang)
        const next = clampOpening({ ...o, offset: snap(Math.max(0, Math.min(len, t)), grid ? 0.05 : 0) }, w)
        updateDesign((d) => ({ ...d, openings: d.openings.map((x) => (x.id === o.id ? next : x)) }), { record: false })
        break
      }
      case 'roomRect': {
        const b = snapToEndpoints(p, design.walls, px(12), grid)
        setRect({ a: dr.start, b })
        break
      }
    }
  }

  const onPointerUp = () => {
    const dr = drag.current
    drag.current = null
    if (dr?.kind === 'roomRect' && rect) {
      const w = Math.abs(rect.b.x - rect.a.x)
      const h = Math.abs(rect.b.y - rect.a.y)
      if (w >= 0.5 && h >= 0.5) {
        const { walls, room } = makeRectRoom(rect.a, rect.b, `Room ${(fullDesign?.rooms.length ?? 0) + 1}`)
        updateDesign((d) => ({ ...d, walls: [...d.walls, ...walls], rooms: [...d.rooms, room] }))
        // A new room lies outside the one in focus, so switch to it.
        if (focus) focusRoom(room.id)
        select({ kind: 'room', id: room.id })
        setTool('select')
      }
      setRect(null)
    }
  }

  const startItemDrag = (e: React.PointerEvent, id: string) => {
    if (tool !== 'select' || e.button !== 0 || spaceDown.current) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const it = design.items.find((i) => i.id === id)!
    const p = toWorld(e.clientX, e.clientY)
    select({ kind: 'item', id })
    drag.current = { kind: 'item', id, dx: p.x - it.x, dy: p.y - it.y, moved: false }
  }

  const startEndpointDrag = (e: React.PointerEvent, pt: Pt) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    // Use the whole design so walls of neighbouring (hidden) rooms that share this corner move with it.
    const all = fullDesign ?? design
    const ends: { wallId: string; end: 'a' | 'b' }[] = []
    for (const w of all.walls) {
      if (dist(w.a, pt) < 0.001) ends.push({ wallId: w.id, end: 'a' })
      if (dist(w.b, pt) < 0.001) ends.push({ wallId: w.id, end: 'b' })
    }
    const roomPts: { roomId: string; index: number }[] = []
    for (const r of all.rooms) r.points.forEach((q, index) => dist(q, pt) < 0.001 && roomPts.push({ roomId: r.id, index }))
    drag.current = { kind: 'endpoint', ends, roomPts, moved: false }
  }

  const clickable = tool === 'select'
  const sel = selection
  const selectedItem = sel?.kind === 'item' ? design.items.find((i) => i.id === sel.id) : undefined
  const selectedWall = sel?.kind === 'wall' ? design.walls.find((w) => w.id === sel.id) : undefined

  // Wall-tool preview
  let preview: { a: Pt; b: Pt } | null = null
  if (tool === 'wall' && chain.length && cursor) {
    const last = chain[chain.length - 1]
    preview = { a: last, b: orthoAssist(last, snapToEndpoints(cursor, design.walls, px(12), grid)) }
  }

  const floorIds = Array.from(new Set(design.rooms.map((r) => r.floor ?? design.style.floor)))
  const gridStep = s > 50 ? 0.5 : s > 20 ? 1 : 5

  return (
    <div
      className={`editor2d tool-${tool}`}
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('text/catalog-id')
        if (id) placeItemAt(id, toWorld(e.clientX, e.clientY))
      }}
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={(e) => {
          if (chain.length) return finishChain()
          // Double-clicking anywhere in a room (furniture included) opens it on its own.
          if (!clickable || focus) return
          const p = toWorld(e.clientX, e.clientY)
          const room = design.rooms.find((r) => pointInPolygon(p, r.points))
          if (room) focusRoom(room.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (chain.length) finishChain()
        }}
        style={{ background: '#f7f8f9' }}
      >
        <defs>
          <pattern id="grid-minor" width={gridStep / 5} height={gridStep / 5} patternUnits="userSpaceOnUse">
            <path d={`M ${gridStep / 5} 0 L 0 0 0 ${gridStep / 5}`} fill="none" stroke="#e6e9ec" strokeWidth={px(1)} />
          </pattern>
          <pattern id="grid-major" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <rect width={gridStep} height={gridStep} fill="url(#grid-minor)" />
            <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#d3d8dd" strokeWidth={px(1)} />
          </pattern>
          {floorIds.map((f) => {
            const rep = getFloor(f).repeat
            return (
              <pattern key={f} id={`floor-${f}`} width={rep} height={rep} patternUnits="userSpaceOnUse">
                <image href={floorPatternUrl(f)} width={rep} height={rep} preserveAspectRatio="none" />
              </pattern>
            )
          })}
        </defs>
        <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${s}) translate(${-view.cx} ${-view.cy})`}>
          <rect x={view.cx - size.w / s / 2} y={view.cy - size.h / s / 2} width={size.w / s} height={size.h / s} fill="url(#grid-major)" />

          {/* Rooms */}
          {design.rooms.map((r) => {
            const selected = sel?.kind === 'room' && sel.id === r.id
            return (
              <polygon
                key={r.id}
                points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={`url(#floor-${r.floor ?? design.style.floor})`}
                opacity={0.9}
                stroke={selected ? '#2f80ed' : 'none'}
                strokeWidth={px(2)}
                onPointerDown={(e) => {
                  if (!clickable || e.button !== 0 || spaceDown.current) return
                  e.stopPropagation()
                  select({ kind: 'room', id: r.id })
                  drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
                }}
              />
            )
          })}

          {/* Walls */}
          {design.walls.map((w) => {
            const [from, to] = visible?.spans.get(w.id) ?? [0, wallLength(w)]
            const selected = sel?.kind === 'wall' && sel.id === w.id
            return (
              <g key={w.id} transform={`translate(${w.a.x} ${w.a.y}) rotate(${deg(wallAngle(w))})`}>
                <rect
                  x={from - w.thickness / 2}
                  y={-w.thickness / 2}
                  width={to - from + w.thickness}
                  height={w.thickness}
                  fill={selected ? '#2f80ed' : '#383c42'}
                  onPointerDown={(e) => {
                    if (!clickable || e.button !== 0 || spaceDown.current) return
                    e.stopPropagation()
                    select({ kind: 'wall', id: w.id })
                  }}
                />
              </g>
            )
          })}

          {/* Openings */}
          {design.openings.map((o) => {
            const w = design.walls.find((x) => x.id === o.wallId)
            if (!w) return null
            return (
              <OpeningSymbol
                key={o.id}
                o={o}
                w={w}
                selected={sel?.kind === 'opening' && sel.id === o.id}
                px={px}
                onPointerDown={(e) => {
                  if (!clickable || e.button !== 0 || spaceDown.current) return
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  select({ kind: 'opening', id: o.id })
                  drag.current = { kind: 'opening', id: o.id, moved: false }
                }}
              />
            )
          })}

          {/* Items (rugs first, raised items last) */}
          {[...design.items]
            .sort((a, b) => layer(a) - layer(b))
            .map((it) => {
              const entry = getEntry(it.catalogId)
              const selected = sel?.kind === 'item' && sel.id === it.id
              return (
                <g
                  key={it.id}
                  transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}
                  onPointerDown={(e) => startItemDrag(e, it.id)}
                  className={clickable ? 'item hoverable' : 'item'}
                >
                  <PlanSymbol e={entry} color={itemColor(it, entry, design.style)} />
                  {selected && (
                    <rect
                      x={-entry.w / 2 - px(4)}
                      y={-entry.d / 2 - px(4)}
                      width={entry.w + px(8)}
                      height={entry.d + px(8)}
                      fill="none"
                      stroke="#2f80ed"
                      strokeWidth={px(1.5)}
                      strokeDasharray={`${px(5)} ${px(3)}`}
                    />
                  )}
                </g>
              )
            })}

          {/* Room labels */}
          {design.rooms.map((r) => {
            const c = polygonCentroid(r.points)
            return (
              <g key={r.id} transform={`translate(${c.x} ${c.y})`} pointerEvents="none" className="room-label">
                <text textAnchor="middle" fontSize={px(13)} y={-px(3)} fontWeight={600} fill="#2b2f33" stroke="#ffffff" strokeWidth={px(3)} paintOrder="stroke" strokeLinejoin="round">
                  {r.name}
                </text>
                <text textAnchor="middle" fontSize={px(11)} y={px(11)} fill="#5a6168" stroke="#ffffff" strokeWidth={px(3)} paintOrder="stroke" strokeLinejoin="round">
                  {polygonArea(r.points).toFixed(1)} m²
                </text>
              </g>
            )
          })}

          {/* Rotate handle for the selected item */}
          {selectedItem && tool === 'select' && (
            <RotateHandle
              item={selectedItem}
              px={px}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                checkpoint()
                drag.current = { kind: 'rotate', id: selectedItem.id }
              }}
            />
          )}

          {/* Endpoint handles + length for the selected wall */}
          {selectedWall && tool === 'select' && (
            <>
              <DimLabel a={selectedWall.a} b={selectedWall.b} px={px} offset={selectedWall.thickness / 2 + px(14)} />
              {[selectedWall.a, selectedWall.b].map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={px(7)}
                  fill="#ffffff"
                  stroke="#2f80ed"
                  strokeWidth={px(2)}
                  className="handle"
                  onPointerDown={(e) => startEndpointDrag(e, pt)}
                />
              ))}
            </>
          )}

          {/* Wall tool preview */}
          {tool === 'wall' && (
            <>
              {chain.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={px(4)} fill="#2f80ed" />
              ))}
              {preview && (
                <>
                  <line x1={preview.a.x} y1={preview.a.y} x2={preview.b.x} y2={preview.b.y} stroke="#2f80ed" strokeWidth={WALL_THICKNESS} strokeOpacity={0.5} />
                  <DimLabel a={preview.a} b={preview.b} px={px} offset={px(16)} />
                </>
              )}
              {cursor && !chain.length && <circle cx={snapToEndpoints(cursor, design.walls, px(12), grid).x} cy={snapToEndpoints(cursor, design.walls, px(12), grid).y} r={px(4)} fill="#2f80ed" />}
            </>
          )}

          {/* Room tool preview */}
          {rect && (
            <>
              <rect
                x={Math.min(rect.a.x, rect.b.x)}
                y={Math.min(rect.a.y, rect.b.y)}
                width={Math.abs(rect.b.x - rect.a.x)}
                height={Math.abs(rect.b.y - rect.a.y)}
                fill="#2f80ed"
                fillOpacity={0.08}
                stroke="#2f80ed"
                strokeWidth={WALL_THICKNESS}
                strokeOpacity={0.5}
              />
              <DimLabel a={{ x: Math.min(rect.a.x, rect.b.x), y: Math.min(rect.a.y, rect.b.y) }} b={{ x: Math.max(rect.a.x, rect.b.x), y: Math.min(rect.a.y, rect.b.y) }} px={px} offset={-px(16)} />
              <DimLabel a={{ x: Math.max(rect.a.x, rect.b.x), y: Math.min(rect.a.y, rect.b.y) }} b={{ x: Math.max(rect.a.x, rect.b.x), y: Math.max(rect.a.y, rect.b.y) }} px={px} offset={-px(16)} />
            </>
          )}

          {/* Door / window hover preview */}
          {hoverWall && (tool === 'door' || tool === 'window') && (
            <OpeningSymbol
              o={clampOpening(makeOpening(hoverWall.wall.id, tool, snap(hoverWall.t * wallLength(hoverWall.wall), grid ? 0.05 : 0)), hoverWall.wall)}
              w={hoverWall.wall}
              selected
              ghost
              px={px}
            />
          )}

          {/* Placement ghost */}
          {tool === 'place' && placeCatalogId && cursor && (
            <g transform={ghostTransform(design, cursor, placeCatalogId, grid)} opacity={0.6} pointerEvents="none">
              <PlanSymbol e={getEntry(placeCatalogId)} color={itemColor({ id: '', catalogId: placeCatalogId, x: 0, y: 0, rotation: 0 }, getEntry(placeCatalogId), design.style)} />
            </g>
          )}
        </g>
      </svg>
      <ScaleBar scale={s} />
      <div className="plan-hint">{hintFor(tool, chain.length > 0, !!focus, design.rooms.length > 0)}</div>
      <div className="zoom-buttons">
        <button onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.25) }))} title="Zoom in">
          +
        </button>
        <button onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.25) }))} title="Zoom out">
          −
        </button>
        <button onClick={() => setView(fitView(design, size.w, size.h, focus))} title={focus ? 'Fit the room to the screen' : 'Fit to screen'}>
          ⤢
        </button>
      </div>
    </div>
  )
}

function ghostTransform(design: Design, cursor: Pt, catalogId: string, grid: number): string {
  const onWall = wallSnap(design, cursor, catalogId)
  if (onWall) return `translate(${onWall.x} ${onWall.y}) rotate(${onWall.rotation})`
  return `translate(${snap(cursor.x, grid ? 0.05 : 0)} ${snap(cursor.y, grid ? 0.05 : 0)})`
}

/** Draw order in the plan: rugs at the bottom, raised items (lamps on tables) on top. */
function layer(it: { catalogId: string; elevation?: number }): number {
  return getEntry(it.catalogId).symbol === 'rug' ? -1 : (it.elevation ?? 0)
}

function hintFor(tool: string, drawing: boolean, focused: boolean, hasRooms: boolean): string {
  switch (tool) {
    case 'wall':
      return drawing ? 'Click to add corners · double-click, Enter or Esc to finish' : 'Click to start a wall'
    case 'room':
      return 'Drag to draw a rectangular room'
    case 'door':
      return 'Click on a wall to add a door'
    case 'window':
      return 'Click on a wall to add a window'
    case 'place':
      return 'Click to place · hold Shift to place several · Esc to cancel'
    default:
      if (focused) return 'Only this room is shown · drag items to move · R rotates · Del deletes'
      return `Drag to pan · scroll to zoom · drag items to move${hasRooms ? ' · double-click a room to edit it alone' : ''}`
  }
}

function OpeningSymbol({
  o,
  w,
  selected,
  ghost,
  px,
  onPointerDown,
}: {
  o: Opening
  w: Wall
  selected: boolean
  ghost?: boolean
  px: (n: number) => number
  onPointerDown?: (e: React.PointerEvent) => void
}) {
  const T = w.thickness
  const x0 = o.offset - o.width / 2
  const stroke = selected ? '#2f80ed' : '#383c42'
  return (
    <g transform={`translate(${w.a.x} ${w.a.y}) rotate(${deg(wallAngle(w))})`} opacity={ghost ? 0.7 : 1} pointerEvents={ghost ? 'none' : undefined} onPointerDown={onPointerDown} className="opening">
      <rect x={x0} y={-T / 2 - px(1)} width={o.width} height={T + px(2)} fill="#ffffff" stroke={stroke} strokeWidth={px(1)} />
      {o.type === 'window' ? (
        <>
          <line x1={x0} y1={-T / 6} x2={x0 + o.width} y2={-T / 6} stroke={stroke} strokeWidth={px(1)} />
          <line x1={x0} y1={T / 6} x2={x0 + o.width} y2={T / 6} stroke={stroke} strokeWidth={px(1)} />
        </>
      ) : (
        <>
          <line x1={x0} y1={T / 2} x2={x0} y2={T / 2 + o.width} stroke={stroke} strokeWidth={px(1.5)} />
          <path d={`M ${x0} ${T / 2 + o.width} A ${o.width} ${o.width} 0 0 0 ${x0 + o.width} ${T / 2}`} fill="none" stroke={stroke} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} />
        </>
      )}
      {/* wider invisible hit area */}
      {!ghost && <rect x={x0} y={-T / 2 - px(6)} width={o.width} height={T + px(12)} fill="transparent" />}
    </g>
  )
}

function RotateHandle({ item, px, onPointerDown }: { item: { x: number; y: number; rotation: number; catalogId: string }; px: (n: number) => number; onPointerDown: (e: React.PointerEvent) => void }) {
  const e = getEntry(item.catalogId)
  const r = (item.rotation * Math.PI) / 180
  const reach = e.d / 2 + px(22)
  // handle sits behind the item's back edge
  const hx = item.x + Math.sin(r) * reach
  const hy = item.y - Math.cos(r) * reach
  const bx = item.x + Math.sin(r) * (e.d / 2)
  const by = item.y - Math.cos(r) * (e.d / 2)
  return (
    <g>
      <line x1={bx} y1={by} x2={hx} y2={hy} stroke="#2f80ed" strokeWidth={px(1.5)} />
      <circle cx={hx} cy={hy} r={px(7)} fill="#ffffff" stroke="#2f80ed" strokeWidth={px(2)} className="handle rotate" onPointerDown={onPointerDown} />
      <text x={hx} y={hy + px(3.5)} textAnchor="middle" fontSize={px(10)} fill="#2f80ed" pointerEvents="none">
        ↻
      </text>
    </g>
  )
}

function DimLabel({ a, b, px, offset }: { a: Pt; b: Pt; px: (n: number) => number; offset: number }) {
  const len = dist(a, b)
  if (len < 0.01) return null
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const nx = -Math.sin(ang) * offset
  const ny = Math.cos(ang) * offset
  const mx = (a.x + b.x) / 2 + nx
  const my = (a.y + b.y) / 2 + ny
  let rot = deg(ang)
  if (rot > 90 || rot < -90) rot += 180
  return (
    <g pointerEvents="none">
      <line x1={a.x + nx} y1={a.y + ny} x2={b.x + nx} y2={b.y + ny} stroke="#2f80ed" strokeWidth={px(1)} />
      <g transform={`translate(${mx} ${my}) rotate(${rot})`}>
        <rect x={-px(26)} y={-px(9)} width={px(52)} height={px(18)} rx={px(4)} fill="#2f80ed" />
        <text textAnchor="middle" y={px(4)} fontSize={px(11)} fill="#ffffff" fontWeight={600}>
          {len.toFixed(2)} m
        </text>
      </g>
    </g>
  )
}

function ScaleBar({ scale }: { scale: number }) {
  const meters = scale > 120 ? 0.5 : scale > 50 ? 1 : scale > 20 ? 2 : 5
  return (
    <div className="scale-bar">
      <div style={{ width: meters * scale }} />
      <span>{meters} m</span>
    </div>
  )
}
