/** What the .skp converter needs from SketchUp's C API (see sdk.ts for the real binding). */

/** An opaque SketchUp object reference (0 when invalid). */
export type Ref = number | bigint

export type ElementKind = 'face' | 'group' | 'instance'

export interface FaceMesh {
  /** x, y, z per vertex, in inches. */
  points: Float64Array
  normals: Float64Array
  /** s, t, q per vertex (texture coordinates are s/q, t/q). */
  stq: Float64Array
  /** Three vertex indices per triangle. */
  indices: number[]
}

export interface MaterialInfo {
  name: string
  /** sRGB 0-255 and alpha 0-1. */
  color: [number, number, number]
  opacity: number
  texture: { data: Buffer; mimeType: 'image/png' | 'image/jpeg' } | null
}

export interface SkpApi {
  open(file: string): Ref
  close(model: Ref): void
  modelEntities(model: Ref): Ref
  faces(entities: Ref): Ref[]
  groups(entities: Ref): Ref[]
  instances(entities: Ref): Ref[]
  groupEntities(group: Ref): Ref
  /** Column-major 4×4 matrix. */
  groupTransform(group: Ref): number[]
  instanceDefinition(instance: Ref): Ref
  instanceTransform(instance: Ref): number[]
  definitionEntities(definition: Ref): Ref
  definitionName(definition: Ref): string
  /** Material painted on a face / group / component instance (0 if none). */
  elementMaterial(kind: ElementKind, ref: Ref): Ref
  /** Hidden, or on a hidden tag/layer. */
  elementHidden(kind: ElementKind, ref: Ref): boolean
  faceMaterials(face: Ref): { front: Ref; back: Ref }
  faceMesh(face: Ref, back: boolean): FaceMesh
  material(ref: Ref): MaterialInfo
  dispose(): void
}

export const isValid = (r: Ref) => r !== 0 && r !== 0n
