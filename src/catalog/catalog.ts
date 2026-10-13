export type Category = 'Modern' | 'Living' | 'Dining' | 'Bedroom' | 'Kitchen' | 'Bathroom' | 'Office' | 'Decor' | 'Premium 3D' | 'My products'

export const CATEGORIES: Category[] = ['My products', 'Modern', 'Living', 'Dining', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Decor', 'Premium 3D']

/** Which style color a procedural item uses as its main color ('custom' uses the entry's own color). */
export type ColorRole = 'primary' | 'wood' | 'metal' | 'accent' | 'white' | 'fixed' | 'custom'

/** How the item is drawn in the 2D plan. */
export type PlanSymbol =
  | 'sofa'
  | 'chair'
  | 'table'
  | 'roundTable'
  | 'bed'
  | 'cabinet'
  | 'bath'
  | 'toilet'
  | 'sink'
  | 'shower'
  | 'plant'
  | 'rug'
  | 'lamp'
  | 'stove'
  | 'tv'
  | 'box'
  | 'panel'
  | 'pendant'
  | 'curtain'

export interface CatalogEntry {
  id: string
  name: string
  category: Category
  /** Footprint width (x), depth (y in plan) and height, in meters. */
  w: number
  d: number
  h: number
  colorRole: ColorRole
  symbol: PlanSymbol
  /** Present for glTF assets; procedural items are built in code. */
  model?: {
    url: string
    credit: string
    license: 'CC0 1.0' | 'CC BY 4.0'
    source: string
    /** Node names to drop from the file (e.g. duplicate demo objects). */
    hide?: string[]
  }
  /** Small items that usually sit on furniture snap onto tables and cabinets. */
  tabletop?: boolean
  /** Height of the usable top surface when it differs from h (e.g. a TV unit with a TV on it). */
  surface?: number
  /** 'wall' items snap flat against the nearest wall; 'ceiling' items hang at defaultElevation. */
  mount?: 'floor' | 'wall' | 'ceiling'
  /** Height above the floor an item gets when it is placed (shelves, mirrors, pendants). */
  defaultElevation?: number
  /** Main color for colorRole 'custom'. */
  color?: string
  /** Never draw wood grain on the main color (e.g. a lacquered shop product). */
  plain?: boolean
  /** Procedural generator to use when it differs from id (user products reuse built-in shapes). */
  builder?: string
  /** Real-world product details for items added from a shop. */
  product?: ProductInfo
  /** A user-uploaded 3D model stored in this browser (see lib/blobStore). */
  userModel?: UserModelRef
}

export interface ProductInfo {
  store: string
  url?: string
  price?: number
  currency: string
  photo?: string
}

export interface UserModelRef {
  key: string
  format: 'glb' | 'gltf' | 'obj' | 'fbx'
  upAxis: 'y' | 'z'
  /** Extra rotation (degrees) so the model's front faces the item's front. */
  rotation: number
}

const KHRONOS = 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/'

export const CATALOG: CatalogEntry[] = [
  // Modern
  { id: 'slatPanel', name: 'Wood slat wall panel', category: 'Modern', w: 0.6, d: 0.022, h: 2.4, colorRole: 'wood', symbol: 'panel', mount: 'wall' },
  { id: 'slatWall', name: 'Slat feature wall (2.4 m)', category: 'Modern', w: 2.4, d: 0.022, h: 2.6, colorRole: 'wood', symbol: 'panel', mount: 'wall' },
  { id: 'mediaWall', name: 'Floating TV media wall', category: 'Modern', w: 2.0, d: 0.38, h: 1.7, surface: 0.62, colorRole: 'wood', symbol: 'tv', mount: 'wall' },
  { id: 'cloudSofa', name: 'Modular cloud sofa', category: 'Modern', w: 2.6, d: 1.05, h: 0.74, colorRole: 'custom', color: '#e8e3da', symbol: 'sofa' },
  { id: 'boucleChair', name: 'Bouclé lounge chair', category: 'Modern', w: 0.82, d: 0.8, h: 0.74, colorRole: 'custom', color: '#efebe4', symbol: 'chair' },
  { id: 'marbleTable', name: 'Marble pedestal table', category: 'Modern', w: 1.2, d: 1.2, h: 0.75, colorRole: 'custom', color: '#ece9e4', symbol: 'roundTable' },
  { id: 'sideTable', name: 'Round side table', category: 'Modern', w: 0.45, d: 0.45, h: 0.52, colorRole: 'metal', symbol: 'roundTable' },
  { id: 'platformBed', name: 'Bed with tall headboard', category: 'Modern', w: 1.8, d: 2.15, h: 1.25, colorRole: 'primary', symbol: 'bed' },
  { id: 'slidingWardrobe', name: 'Sliding-door wardrobe', category: 'Modern', w: 2.0, d: 0.65, h: 2.3, colorRole: 'wood', symbol: 'cabinet' },
  { id: 'globePendant', name: 'Globe pendant light', category: 'Modern', w: 0.4, d: 0.4, h: 0.45, colorRole: 'metal', symbol: 'pendant', mount: 'ceiling', defaultElevation: 1.75 },
  { id: 'linearPendant', name: 'Linear pendant (over table)', category: 'Modern', w: 1.2, d: 0.08, h: 0.08, colorRole: 'metal', symbol: 'pendant', mount: 'ceiling', defaultElevation: 1.6 },
  { id: 'arcLamp', name: 'Arc floor lamp', category: 'Modern', w: 1.5, d: 0.4, h: 2.0, colorRole: 'metal', symbol: 'lamp' },
  { id: 'floatingShelf', name: 'Floating wall shelf', category: 'Modern', w: 1.0, d: 0.22, h: 0.3, colorRole: 'wood', symbol: 'panel', mount: 'wall', defaultElevation: 1.3 },
  { id: 'roundMirror', name: 'Round wall mirror', category: 'Modern', w: 0.8, d: 0.03, h: 0.8, colorRole: 'metal', symbol: 'panel', mount: 'wall', defaultElevation: 0.95 },
  { id: 'wallArt', name: 'Framed wall art', category: 'Modern', w: 0.7, d: 0.03, h: 1.0, colorRole: 'accent', symbol: 'panel', mount: 'wall', defaultElevation: 0.9 },
  { id: 'curtains', name: 'Linen curtains', category: 'Modern', w: 2.2, d: 0.14, h: 2.6, colorRole: 'custom', color: '#e7e1d6', symbol: 'curtain', mount: 'wall' },
  { id: 'monstera', name: 'Monstera plant', category: 'Modern', w: 0.9, d: 0.9, h: 1.3, colorRole: 'fixed', symbol: 'plant' },

  // Living
  { id: 'sofa3', name: '3-seat sofa', category: 'Living', w: 2.2, d: 0.92, h: 0.85, colorRole: 'primary', symbol: 'sofa' },
  { id: 'sofa2', name: 'Loveseat', category: 'Living', w: 1.6, d: 0.88, h: 0.85, colorRole: 'primary', symbol: 'sofa' },
  { id: 'sectional', name: 'Corner sectional', category: 'Living', w: 2.7, d: 1.8, h: 0.85, colorRole: 'primary', symbol: 'sofa' },
  { id: 'armchair', name: 'Armchair', category: 'Living', w: 0.85, d: 0.85, h: 0.9, colorRole: 'primary', symbol: 'chair' },
  { id: 'coffeeTable', name: 'Coffee table', category: 'Living', w: 1.2, d: 0.6, h: 0.42, colorRole: 'wood', symbol: 'table' },
  { id: 'roundCoffee', name: 'Round coffee table', category: 'Living', w: 0.8, d: 0.8, h: 0.4, colorRole: 'wood', symbol: 'roundTable' },
  { id: 'tvUnit', name: 'TV unit + TV', category: 'Living', w: 1.8, d: 0.45, h: 1.25, surface: 0.5, colorRole: 'wood', symbol: 'tv' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Living', w: 0.9, d: 0.35, h: 1.9, colorRole: 'wood', symbol: 'cabinet' },
  { id: 'sideboard', name: 'Sideboard', category: 'Living', w: 1.6, d: 0.45, h: 0.8, colorRole: 'wood', symbol: 'cabinet' },
  { id: 'fireplace', name: 'Fireplace', category: 'Living', w: 1.4, d: 0.4, h: 1.1, surface: 1.16, colorRole: 'white', symbol: 'cabinet' },

  // Dining
  { id: 'diningTable6', name: 'Dining table (6)', category: 'Dining', w: 1.8, d: 0.9, h: 0.75, colorRole: 'wood', symbol: 'table' },
  { id: 'diningTable4', name: 'Dining table (4)', category: 'Dining', w: 1.2, d: 0.8, h: 0.75, colorRole: 'wood', symbol: 'table' },
  { id: 'roundDining', name: 'Round dining table', category: 'Dining', w: 1.1, d: 1.1, h: 0.75, colorRole: 'wood', symbol: 'roundTable' },
  { id: 'diningChair', name: 'Dining chair', category: 'Dining', w: 0.46, d: 0.52, h: 0.88, colorRole: 'wood', symbol: 'chair' },
  { id: 'barStool', name: 'Bar stool', category: 'Dining', w: 0.42, d: 0.42, h: 0.75, colorRole: 'metal', symbol: 'chair' },

  // Bedroom
  { id: 'bedKing', name: 'King bed', category: 'Bedroom', w: 1.95, d: 2.15, h: 1.1, colorRole: 'primary', symbol: 'bed' },
  { id: 'bedDouble', name: 'Double bed', category: 'Bedroom', w: 1.6, d: 2.1, h: 1.05, colorRole: 'primary', symbol: 'bed' },
  { id: 'bedSingle', name: 'Single bed', category: 'Bedroom', w: 0.95, d: 2.05, h: 0.95, colorRole: 'primary', symbol: 'bed' },
  { id: 'nightstand', name: 'Nightstand', category: 'Bedroom', w: 0.5, d: 0.4, h: 0.55, colorRole: 'wood', symbol: 'cabinet' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', w: 1.5, d: 0.6, h: 2.1, colorRole: 'wood', symbol: 'cabinet' },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', w: 1.2, d: 0.5, h: 0.85, colorRole: 'wood', symbol: 'cabinet' },

  // Kitchen
  { id: 'kitchenBase', name: 'Base cabinet', category: 'Kitchen', w: 0.6, d: 0.6, h: 0.9, colorRole: 'white', symbol: 'cabinet' },
  { id: 'kitchenRun', name: 'Kitchen run (2.4 m)', category: 'Kitchen', w: 2.4, d: 0.62, h: 2.2, surface: 0.92, colorRole: 'white', symbol: 'cabinet' },
  { id: 'kitchenSink', name: 'Sink cabinet', category: 'Kitchen', w: 0.8, d: 0.6, h: 0.9, colorRole: 'white', symbol: 'sink' },
  { id: 'stove', name: 'Range cooker', category: 'Kitchen', w: 0.6, d: 0.6, h: 0.9, colorRole: 'metal', symbol: 'stove' },
  { id: 'fridge', name: 'Fridge', category: 'Kitchen', w: 0.7, d: 0.7, h: 1.85, colorRole: 'metal', symbol: 'box' },
  { id: 'island', name: 'Kitchen island', category: 'Kitchen', w: 1.8, d: 0.9, h: 0.92, colorRole: 'white', symbol: 'cabinet' },

  // Bathroom
  { id: 'bathtub', name: 'Bathtub', category: 'Bathroom', w: 1.7, d: 0.75, h: 0.58, colorRole: 'white', symbol: 'bath' },
  { id: 'shower', name: 'Shower', category: 'Bathroom', w: 0.9, d: 0.9, h: 2.0, colorRole: 'white', symbol: 'shower' },
  { id: 'toilet', name: 'Toilet', category: 'Bathroom', w: 0.4, d: 0.7, h: 0.8, colorRole: 'white', symbol: 'toilet' },
  { id: 'vanity', name: 'Vanity + basin', category: 'Bathroom', w: 0.8, d: 0.5, h: 0.85, colorRole: 'wood', symbol: 'sink' },

  // Office
  { id: 'desk', name: 'Desk', category: 'Office', w: 1.4, d: 0.7, h: 0.75, colorRole: 'wood', symbol: 'table' },
  { id: 'officeChair', name: 'Office chair', category: 'Office', w: 0.6, d: 0.6, h: 1.1, colorRole: 'metal', symbol: 'chair' },
  { id: 'filing', name: 'Drawer unit', category: 'Office', w: 0.42, d: 0.55, h: 0.6, colorRole: 'white', symbol: 'cabinet' },

  // Decor
  { id: 'rugRect', name: 'Rug', category: 'Decor', w: 2.4, d: 1.7, h: 0.015, colorRole: 'accent', symbol: 'rug' },
  { id: 'rugRound', name: 'Round rug', category: 'Decor', w: 1.6, d: 1.6, h: 0.015, colorRole: 'accent', symbol: 'rug' },
  { id: 'plantTall', name: 'Tall plant', category: 'Decor', w: 0.55, d: 0.55, h: 1.5, colorRole: 'fixed', symbol: 'plant' },
  { id: 'plantSmall', name: 'Small plant', category: 'Decor', w: 0.35, d: 0.35, h: 0.6, colorRole: 'fixed', symbol: 'plant' },
  { id: 'floorLamp', name: 'Floor lamp', category: 'Decor', w: 0.4, d: 0.4, h: 1.6, colorRole: 'metal', symbol: 'lamp' },

  // Realistic glTF assets (Khronos glTF Sample Assets).
  {
    id: 'm_glamSofa',
    name: 'Glam velvet sofa',
    category: 'Premium 3D',
    w: 2.19,
    d: 1.02,
    h: 0.79,
    colorRole: 'fixed',
    symbol: 'sofa',
    model: { url: 'models/GlamVelvetSofa.glb', credit: '© 2021 Wayfair, LLC', license: 'CC BY 4.0', source: KHRONOS + 'GlamVelvetSofa' },
  },
  {
    id: 'm_damaskChair',
    name: 'Damask accent chair',
    category: 'Premium 3D',
    w: 0.83,
    d: 0.58,
    h: 0.69,
    colorRole: 'fixed',
    symbol: 'chair',
    model: { url: 'models/ChairDamaskPurplegold.glb', credit: '© 2021 Wayfair', license: 'CC BY 4.0', source: KHRONOS + 'ChairDamaskPurplegold' },
  },
  {
    id: 'm_sheenChair',
    name: 'Velvet tufted chair',
    category: 'Premium 3D',
    w: 0.83,
    d: 0.57,
    h: 0.69,
    colorRole: 'fixed',
    symbol: 'chair',
    model: { url: 'models/SheenChair.glb', credit: '© 2020 Wayfair, LLC', license: 'CC0 1.0', source: KHRONOS + 'SheenChair' },
  },
  {
    id: 'm_lamp',
    name: 'Iridescent table lamp',
    category: 'Premium 3D',
    w: 0.3,
    d: 0.3,
    h: 0.48,
    tabletop: true,
    colorRole: 'fixed',
    symbol: 'lamp',
    model: { url: 'models/IridescenceLamp.glb', credit: '© 2022 Wayfair, LLC', license: 'CC BY 4.0', source: KHRONOS + 'IridescenceLamp' },
  },
  {
    id: 'm_plant',
    name: 'Potted plant',
    category: 'Premium 3D',
    w: 0.7,
    d: 0.66,
    h: 0.84,
    colorRole: 'fixed',
    symbol: 'plant',
    model: {
      url: 'models/DiffuseTransmissionPlant.glb',
      credit: '© 2024 Darmstadt Graphics Group GmbH',
      license: 'CC BY 4.0',
      source: KHRONOS + 'DiffuseTransmissionPlant',
    },
  },
  {
    id: 'm_vase',
    name: 'Glass vase with flowers',
    category: 'Premium 3D',
    w: 0.1,
    d: 0.14,
    h: 0.2,
    tabletop: true,
    colorRole: 'fixed',
    symbol: 'plant',
    model: {
      url: 'models/GlassVaseFlowers.glb',
      credit: 'Public domain',
      license: 'CC0 1.0',
      source: KHRONOS + 'GlassVaseFlowers',
      // The sample file shows two vases side by side; keep the one with real glass transmission.
      hide: ['Flowers1', 'GlassAlpha'],
    },
  },
]

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]))

