import * as THREE from 'three'
import { getPattern, type PatternDef } from '../catalog/wallFinishes'
import { getBlob } from '../lib/blobStore'
import { mix } from '../lib/colors'
import type { Wallpaper } from '../types'

/**
 * Wallpapers and wall materials drawn on canvases. Each pattern is one square repeat of `def.size`
 * meters. Patterns with relief also get a height map (grout lines, brick joints, fibres) used as a
 * bump map so light rakes across them.
 */

const S = 1024

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const lighten = (c: string, t: number) => mix(c, '#ffffff', t)
const darken = (c: string, t: number) => mix(c, '#000000', t)
const gray = (v: number) => {
  const g = Math.max(0, Math.min(255, Math.round(v)))
  return `rgb(${g},${g},${g})`
}

/** Calls fn at the position and its wrapped copies so shapes crossing an edge tile seamlessly. */
function wrapped(x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-S, 0, S])
    for (const dy of [-S, 0, S]) {
      const px = x + dx
      const py = y + dy
      if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue
      fn(px, py)
    }
}

function mottle(ctx: CanvasRenderingContext2D, rand: () => number, base: string, count: number, rMin: number, rMax: number, strength: number) {
  for (let i = 0; i < count; i++) {
    const r = rMin + rand() * (rMax - rMin)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    const c = rand() > 0.5 ? lighten(base, strength * rand()) : darken(base, strength * rand())
    g.addColorStop(0, c)
    g.addColorStop(1, c + '00')
    const x = rand() * S
    const y = rand() * S
    wrapped(x, y, r, (px, py) => {
      ctx.save()
      ctx.translate(px, py)
      ctx.fillStyle = g
      ctx.globalAlpha = 0.55
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.restore()
    })
  }
  ctx.globalAlpha = 1
}

function grain(ctx: CanvasRenderingContext2D, rand: () => number, base: string, n: number, alpha: number, size = 1.6) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rand() > 0.5 ? lighten(base, rand() * 0.25) : darken(base, rand() * 0.25)
    ctx.globalAlpha = alpha
    ctx.fillRect(rand() * S, rand() * S, size, size)
  }
  ctx.globalAlpha = 1
}

/** Running-bond bricks or tiles: cols per row, rows per repeat, joint width in px. */
function bond(
  color: CanvasRenderingContext2D,
  height: CanvasRenderingContext2D,
  rand: () => number,
  cols: number,
  rows: number,
  joint: number,
  jointColor: string,
  unit: (r: () => number) => string,
  bevel: number,
  offset = 0.5,
) {
  const bw = S / cols
  const bh = S / rows
  color.fillStyle = jointColor
  color.fillRect(0, 0, S, S)
  height.fillStyle = gray(40)
  height.fillRect(0, 0, S, S)
  for (let r = 0; r < rows; r++) {
    const shift = (r % 2) * offset * bw
    for (let c = -1; c < cols; c++) {
      const x = c * bw + shift + joint / 2
      const y = r * bh + joint / 2
      const w = bw - joint
      const h = bh - joint
      color.fillStyle = unit(rand)
      color.fillRect(x, y, w, h)
      // Face height: flat top with a bevel towards the joints.
      const top = 200 + rand() * 30
      height.fillStyle = gray(top)
      height.fillRect(x, y, w, h)
      if (bevel > 0) {
        for (let i = 0; i < bevel; i++) {
          height.strokeStyle = gray(60 + ((top - 60) * i) / bevel)
          height.lineWidth = 1
          height.strokeRect(x + i + 0.5, y + i + 0.5, w - i * 2 - 1, h - i * 2 - 1)
        }
      }
    }
  }
}

type Drawer = (color: CanvasRenderingContext2D, height: CanvasRenderingContext2D, base: string, rand: () => number) => void

