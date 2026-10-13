import * as THREE from 'three'
import { getFloor, type FloorMaterial } from '../catalog/styles'
import { mix } from '../lib/colors'
import type { FloorId } from '../types'

const SIZE = 512
const cache = new Map<FloorId, THREE.CanvasTexture>()
const patternCache = new Map<FloorId, string>()

/** Deterministic pseudo-random generator so textures look the same on every load. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, f: FloorMaterial) {
  const rand = rng(f.id.length * 977 + f.base.charCodeAt(2))
  const S = SIZE
  ctx.fillStyle = f.base
  ctx.fillRect(0, 0, S, S)

  switch (f.pattern) {
    case 'planks': {
      const rows = 8
      const h = S / rows
      for (let r = 0; r < rows; r++) {
        let x = -rand() * S * 0.5
        while (x < S) {
          const len = S * (0.35 + rand() * 0.4)
          ctx.fillStyle = mix(f.base, rand() > 0.5 ? '#ffffff' : '#3a2412', rand() * 0.14)
          ctx.fillRect(x, r * h, len, h)
          // grain
          ctx.strokeStyle = mix(f.base, '#3a2412', 0.18)
          ctx.globalAlpha = 0.35
          for (let g = 0; g < 4; g++) {
            ctx.beginPath()
            const gy = r * h + h * (0.2 + rand() * 0.6)
            ctx.moveTo(x, gy)
            ctx.bezierCurveTo(x + len * 0.3, gy + (rand() - 0.5) * 6, x + len * 0.6, gy + (rand() - 0.5) * 6, x + len, gy)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = mix(f.base, '#000000', 0.35)
          ctx.fillRect(x, r * h, 1.5, h)
          x += len
        }
        ctx.fillStyle = mix(f.base, '#000000', 0.35)
        ctx.fillRect(0, r * h, S, 1.5)
      }
      break
    }
    case 'herringbone': {
      const w = S / 16
      const l = w * 4
      for (let i = -8; i < 24; i++) {
        for (let j = -8; j < 24; j++) {
          const x = i * w * 2 + j * w * 2
          const y = j * w * 2 - i * w * 2
          for (const [dx, dy, ww, hh] of [
            [x, y, l, w],
            [x + l - w, y - l + w, w, l],
          ] as const) {
            ctx.fillStyle = mix(f.base, rand() > 0.5 ? '#ffffff' : '#000000', rand() * 0.16)
            ctx.fillRect(dx * 0.5, dy * 0.5, ww * 0.5, hh * 0.5)
            ctx.strokeStyle = mix(f.base, '#000000', 0.4)
            ctx.lineWidth = 1
            ctx.strokeRect(dx * 0.5, dy * 0.5, ww * 0.5, hh * 0.5)
          }
        }
      }
      break
    }
    case 'tiles': {
      const n = 4
      const t = S / n
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = mix(f.base, rand() > 0.5 ? '#ffffff' : '#000000', rand() * 0.07)
          ctx.fillRect(i * t, j * t, t, t)
        }
      ctx.strokeStyle = mix(f.base, '#7a756c', 0.6)
      ctx.lineWidth = 4
      for (let i = 0; i <= n; i++) {
        ctx.beginPath()
        ctx.moveTo(i * t, 0)
        ctx.lineTo(i * t, S)
        ctx.moveTo(0, i * t)
        ctx.lineTo(S, i * t)
        ctx.stroke()
      }
      break
    }
    case 'marble': {
      ctx.lineCap = 'round'
      for (let v = 0; v < 26; v++) {
        ctx.strokeStyle = mix(f.base, v % 3 ? '#9a958c' : '#6d6a64', 0.5 + rand() * 0.3)
        ctx.globalAlpha = 0.15 + rand() * 0.3
        ctx.lineWidth = 0.6 + rand() * 2.2
        ctx.beginPath()
        let x = rand() * S
        let y = 0
        ctx.moveTo(x, y)
        while (y < S) {
          x += (rand() - 0.45) * 40
          y += 10 + rand() * 30
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.strokeStyle = mix(f.base, '#8b877f', 0.5)
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, S, S)
      break
    }
    case 'concrete': {
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = mix(f.base, rand() > 0.5 ? '#ffffff' : '#000000', rand() * 0.18)
        ctx.globalAlpha = 0.5
        const r = rand() * 2.5
        ctx.fillRect(rand() * S, rand() * S, r, r)
      }
      for (let i = 0; i < 12; i++) {
        ctx.globalAlpha = 0.08
        ctx.fillStyle = mix(f.base, '#000000', 0.3)
        ctx.beginPath()
        ctx.arc(rand() * S, rand() * S, 30 + rand() * 90, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      break
    }
    case 'carpet': {
      for (let i = 0; i < 26000; i++) {
        ctx.fillStyle = mix(f.base, rand() > 0.5 ? '#ffffff' : '#000000', rand() * 0.2)
        ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5)
      }
      break
    }
  }
}

export function floorCanvas(id: FloorId): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  drawFloor(c.getContext('2d')!, getFloor(id))
  return c
}

export function floorTexture(id: FloorId): THREE.CanvasTexture {
  let t = cache.get(id)
  if (!t) {
    t = new THREE.CanvasTexture(floorCanvas(id))
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    cache.set(id, t)
  }
  return t
}

/** Small data URL of the floor pattern, used by the 2D plan and swatches. */
export function floorPatternUrl(id: FloorId): string {
  let url = patternCache.get(id)
  if (!url) {
    const big = floorCanvas(id)
    const small = document.createElement('canvas')
    small.width = small.height = 128
    small.getContext('2d')!.drawImage(big, 0, 0, 128, 128)
    url = small.toDataURL('image/png')
    patternCache.set(id, url)
  }
  return url
}