/** Shown when an item refers to a product that no longer exists. */
const MISSING: CatalogEntry = { id: 'missing', name: 'Missing item', category: 'Decor', w: 0.5, d: 0.5, h: 0.5, colorRole: 'custom', color: '#d9534f', symbol: 'box' }

/** User products are registered at runtime (from the store) so getEntry() can resolve them anywhere. */
let userEntries = new Map<string, CatalogEntry>()

export function setUserEntries(list: CatalogEntry[]) {
  userEntries = new Map(list.map((e) => [e.id, e]))
}

export function userEntryList(): CatalogEntry[] {
  return [...userEntries.values()]
}

const SURFACE_SYMBOLS: PlanSymbol[] = ['table', 'roundTable', 'cabinet', 'tv', 'sink']

/** Top height of an item that other things can stand on, or null if it is not a surface. */
export function surfaceHeight(e: CatalogEntry): number | null {
  if (e.model || !SURFACE_SYMBOLS.includes(e.symbol)) return null
  return e.surface ?? e.h
}

export function getEntry(id: string): CatalogEntry {
  return BY_ID.get(id) ?? userEntries.get(id) ?? MISSING
}

type Sized = { catalogId: string; w?: number; d?: number; h?: number }
const sizedCache = new WeakMap<CatalogEntry, Map<string, CatalogEntry>>()