const DRAW: Record<string, Drawer> = {
  limewash(ctx, h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    mottle(ctx, rand, base, 70, 80, 260, 0.12)
    // soft brush strokes
    for (let i = 0; i < 140; i++) {
      ctx.strokeStyle = rand() > 0.5 ? lighten(base, 0.1) : darken(base, 0.07)
      ctx.globalAlpha = 0.08
      ctx.lineWidth = 20 + rand() * 40
      ctx.lineCap = 'round'
      const x = rand() * S
      const y = rand() * S
      const a = rand() * Math.PI
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + Math.cos(a) * 80, y + Math.sin(a) * 80, x + Math.cos(a + 0.6) * 160, y + Math.sin(a + 0.6) * 160)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    h.fillStyle = gray(128)
    h.fillRect(0, 0, S, S)
    grain(h, rand, '#808080', 30000, 0.5, 2)
  },
  pinstripe(ctx, _h, base, rand) {
    ctx.fillStyle = lighten(base, 0.25)
    ctx.fillRect(0, 0, S, S)
    grain(ctx, rand, lighten(base, 0.25), 8000, 0.25)
    const n = 16
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = darken(base, 0.12)
      ctx.fillRect((i * S) / n, 0, 3, S)
      ctx.fillStyle = base
      ctx.fillRect((i * S) / n + 10, 0, 12, S)
    }
  },
  wideStripe(ctx, _h, base, rand) {
    const light = lighten(base, 0.55)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? base : light
      ctx.fillRect((i * S) / 4, 0, S / 4, S)
    }
    grain(ctx, rand, base, 12000, 0.18)
  },
  artDeco(ctx, _h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    const gold = '#c9a45c'
    const r = S / 8
    for (let row = -1; row <= 8; row++)
      for (let col = -1; col <= 4; col++) {
        const cx = col * r * 2 + (row % 2 ? r : 0)
        const cy = row * r
        ctx.fillStyle = row % 2 ? lighten(base, 0.06) : base
        ctx.beginPath()
        ctx.arc(cx + r, cy + r, r, Math.PI, 0)
        ctx.fill()
        ctx.strokeStyle = gold
        for (let k = 1; k <= 4; k++) {
          ctx.lineWidth = k === 4 ? 4 : 2
          ctx.beginPath()
          ctx.arc(cx + r, cy + r, (r * k) / 4, Math.PI, 0)
          ctx.stroke()
        }
        for (let k = 1; k < 6; k++) {
          const a = Math.PI + (Math.PI * k) / 6
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(cx + r + Math.cos(a) * r * 0.25, cy + r + Math.sin(a) * r * 0.25)
          ctx.lineTo(cx + r + Math.cos(a) * r, cy + r + Math.sin(a) * r)
          ctx.stroke()
        }
      }
    grain(ctx, rand, base, 6000, 0.15)
  },
  botanical(ctx, _h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    const greens = ['#4f6f52', '#6d8b62', '#3d5a45', '#8aa37a']
    for (let i = 0; i < 46; i++) {
      const x = rand() * S
      const y = rand() * S
      const a = rand() * Math.PI * 2
      const len = 70 + rand() * 90
      const col = greens[Math.floor(rand() * greens.length)]
      wrapped(x, y, len, (px, py) => {
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(a)
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0)
        ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0)
        ctx.fill()
        ctx.strokeStyle = lighten(col, 0.3)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(len * 0.95, 0)
        ctx.stroke()
        ctx.restore()
      })
    }
    grain(ctx, rand, base, 8000, 0.12)
  },
  trellis(ctx, _h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = darken(base, 0.28)
    ctx.lineWidth = 7
    const n = 4
    const c = S / n
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const x = i * c
        const y = j * c
        ctx.beginPath()
        ctx.ellipse(x, y, c * 0.36, c * 0.36, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x + c * 0.36, y)
        ctx.bezierCurveTo(x + c * 0.5, y + c * 0.12, x + c * 0.5, y + c * 0.12, x + c - c * 0.36, y)
        ctx.moveTo(x, y + c * 0.36)
        ctx.bezierCurveTo(x + c * 0.12, y + c * 0.5, x + c * 0.12, y + c * 0.5, x, y + c - c * 0.36)
        ctx.stroke()
      }
    grain(ctx, rand, base, 8000, 0.15)
  },
  grasscloth(ctx, h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    h.fillStyle = gray(128)
    h.fillRect(0, 0, S, S)
    for (let i = 0; i < 2600; i++) {
      const y = rand() * S
      const x = rand() * S
      const len = 60 + rand() * 340
      const t = rand()
      ctx.strokeStyle = t > 0.5 ? lighten(base, rand() * 0.3) : darken(base, rand() * 0.3)
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1 + rand() * 3
      h.strokeStyle = gray(t > 0.5 ? 200 : 70)
      h.lineWidth = ctx.lineWidth
      for (const c of [ctx, h]) {
        for (const dx of [-S, 0]) {
          c.beginPath()
          c.moveTo(x + dx, y)
          c.lineTo(x + dx + len, y + (rand() - 0.5) * 3)
          c.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
    // vertical seams of the woven backing
    ctx.fillStyle = darken(base, 0.15)
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.25
      ctx.fillRect((i * S) / 40, 0, 1, S)
    }
    ctx.globalAlpha = 1
  },
  brick(ctx, h, base, rand) {
    bond(ctx, h, rand, 4, 12, 13, '#cfc6b8', (r) => mix(base, r() > 0.5 ? '#5b2a1b' : '#c27a55', r() * 0.45), 4)
    grain(ctx, rand, base, 40000, 0.25, 2)
    grain(h, rand, '#808080', 20000, 0.3, 2)
  },
  whiteBrick(ctx, h, base, rand) {
    bond(ctx, h, rand, 4, 12, 12, darken(base, 0.06), (r) => mix(base, '#9a958c', r() * 0.08), 5)
    grain(ctx, rand, base, 30000, 0.2, 2)
    grain(h, rand, '#808080', 30000, 0.35, 2)
  },
  concrete(ctx, h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    mottle(ctx, rand, base, 60, 40, 200, 0.18)
    grain(ctx, rand, base, 60000, 0.35, 1.6)
    h.fillStyle = gray(160)
    h.fillRect(0, 0, S, S)
    grain(h, rand, '#a0a0a0', 30000, 0.4, 2)
    // formwork panel joints and tie holes
    ctx.fillStyle = darken(base, 0.18)
    ctx.fillRect(0, S / 2 - 1, S, 2)
    ctx.fillRect(S / 2 - 1, 0, 2, S)
    h.fillStyle = gray(90)
    h.fillRect(0, S / 2 - 2, S, 4)
    h.fillRect(S / 2 - 2, 0, 4, S)
    for (const [x, y] of [
      [S / 4, S / 4],
      [(3 * S) / 4, S / 4],
      [S / 4, (3 * S) / 4],
      [(3 * S) / 4, (3 * S) / 4],
    ]) {
      ctx.fillStyle = darken(base, 0.4)
      ctx.beginPath()
      ctx.arc(x, y, 9, 0, Math.PI * 2)
      ctx.fill()
      h.fillStyle = gray(20)
      h.beginPath()
      h.arc(x, y, 9, 0, Math.PI * 2)
      h.fill()
    }
  },
  subway(ctx, h, base, rand) {
    bond(ctx, h, rand, 4, 8, 6, '#d9d6cf', (r) => mix(base, r() > 0.5 ? '#ffffff' : '#c8c4bb', r() * 0.12), 10)
  },
  zellige(ctx, h, base, rand) {
    bond(ctx, h, rand, 5, 5, 7, '#e3dccd', (r) => mix(base, r() > 0.5 ? '#ffffff' : '#000000', r() * 0.28), 14, 0)
    // glaze pooling: lighter centers, darker rims
    const t = S / 5
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const g = ctx.createRadialGradient(i * t + t / 2, j * t + t / 2, 4, i * t + t / 2, j * t + t / 2, t * 0.7)
        g.addColorStop(0, 'rgba(255,255,255,0.18)')
        g.addColorStop(1, 'rgba(0,0,0,0.12)')
        ctx.fillStyle = g
        ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6)
        for (let k = 0; k < 8; k++) {
          h.fillStyle = gray(170 + rand() * 60)
          h.globalAlpha = 0.4
          h.beginPath()
          h.arc(i * t + t * (0.2 + rand() * 0.6), j * t + t * (0.2 + rand() * 0.6), t * (0.1 + rand() * 0.2), 0, Math.PI * 2)
          h.fill()
        }
        h.globalAlpha = 1
      }
  },
  woodPanel(ctx, h, base, rand) {
    const n = 8
    const bw = S / n
    h.fillStyle = gray(200)
    h.fillRect(0, 0, S, S)
    for (let i = 0; i < n; i++) {
      const tone = mix(base, rand() > 0.5 ? '#ffffff' : '#2d1a0c', rand() * 0.15)
      ctx.fillStyle = tone
      ctx.fillRect(i * bw, 0, bw, S)
      for (let g = 0; g < 22; g++) {
        ctx.strokeStyle = darken(tone, 0.15 + rand() * 0.15)
        ctx.globalAlpha = 0.35
        ctx.lineWidth = 0.8 + rand() * 2
        const x0 = i * bw + rand() * bw
        ctx.beginPath()
        ctx.moveTo(x0, 0)
        for (let y = 0; y <= S; y += 64) ctx.lineTo(Math.min(i * bw + bw - 4, Math.max(i * bw + 4, x0 + Math.sin(y / 90 + g) * 5)), y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      // groove between boards
      ctx.fillStyle = darken(base, 0.55)
      ctx.fillRect(i * bw, 0, 4, S)
      h.fillStyle = gray(30)
      h.fillRect(i * bw, 0, 6, S)
    }
  },
  marbleSlab(ctx, _h, base, rand) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    mottle(ctx, rand, base, 30, 80, 240, 0.05)
    ctx.lineCap = 'round'
    for (let v = 0; v < 16; v++) {
      ctx.strokeStyle = v % 4 ? '#a59f95' : '#7d776e'
      ctx.globalAlpha = 0.12 + rand() * 0.3
      ctx.lineWidth = 0.6 + rand() * 3
      let x = rand() * S
      let y = -20
      ctx.beginPath()
      ctx.moveTo(x, y)
      while (y < S + 20) {
        x += (rand() - 0.5) * 70
        y += 10 + rand() * 40
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },
}

export interface WallMaps {
  map: THREE.Texture
  bump: THREE.Texture | null
  /** Size in meters of one repeat (width, height). */
  size: [number, number]
  roughness: number
  relief: number
}

const cache = new Map<string, WallMaps>()

function canvasTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function drawPattern(def: PatternDef, color: string, size = S): { color: HTMLCanvasElement; height: HTMLCanvasElement } {
  const c = document.createElement('canvas')
  const h = document.createElement('canvas')
  c.width = c.height = h.width = h.height = S
  const draw = DRAW[def.id]
  draw(c.getContext('2d')!, h.getContext('2d')!, color, rng(def.id.length * 131 + 7))
  if (size === S) return { color: c, height: h }
  const small = document.createElement('canvas')
  small.width = small.height = size
  small.getContext('2d')!.drawImage(c, 0, 0, size, size)
  return { color: small, height: h }
}

/** Textures for a built-in pattern in a given color (cached). */
export function patternMaps(id: string, color?: string): WallMaps | null {
  const def = getPattern(id)
  if (!def) return null
  const col = def.tint && color ? color : def.color
  const key = `${id}|${col}`
  let m = cache.get(key)
  if (!m) {
    const { color: c, height } = drawPattern(def, col)
    m = { map: canvasTexture(c, true), bump: def.relief > 0 ? canvasTexture(height, false) : null, size: [def.size, def.size], roughness: def.roughness, relief: def.relief }
    cache.set(key, m)
  }
  return m
}

const thumbs = new Map<string, string>()

/** Small swatch image of a pattern, cropped to about 0.5 m of wall so its scale reads correctly. */
export function patternThumb(id: string, color?: string): string {
  const def = getPattern(id)
  if (!def) return ''
  const col = def.tint && color ? color : def.color
  const key = `${id}|${col}`
  let url = thumbs.get(key)
  if (!url) {
    const { color: c } = drawPattern(def, col)
    const out = document.createElement('canvas')
    out.width = out.height = 96
    const crop = Math.min(S, (S * 0.6) / def.size)
    out.getContext('2d')!.drawImage(c, 0, 0, crop, crop, 0, 0, 96, 96)
    url = out.toDataURL('image/jpeg', 0.85)
    thumbs.set(key, url)
  }
  return url
}

const imageCache = new Map<string, Promise<WallMaps>>()

/** Texture for an uploaded wallpaper image, loaded from IndexedDB. */
export function wallpaperMaps(w: Wallpaper): Promise<WallMaps> {
  let p = imageCache.get(w.key)
  if (!p) {
    p = getBlob(w.key).then(async (blob) => {
      if (!blob) throw new Error('Wallpaper image is missing')
      // ImageBitmaps ignore texture.flipY, so flip while decoding.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })
      const t = new THREE.Texture(bitmap)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.flipY = false
      t.needsUpdate = true
      return { map: t, bump: null, size: [w.width, w.width * w.aspect] as [number, number], roughness: 0.85, relief: 0 }
    })
    imageCache.set(w.key, p)
    p.catch(() => imageCache.delete(w.key))
  }
  return p
}

export function forgetWallpaper(key: string) {
  imageCache.delete(key)
}
