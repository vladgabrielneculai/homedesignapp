export type Category = 'Living' | 'Dining' | 'Bedroom' | 'Kitchen' | 'Bathroom' | 'Office' | 'Decor' | 'Premium 3D'

export const CATEGORIES: Category[] = ['Living', 'Dining', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Decor', 'Premium 3D']

/** Which style color a procedural item uses as its main color. */
export type ColorRole = 'primary' | 'wood' | 'metal' | 'accent' | 'white' | 'fixed'

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
}

const KHRONOS = 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/'

export const CATALOG: CatalogEntry[] = [
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

const SURFACE_SYMBOLS: PlanSymbol[] = ['table', 'roundTable', 'cabinet', 'tv', 'sink']

/** Top height of an item that other things can stand on, or null if it is not a surface. */
export function surfaceHeight(e: CatalogEntry): number | null {
  if (e.model || !SURFACE_SYMBOLS.includes(e.symbol)) return null
  return e.surface ?? e.h
}

export function getEntry(id: string): CatalogEntry {
  return BY_ID.get(id) ?? CATALOG[0]
}
