import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ElementKind, FaceMesh, MaterialInfo, Ref, SkpApi } from './api.ts'

/**
 * Binding to the official SketchUp C SDK (SketchUpAPI.dll on Windows, SketchUpAPI.framework on macOS),
 * called through koffi. The SDK is free from https://developer.sketchup.com (it can't be shipped with
 * this app); point SKETCHUP_SDK_DIR at the folder that contains the library.
 *
 * Every SketchUp "Ref" is a struct holding one pointer; on 64-bit systems that is passed exactly like a
 * 64-bit integer, so refs are declared as uint64_t and output parameters are plain byte buffers.
 */

const ERRORS: Record<number, string> = {
  1: 'null pointer input',
  2: 'invalid input',
  6: 'generic error',
  7: 'the file could not be read (is it a SketchUp file?)',
  8: 'out of range',
  9: 'no data',
  12: 'the model is invalid',
  13: 'the file was saved by a newer SketchUp than this SDK; download the latest SDK',
  17: 'unsupported',
}

export function libraryPath(dir: string): string {
  const candidates =
    process.platform === 'win32'
      ? [path.join(dir, 'SketchUpAPI.dll'), path.join(dir, 'binaries', 'sketchup', 'x64', 'SketchUpAPI.dll')]
      : process.platform === 'darwin'
        ? [path.join(dir, 'SketchUpAPI.framework', 'SketchUpAPI'), path.join(dir, 'SketchUpAPI.framework', 'Versions', 'Current', 'SketchUpAPI')]
        : []
  const found = candidates.find((p) => existsSync(p))
  if (!found)
    throw new Error(
      process.platform === 'win32' || process.platform === 'darwin'
        ? `SketchUpAPI library not found in ${dir}. Set SKETCHUP_SDK_DIR to the SDK folder that contains SketchUpAPI.dll.`
        : 'The SketchUp SDK only exists for Windows and macOS.',
    )
  return found
}

