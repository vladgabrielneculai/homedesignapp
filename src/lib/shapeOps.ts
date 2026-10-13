import * as THREE from 'three'
import { useStore } from '../state/store'
import type { Design, Shape, SolidMesh, Vec3 } from '../types'
import { uid } from './geometry'
import { arr, componentOf, decompose, faceNormal, mergeMeshes, meshOf, pushPull, recenter, shapeBox, shapeMatrix, splitMesh, transformMesh, vec } from './solid'

/** Editing operations on modeled shapes (all undoable through the store's history). */

const update = (fn: (d: Design) => Design, record = true) => useStore.getState().updateDesign(fn, { record })
const shapesOf = (d: Design) => d.shapes ?? []

export function selectedShapeIds(): string[] {
  const s = useStore.getState().selection
  return s?.kind === 'shapes' ? s.ids : []
}

export function selectShapes(ids: string[]) {
  useStore.getState().select(ids.length ? { kind: 'shapes', ids } : null)
}

/** Adds a shape whose mesh is given in world coordinates (the mesh is re-centred on its base). */
export function addWorldShape(world: SolidMesh, name: string, color?: string): string {
  const { mesh, offset } = recenter(world)
  const id = uid()
  const shape: Shape = { id, name, mesh, position: arr(offset), rotation: [0, 0, 0], scale: [1, 1, 1], color }
  update((d) => ({ ...d, shapes: [...shapesOf(d), shape] }))
  return id
}

export function patchShape(id: string, patch: Partial<Shape>, record = true) {
  update((d) => ({ ...d, shapes: shapesOf(d).map((s) => (s.id === id ? { ...s, ...patch } : s)) }), record)
}

export function deleteShapes(ids: string[]) {
  update((d) => ({ ...d, shapes: shapesOf(d).filter((s) => !ids.includes(s.id)) }))
  selectShapes([])
}

/** Replaces the mesh a shape uses: its own, or its component's (which changes every copy). */
function withMesh(d: Design, s: Shape, mesh: SolidMesh): Design {
  if (s.componentId && componentOf(d, s))
    return { ...d, components: (d.components ?? []).map((c) => (c.id === s.componentId ? { ...c, mesh } : c)) }
  return { ...d, shapes: shapesOf(d).map((x) => (x.id === s.id ? { ...x, mesh } : x)) }
}

/**
 * Push/Pull a face of a shape by a distance in meters measured in the room (the shape may be rotated
 * or scaled, so the distance is converted into the shape's own units).
 */
export function pushPullMesh(d: Design, s: Shape, fi: number, worldDist: number): SolidMesh | null {
  const mesh = meshOf(d, s)
  if (!mesh || !mesh.faces[fi]) return null
  const m = shapeMatrix(s)
  const nl = faceNormal(mesh, fi)
  const lin = new THREE.Matrix3().setFromMatrix4(m)
  const stretched = nl.clone().applyMatrix3(lin)
  const nw = nl.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(m)).normalize()
  const k = stretched.dot(nw)
  if (Math.abs(k) < 1e-6) return null
  return pushPull(mesh, fi, worldDist / k)
}

export function applyPushPull(shapeId: string, fi: number, worldDist: number) {
  update((d) => {
    const s = shapesOf(d).find((x) => x.id === shapeId)
    const mesh = s && pushPullMesh(d, s, fi, worldDist)
    return s && mesh ? withMesh(d, s, mesh) : d
  })
}

export function paintFace(shapeId: string, fi: number | null, color: string) {
  update((d) => {
    const s = shapesOf(d).find((x) => x.id === shapeId)
    const mesh = s && meshOf(d, s)
    if (!s || !mesh) return d
    if (fi === null) {
      // Whole shape: its color, and clear per-face paint.
      const plain = { ...mesh, faceColors: undefined }
      return withMesh({ ...d, shapes: shapesOf(d).map((x) => (x.id === s.id ? { ...x, color } : x)) }, s, plain)
    }
    const faceColors = mesh.faces.map((_, i) => (i === fi ? color : (mesh.faceColors?.[i] ?? null)))
    return withMesh(d, s, { ...mesh, faceColors })
  })
}

/** Copies placed next to the originals (component copies stay linked to their component). */
export function duplicateShapes(ids: string[], offset?: Vec3): string[] {
  const d0 = currentDesign()
  if (!d0) return []
  const list = shapesOf(d0).filter((s) => ids.includes(s.id))
  if (!list.length) return []
  const box = new THREE.Box3()
  for (const s of list) box.union(shapeBox(d0, s))
  const off = offset ?? [Math.round((box.max.x - box.min.x + 0.2) * 100) / 100, 0, 0]
  const copies = list.map((s) => ({
    ...structuredClone(s),
    id: uid(),
    position: [s.position[0] + off[0], s.position[1] + off[1], s.position[2] + off[2]] as Vec3,
  }))
  update((d) => ({ ...d, shapes: [...shapesOf(d), ...copies] }))
  selectShapes(copies.map((c) => c.id))
  return copies.map((c) => c.id)
}

