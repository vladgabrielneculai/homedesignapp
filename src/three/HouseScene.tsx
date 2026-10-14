import { ShapesScene } from './Shapes'
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { itemEntry, type CatalogEntry } from '../catalog/catalog'
import { getFloor } from '../catalog/styles'
import { itemColor, mix, paletteFor } from '../lib/colors'
import { wallAngle, wallLength } from '../lib/geometry'
import type { Design, Item, Opening, Room, SolidMesh, Wall, WallFinish } from '../types'
import { getPattern, wallFinish } from '../catalog/wallFinishes'
import { wallInRoom } from '../lib/roomFocus'
import { patternMaps, wallpaperMaps, type WallMaps } from './wallTextures'
import { useStore } from '../state/store'
import { ProceduralItem, type Palette } from './Procedural'
import { floorTexture } from './textures'
import { fitObject, loadUserModel } from './userModels'

export interface SceneOptions {
  lowWalls: boolean
  /** Close the rooms with ceilings (eye-level views); light then only enters through windows. */
  ceilings?: boolean
  evening?: boolean
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
  /** Modeled shapes: selection, whether to draw their edges, and a live Push/Pull preview. */
  selectedShapeIds?: string[]
  shapeEdges?: boolean
  shapePreview?: { shapeId: string; mesh: SolidMesh } | null
  onSelectShape?: (id: string, add: boolean) => void
}

const LOW_WALL_HEIGHT = 1.0
/** Shared empty list, so walls without openings keep their memoized geometry and materials. */
const NO_OPENINGS: Opening[] = []
const SKIRTING_H = 0.08

/**
 * Image-based lighting for reflections and soft fill: a real photographed interior (Poly Haven's
 * "apartment" HDRI, CC0, bundled locally) once loaded, a generated studio room until then.
 */
let hdri: Promise<THREE.DataTexture> | null = null
function loadInteriorHdri(): Promise<THREE.DataTexture> {
  hdri ??= Promise.all([import('@pmndrs/assets/hdri/apartment.exr.js'), import('three/examples/jsm/loaders/EXRLoader.js')]).then(
    ([file, { EXRLoader }]) => new EXRLoader().loadAsync(file.default),
  )
  hdri.catch(() => (hdri = null))
  return hdri
}

export function LocalEnvironment({ intensity = 0.3 }: { intensity?: number }) {
  const { gl, scene, invalidate } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    let env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    let alive = true
    loadInteriorHdri().then(
      (tex) => {
        if (!alive) return
        tex.mapping = THREE.EquirectangularReflectionMapping
        const next = pmrem.fromEquirectangular(tex).texture
        if (scene.environment === env) scene.environment = next
        env.dispose()
        env = next
        invalidate()
      },
      () => {},
    )
    return () => {
      alive = false
      if (scene.environment === env) scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, invalidate])
  useEffect(() => {
    scene.environmentIntensity = intensity
    invalidate()
  }, [scene, intensity, invalidate])
  return null
}

/** Ceiling height of a room: the lowest of the walls around it (2.7 m if it has none). */
export function ceilingHeight(design: Design, room: Room): number {
  const hs = design.walls.filter((w) => wallInRoom(w, room.points)).map((w) => w.height)
  return hs.length ? Math.min(...hs) : 2.7
}

/** Warm "ceiling lights" in every room for Evening mode. */
export function RoomLights({ design }: { design: Design }) {
  return (
    <>
      {design.rooms.map((r) => {
        const n = r.points.length || 1
        const cx = r.points.reduce((s, p) => s + p.x, 0) / n
        const cz = r.points.reduce((s, p) => s + p.y, 0) / n
        return <pointLight key={r.id} position={[cx, 2.45, cz]} intensity={1.6} distance={7} decay={1.5} color="#ffd6a3" />
      })}
    </>
  )
}

interface FaceLook {
  color: string
  maps: WallMaps | null
  roughness: number
  relief: number
  /** Tiles and stone don't get a skirting board. */
  skirting: boolean
}

