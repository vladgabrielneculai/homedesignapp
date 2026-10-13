import type { Design, Item, Pt, Room, Wall } from '../types'
import { pointInPolygon, projectOnSegment, wallLength } from './geometry'

/**
 * The stretch of a wall that belongs to a room, in meters from wall.a: the part running along one of
 * the room's edges, or the whole wall when it stands inside the room. Null when the wall isn't part of it.
 */
export function wallSpan(w: Wall, poly: Pt[]): [number, number] | null {
  const len = wallLength(w)
  if (len < 0.01) return null
  const tol = w.thickness / 2 + 0.05
  const wx = (w.b.x - w.a.x) / len
  const wy = (w.b.y - w.a.y) / len
  let from = Infinity
  let to = -Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const elen = Math.hypot(b.x - a.x, b.y - a.y)
    if (elen < 0.01) continue
    const ux = (b.x - a.x) / elen
    const uy = (b.y - a.y) / elen
    // Both wall ends must lie on the edge's line…
    const off = (p: Pt) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux)
    if (off(w.a) > tol || off(w.b) > tol) continue
    // …and the wall must overlap the edge by more than a corner's worth.
    const ta = (a.x - w.a.x) * wx + (a.y - w.a.y) * wy
    const tb = (b.x - w.a.x) * wx + (b.y - w.a.y) * wy
    const s = Math.max(0, Math.min(ta, tb))
    const e = Math.min(len, Math.max(ta, tb))
    if (e - s > 0.1) {
      from = Math.min(from, s)
      to = Math.max(to, e)
    }
  }
  if (from < to) return [from, to]
  // Partition walls drawn inside the room.
  const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
  return pointInPolygon(mid, poly) && distToBoundary(mid, poly) > tol ? [0, len] : null
}

export function wallInRoom(w: Wall, poly: Pt[]): boolean {
  return wallSpan(w, poly) !== null
}

function distToBoundary(p: Pt, poly: Pt[]): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, projectOnSegment(p, poly[i], poly[(i + 1) % poly.length]).d)
  return d
}

export function itemInRoom(it: Item, poly: Pt[]): boolean {
  return pointInPolygon(it, poly)
}

/**
 * The part of the design that belongs to one room: its floor, furniture, and its walls cut down to the
 * stretch around the room (with the doors and windows on that stretch).
 */
export function roomDesign(design: Design, room: Room): Design {
  const walls: Wall[] = []
  const openings: Design['openings'] = []
  for (const w of design.walls) {
    const span = wallSpan(w, room.points)
    if (!span) continue
    const [s, e] = span
    const len = wallLength(w)
    const ux = (w.b.x - w.a.x) / len
    const uy = (w.b.y - w.a.y) / len
    walls.push({ ...w, a: { x: w.a.x + ux * s, y: w.a.y + uy * s }, b: { x: w.a.x + ux * e, y: w.a.y + uy * e } })
    for (const o of design.openings)
      if (o.wallId === w.id && o.offset - o.width / 2 >= s - 0.01 && o.offset + o.width / 2 <= e + 0.01) openings.push({ ...o, offset: o.offset - s })
  }
  return {
    ...design,
    walls,
    openings,
    rooms: [room],
    items: design.items.filter((it) => itemInRoom(it, room.points)),
  }
}