/**
 * The catalog entry for a placed item, with the item's custom size applied. Results are cached so the
 * same size always gives the same object (3D models are only re-fitted when the size really changes).
 */
export function itemEntry(it: Sized): CatalogEntry {
  const e = getEntry(it.catalogId)
  if (it.w === undefined && it.d === undefined && it.h === undefined) return e
  let byKey = sizedCache.get(e)
  if (!byKey) sizedCache.set(e, (byKey = new Map()))
  const key = `${it.w}|${it.d}|${it.h}`
  let sized = byKey.get(key)
  if (!sized) {
    const h = it.h ?? e.h
    sized = { ...e, w: it.w ?? e.w, d: it.d ?? e.d, h, surface: e.surface !== undefined ? (e.surface * h) / e.h : undefined }
    byKey.set(key, sized)
  }
  return sized
}

export const MIN_SIZE = 0.05
export const MAX_SIZE = 12

/** Built-in shapes a shop product can be drawn as, keyed by generator id. */
export const PRODUCT_SHAPES: { id: string; label: string }[] = [
  { id: 'sofa3', label: 'Sofa' },
  { id: 'cloudSofa', label: 'Sofa – rounded / modular' },
  { id: 'sectional', label: 'Corner sofa' },
  { id: 'armchair', label: 'Armchair' },
  { id: 'boucleChair', label: 'Lounge chair – rounded' },
  { id: 'diningChair', label: 'Dining chair' },
  { id: 'barStool', label: 'Stool' },
  { id: 'officeChair', label: 'Office chair' },
  { id: 'bedDouble', label: 'Bed' },
  { id: 'platformBed', label: 'Bed – tall headboard' },
  { id: 'diningTable4', label: 'Table' },
  { id: 'roundDining', label: 'Round table' },
  { id: 'coffeeTable', label: 'Coffee table' },
  { id: 'desk', label: 'Desk' },
  { id: 'sideboard', label: 'Sideboard / cabinet' },
  { id: 'dresser', label: 'Chest of drawers' },
  { id: 'nightstand', label: 'Nightstand' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'slidingWardrobe', label: 'Wardrobe – sliding doors' },
  { id: 'bookshelf', label: 'Bookcase / shelving' },
  { id: 'tvUnit', label: 'TV bench' },
  { id: 'kitchenBase', label: 'Kitchen cabinet' },
  { id: 'rugRect', label: 'Rug' },
  { id: 'rugRound', label: 'Round rug' },
  { id: 'plantTall', label: 'Plant' },
  { id: 'floorLamp', label: 'Floor lamp' },
  { id: 'globePendant', label: 'Pendant lamp' },
  { id: 'slatPanel', label: 'Wall panel' },
  { id: 'floatingShelf', label: 'Wall shelf' },
  { id: 'roundMirror', label: 'Mirror' },
  { id: 'wallArt', label: 'Wall art / frame' },
  { id: 'curtains', label: 'Curtains' },
]
