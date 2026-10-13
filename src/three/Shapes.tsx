import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { deleteDimension } from '../lib/shapeOps'
import { useStore } from '../state/store'
import { edgesOf, meshOf, shapeMatrix, triangulate, vec } from '../lib/solid'
import type { Design, Dimension, Shape, SolidMesh } from '../types'

/** Default face color of new shapes (SketchUp's warm white). */
export const SHAPE_COLOR = '#ece8df'
const EDGE = '#2b2b2b'
const SELECTED = '#2f80ed'

export interface ShapeGeometry {
  geometry: THREE.BufferGeometry
  edges: THREE.BufferGeometry
  /** Face of the polygon mesh each triangle belongs to. */
  triFace: number[]
}

/** Flat-shaded triangles (one color per face) plus the polygon edges. */
export function buildShapeGeometry(mesh: SolidMesh, color: string): ShapeGeometry {
  const { tris, triFace } = triangulate(mesh)
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const c = new THREE.Color()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const d = new THREE.Vector3()
  tris.forEach((t, i) => {
    a.fromArray(mesh.verts[t[0]])
    b.fromArray(mesh.verts[t[1]])
    d.fromArray(mesh.verts[t[2]])
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize()
    c.set(mesh.faceColors?.[triFace[i]] ?? color)
    for (const p of [a, b, d]) {
      pos.push(p.x, p.y, p.z)
      nor.push(n.x, n.y, n.z)
      col.push(c.r, c.g, c.b)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geometry.computeBoundingSphere()
  const lines: number[] = []
  for (const [i, j] of edgesOf(mesh)) lines.push(...mesh.verts[i], ...mesh.verts[j])
  const edges = new THREE.BufferGeometry()
  edges.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  return { geometry, edges, triFace }
}

const faceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })

function ShapeMesh({ shape, mesh, selected, edges, onSelect }: { shape: Shape; mesh: SolidMesh; selected: boolean; edges: boolean; onSelect?: (id: string, add: boolean) => void }) {
  const geo = useMemo(() => buildShapeGeometry(mesh, shape.color ?? SHAPE_COLOR), [mesh, shape.color])
  useEffect(
    () => () => {
      geo.geometry.dispose()
      geo.edges.dispose()
    },
    [geo],
  )
  const matrix = useMemo(() => shapeMatrix(shape), [shape])
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh
        geometry={geo.geometry}
        material={faceMaterial}
        castShadow
        receiveShadow
        userData={{ shapeId: shape.id, triFace: geo.triFace }}
        onClick={
          onSelect
            ? (e) => {
                e.stopPropagation()
                onSelect(shape.id, e.shiftKey)
              }
            : undefined
        }
      />
      {(edges || selected) && (
        <lineSegments geometry={geo.edges} userData={{ noPick: true }} renderOrder={selected ? 2 : 0}>
          <lineBasicMaterial color={selected ? SELECTED : EDGE} depthTest={!selected} transparent={selected} opacity={selected ? 0.9 : 1} />
        </lineSegments>
      )}
    </group>
  )
}

export function ShapesScene({
  design,
  selectedIds,
  edges,
  preview,
  onSelect,
}: {
  design: Design
  selectedIds: string[]
  edges: boolean
  preview?: { shapeId: string; mesh: SolidMesh } | null
  onSelect?: (id: string, add: boolean) => void
}) {
  return (
    <group>
      {(design.shapes ?? []).map((s) => {
        const mesh = preview?.shapeId === s.id ? preview.mesh : meshOf(design, s)
        return mesh ? <ShapeMesh key={s.id} shape={s} mesh={mesh} selected={selectedIds.includes(s.id)} edges={edges} onSelect={onSelect} /> : null
      })}
      {(design.dimensions ?? []).map((dm) => (
        <DimensionLine key={dm.id} dim={dm} />
      ))}
    </group>
  )
}

export function formatLength(m: number): string {
  return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 1000) / 10} cm`
}

/** A tape-measure dimension: a line with end ticks and its length. */
export function DimensionLine({ dim, color = '#c0392b', live }: { dim: Pick<Dimension, 'a' | 'b'> & { id?: string }; color?: string; live?: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([...dim.a, ...dim.b], 3))
    return g
  }, [dim.a, dim.b])
  useEffect(() => () => geo.dispose(), [geo])
  const a = vec(dim.a)
  const b = vec(dim.b)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const len = a.distanceTo(b)
  return (
    <group>
      <lineSegments geometry={geo} userData={{ noPick: true }} renderOrder={3}>
        <lineDashedMaterial color={color} depthTest={false} transparent />
      </lineSegments>
      {[a, b].map((p, i) => (
        <mesh key={i} position={p} userData={{ noPick: true }} renderOrder={3}>
          <sphereGeometry args={[0.025, 10, 8]} />
          <meshBasicMaterial color={color} depthTest={false} transparent />
        </mesh>
      ))}
      {len > 0.001 && (
        <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: live ? 'none' : 'auto' }}>
          <span
            className={'dim-label' + (live ? ' live' : '')}
            onClick={() => {
              if (live || !dim.id) return
              const st = useStore.getState()
              if (st.modelTool === 'erase') deleteDimension(dim.id)
              else st.select({ kind: 'dimension', id: dim.id })
            }}
          >
            {formatLength(len)}
          </span>
        </Html>
      )}
    </group>
  )
}