/** Several shapes become one (a group); a single component instance becomes plain geometry. */
export function groupShapes(ids: string[], name = 'Group'): string | null {
  const d = currentDesign()
  if (!d) return null
  const list = shapesOf(d).filter((s) => ids.includes(s.id))
  if (list.length < 2) return null
  const merged = mergeMeshes(list.map((s) => ({ mesh: transformMesh(meshOf(d, s)!, shapeMatrix(s)), color: s.color })))
  const { mesh, offset } = recenter(merged)
  const id = uid()
  const shape: Shape = { id, name, mesh, position: arr(offset), rotation: [0, 0, 0], scale: [1, 1, 1] }
  update((x) => ({ ...x, shapes: [...shapesOf(x).filter((s) => !ids.includes(s.id)), shape] }))
  selectShapes([id])
  return id
}

/** Turns the selection into a component; other copies made from it later share its geometry. */
export function makeComponent(ids: string[], name: string) {
  const gid = ids.length > 1 ? groupShapes(ids, name) : ids[0]
  const d = currentDesign()
  const s = d && shapesOf(d).find((x) => x.id === gid)
  if (!d || !s || !s.mesh) return
  const cid = uid()
  const baked = s.color ? { ...s.mesh, faceColors: s.mesh.faces.map((_, i) => s.mesh!.faceColors?.[i] ?? s.color!) } : s.mesh
  update((x) => ({
    ...x,
    components: [...(x.components ?? []), { id: cid, name, mesh: baked }],
    shapes: shapesOf(x).map((y) => (y.id === s.id ? { ...y, name, mesh: undefined, componentId: cid, color: undefined } : y)),
  }))
}

/** Detaches one copy from its component so it can be edited on its own. */
export function makeUnique(id: string) {
  update((d) => {
    const s = shapesOf(d).find((x) => x.id === id)
    const c = s && componentOf(d, s)
    if (!s || !c) return d
    return { ...d, shapes: shapesOf(d).map((x) => (x.id === id ? { ...x, componentId: undefined, mesh: structuredClone(c.mesh) } : x)) }
  })
}

/** Splits a group or component copy back into its separate solids. */
export function explodeShape(id: string) {
  const d = currentDesign()
  const s = d && shapesOf(d).find((x) => x.id === id)
  const mesh = d && s && meshOf(d, s)
  if (!d || !s || !mesh) return
  const parts = splitMesh(transformMesh(mesh, shapeMatrix(s))).map((m) => {
    const r = recenter(m)
    return { id: uid(), name: 'Shape', mesh: r.mesh, position: arr(r.offset), rotation: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, color: s.color }
  })
  update((x) => ({ ...x, shapes: [...shapesOf(x).filter((y) => y.id !== id), ...parts] }))
  selectShapes(parts.map((p) => p.id))
}

/** Applies a world-space transform (from the move/rotate/scale gizmo) to shapes. */
export function transformShapes(ids: string[], delta: THREE.Matrix4, record = true) {
  update(
    (d) => ({
      ...d,
      shapes: shapesOf(d).map((s) => (ids.includes(s.id) ? { ...s, ...decompose(delta.clone().multiply(shapeMatrix(s))) } : s)),
    }),
    record,
  )
}

/** The shape's size along its own axes (width, height, depth), in meters. */
export function shapeSize(d: Design, s: Shape): Vec3 {
  const mesh = meshOf(d, s)
  const box = new THREE.Box3()
  for (const p of mesh?.verts ?? []) box.expandByPoint(vec(p))
  const z = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3())
  return [z.x * Math.abs(s.scale[0]), z.y * Math.abs(s.scale[1]), z.z * Math.abs(s.scale[2])]
}

/** Resizes a shape along its own axes (shapes are built around their base center, which stays put). */
export function resizeShape(id: string, size: Vec3) {
  update((d) => {
    const s = shapesOf(d).find((x) => x.id === id)
    if (!s) return d
    const cur = shapeSize(d, s)
    const scale = s.scale.map((k, i) => (cur[i] > 1e-6 && size[i] > 0 ? (k * size[i]) / cur[i] : k)) as Vec3
    return { ...d, shapes: shapesOf(d).map((x) => (x.id === id ? { ...x, scale } : x)) }
  })
}

export function addDimension(a: Vec3, b: Vec3) {
  update((d) => ({ ...d, dimensions: [...(d.dimensions ?? []), { id: uid(), a, b }] }))
}

export function deleteDimension(id: string) {
  update((d) => ({ ...d, dimensions: (d.dimensions ?? []).filter((x) => x.id !== id) }))
}

export function currentDesign(): Design | undefined {
  const s = useStore.getState()
  const p = s.projects.find((x) => x.id === s.currentProjectId)
  return (p?.variants.find((v) => v.id === p.activeVariantId) ?? p?.variants[0])?.design
}

export const worldPoint = (p: THREE.Vector3): Vec3 => arr(p)
export { vec }
