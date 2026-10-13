import type { StyleSettings, Wall, WallFinish, WallSide } from '../types'

export type PatternGroup = 'wallpaper' | 'material'

export interface PatternDef {
  id: string
  name: string
  group: PatternGroup
  /** Real size of one square repeat of the pattern, in meters. */
  size: number
  /** Default main color; patterns with `tint` can be recolored. */
  color: string
  tint?: boolean
  roughness: number
  /** Strength of the relief (grout lines, brick joints, fibres). 0 = flat. */
  relief: number
}

/** Built-in wallpapers and wall materials. The textures are drawn in three/wallTextures.ts. */
export const PATTERNS: PatternDef[] = [
  { id: 'limewash', name: 'Limewash', group: 'wallpaper', size: 2.4, color: '#d9cdbb', tint: true, roughness: 0.95, relief: 0.15 },
  { id: 'pinstripe', name: 'Pinstripe', group: 'wallpaper', size: 0.53, color: '#e7e1d5', tint: true, roughness: 0.85, relief: 0 },
  { id: 'wideStripe', name: 'Wide stripes', group: 'wallpaper', size: 0.53, color: '#b9c7c2', tint: true, roughness: 0.85, relief: 0 },
  { id: 'artDeco', name: 'Art deco fans', group: 'wallpaper', size: 0.53, color: '#2f4a46', tint: true, roughness: 0.75, relief: 0 },
  { id: 'botanical', name: 'Botanical leaves', group: 'wallpaper', size: 0.64, color: '#e9e4d6', tint: true, roughness: 0.85, relief: 0 },
  { id: 'trellis', name: 'Trellis', group: 'wallpaper', size: 0.53, color: '#e4ddd0', tint: true, roughness: 0.85, relief: 0 },
  { id: 'grasscloth', name: 'Grasscloth', group: 'wallpaper', size: 0.9, color: '#c8b48f', tint: true, roughness: 1, relief: 0.5 },
  { id: 'brick', name: 'Red brick', group: 'material', size: 0.9, color: '#9c4f36', roughness: 0.95, relief: 1 },
  { id: 'whiteBrick', name: 'Painted brick', group: 'material', size: 0.9, color: '#efece6', tint: true, roughness: 0.9, relief: 1 },
  { id: 'concrete', name: 'Concrete', group: 'material', size: 2, color: '#a9a69f', roughness: 0.9, relief: 0.2 },
  { id: 'subway', name: 'Subway tiles', group: 'material', size: 0.6, color: '#f4f3ef', tint: true, roughness: 0.2, relief: 0.8 },
  { id: 'zellige', name: 'Zellige tiles', group: 'material', size: 0.5, color: '#5e8a7c', tint: true, roughness: 0.15, relief: 0.6 },
  { id: 'woodPanel', name: 'Wood paneling', group: 'material', size: 1.2, color: '#a87a4f', tint: true, roughness: 0.6, relief: 0.6 },
  { id: 'marbleSlab', name: 'Marble slab', group: 'material', size: 1.6, color: '#efede8', roughness: 0.2, relief: 0 },
]

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]))

export function getPattern(id: string): PatternDef | undefined {
  return BY_ID.get(id)
}

/** The finish shown on one side of a wall, falling back to the wall's old color and then the style. */
export function wallFinish(w: Wall, side: WallSide, style: StyleSettings): WallFinish {
  return w.sides?.[side] ?? { kind: 'paint', color: w.color ?? style.wallColor }
}

/** A representative flat color for a finish (2D plan, wall caps). */
export function finishColor(f: WallFinish, style: StyleSettings, wallpaperColor?: (id: string) => string | undefined): string {
  if (f.kind === 'paint') return f.color
  if (f.kind === 'pattern') return f.color ?? getPattern(f.id)?.color ?? style.wallColor
  return wallpaperColor?.(f.id) ?? style.wallColor
}

/** Set one side's finish, turning an old whole-wall color into explicit sides so the other side keeps it. */
export function withSideFinish(w: Wall, side: WallSide, f: WallFinish | undefined): Wall {
  const sides = { ...(w.color ? { a: { kind: 'paint', color: w.color } as WallFinish, b: { kind: 'paint', color: w.color } as WallFinish } : {}), ...w.sides }
  if (f) sides[side] = f
  else delete sides[side]
  const { color: _old, ...rest } = w
  void _old
  return { ...rest, sides }
}

export function sameFinish(a: WallFinish | undefined, b: WallFinish | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