/** Loads an uploaded wallpaper's texture (async, from IndexedDB). */
function useWallpaperMaps(id: string | null): WallMaps | null {
  const wp = useStore((s) => (id ? s.wallpapers.find((w) => w.id === id) : undefined))
  const [loaded, setLoaded] = useState<{ key: string; maps: WallMaps } | null>(null)
  useEffect(() => {
    if (!wp) return
    let alive = true
    wallpaperMaps(wp).then(
      (maps) => alive && setLoaded({ key: wp.key, maps }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [wp])
  const width = wp?.width ?? 1
  const aspect = wp?.aspect ?? 1
  const maps = loaded && wp && loaded.key === wp.key ? loaded.maps : null
  // The repeat size may be edited after loading.
  return useMemo(() => (maps ? { ...maps, size: [width, width * aspect] as [number, number] } : null), [maps, width, aspect])
}

function useFaceLook(finish: WallFinish, style: Design['style']): FaceLook {
  const maps = useWallpaperMaps(finish.kind === 'image' ? finish.id : null)
  // Finishes are often rebuilt objects; key on their content so materials survive unrelated edits.
  const key = JSON.stringify(finish)
  return useMemo(() => {
    const f = JSON.parse(key) as WallFinish
    if (f.kind === 'paint') return { color: f.color, maps: null, roughness: 0.92, relief: 0, skirting: true }
    if (f.kind === 'pattern') {
      const m = patternMaps(f.id, f.color)
      const def = getPattern(f.id)
      if (m) return { color: '#ffffff', maps: m, roughness: m.roughness, relief: m.relief, skirting: def?.group !== 'material' || f.id === 'woodPanel' || f.id === 'concrete' }
    }
    if (f.kind === 'image' && maps) return { color: '#ffffff', maps, roughness: 0.85, relief: 0, skirting: true }
    return { color: style.wallColor, maps: null, roughness: 0.92, relief: 0, skirting: true }
  }, [key, maps, style.wallColor])
}

/**
 * Material for one face of a wall piece. u0/v0 are the face's position along the wall and up from the
 * floor (meters), so patterns line up across pieces split by doors and windows.
 */
function faceMaterial(look: FaceLook, u0: number, w: number, v0: number, h: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: look.color, roughness: look.roughness })
  if (look.maps) {
    const [sw, sh] = look.maps.size
    const place = (t: THREE.Texture) => {
      const c = t.clone()
      c.repeat.set(w / sw, h / sh)
      c.offset.set(u0 / sw, v0 / sh)
      return c
    }
    mat.map = place(look.maps.map)
    if (look.maps.bump) {
      mat.bumpMap = place(look.maps.bump)
      mat.bumpScale = look.relief * 2.5
    }
  }
  return mat
}

function WallMesh({ wall, openings, style, lowWalls }: { wall: Wall; openings: Opening[]; style: Design['style']; lowWalls: boolean }) {
  const len = wallLength(wall)
  const ang = wallAngle(wall)
  const H = lowWalls ? Math.min(LOW_WALL_HEIGHT, wall.height) : wall.height
  const T = wall.thickness
  const ext = T / 2 // extend each end so corners close
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const lookA = useFaceLook(wallFinish(wall, 'a', style), style)
  const lookB = useFaceLook(wallFinish(wall, 'b', style), style)
  const capColor = mix(style.wallColor, '#000000', 0.25)

  const sorted = useMemo(() => [...openings].sort((a, b) => a.offset - b.offset), [openings])
  const pieces = useMemo(() => {
    const out: { x0: number; x1: number; y0: number; y1: number }[] = []
    let cursor = -ext
    for (const o of sorted) {
      const s = o.offset - o.width / 2
      const e = o.offset + o.width / 2
      if (s > cursor) out.push({ x0: cursor, x1: s, y0: 0, y1: H })
      if (o.sill > 0) out.push({ x0: s, x1: e, y0: 0, y1: Math.min(o.sill, H) })
      const top = o.sill + o.height
      if (top < H) out.push({ x0: s, x1: e, y0: top, y1: H })
      cursor = Math.max(cursor, e)
    }
    if (cursor < len + ext) out.push({ x0: cursor, x1: len + ext, y0: 0, y1: H })
    return out.filter((p) => p.x1 - p.x0 > 0.001 && p.y1 - p.y0 > 0.001)
  }, [sorted, ext, len, H])

  // BoxGeometry face order: +x, -x, +y, -y, +z (side a), -z (side b).
  const materials = useMemo(() => {
    const plain = new THREE.MeshStandardMaterial({ color: lookA.maps ? style.wallColor : lookA.color, roughness: 0.92 })
    return pieces.map((p) => {
      const w = p.x1 - p.x0
      const h = p.y1 - p.y0
      // Side b is seen mirrored, so measure its pattern from the far end of the wall.
      return [plain, plain, plain, plain, faceMaterial(lookA, p.x0, w, p.y0, h), faceMaterial(lookB, len - p.x1, w, p.y0, h)]
    })
  }, [pieces, lookA, lookB, len, style.wallColor])
  useEffect(
    () => () => {
      const seen = new Set<THREE.Material>()
      for (const list of materials)
        for (const m of list) {
          if (seen.has(m)) continue
          seen.add(m)
          const sm = m as THREE.MeshStandardMaterial
          sm.map?.dispose()
          sm.bumpMap?.dispose()
          m.dispose()
        }
    },
    [materials],
  )

  return (
    <group position={[mid.x, 0, mid.y]} rotation={[0, -ang, 0]} userData={{ wallId: wall.id }}>
      {pieces.map((p, i) => {
        const w = p.x1 - p.x0
        const h = p.y1 - p.y0
        return (
          <mesh key={i} position={[p.x0 + w / 2 - len / 2, p.y0 + h / 2, 0]} material={materials[i]} castShadow receiveShadow>
            <boxGeometry args={[w, h, T]} />
          </mesh>
        )
      })}
      {/* skirting boards on painted / papered faces of every full-height piece */}
      {pieces
        .filter((p) => p.y0 === 0 && p.y1 > SKIRTING_H)
        .map((p, i) =>
          ([1, -1] as const)
            .filter((side) => (side === 1 ? lookA : lookB).skirting)
            .map((side) => (
              <mesh key={`${i}${side}`} position={[(p.x0 + p.x1) / 2 - len / 2, SKIRTING_H / 2, side * (T / 2 + 0.006)]} receiveShadow>
                <boxGeometry args={[p.x1 - p.x0, SKIRTING_H, 0.012]} />
                <meshStandardMaterial color="#f7f6f2" roughness={0.45} />
              </mesh>
            )),
        )}
      {/* darker cap on top of the wall makes the cut readable from above */}
      <mesh position={[0, H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len + T, T]} />
        <meshStandardMaterial color={capColor} roughness={1} />
      </mesh>
      {sorted.map((o) => (
        <OpeningMesh key={o.id} o={o} len={len} T={T} H={H} />
      ))}
    </group>
  )
}

function OpeningMesh({ o, len, T, H }: { o: Opening; len: number; T: number; H: number }) {
  const cx = o.offset - len / 2
  const frame = '#f6f5f2'
  if (o.type === 'window') {
    const top = Math.min(o.sill + o.height, H)
    const h = top - o.sill
    if (h <= 0.02) return null
    return (
      <group position={[cx, o.sill + h / 2, 0]}>
        {/* The ray tracer puts a "sky portal" light on the glass of indoor windows (see three/tracer.ts). */}
        <mesh userData={{ windowGlass: { w: o.width - 0.04, h: h - 0.04 } }}>
          <boxGeometry args={[o.width - 0.04, h - 0.04, 0.01]} />
          <meshPhysicalMaterial color="#bcdbe6" transparent opacity={0.28} roughness={0.02} metalness={0} />
        </mesh>
        {/* frame */}
        <mesh position={[0, -h / 2 + 0.02, 0]} castShadow>
          <boxGeometry args={[o.width, 0.04, T + 0.04]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
        {top < H - 0.01 ? (
          <mesh position={[0, h / 2 - 0.02, 0]}>
            <boxGeometry args={[o.width, 0.04, T * 0.6]} />
            <meshStandardMaterial color={frame} roughness={0.5} />
          </mesh>
        ) : null}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * (o.width - 0.04)) / 2, 0, 0]}>
            <boxGeometry args={[0.04, h, T * 0.6]} />
            <meshStandardMaterial color={frame} roughness={0.5} />
          </mesh>
        ))}
        <mesh>
          <boxGeometry args={[0.03, h, 0.05]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      </group>
    )
  }
  // Door: frame plus a leaf hinged on the left, standing ajar.
  const h = Math.min(o.height, H)
  const leafW = o.width - 0.06
  return (
    <group position={[cx, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (o.width - 0.04)) / 2, h / 2, 0]}>
          <boxGeometry args={[0.04, h, T + 0.03]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      ))}
      {h >= o.height && (
        <mesh position={[0, h - 0.02, 0]}>
          <boxGeometry args={[o.width, 0.04, T + 0.03]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      )}
      <group position={[-o.width / 2 + 0.04, 0, T / 2]} rotation={[0, -Math.PI / 3, 0]}>
        <mesh position={[leafW / 2, Math.min(h, 2.06) / 2, 0.02]} castShadow>
          <boxGeometry args={[leafW, Math.min(h, 2.06) - 0.02, 0.04]} />
          <meshStandardMaterial color="#e9e4dc" roughness={0.55} />
        </mesh>
        {h > 1.1 && (
          <mesh position={[leafW - 0.08, 1.0, 0.06]}>
            <boxGeometry args={[0.12, 0.02, 0.03]} />
            <meshStandardMaterial color="#9a9ea3" metalness={0.8} roughness={0.25} />
          </mesh>
        )}
      </group>
    </group>
  )
}

