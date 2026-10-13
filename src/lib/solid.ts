import * as THREE from 'three'
import type { ComponentDef, Design, Shape, SolidMesh, Vec3 } from '../types'

/**
 * Geometry of modeled shapes: SketchUp-style polygon faces with shared corners, Push/Pull, merging
 * and splitting. Meshes are plain JSON so they are saved with the design.
 */

export const vec = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2])
export const arr = (v: THREE.Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)]
const round = (x: number) => Math.round(x * 1e5) / 1e5

/** Face normal by Newell's method (works for any flat polygon, convex or not). */
export function faceNormal(mesh: SolidMesh, fi: number): THREE.Vector3 {
  const f = mesh.faces[fi]
  const n = new THREE.Vector3()
  for (let i = 0; i < f.length; i++) {
    const a = mesh.verts[f[i]]
    const b = mesh.verts[f[(i + 1) % f.length]]
    n.x += (a[1] - b[1]) * (a[2] + b[2])
    n.y += (a[2] - b[2]) * (a[0] + b[0])
    n.z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return n.lengthSq() > 0 ? n.normalize() : new THREE.Vector3(0, 1, 0)
}

export function faceCenter(mesh: SolidMesh, fi: number): THREE.Vector3 {
  const f = mesh.faces[fi]
  const c = new THREE.Vector3()
  for (const i of f) c.add(vec(mesh.verts[i]))
  return c.divideScalar(f.length || 1)
}

/** A single flat face through the points, turned so its front faces `normal`. */
export function polygonMesh(pts: Vec3[], normal: THREE.Vector3): SolidMesh {
  const mesh: SolidMesh = { verts: pts.map((p) => [...p] as Vec3), faces: [pts.map((_, i) => i)] }
  if (faceNormal(mesh, 0).dot(normal) < 0) mesh.faces[0].reverse()
  return mesh
}

/** Two orthogonal directions spanning the plane with this normal (axis-aligned when possible). */
export function planeBasis(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const ax = Math.abs(n.x)
  const ay = Math.abs(n.y)
  const az = Math.abs(n.z)
  let u: THREE.Vector3
  if (ay >= ax && ay >= az) u = new THREE.Vector3(1, 0, 0)
  else if (ax >= az) u = new THREE.Vector3(0, 0, 1)
  else u = new THREE.Vector3(1, 0, 0)
  u.addScaledVector(n, -u.dot(n)).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  return { u, v }
}

const hasEdge = (f: number[], a: number, b: number) => {
  for (let i = 0; i < f.length; i++) if (f[i] === a && f[(i + 1) % f.length] === b) return true
  return false
}

/** Index of the other face sharing the edge a-b, or -1. */
function neighbourOf(mesh: SolidMesh, fi: number, a: number, b: number): number {
  return mesh.faces.findIndex((f, j) => j !== fi && (hasEdge(f, b, a) || hasEdge(f, a, b)))
}

/**
 * Push/Pull a face by `dist` meters along its normal (negative pushes in), like SketchUp:
 * - a face whose neighbours are all at right angles slides, stretching the shape (a box gets taller);
 * - a lone face becomes a solid (a rectangle becomes a box);
 * - otherwise the face is extruded and new side faces are added.
 */
export function pushPull(mesh: SolidMesh, fi: number, dist: number): SolidMesh {
  const face = mesh.faces[fi]
  if (!face || Math.abs(dist) < 1e-6) return mesh
  const n = faceNormal(mesh, fi)
  const edges = face.map((a, i) => [a, face[(i + 1) % face.length]] as const)
  const neighbours = edges.map(([a, b]) => neighbourOf(mesh, fi, a, b))
  const verts = mesh.verts.map((p) => [...p] as Vec3)
  const faces = mesh.faces.map((f) => f.slice())
  const colors = mesh.faceColors ? mesh.faceColors.slice() : undefined
  const shift = (i: number, d: number) => arr(vec(verts[i]).addScaledVector(n, d))

  const flat = neighbours.every((j) => j < 0)
  const square = neighbours.every((j) => j >= 0 && Math.abs(faceNormal(mesh, j).dot(n)) < 1e-3)
  if (square) {
    // How far the face can go back before it meets the far side of the shape.
    const p0 = vec(verts[face[0]])
    let depth = Infinity
    for (const j of new Set(neighbours))
      for (const k of mesh.faces[j]) if (!face.includes(k)) depth = Math.min(depth, -vec(verts[k]).sub(p0).dot(n))
    const d = dist < 0 && Number.isFinite(depth) ? Math.max(dist, -(depth - 0.001)) : dist
    for (const i of face) verts[i] = shift(i, d)
    return { ...mesh, verts, faces, faceColors: colors }
  }

  const back = flat && dist < 0
  const moved = face.map((i) => {
    verts.push(shift(i, dist))
    return verts.length - 1
  })
  const sides: number[][] = edges.map(([a, b], i) => {
    const a2 = moved[i]
    const b2 = moved[(i + 1) % face.length]
    return back ? [b, a, a2, b2] : [a, b, b2, a2]
  })
  if (flat) {
    // The original face stays as the far side (facing away), the moved copy is the near side.
    faces[fi] = back ? face.slice() : face.slice().reverse()
    faces.push(back ? moved.slice().reverse() : moved)
    colors?.push(colors[fi] ?? null)
  } else {
    faces[fi] = moved
  }
  faces.push(...sides)
  colors?.push(...sides.map(() => null))
  return { verts, faces, faceColors: colors }
}

/** Unique undirected edges, for drawing lines. */
export function edgesOf(mesh: SolidMesh): [number, number][] {
  const seen = new Set<string>()
  const out: [number, number][] = []
  for (const f of mesh.faces)
    for (let i = 0; i < f.length; i++) {
      const a = f[i]
      const b = f[(i + 1) % f.length]
      const k = a < b ? `${a},${b}` : `${b},${a}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push([a, b])
    }
  return out
}

/** Triangles for rendering, with the face each triangle belongs to (for picking and paint). */
export function triangulate(mesh: SolidMesh): { tris: number[][]; triFace: number[] } {
  const tris: number[][] = []
  const triFace: number[] = []
  mesh.faces.forEach((f, fi) => {
    if (f.length < 3) return
    const n = faceNormal(mesh, fi)
    let list: number[][]
    if (f.length === 3) list = [[0, 1, 2]]
    else {
      const { u, v } = planeBasis(n)
      const contour = f.map((i) => {
        const p = vec(mesh.verts[i])
        return new THREE.Vector2(p.dot(u), p.dot(v))
      })
      list = THREE.ShapeUtils.triangulateShape(contour, [])
    }
    for (const t of list) {
      const a = vec(mesh.verts[f[t[0]]])
      const b = vec(mesh.verts[f[t[1]]])
      const c = vec(mesh.verts[f[t[2]]])
      const tn = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a))
      tris.push(tn.dot(n) >= 0 ? [f[t[0]], f[t[1]], f[t[2]]] : [f[t[0]], f[t[2]], f[t[1]]])
      triFace.push(fi)
    }
  })
  return { tris, triFace }
}

export function shapeMatrix(s: Pick<Shape, 'position' | 'rotation' | 'scale'>): THREE.Matrix4 {
  const e = new THREE.Euler((s.rotation[0] * Math.PI) / 180, (s.rotation[1] * Math.PI) / 180, (s.rotation[2] * Math.PI) / 180, 'XYZ')
  return new THREE.Matrix4().compose(vec(s.position), new THREE.Quaternion().setFromEuler(e), vec(s.scale))
}

/** Position, rotation (degrees) and scale from a matrix. */
export function decompose(m: THREE.Matrix4): Pick<Shape, 'position' | 'rotation' | 'scale'> {
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const sc = new THREE.Vector3()
  m.decompose(p, q, sc)
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 1000) / 1000
  return { position: arr(p), rotation: [deg(e.x), deg(e.y), deg(e.z)], scale: arr(sc) }
}

export function componentOf(design: Design, s: Shape): ComponentDef | undefined {
  return s.componentId ? design.components?.find((c) => c.id === s.componentId) : undefined
}

export function meshOf(design: Design, s: Shape): SolidMesh | null {
  return componentOf(design, s)?.mesh ?? s.mesh ?? null
}

/** World-space corners of a shape's bounding box. */
export function shapeBox(design: Design, s: Shape): THREE.Box3 {
  const box = new THREE.Box3()
  const mesh = meshOf(design, s)
  if (!mesh) return box
  const m = shapeMatrix(s)
  for (const p of mesh.verts) box.expandByPoint(vec(p).applyMatrix4(m))
  return box
}

/** Mesh with every corner transformed (used to bake a shape into a merged group). */
export function transformMesh(mesh: SolidMesh, m: THREE.Matrix4): SolidMesh {
  const flip = m.determinant() < 0
  return {
    verts: mesh.verts.map((p) => arr(vec(p).applyMatrix4(m))),
    faces: mesh.faces.map((f) => (flip ? f.slice().reverse() : f.slice())),
    faceColors: mesh.faceColors?.slice(),
  }
}

export function mergeMeshes(list: { mesh: SolidMesh; color?: string }[]): SolidMesh {
  const out: SolidMesh = { verts: [], faces: [], faceColors: [] }
  for (const { mesh, color } of list) {
    const base = out.verts.length
    out.verts.push(...mesh.verts)
    mesh.faces.forEach((f, i) => {
      out.faces.push(f.map((k) => k + base))
      out.faceColors!.push(mesh.faceColors?.[i] ?? color ?? null)
    })
  }
  return out
}

/** Splits a mesh into its separate solids (faces connected through shared corners). */
export function splitMesh(mesh: SolidMesh): SolidMesh[] {
  const parent = mesh.verts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const f of mesh.faces) for (let i = 1; i < f.length; i++) parent[find(f[i])] = find(f[0])
  const groups = new Map<number, number[]>()
  mesh.faces.forEach((f, fi) => {
    if (!f.length) return
    const r = find(f[0])
    groups.set(r, [...(groups.get(r) ?? []), fi])
  })
  return [...groups.values()].map((fis) => {
    const remap = new Map<number, number>()
    const verts: Vec3[] = []
    const faces = fis.map((fi) =>
      mesh.faces[fi].map((k) => {
        if (!remap.has(k)) {
          remap.set(k, verts.length)
          verts.push(mesh.verts[k])
        }
        return remap.get(k)!
      }),
    )
    return { verts, faces, faceColors: mesh.faceColors ? fis.map((fi) => mesh.faceColors![fi] ?? null) : undefined }
  })
}

/** Moves a mesh so its bounding-box center (bottom for y) is the origin; returns the offset removed. */
export function recenter(mesh: SolidMesh): { mesh: SolidMesh; offset: THREE.Vector3 } {
  const box = new THREE.Box3()
  for (const p of mesh.verts) box.expandByPoint(vec(p))
  const offset = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
  return { mesh: { ...mesh, verts: mesh.verts.map((p) => arr(vec(p).sub(offset))) }, offset }
}
