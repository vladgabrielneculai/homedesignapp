/** Minimal binary glTF 2.0 writer: one node, one mesh with a primitive per material. */

export interface GlbMaterial {
  name: string
  color: [number, number, number, number]
  texture?: { data: Buffer; mimeType: string }
}

export interface GlbPrimitive {
  material: number
  positions: number[]
  normals: number[]
  uvs: number[] | null
  indices: number[]
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export function writeGlb(name: string, materials: GlbMaterial[], primitives: GlbPrimitive[]): Buffer {
  const chunks: Buffer[] = []
  let offset = 0
  const bufferViews: Record<string, unknown>[] = []
  const accessors: Record<string, unknown>[] = []
  const addView = (data: Buffer, target?: number) => {
    const pad = (4 - (offset % 4)) % 4
    if (pad) {
      chunks.push(Buffer.alloc(pad))
      offset += pad
    }
    chunks.push(data)
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? { target } : {}) })
    offset += data.length
    return bufferViews.length - 1
  }
  const floats = (values: number[], size: number, type: string, withBounds: boolean) => {
    const data = Buffer.from(new Float32Array(values).buffer)
    const view = addView(data, 34962)
    const acc: Record<string, unknown> = { bufferView: view, componentType: 5126, count: values.length / size, type }
    if (withBounds) {
      const min = Array(size).fill(Infinity)
      const max = Array(size).fill(-Infinity)
      for (let i = 0; i < values.length; i++) {
        min[i % size] = Math.min(min[i % size], values[i])
        max[i % size] = Math.max(max[i % size], values[i])
      }
      acc.min = min.map((v) => Math.fround(v))
      acc.max = max.map((v) => Math.fround(v))
    }
    accessors.push(acc)
    return accessors.length - 1
  }

  const images: Record<string, unknown>[] = []
  const textures: Record<string, unknown>[] = []
  const gltfMaterials = materials.map((m) => {
    const pbr: Record<string, unknown> = {
      baseColorFactor: [srgbToLinear(m.color[0]), srgbToLinear(m.color[1]), srgbToLinear(m.color[2]), m.color[3]],
      metallicFactor: 0,
      roughnessFactor: 0.8,
    }
    if (m.texture) {
      images.push({ bufferView: addView(m.texture.data), mimeType: m.texture.mimeType })
      textures.push({ source: images.length - 1, sampler: 0 })
      pbr.baseColorTexture = { index: textures.length - 1 }
      // A texture shows its own colors (SketchUp's material color only tints colorized textures).
      pbr.baseColorFactor = [1, 1, 1, m.color[3]]
    }
    return { name: m.name, pbrMetallicRoughness: pbr, doubleSided: true, ...(m.color[3] < 0.999 ? { alphaMode: 'BLEND' } : {}) }
  })

  const prims = primitives
    .filter((p) => p.indices.length)
    .map((p) => {
      const attributes: Record<string, number> = {
        POSITION: floats(p.positions, 3, 'VEC3', true),
        NORMAL: floats(p.normals, 3, 'VEC3', false),
      }
      if (p.uvs) attributes.TEXCOORD_0 = floats(p.uvs, 2, 'VEC2', false)
      const idx = Buffer.from(new Uint32Array(p.indices).buffer)
      accessors.push({ bufferView: addView(idx, 34963), componentType: 5125, count: p.indices.length, type: 'SCALAR' })
      return { attributes, indices: accessors.length - 1, material: p.material }
    })

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'Home Designer SketchUp import' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: prims }],
    materials: gltfMaterials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: 0 }],
  }
  if (images.length) {
    json.images = images
    json.textures = textures
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]
  }
  const pad = (4 - (offset % 4)) % 4
  if (pad) chunks.push(Buffer.alloc(pad))
  const bin = Buffer.concat(chunks)
  ;(json.buffers as { byteLength: number }[])[0].byteLength = bin.length

  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const jpad = (4 - (jsonBuf.length % 4)) % 4
  if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8)
  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(jsonBuf.length, 0)
  jsonHead.writeUInt32LE(0x4e4f534a, 4)
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(bin.length, 0)
  binHead.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonHead, jsonBuf, binHead, bin])
}
