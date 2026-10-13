import type { FloorId, StyleSettings } from '../types'

export interface StylePreset extends StyleSettings {
  name: string
  description: string
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    presetId: 'scandi',
    name: 'Scandinavian',
    description: 'Light oak, soft whites and muted textiles.',
    wallColor: '#f3f1ec',
    floor: 'whiteOak',
    primary: '#c9c4ba',
    wood: '#d8b98c',
    metal: '#2b2b2b',
    accent: '#8fa9a0',
  },
  {
    presetId: 'modern',
    name: 'Modern',
    description: 'Crisp greys, polished concrete and black metal.',
    wallColor: '#e9eaeb',
    floor: 'concrete',
    primary: '#4a5058',
    wood: '#6b5644',
    metal: '#1c1c1e',
    accent: '#d9a441',
  },
  {
    presetId: 'industrial',
    name: 'Industrial',
    description: 'Warm brick tones, dark walnut and raw steel.',
    wallColor: '#b9a99a',
    floor: 'walnut',
    primary: '#6e4a33',
    wood: '#4b3526',
    metal: '#3d3f42',
    accent: '#a35d3a',
  },
  {
    presetId: 'classic',
    name: 'Classic',
    description: 'Cream walls, marble and rich navy upholstery.',
    wallColor: '#efe6d6',
    floor: 'marble',
    primary: '#2f3e5c',
    wood: '#7a4f2e',
    metal: '#b8954a',
    accent: '#9b2f3a',
  },
  {
    presetId: 'boho',
    name: 'Boho',
    description: 'Terracotta, rattan and sun-warmed colors.',
    wallColor: '#f1e2cf',
    floor: 'terracotta',
    primary: '#d08b5b',
    wood: '#b07c4f',
    metal: '#8a6a3b',
    accent: '#6f8f52',
  },
  {
    presetId: 'japandi',
    name: 'Japandi',
    description: 'Calm neutrals, pale wood and charcoal accents.',
    wallColor: '#e8e2d8',
    floor: 'oak',
    primary: '#a89f91',
    wood: '#c3a27a',
    metal: '#30302e',
    accent: '#5c6650',
  },
]

export const DEFAULT_STYLE: StyleSettings = stripPreset(STYLE_PRESETS[0])

export function stripPreset(p: StylePreset): StyleSettings {
  const { presetId, wallColor, floor, primary, wood, metal, accent } = p
  return { presetId, wallColor, floor, primary, wood, metal, accent }
}

export interface FloorMaterial {
  id: FloorId
  name: string
  base: string
  pattern: 'planks' | 'tiles' | 'marble' | 'concrete' | 'carpet' | 'herringbone'
  /** Size in meters that one texture repeat covers. */
  repeat: number
}

export const FLOORS: FloorMaterial[] = [
  { id: 'oak', name: 'Oak planks', base: '#b98b5a', pattern: 'planks', repeat: 1.6 },
  { id: 'whiteOak', name: 'White oak', base: '#d9c3a0', pattern: 'planks', repeat: 1.6 },
  { id: 'walnut', name: 'Walnut herringbone', base: '#6b4a32', pattern: 'herringbone', repeat: 1.2 },
  { id: 'tile', name: 'Ceramic tile', base: '#e4e2dd', pattern: 'tiles', repeat: 1.2 },
  { id: 'marble', name: 'Marble', base: '#ece9e4', pattern: 'marble', repeat: 2.4 },
  { id: 'concrete', name: 'Polished concrete', base: '#a7a6a2', pattern: 'concrete', repeat: 3 },
  { id: 'carpet', name: 'Carpet', base: '#9c958a', pattern: 'carpet', repeat: 1 },
  { id: 'terracotta', name: 'Terracotta tile', base: '#c0704a', pattern: 'tiles', repeat: 1.2 },
]

export function getFloor(id: FloorId): FloorMaterial {
  return FLOORS.find((f) => f.id === id) ?? FLOORS[0]
}

export const PAINT_SWATCHES = [
  '#ffffff',
  '#f3f1ec',
  '#efe6d6',
  '#e8e2d8',
  '#e9eaeb',
  '#d7dfe0',
  '#c9d6c8',
  '#b9a99a',
  '#d9b8a3',
  '#9fb3c8',
  '#5d6d7e',
  '#3b4a3f',
]
