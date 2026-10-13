import { isValid, type Ref, type SkpApi } from './api.ts'
import { writeGlb, type GlbMaterial, type GlbPrimitive } from './glb.ts'

/**
 * Converts a SketchUp model to a binary glTF the browser can display: every face, group and component
 * copy is flattened into world space, grouped by material, and converted from SketchUp's inches with
 * Z up to meters with Y up (SketchUp's green axis becomes the plan's "up").
 */

const INCH = 0.0254
type Mat = number[]

const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Column-major 4×4 product a·b. */
function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}

function apply(m: Mat, x: number, y: number, z: number): [number, number, number] {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w]
}

/** Inverse-transpose of the 3×3 part, for normals (row-major result). */
function normalMatrix(m: Mat): number[] {
  const a = m[0], b = m[4], c = m[8]
  const d = m[1], e = m[5], f = m[9]
  const g = m[2], h = m[6], i = m[10]
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C || 1
  // cofactor matrix / det = inverse transpose
  return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]
}

function det3(m: Mat): number {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
}

export interface ConvertResult {
  glb: Buffer
  /** Size in meters: width (x), height (y), depth (z). */
  size: [number, number, number]
  triangles: number
  name: string
}

export function convertSkp(api: SkpApi, file: string, name: string): ConvertResult {
  const model = api.open(file)
  const materials: GlbMaterial[] = [{ name: 'Default', color: [0.92, 0.91, 0.88, 1] }]
  const matIndex = new Map<string, number>()
  const prims = new Map<number, GlbPrimitive>()
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  let triangles = 0
  let biggest = { name: '', count: 0 }

  const materialFor = (m: Ref): number => {
    if (!isValid(m)) return 0
    const key = String(m)
    let idx = matIndex.get(key)
    if (idx === undefined) {
      const info = api.material(m)
      materials.push({ name: info.name, color: [info.color[0] / 255, info.color[1] / 255, info.color[2] / 255, info.opacity], texture: info.texture ?? undefined })
      idx = materials.length - 1
      matIndex.set(key, idx)
    }
    return idx
  }

  const prim = (material: number): GlbPrimitive => {
    let p = prims.get(material)
    if (!p) {
      p = { material, positions: [], normals: [], uvs: materials[material].texture ? [] : null, indices: [] }
      prims.set(material, p)
    }
    return p
  }

  const visit = (entities: Ref, m: Mat, inherited: Ref, depth: number) => {
    if (depth > 64) return
    const nm = normalMatrix(m)
    const flip = det3(m) < 0
    for (const face of api.faces(entities)) {
      if (api.elementHidden('face', face)) continue
      const { front, back } = api.faceMaterials(face)
      // Faces without paint take the paint of the group/component they are in.
      const useBack = !isValid(front) && isValid(back)
      const matRef = isValid(front) ? front : isValid(back) ? back : inherited
      const mi = materialFor(matRef)
      const mesh = api.faceMesh(face, useBack)
      const p = prim(mi)
      const base = p.positions.length / 3
      const n = mesh.points.length / 3
      for (let v = 0; v < n; v++) {
        const [x, y, z] = apply(m, mesh.points[v * 3], mesh.points[v * 3 + 1], mesh.points[v * 3 + 2])
        // SketchUp (x, y, z up) in inches → (x, z, -y) in meters.
        const wx = x * INCH
        const wy = z * INCH
        const wz = -y * INCH
        p.positions.push(wx, wy, wz)
        bounds.min[0] = Math.min(bounds.min[0], wx)
        bounds.min[1] = Math.min(bounds.min[1], wy)
        bounds.min[2] = Math.min(bounds.min[2], wz)
        bounds.max[0] = Math.max(bounds.max[0], wx)
        bounds.max[1] = Math.max(bounds.max[1], wy)
        bounds.max[2] = Math.max(bounds.max[2], wz)
        const ox = mesh.normals[v * 3], oy = mesh.normals[v * 3 + 1], oz = mesh.normals[v * 3 + 2]
        let nx = nm[0] * ox + nm[1] * oy + nm[2] * oz
        let ny = nm[3] * ox + nm[4] * oy + nm[5] * oz
        let nz = nm[6] * ox + nm[7] * oy + nm[8] * oz
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len
        ny /= len
        nz /= len
        if (useBack) p.normals.push(-nx, -nz, ny)
        else p.normals.push(nx, nz, -ny)
        if (p.uvs) {
          const q = mesh.stq[v * 3 + 2] || 1
          p.uvs.push(mesh.stq[v * 3] / q, 1 - mesh.stq[v * 3 + 1] / q)
        }
      }
      for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
        const a = base + mesh.indices[t]
        const b = base + mesh.indices[t + 1]
        const c = base + mesh.indices[t + 2]
        // Mirrored copies and back-painted faces turn inside out; keep triangles facing outwards.
        if (flip !== useBack) p.indices.push(a, c, b)
        else p.indices.push(a, b, c)
        triangles++
      }
    }
    for (const g of api.groups(entities)) {
      if (api.elementHidden('group', g)) continue
      const own = api.elementMaterial('group', g)
      visit(api.groupEntities(g), mul(m, api.groupTransform(g)), isValid(own) ? own : inherited, depth + 1)
    }
    for (const inst of api.instances(entities)) {
      if (api.elementHidden('instance', inst)) continue
      const def = api.instanceDefinition(inst)
      const own = api.elementMaterial('instance', inst)
      if (depth === 0) {
        const before = triangles
        visit(api.definitionEntities(def), mul(m, api.instanceTransform(inst)), isValid(own) ? own : inherited, depth + 1)
        if (triangles - before > biggest.count) biggest = { name: api.definitionName(def), count: triangles - before }
      } else visit(api.definitionEntities(def), mul(m, api.instanceTransform(inst)), isValid(own) ? own : inherited, depth + 1)
    }
  }

  try {
    visit(api.modelEntities(model), IDENTITY, 0, 0)
  } finally {
    api.close(model)
  }
  if (!triangles) throw new Error('The SketchUp file has no visible faces.')

  // Put the model's base center at the origin so it can be placed like furniture.
  const cx = (bounds.min[0] + bounds.max[0]) / 2
  const cz = (bounds.min[2] + bounds.max[2]) / 2
  const by = bounds.min[1]
  for (const p of prims.values())
    for (let i = 0; i < p.positions.length; i += 3) {
      p.positions[i] -= cx
      p.positions[i + 1] -= by
      p.positions[i + 2] -= cz
    }
  const size: [number, number, number] = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
  // A file with one main component (a sofa from 3D Warehouse) is named after it.
  const label = biggest.count > triangles * 0.8 && biggest.name ? biggest.name : name
  return { glb: writeGlb(label, materials, [...prims.values()]), size, triangles, name: label }
}