function RoomFloor({ room, fallback }: { room: Room; fallback: Design['style']['floor'] }) {
  const floorId = room.floor ?? fallback
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x, -p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [room.points])
  const material = useMemo(() => {
    const f = getFloor(floorId)
    const map = floorTexture(floorId)
    map.repeat.set(1 / f.repeat, 1 / f.repeat)
    const glossy = f.pattern === 'marble' || f.pattern === 'tiles'
    // The color texture doubles as roughness and bump map: joints and darker grain are rougher and
    // recessed, which breaks up reflections the way real floors do.
    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap: f.pattern === 'carpet' ? null : map,
      roughness: glossy ? 0.35 : f.pattern === 'carpet' ? 1 : f.pattern === 'concrete' ? 0.85 : 0.75,
      bumpMap: map,
      bumpScale: f.pattern === 'carpet' ? 1.5 : 0.6,
      envMapIntensity: glossy ? 1.4 : 1,
    })
  }, [floorId])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow userData={{ roomId: room.id }} />
}

/** Flat white ceiling over a room (faces down, so it is invisible from above) with a flush light. */
function RoomCeiling({ room, height, lit }: { room: Room; height: number; lit: boolean }) {
  // Turned +90° about x (the floor turns -90°), so plan y maps straight to world z.
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x, p.y)))
    return new THREE.ShapeGeometry(shape)
  }, [room.points])
  useEffect(() => () => geometry.dispose(), [geometry])
  const n = room.points.length || 1
  const cx = room.points.reduce((a, p) => a + p.x, 0) / n
  const cz = room.points.reduce((a, p) => a + p.y, 0) / n
  return (
    <group>
      {/* rotated so the face points down */}
      <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]} castShadow receiveShadow userData={{ isCeiling: true }}>
        <meshStandardMaterial color="#f6f5f1" roughness={0.95} />
      </mesh>
      <mesh position={[cx, height - 0.015, cz]}>
        <cylinderGeometry args={[0.17, 0.19, 0.03, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffe2b8" emissiveIntensity={lit ? 2.2 : 0} roughness={0.6} />
      </mesh>
    </group>
  )
}