export async function loadSketchUpApi(dir: string): Promise<SkpApi> {
  const lib = libraryPath(dir)
  // SketchUpAPI.dll loads companion DLLs from its own folder.
  if (process.platform === 'win32') process.env.PATH = `${path.dirname(lib)};${process.env.PATH ?? ''}`
  const koffi = (await import('koffi')).default
  const so = koffi.load(lib)
  const fn = (decl: string) => so.func(decl)

  const SUInitialize = fn('void SUInitialize()')
  const SUTerminate = fn('void SUTerminate()')
  const SUModelCreateFromFile = fn('int SUModelCreateFromFile(void *model, const char *path)')
  const SUModelRelease = fn('int SUModelRelease(void *model)')
  const SUModelGetEntities = fn('int SUModelGetEntities(uint64_t model, void *entities)')
  const count = (name: string) => fn(`int ${name}(uint64_t entities, void *count)`)
  const list = (name: string) => fn(`int ${name}(uint64_t entities, size_t len, void *items, void *count)`)
  const SUEntitiesGetNumFaces = count('SUEntitiesGetNumFaces')
  const SUEntitiesGetFaces = list('SUEntitiesGetFaces')
  const SUEntitiesGetNumGroups = count('SUEntitiesGetNumGroups')
  const SUEntitiesGetGroups = list('SUEntitiesGetGroups')
  const SUEntitiesGetNumInstances = count('SUEntitiesGetNumInstances')
  const SUEntitiesGetInstances = list('SUEntitiesGetInstances')
  const SUGroupGetEntities = fn('int SUGroupGetEntities(uint64_t group, void *entities)')
  const SUGroupGetTransform = fn('int SUGroupGetTransform(uint64_t group, void *transform)')
  const SUComponentInstanceGetDefinition = fn('int SUComponentInstanceGetDefinition(uint64_t instance, void *definition)')
  const SUComponentInstanceGetTransform = fn('int SUComponentInstanceGetTransform(uint64_t instance, void *transform)')
  const SUComponentDefinitionGetEntities = fn('int SUComponentDefinitionGetEntities(uint64_t definition, void *entities)')
  const SUComponentDefinitionGetName = fn('int SUComponentDefinitionGetName(uint64_t definition, void *name)')
  const toElement: Record<ElementKind, (r: Ref) => Ref> = {
    face: fn('uint64_t SUFaceToDrawingElement(uint64_t face)'),
    group: fn('uint64_t SUGroupToDrawingElement(uint64_t group)'),
    instance: fn('uint64_t SUComponentInstanceToDrawingElement(uint64_t instance)'),
  }
  const SUDrawingElementGetMaterial = fn('int SUDrawingElementGetMaterial(uint64_t element, void *material)')
  const SUDrawingElementGetHidden = fn('int SUDrawingElementGetHidden(uint64_t element, void *hidden)')
  const SUDrawingElementGetLayer = fn('int SUDrawingElementGetLayer(uint64_t element, void *layer)')
  const SULayerGetVisibility = fn('int SULayerGetVisibility(uint64_t layer, void *visible)')
  const SUFaceGetFrontMaterial = fn('int SUFaceGetFrontMaterial(uint64_t face, void *material)')
  const SUFaceGetBackMaterial = fn('int SUFaceGetBackMaterial(uint64_t face, void *material)')
  const SUMeshHelperCreate = fn('int SUMeshHelperCreate(void *mesh, uint64_t face)')
  const SUMeshHelperRelease = fn('int SUMeshHelperRelease(void *mesh)')
  const SUMeshHelperGetNumVertices = fn('int SUMeshHelperGetNumVertices(uint64_t mesh, void *count)')
  const SUMeshHelperGetNumTriangles = fn('int SUMeshHelperGetNumTriangles(uint64_t mesh, void *count)')
  const SUMeshHelperGetVertices = fn('int SUMeshHelperGetVertices(uint64_t mesh, size_t len, void *vertices, void *count)')
  const SUMeshHelperGetNormals = fn('int SUMeshHelperGetNormals(uint64_t mesh, size_t len, void *normals, void *count)')
  const SUMeshHelperGetVertexIndices = fn('int SUMeshHelperGetVertexIndices(uint64_t mesh, size_t len, void *indices, void *count)')
  const SUMeshHelperGetFrontSTQCoords = fn('int SUMeshHelperGetFrontSTQCoords(uint64_t mesh, size_t len, void *stq, void *count)')
  const SUMeshHelperGetBackSTQCoords = fn('int SUMeshHelperGetBackSTQCoords(uint64_t mesh, size_t len, void *stq, void *count)')
  const SUMaterialGetColor = fn('int SUMaterialGetColor(uint64_t material, void *color)')
  const SUMaterialGetUseOpacity = fn('int SUMaterialGetUseOpacity(uint64_t material, void *use)')
  const SUMaterialGetOpacity = fn('int SUMaterialGetOpacity(uint64_t material, void *alpha)')
  const SUMaterialGetTexture = fn('int SUMaterialGetTexture(uint64_t material, void *texture)')
  const SUMaterialGetName = fn('int SUMaterialGetName(uint64_t material, void *name)')
  const SUTextureWriteToFile = fn('int SUTextureWriteToFile(uint64_t texture, const char *path)')
  const SUStringCreate = fn('int SUStringCreate(void *str)')
  const SUStringRelease = fn('int SUStringRelease(void *str)')
  const SUStringGetUTF8Length = fn('int SUStringGetUTF8Length(uint64_t str, void *length)')
  const SUStringGetUTF8 = fn('int SUStringGetUTF8(uint64_t str, size_t len, void *chars, void *count)')

  SUInitialize()
  const textures = mkdtempSync(path.join(tmpdir(), 'skp-textures-'))

  const check = (code: number, what: string) => {
    if (code !== 0) throw new Error(`SketchUp SDK: ${what} failed: ${ERRORS[code] ?? `error ${code}`}`)
  }
  const ref = (b: Buffer, i = 0): Ref => {
    const v = b.readBigUInt64LE(i * 8)
    return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v
  }
  const out = (call: (buf: Buffer) => number, what: string): Ref => {
    const b = Buffer.alloc(8)
    check(call(b), what)
    return ref(b)
  }
  /** Like out(), but "no data" (nothing assigned) gives an invalid ref instead of an error. */
  const optional = (call: (buf: Buffer) => number): Ref => {
    const b = Buffer.alloc(8)
    return call(b) === 0 ? ref(b) : 0
  }
  const size = (call: (buf: Buffer) => number, what: string): number => Number(out(call, what))
  const refs = (num: typeof SUEntitiesGetNumFaces, get: typeof SUEntitiesGetFaces, ents: Ref, what: string): Ref[] => {
    const n = size((b) => num(ents, b), what)
    if (!n) return []
    const items = Buffer.alloc(n * 8)
    const got = Buffer.alloc(8)
    check(get(ents, n, items, got), what)
    return Array.from({ length: Number(got.readBigUInt64LE(0)) }, (_, i) => ref(items, i))
  }
  const matrix = (call: (buf: Buffer) => number, what: string): number[] => {
    const b = Buffer.alloc(16 * 8)
    check(call(b), what)
    return Array.from({ length: 16 }, (_, i) => b.readDoubleLE(i * 8))
  }
  const string = (call: (s: Ref) => number): string => {
    const holder = Buffer.alloc(8)
    if (SUStringCreate(holder) !== 0) return ''
    const s = ref(holder)
    try {
      if (call(s) !== 0) return ''
      const len = Buffer.alloc(8)
      SUStringGetUTF8Length(s, len)
      const n = Number(len.readBigUInt64LE(0)) + 1
      const chars = Buffer.alloc(n)
      const got = Buffer.alloc(8)
      SUStringGetUTF8(s, n, chars, got)
      return chars.toString('utf8', 0, Number(got.readBigUInt64LE(0))).replace(/\0+$/, '')
    } finally {
      SUStringRelease(holder)
    }
  }
  const bool = (call: (buf: Buffer) => number): boolean | null => {
    const b = Buffer.alloc(8)
    return call(b) === 0 ? b[0] !== 0 : null
  }
  let textureCount = 0

  return {
    open(file) {
      return out((b) => SUModelCreateFromFile(b, file), 'opening the file')
    },
    close(model) {
      const b = Buffer.alloc(8)
      b.writeBigUInt64LE(BigInt(model))
      SUModelRelease(b)
    },
    modelEntities: (model) => out((b) => SUModelGetEntities(model, b), 'reading the model'),
    faces: (ents) => refs(SUEntitiesGetNumFaces, SUEntitiesGetFaces, ents, 'listing faces'),
    groups: (ents) => refs(SUEntitiesGetNumGroups, SUEntitiesGetGroups, ents, 'listing groups'),
    instances: (ents) => refs(SUEntitiesGetNumInstances, SUEntitiesGetInstances, ents, 'listing components'),
    groupEntities: (g) => out((b) => SUGroupGetEntities(g, b), 'reading a group'),
    groupTransform: (g) => matrix((b) => SUGroupGetTransform(g, b), 'reading a group transform'),
    instanceDefinition: (i) => out((b) => SUComponentInstanceGetDefinition(i, b), 'reading a component'),
    instanceTransform: (i) => matrix((b) => SUComponentInstanceGetTransform(i, b), 'reading a component transform'),
    definitionEntities: (d) => out((b) => SUComponentDefinitionGetEntities(d, b), 'reading a component definition'),
    definitionName: (d) => string((s) => {
      const h = Buffer.alloc(8)
      h.writeBigUInt64LE(BigInt(s))
      return SUComponentDefinitionGetName(d, h)
    }),
    elementMaterial: (kind, r) => optional((b) => SUDrawingElementGetMaterial(toElement[kind](r), b)),
    elementHidden(kind, r) {
      const el = toElement[kind](r)
      if (bool((b) => SUDrawingElementGetHidden(el, b))) return true
      const layer = optional((b) => SUDrawingElementGetLayer(el, b))
      return layer !== 0 && layer !== 0n && bool((b) => SULayerGetVisibility(layer, b)) === false
    },
    faceMaterials: (face) => ({
      front: optional((b) => SUFaceGetFrontMaterial(face, b)),
      back: optional((b) => SUFaceGetBackMaterial(face, b)),
    }),
    faceMesh(face, back): FaceMesh {
      const holder = Buffer.alloc(8)
      check(SUMeshHelperCreate(holder, face), 'triangulating a face')
      const mesh = ref(holder)
      try {
        const nv = size((b) => SUMeshHelperGetNumVertices(mesh, b), 'counting vertices')
        const nt = size((b) => SUMeshHelperGetNumTriangles(mesh, b), 'counting triangles')
        const got = Buffer.alloc(8)
        const pts = Buffer.alloc(nv * 24)
        check(SUMeshHelperGetVertices(mesh, nv, pts, got), 'reading vertices')
        const nor = Buffer.alloc(nv * 24)
        check(SUMeshHelperGetNormals(mesh, nv, nor, got), 'reading normals')
        const stq = Buffer.alloc(nv * 24)
        ;(back ? SUMeshHelperGetBackSTQCoords : SUMeshHelperGetFrontSTQCoords)(mesh, nv, stq, got)
        const idx = Buffer.alloc(nt * 3 * 8)
        check(SUMeshHelperGetVertexIndices(mesh, nt * 3, idx, got), 'reading triangles')
        const doubles = (b: Buffer) => new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
        const indices = Array.from({ length: Number(got.readBigUInt64LE(0)) }, (_, i) => Number(idx.readBigUInt64LE(i * 8)))
        return { points: doubles(pts), normals: doubles(nor), stq: doubles(stq), indices }
      } finally {
        SUMeshHelperRelease(holder)
      }
    },
    material(m): MaterialInfo {
      const c = Buffer.alloc(4)
      SUMaterialGetColor(m, c)
      const use = bool((b) => SUMaterialGetUseOpacity(m, b))
      const alpha = Buffer.alloc(8)
      const opacity = use && SUMaterialGetOpacity(m, alpha) === 0 ? alpha.readDoubleLE(0) : 1
      const name = string((s) => {
        const h = Buffer.alloc(8)
        h.writeBigUInt64LE(BigInt(s))
        return SUMaterialGetName(m, h)
      })
      let texture: MaterialInfo['texture'] = null
      const tex = optional((b) => SUMaterialGetTexture(m, b))
      if (tex !== 0 && tex !== 0n) {
        const file = path.join(textures, `t${textureCount++}.png`)
        if (SUTextureWriteToFile(tex, file) === 0 && existsSync(file)) {
          const data = readFileSync(file)
          const jpeg = data[0] === 0xff && data[1] === 0xd8
          texture = { data, mimeType: jpeg ? 'image/jpeg' : 'image/png' }
        }
      }
      return { name, color: [c[0], c[1], c[2]], opacity, texture }
    },
    dispose() {
      SUTerminate()
      rmSync(textures, { recursive: true, force: true })
    },
  }
}
