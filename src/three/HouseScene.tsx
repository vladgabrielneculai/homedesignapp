import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { getEntry, type CatalogEntry } from '../catalog/catalog'
import { getFloor } from '../catalog/styles'
import { itemColor, mix, paletteFor } from '../lib/colors'
import { wallAngle, wallLength } from '../lib/geometry'
import type { Design, Item, Opening, Room, Wall } from '../types'
import { ProceduralItem, type Palette } from './Procedural'
import { floorTexture } from './textures'

export interface SceneOptions {
  lowWalls: boolean
  selectedItemId?: string | null
  onSelectItem?: (id: string | null) => void
}

const LOW_WALL_HEIGHT = 1.0

/** Image-based lighting generated locally so glTF materials (sheen, transmission) look right offline. */
export function LocalEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.3
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

function WallMesh({ wall, openings, color, lowWalls }: { wall: Wall; openings: Opening[]; color: string; lowWalls: boolean }) {
  const len = wallLength(wall)
  const ang = wallAngle(wall)
  const H = lowWalls ? Math.min(LOW_WALL_HEIGHT, wall.height) : wall.height
  const T = wall.thickness
  const ext = T / 2 // extend each end so corners close
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const capColor = mix(color, '#000000', 0.25)

  const pieces: { x0: number; x1: number; y0: number; y1: number }[] = []
  const sorted = [...openings].sort((a, b) => a.offset - b.offset)
  let cursor = -ext
  for (const o of sorted) {
    const s = o.offset - o.width / 2
    const e = o.offset + o.width / 2
    if (s > cursor) pieces.push({ x0: cursor, x1: s, y0: 0, y1: H })
    if (o.sill > 0) pieces.push({ x0: s, x1: e, y0: 0, y1: Math.min(o.sill, H) })
    const top = o.sill + o.height
    if (top < H) pieces.push({ x0: s, x1: e, y0: top, y1: H })
    cursor = Math.max(cursor, e)
  }
  if (cursor < len + ext) pieces.push({ x0: cursor, x1: len + ext, y0: 0, y1: H })

  return (
    <group position={[mid.x, 0, mid.y]} rotation={[0, -ang, 0]}>
      {pieces.map((p, i) => {
        const w = p.x1 - p.x0
        const h = p.y1 - p.y0
        if (w <= 0.001 || h <= 0.001) return null
        return (
          <mesh key={i} position={[p.x0 + w / 2 - len / 2, p.y0 + h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, T]} />
            <meshStandardMaterial color={color} roughness={0.92} />
          </mesh>
        )
      })}
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
        <mesh>
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
    return new THREE.MeshStandardMaterial({
      map,
      roughness: f.pattern === 'marble' || f.pattern === 'tiles' ? 0.25 : f.pattern === 'carpet' ? 1 : 0.6,
    })
  }, [floorId])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow />
}

function ModelItem({ entry }: { entry: CatalogEntry }) {
  const { scene } = useGLTF(import.meta.env.BASE_URL + entry.model!.url)
  const object = useMemo(() => {
    const clone = scene.clone(true)
    // Some sample models ship with their own studio lights (the room provides lighting instead)
    // or extra demo objects listed in `hide`.
    const remove: THREE.Object3D[] = []
    const hide = entry.model!.hide ?? []
    clone.traverse((o) => {
      if ((o as THREE.Light).isLight || hide.includes(o.name)) remove.push(o)
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    for (const o of remove) o.removeFromParent()
    clone.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const s = Math.min(entry.w / size.x, entry.d / size.z, entry.h / size.y)
    clone.scale.setScalar(s)
    const center = box.getCenter(new THREE.Vector3())
    clone.position.set(-center.x * s, -box.min.y * s, -center.z * s)
    const wrapper = new THREE.Group()
    wrapper.add(clone)
    return wrapper
  }, [scene, entry])
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

function ItemMesh({ item, style, palette, selected, onSelect }: { item: Item; style: Design['style']; palette: Palette; selected: boolean; onSelect?: (id: string) => void }) {
  const entry = getEntry(item.catalogId)
  const color = itemColor(item, entry, style)
  const handleClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect(item.id)
      }
    : undefined
  return (
    <group position={[item.x, item.elevation ?? 0, item.y]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]} onClick={handleClick}>
      {entry.model ? (
        <Suspense fallback={<Placeholder entry={entry} />}>
          <ModelItem entry={entry} />
        </Suspense>
      ) : (
        <ProceduralItem e={entry} pal={palette} mainColor={color} />
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
      {design.walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? []} color={w.color ?? design.style.wallColor} lowWalls={options.lowWalls} />
      ))}
      {design.items.map((it) => (
        <ItemMesh
          key={it.id}
          item={it}
          style={design.style}
          palette={palette}
          selected={options.selectedItemId === it.id}
          onSelect={options.onSelectItem}
        />
      ))}
    </group>
  )
}

/** Fits the shadow camera of a directional light around the design. */
export function SunLight({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e0', 2.4)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    return l
  }, [])
  useLayoutEffect(() => {
    // Sun from the back-left so shadows fall towards the default camera instead of hiding behind objects.
    light.position.set(center.x - radius * 0.9, radius * 1.1 + 5, center.z - radius * 0.5)
    light.target.position.copy(center)
    light.target.updateMatrixWorld()
    light.shadow.bias = -0.0004
    light.shadow.normalBias = 0.02
    const cam = light.shadow.camera
    const r = radius + 2
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.5
    cam.far = radius * 4 + 30
    cam.updateProjectionMatrix()
  }, [light, center, radius])
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

