import type { CatalogEntry } from '../catalog/catalog'
import type { Item, StyleSettings } from '../types'
import type { Palette } from '../three/Procedural'

const CABINET_WHITE = '#f2f1ed'

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (v: number, s: number) => (v >> s) & 255
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t))
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function roleColor(entry: CatalogEntry, style: StyleSettings): string {
  switch (entry.colorRole) {
    case 'primary':
      return style.primary
    case 'wood':
      return style.wood
    case 'metal':
      return style.metal
    case 'accent':
      return style.accent
    case 'white':
      return CABINET_WHITE
    default:
      return '#ffffff'
  }
}

export function itemColor(item: Item, entry: CatalogEntry, style: StyleSettings): string {
  return item.color ?? roleColor(entry, style)
}

export function paletteFor(style: StyleSettings): Palette {
  return {
    main: style.primary,
    wood: style.wood,
    metal: style.metal,
    accent: style.accent,
    fabric: mix(style.primary, '#ffffff', 0.25),
  }
}

/** Readable text color for a given background. */
export function contrastText(bg: string): string {
  const v = parseInt(bg.slice(1), 16)
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255
  return lum > 0.6 ? '#1f2328' : '#ffffff'
}
