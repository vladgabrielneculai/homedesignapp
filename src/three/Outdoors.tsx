import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { defaultCity, sunPosition } from '../lib/sun'
import type { Design, Site } from '../types'

/** Date and time the 3D view is lit for. */
export interface SunTime {
  month: number
  day: number
  hour: number
}

export function defaultSite(): Site {
  const c = defaultCity()
  return { city: c.name, lat: c.lat, lon: c.lon, utc: c.utc, dst: c.dst, north: 0 }
}

export interface SunState {
  /** Unit vector towards the sun in world space (y up; plan y is world z). */
  dir: THREE.Vector3
  altitude: number
  azimuth: number
  /** 0 at night, 1 in full daylight. */
  daylight: number
  /** Sun below (or just at) the horizon: interior lights on. */
  night: boolean
  color: string
  intensity: number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mixHex(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}

export function computeSun(site: Site, time: SunTime, doy: number): SunState {
  const { altitude, azimuth } = sunPosition(site.lat, site.lon, site.utc, site.dst, doy, time.hour)
  // The plan's "up" (world -z) faces compass bearing `north`, so bearing b lies (b - north) clockwise
  // from plan up: plan direction (sin t, -cos t), i.e. world (sin t, ·, -cos t).
  const b = ((azimuth - site.north) * Math.PI) / 180
  const alt = (Math.max(altitude, -10) * Math.PI) / 180
  const dir = new THREE.Vector3(Math.cos(alt) * Math.sin(b), Math.sin(alt), -Math.cos(alt) * Math.cos(b)).normalize()
  const daylight = smooth(-6, 8, altitude)
  const warm = smooth(2, 28, altitude)
  return {
    dir,
    altitude,
    azimuth,
    daylight,
    night: altitude < 2,
    color: mixHex('#ff8a3d', '#fff4e3', warm),
    intensity: 3.2 * smooth(-1, 12, altitude),
  }
}

/** Physically based sky (Rayleigh + Mie scattering) with soft clouds. */
export function SkyDome({ sun, clouds = 0.25 }: { sun: SunState; clouds?: number }) {
  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(1800)
    const u = s.material.uniforms
    u.turbidity.value = 4
    u.rayleigh.value = 1.2
    u.mieCoefficient.value = 0.004
    u.mieDirectionalG.value = 0.8
    u.cloudElevation.value = 0.6
    s.renderOrder = -10
    // The photo renderer swaps the sky mesh for an environment map made from it.
    s.userData.isSkyDome = true
    return s
  }, [])
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const u = sky.material.uniforms
    u.sunPosition.value.copy(sun.dir).multiplyScalar(1000)
    u.cloudCoverage.value = clouds
    u.cloudDensity.value = 0.5
    invalidate()
  }, [sky, sun, clouds, invalidate])
  useEffect(() => () => sky.material.dispose(), [sky])
  return <primitive object={sky} />
}

/** The tone the far ground and the fog fade into. */
export function horizonColor(sun: SunState): string {
  return mixHex('#141a28', mixHex('#e2b892', '#dfe6ea', smooth(2, 25, sun.altitude)), sun.daylight)
}

function grassCanvas(): HTMLCanvasElement {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#5f7a43'
  ctx.fillRect(0, 0, S, S)
  let seed = 99
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  // soft patches
  for (let i = 0; i < 40; i++) {
    const r = 30 + rand() * 90
    const x = rand() * S
    const y = rand() * S
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const col = rand() > 0.5 ? '#6f8a4b' : '#4f6838'
    g.addColorStop(0, col)
    g.addColorStop(1, col + '00')
    ctx.fillStyle = g
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) ctx.fillRect(x - r + dx, y - r + dy, r * 2, r * 2)
  }
  // blades
  for (let i = 0; i < 22000; i++) {
    const x = rand() * S
    const y = rand() * S
    const v = rand()
    ctx.strokeStyle = v > 0.6 ? '#86a35c' : v > 0.3 ? '#56713c' : '#3f5730'
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  return c
}

let grassTex: THREE.CanvasTexture | null = null
function grassTexture() {
  if (!grassTex) {
    grassTex = new THREE.CanvasTexture(grassCanvas())
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping
    grassTex.colorSpace = THREE.SRGBColorSpace
    grassTex.anisotropy = 8
  }
  return grassTex
}

/** Lawn around the house plus a paved strip hugging the walls. */
export function Ground({ center, radius, night }: { center: THREE.Vector3; radius: number; night: boolean }) {
  const size = radius * 14
  const material = useMemo(() => {
    const t = grassTexture().clone()
    t.repeat.set(size / 3, size / 3)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: night ? '#6c7466' : '#ffffff' })
  }, [size, night])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -0.012, center.z]} receiveShadow material={material}>
      <circleGeometry args={[size / 2, 96]} />
    </mesh>
  )
}

/**
 * Leafy canopy: a sphere with lumpy, noise-displaced surface, smooth shading and color varying from
 * sunlit tips to darker shaded hollows, so trees read as foliage rather than faceted gems.
 */
