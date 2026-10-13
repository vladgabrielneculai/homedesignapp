// All plan coordinates are in meters. The 2D plan uses (x, y); in 3D, plan y maps to world z.

export interface Pt {
  x: number
  y: number
}

export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number
  height: number
  /** Older per-wall paint for both sides; per-side finishes (below) take precedence. */
  color?: string
  /**
   * Finish of each face. Side 'a' faces along the normal (-sin θ, cos θ) of the direction a→b,
   * side 'b' the other way. Unset sides use `color`, then the style's wall color.
   */
  sides?: { a?: WallFinish; b?: WallFinish }
}

export type WallSide = 'a' | 'b'

export type WallFinish =
  | { kind: 'paint'; color: string }
  /** A built-in wallpaper or material (see catalog/wallFinishes), optionally recolored. */
  | { kind: 'pattern'; id: string; color?: string }
  /** A wallpaper image the user uploaded (see Wallpaper). */
  | { kind: 'image'; id: string }

/** A wallpaper or tile photo uploaded by the user, stored in IndexedDB. */
export interface Wallpaper {
  id: string
  name: string
  /** IndexedDB key of the image. */
  key: string
  /** Small JPEG data URL for swatches. */
  thumb: string
  /** Real width of one repeat of the image, in meters (height follows the image's aspect ratio). */
  width: number
  /** Image aspect ratio (height / width). */
  aspect: number
  createdAt: number
}

export type OpeningType = 'door' | 'window'

export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  /** Distance in meters from wall.a to the opening's center. */
  offset: number
  width: number
  height: number
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number
}

export interface Room {
  id: string
  name: string
  points: Pt[]
  /** Optional floor override; falls back to the design style's floor. */
  floor?: FloorId
}

export interface Item {
  id: string
  catalogId: string
  x: number
  y: number
  /** Rotation in degrees, clockwise when seen from above. */
  rotation: number
  /** Overrides the style's primary color for procedural items. */
  color?: string
  /** Height above the floor in meters, e.g. a lamp on a side table. */
  elevation?: number
  /** Custom size in meters (width, depth, height), overriding the catalog size. */
  w?: number
  d?: number
  h?: number
}

export type FloorId = 'oak' | 'walnut' | 'whiteOak' | 'tile' | 'marble' | 'concrete' | 'carpet' | 'terracotta'

export interface StyleSettings {
  presetId: string
  wallColor: string
  floor: FloorId
  /** Main upholstery / feature color. */
  primary: string
  /** Wood tone for frames, tables and cabinets. */
  wood: string
  /** Metal tone for legs, handles and fixtures. */
  metal: string
  /** Secondary accent (cushions, rugs, decor). */
  accent: string
}

/** A point or vector in 3D: x and z are plan x and plan y, y is height above the floor (meters). */
export type Vec3 = [number, number, number]

/** Polygon mesh of a modeled shape: SketchUp-style faces (any number of corners, flat). */
export interface SolidMesh {
  verts: Vec3[]
  /** Each face lists vertex indices counter-clockwise when seen from outside. */
  faces: number[][]
  /** Paint per face (null: the shape's color). */
  faceColors?: (string | null)[]
}

/**
 * Something modeled with the SketchUp tools (a box pulled up from a rectangle, a shelf, a step...).
 * Its geometry is its own mesh or, for a component instance, the component's shared mesh.
 */
export interface Shape {
  id: string
  name?: string
  mesh?: SolidMesh
  componentId?: string
  position: Vec3
  /** Euler angles in degrees (XYZ order). */
  rotation: Vec3
  scale: Vec3
  color?: string
}

/** A component definition: every instance shares this geometry, so editing one edits all. */
export interface ComponentDef {
  id: string
  name: string
  mesh: SolidMesh
}

/** A measurement left by the Tape measure tool. */
export interface Dimension {
  id: string
  a: Vec3
  b: Vec3
}

export interface Design {
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  items: Item[]
  /** Modeled shapes (see Shape), component definitions and tape measurements. */
  shapes?: Shape[]
  components?: ComponentDef[]
  dimensions?: Dimension[]
  style: StyleSettings
  /** Where the home is and which way it faces, for real sun positions. */
  site?: Site
  /** An imported floor plan image shown under the drawing, for tracing. */
  underlay?: Underlay
}

export interface Underlay {
  /** IndexedDB key of the image. */
  key: string
  name: string
  /** Image size in pixels. */
  w: number
  h: number
  /** Plan position of the image's top-left corner, in meters. */
  x: number
  y: number
  /** Meters per image pixel. */
  scale: number
  opacity: number
  visible: boolean
  /** Whether the scale has been set from a known distance. */
  calibrated: boolean
}

export interface Site {
  /** City from lib/sun CITIES, or undefined for custom coordinates. */
  city?: string
  lat: number
  lon: number
  /** Standard UTC offset in hours and daylight-saving rule. */
  utc: number
  dst: 'eu' | 'us' | 'au' | 'nz' | 'none'
  /** Compass bearing of the plan's "up" direction, in degrees (0 = up is north). */
  north: number
}

export interface Variant {
  id: string
  name: string
  design: Design
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  variants: Variant[]
  activeVariantId: string
  /** Small PNG data URL captured from the 3D view. */
  thumbnail?: string
}

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'place' | 'calibrate' | 'moveUnderlay'

export type Selection =
  | { kind: 'item'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'room'; id: string }
  | { kind: 'shapes'; ids: string[] }
  | { kind: 'dimension'; id: string }
  | null

/** SketchUp-style tools of the 3D view. */
export type ModelTool = 'select' | 'line' | 'rect' | 'circle' | 'push' | 'move' | 'rotate' | 'scale' | 'tape' | 'paint' | 'erase'

export type ViewMode = '2d' | '3d' | 'split' | 'compare'

/** A real piece of furniture from a shop, added by the user with its real dimensions. */
export interface Product {
  id: string
  name: string
  store: string
  url?: string
  price?: number
  currency: string
  /** Real dimensions in meters. */
  w: number
  d: number
  h: number
  /** Built-in generator used to draw it when there is no 3D model (see PRODUCT_SHAPES). */
  shape: string
  color: string
  /** Show wood grain on the main color (otherwise a plain painted/fabric finish). */
  woodFinish?: boolean
  /** Small JPEG data URL of the product photo. */
  photo?: string
  /** Uploaded 3D model, stored in IndexedDB. */
  model?: { key: string; fileName: string; format: 'glb' | 'gltf' | 'obj' | 'fbx' | 'dae'; upAxis: 'y' | 'z'; rotation: number }
  createdAt: number
}