function ModelItem({ entry }: { entry: CatalogEntry }) {
  const { scene } = useGLTF(import.meta.env.BASE_URL + entry.model!.url)
  const object = useMemo(() => fitObject(scene, entry, { hide: entry.model!.hide }), [scene, entry])
  return <primitive object={object} />
}

/** A 3D model the user uploaded for one of their shop products (loaded from IndexedDB). */
function UserModelItem({ entry, fallback }: { entry: CatalogEntry; fallback: React.ReactNode }) {
  const ref = entry.userModel!
  const [source, setSource] = useState<{ key: string; obj: THREE.Object3D } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadUserModel(ref).then(
      (obj) => alive && setSource({ key: ref.key, obj }),
      () => alive && setFailed(ref.key),
    )
    return () => {
      alive = false
    }
  }, [ref])
  const object = useMemo(
    () => (source && source.key === ref.key ? fitObject(source.obj, entry, { upAxis: ref.upAxis, rotation: ref.rotation }) : null),
    [source, entry, ref],
  )
  if (!object || failed === ref.key) return <>{fallback}</>
  return <primitive object={object} />
}

function Placeholder({ entry }: { entry: CatalogEntry }) {
  return (
    <mesh position={[0, entry.h / 2, 0]}>
      <boxGeometry args={[entry.w, entry.h, entry.d]} />
      <meshStandardMaterial color="#c8c8c8" transparent opacity={0.35} />
    </mesh>
  )
}