const foliageCache = new Map<string, THREE.BufferGeometry>()
function foliage(seed: number, color: string): THREE.BufferGeometry {
  const key = `${seed}:${color}`
  let g = foliageCache.get(key)
  if (g) return g
  g = new THREE.IcosahedronGeometry(1, 4)
  const pos = g.attributes.position
  const base = new THREE.Color(color)
  const light = base.clone().lerp(new THREE.Color('#b9c97a'), 0.35)
  const dark = base.clone().multiplyScalar(0.45)
  const colors: number[] = []
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n =
      Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.4 + seed * 0.6) * 0.16 +
      Math.sin(v.x * 9.3 + seed * 2.1) * Math.sin(v.y * 8.1) * Math.sin(v.z * 9.7 + seed) * 0.05
    const r = 1 + n
    pos.setXYZ(i, v.x * r, v.y * r * 0.9, v.z * r)
    // Lumps catch the light, hollows and the underside fall into shade.
    const k = THREE.MathUtils.clamp(0.45 + n * 2.2 + v.y * 0.3, 0, 1)
    const c = dark.clone().lerp(light, k)
    const speck = 0.92 + ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1) * 0.08
    colors.push(c.r * speck, c.g * speck, c.b * speck)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  foliageCache.set(key, g)
  return g
}

const leafMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
const barkMaterial = new THREE.MeshStandardMaterial({ color: '#5e4a3b', roughness: 1 })
const pineMaterial = new THREE.MeshStandardMaterial({ color: '#2f4a35', roughness: 0.95 })

function Tree({ x, z, s, kind }: { x: number; z: number; s: number; kind: number }) {
  const leaf = ['#4c6b3a', '#5a7a3f', '#3f5f37'][kind % 3]
  if (kind % 4 === 3) {
    // conifer
    return (
      <group position={[x, 0, z]} scale={s}>
        <mesh position={[0, 0.6, 0]} material={barkMaterial} castShadow>
          <cylinderGeometry args={[0.08, 0.12, 1.2, 10]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 1.2 + i * 0.75, 0]} material={pineMaterial} castShadow>
            <coneGeometry args={[1.3 - i * 0.28, 1.7, 18]} />
          </mesh>
        ))}
      </group>
    )
  }
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 1.1, 0]} material={barkMaterial} castShadow>
        <cylinderGeometry args={[0.09, 0.16, 2.2, 10]} />
      </mesh>
      {[
        [0, 2.9, 0, 1.35],
        [0.7, 2.5, 0.3, 0.95],
        [-0.6, 2.6, -0.3, 1.0],
        [0.1, 3.5, -0.4, 0.9],
      ].map(([px, py, pz, r], i) => (
        <mesh key={i} geometry={foliage(kind * 7 + i, leaf)} material={leafMaterial} position={[px, py, pz]} scale={r} castShadow receiveShadow />
      ))}
    </group>
  )
}

function Bush({ x, z, s }: { x: number; z: number; s: number }) {
  return <mesh geometry={foliage(Math.round(x * 10 + z), '#4d6b3b')} material={leafMaterial} position={[x, 0.32 * s, z]} scale={[0.55 * s, 0.42 * s, 0.55 * s]} castShadow receiveShadow />
}

/** A few trees and shrubs scattered around (never on) the house, so windows look out onto something. */
export function Garden({ design }: { design: Design }) {
  const pts = design.walls.flatMap((w) => [w.a, w.b])
  const key = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';')
  const plants = useMemo(() => {
    if (!pts.length) return { trees: [], bushes: [] }
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
    let seed = 1234 + Math.round((maxX - minX) * 10)
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const hw = (maxX - minX) / 2
    const hh = (maxY - minY) / 2
    const trees: { x: number; z: number; s: number; kind: number }[] = []
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3
      const gap = 4 + rand() * 9
      // distance from the center to the bounding box edge along this direction, then further out
      const edge = Math.min(Math.abs(hw / (Math.cos(a) || 1e-6)), Math.abs(hh / (Math.sin(a) || 1e-6)))
      const r = edge + gap
      trees.push({ x: cx + Math.cos(a) * r, z: cy + Math.sin(a) * r, s: 0.8 + rand() * 0.6, kind: Math.floor(rand() * 4) })
    }
    const bushes: { x: number; z: number; s: number }[] = []
    for (let i = 0; i < 18; i++) {
      const side = Math.floor(rand() * 4)
      const t = rand()
      const off = 1.4 + rand() * 1.6
      const x = side < 2 ? minX + t * (maxX - minX) : side === 2 ? minX - off : maxX + off
      const z = side === 0 ? minY - off : side === 1 ? maxY + off : minY + t * (maxY - minY)
      bushes.push({ x, z, s: 0.7 + rand() * 0.7 })
    }
    return { trees, bushes }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (
    <group>
      {plants.trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}
      {plants.bushes.map((b, i) => (
        <Bush key={i} {...b} />
      ))}
    </group>
  )
}
