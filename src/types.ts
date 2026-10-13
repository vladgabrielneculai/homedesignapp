// All plan coordinates are in meters. The 2D plan uses (x, y); in 3D, plan y maps to world z.

export interface Pt {
  x: number
  y: number
}

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number
  height: number
  /** Optional per-wall paint; falls back to the design style's wall color. */
  color?: string
}

export type OpeningType = 'door' | 'window'

export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  /** Distance in meters from wall.a to the opening's center. */
  offset: number
  width: number
  height: number
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number
}

export interface Room {
  id: string
  name: string
  points: Pt[]
  /** Optional floor override; falls back to the design style's floor. */
  floor?: FloorId
}

export interface Item {
  id: string
  catalogId: string
  x: number
  y: number
  /** Rotation in degrees, clockwise when seen from above. */
  rotation: number
  /** Overrides the style's primary color for procedural items. */
  color?: string
  /** Height above the floor in meters, e.g. a lamp on a side table. */
  elevation?: number
}

export type FloorId = 'oak' | 'walnut' | 'whiteOak' | 'tile' | 'marble' | 'concrete' | 'carpet' | 'terracotta'

export interface StyleSettings {
  presetId: string
  wallColor: string
  floor: FloorId
  /** Main upholstery / feature color. */
  primary: string
  /** Wood tone for frames, tables and cabinets. */
  wood: string
  /** Metal tone for legs, handles and fixtures. */
  metal: string
  /** Secondary accent (cushions, rugs, decor). */
  accent: string
}

export interface Design {
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  items: Item[]
  style: StyleSettings
}

export interface Variant {
  id: string
  name: string
  design: Design
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  variants: Variant[]
  activeVariantId: string
  /** Small PNG data URL captured from the 3D view. */
  thumbnail?: string
}

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'place'

export type Selection =
  | { kind: 'item'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string }
  | null

export type ViewMode = '2d' | '3d' | 'split' | 'compare'