function ItemMesh({ item, style, palette, selected, evening, onSelect }: { item: Item; style: Design['style']; palette: Palette; selected: boolean; evening: boolean; onSelect?: (id: string) => void }) {
  const entry = itemEntry(item)
  const color = itemColor(item, entry, style)
  const handleClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect(item.id)
      }
    : undefined
  return (
    <group position={[item.x, item.elevation ?? 0, item.y]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]} onClick={handleClick} userData={{ itemId: item.id }}>
      {entry.model ? (
        <Suspense fallback={<Placeholder entry={entry} />}>
          <ModelItem entry={entry} />
        </Suspense>
      ) : entry.userModel ? (
        // Until the uploaded model loads (or if it is missing), show the product's chosen shape.
        <UserModelItem entry={entry} fallback={<ProceduralItem e={entry} pal={palette} mainColor={color} evening={evening} elevation={item.elevation ?? 0} />} />
      ) : (
        <ProceduralItem e={entry} pal={palette} mainColor={color} evening={evening} elevation={item.elevation ?? 0} />
      )}
      {selected && <SelectionBox entry={entry} />}
    </group>
  )
}

function SelectionBox({ entry }: { entry: CatalogEntry }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(entry.w + 0.04, Math.max(entry.h, 0.05) + 0.04, entry.d + 0.04)), [entry])
  return (
    <lineSegments geometry={geo} position={[0, Math.max(entry.h, 0.05) / 2, 0]}>
      <lineBasicMaterial color="#2f80ed" />
    </lineSegments>
  )
}

export function HouseScene({ design, options }: { design: Design; options: SceneOptions }) {
  const palette = useMemo(() => paletteFor(design.style), [design.style])
  // Re-render when the user edits one of their shop products (size, color, model).
  useStore((s) => s.products)
  const openingsByWall = useMemo(() => {
    const m = new Map<string, Opening[]>()
    for (const o of design.openings) m.set(o.wallId, [...(m.get(o.wallId) ?? []), o])
    return m
  }, [design.openings])

  return (
    <group>
      {design.rooms.map((r) => (
        <RoomFloor key={r.id} room={r} fallback={design.style.floor} />
      ))}
      {options.ceilings &&
        design.rooms.map((r) => <RoomCeiling key={r.id} room={r} height={ceilingHeight(design, r)} lit={!!options.evening} />)}
      {design.walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? NO_OPENINGS} style={design.style} lowWalls={options.lowWalls} />
      ))}
      {design.items.map((it) => (
        <ItemMesh
          key={it.id}
          item={it}
          style={design.style}
          palette={palette}
          selected={options.selectedItemId === it.id}
          evening={!!options.evening}
          onSelect={options.onSelectItem}
        />
      ))}
      <ShapesScene design={design} selectedIds={options.selectedShapeIds ?? []} edges={options.shapeEdges ?? true} preview={options.shapePreview} onSelect={options.onSelectShape} />
    </group>
  )
}

/** Directional sunlight from `dir`, with its shadow camera fitted around the design. */
export function SunLight({ center, radius, dir, intensity = 2.4, color = '#fff4e0' }: { center: THREE.Vector3; radius: number; dir: THREE.Vector3; intensity?: number; color?: string }) {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e0', 2.4)
    l.castShadow = true
    l.shadow.mapSize.set(4096, 4096)
    return l
  }, [])
  useLayoutEffect(() => {
    light.intensity = intensity
    light.color.set(color)
    light.castShadow = intensity > 0.01
  }, [light, intensity, color])
  useLayoutEffect(() => {
    const dist = radius * 2 + 20
    light.position.copy(center).addScaledVector(dir, dist)
    light.target.position.copy(center)
    light.target.updateMatrixWorld()
    light.shadow.bias = -0.0003
    light.shadow.normalBias = 0.02
    light.shadow.radius = 3
    const cam = light.shadow.camera
    // Cover the house plus the garden around it.
    const r = radius + 9
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.5
    cam.far = dist + r * 2
    cam.updateProjectionMatrix()
  }, [light, center, radius, dir])
  useEffect(() => () => light.dispose(), [light])
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}
