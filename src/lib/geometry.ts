import { nanoid } from 'nanoid'
import type { Opening, Pt, Wall } from '../types'

export const uid = () => nanoid(10)

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

export const wallLength = (w: Wall) => dist(w.a, w.b)

export const wallAngle = (w: Wall) => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)

export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v)

export const snapPt = (p: Pt, step: number): Pt => ({ x: snap(p.x, step), y: snap(p.y, step) })

/** Closest point on segment ab to p, with its parameter t in [0, 1]. */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const pt = { x: a.x + dx * t, y: a.y + dy * t }
  return { pt, t, d: dist(p, pt) }
}

/** The wall nearest to p within maxDist, if any. */
export function nearestWall(p: Pt, walls: Wall[], maxDist: number) {
  let best: { wall: Wall; t: number; d: number; pt: Pt } | null = null
  for (const wall of walls) {
    const r = projectOnSegment(p, wall.a, wall.b)
    if (r.d <= maxDist && (!best || r.d < best.d)) best = { wall, ...r }
  }
  return best
}

/** Snap a point to existing wall endpoints when close; otherwise to the grid. */
export function snapToEndpoints(p: Pt, walls: Wall[], radius: number, grid: number): Pt {
  let best: Pt | null = null
  let bestD = radius
  for (const w of walls) {
    for (const e of [w.a, w.b]) {
      const d = dist(p, e)
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
  }
  return best ? { ...best } : snapPt(p, grid)
}

/** Keep the drawn segment horizontal/vertical when it is within a few degrees of an axis. */
export function orthoAssist(from: Pt, to: Pt, degrees = 8): Pt {
  const ang = Math.abs((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI)
  if (ang < degrees || ang > 180 - degrees) return { x: to.x, y: from.y }
  if (Math.abs(ang - 90) < degrees) return { x: from.x, y: to.y }
  return to
}

export function polygonArea(pts: Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export function polygonCentroid(pts: Pt[]): Pt {
  const n = pts.length || 1
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
}

export function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Clamp an opening so it stays fully inside its wall. */
export function clampOpening(o: Opening, wall: Wall): Opening {
  const len = wallLength(wall)
  const width = Math.min(o.width, Math.max(0.3, len - 0.1))
  const half = width / 2
  return { ...o, width, offset: Math.max(half + 0.05, Math.min(len - half - 0.05, o.offset)) }
}

export function bounds(pts: Pt[]) {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 10, maxY: 8 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

/** Whether p lies inside a w×d footprint centered at c and rotated by deg (clockwise in plan). */
export function inFootprint(p: Pt, c: Pt, w: number, d: number, deg: number): boolean {
  const r = (-deg * Math.PI) / 180
  const dx = p.x - c.x
  const dy = p.y - c.y
  const lx = dx * Math.cos(r) - dy * Math.sin(r)
  const ly = dx * Math.sin(r) + dy * Math.cos(r)
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= d / 2
}
