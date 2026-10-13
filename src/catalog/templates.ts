import { DEFAULT_STYLE, STYLE_PRESETS, stripPreset } from './styles'
import { uid } from '../lib/geometry'
import type { Design, FloorId, Item, Opening, OpeningType, Pt, Room, Wall } from '../types'

export const WALL_THICKNESS = 0.12
export const EXTERIOR_THICKNESS = 0.2
export const WALL_HEIGHT = 2.7

/** Small builder so templates can be written as readable lists of walls, openings and furniture. */
class Plan {
  walls: Wall[] = []
  openings: Opening[] = []
  rooms: Room[] = []
  items: Item[] = []

  wall(a: [number, number], b: [number, number], exterior = false) {
    const w: Wall = {
      id: uid(),
      a: { x: a[0], y: a[1] },
      b: { x: b[0], y: b[1] },
      thickness: exterior ? EXTERIOR_THICKNESS : WALL_THICKNESS,
      height: WALL_HEIGHT,
    }
    this.walls.push(w)
    return w
  }

  /** Closed loop of exterior walls; returns them in order. */
  outline(pts: [number, number][]) {
    return pts.map((p, i) => this.wall(p, pts[(i + 1) % pts.length], true))
  }

  open(wall: Wall, type: OpeningType, offset: number, width?: number, extra?: Partial<Opening>) {
    this.openings.push(makeOpening(wall.id, type, offset, width, extra))
  }

  room(name: string, pts: [number, number][], floor?: FloorId) {
    this.rooms.push({ id: uid(), name, points: pts.map(([x, y]) => ({ x, y })), floor })
  }

  item(catalogId: string, x: number, y: number, rotation = 0, elevation?: number) {
    this.items.push({ id: uid(), catalogId, x, y, rotation, elevation })
  }

  build(style = DEFAULT_STYLE): Design {
    return { walls: this.walls, openings: this.openings, rooms: this.rooms, items: this.items, style: { ...style } }
  }
}

export function makeOpening(wallId: string, type: OpeningType, offset: number, width?: number, extra?: Partial<Opening>): Opening {
  const door = type === 'door'
  return {
    id: uid(),
    wallId,
    type,
    offset,
    width: width ?? (door ? 0.9 : 1.2),
    height: door ? 2.1 : 1.3,
    sill: door ? 0 : 0.9,
    ...extra,
  }
}

export function makeRectRoom(a: Pt, b: Pt, name = 'Room'): { walls: Wall[]; room: Room } {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const p = new Plan()
  p.outline([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ])
  for (const w of p.walls) w.thickness = WALL_THICKNESS
  p.room(name, [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ])
  return { walls: p.walls, room: p.rooms[0] }
}

function blank(): Design {
  return new Plan().build()
}

function emptyRoom(): Design {
  const p = new Plan()
  const [top, right, bottom] = p.outline([
    [0, 0],
    [5, 0],
    [5, 4],
    [0, 4],
  ])
  p.open(top, 'window', 2.5, 1.6)
  p.open(right, 'window', 2, 1.2)
  p.open(bottom, 'door', 4)
  p.room('Room', [
    [0, 0],
    [5, 0],
    [5, 4],
    [0, 4],
  ])
  return p.build()
}

function studio(): Design {
  const p = new Plan()
  const [top, right, bottom, left] = p.outline([
    [0, 0],
    [7, 0],
    [7, 5.5],
    [0, 5.5],
  ])
  p.open(top, 'window', 1.8, 1.6)
  p.open(top, 'window', 4.2, 1.2)
  p.open(left, 'window', 3.0, 1.2)
  p.open(left, 'door', 1.0)
  void bottom
  p.open(right, 'window', 4.4, 0.6, { sill: 1.4, height: 0.6 })
  const bathW = p.wall([4.6, 3.2], [7, 3.2])
  const bathV = p.wall([4.6, 3.2], [4.6, 5.5])
  void bathW
  p.open(bathV, 'door', 0.8, 0.8)
  p.room('Studio', [
    [0, 0],
    [7, 0],
    [7, 3.2],
    [4.6, 3.2],
    [4.6, 5.5],
    [0, 5.5],
  ])
  p.room(
    'Bathroom',
    [
      [4.6, 3.2],
      [7, 3.2],
      [7, 5.5],
      [4.6, 5.5],
    ],
    'tile',
  )
  // Sleeping corner
  p.item('bedDouble', 6.0, 1.15, 0)
  p.item('nightstand', 4.85, 0.35, 0)
  p.item('wardrobe', 5.6, 2.86, 180)
  // Living corner
  p.item('rugRect', 2.0, 2.4, 0)
  p.item('sofa2', 2.0, 3.35, 180)
  p.item('roundCoffee', 2.0, 2.2, 0)
  p.item('armchair', 0.65, 1.0, 315)
  p.item('plantTall', 3.6, 0.45, 0)
  // Kitchenette
  p.item('kitchenRun', 2.0, 5.07, 180)
  p.item('diningTable4', 3.6, 4.0, 90)
  p.item('diningChair', 3.0, 4.0, 270)
  p.item('diningChair', 4.2, 4.0, 90)
  // Bathroom
  p.item('shower', 6.5, 5.0, 180)
  p.item('toilet', 5.5, 5.07, 180)
  p.item('vanity', 6.7, 3.75, 90)
  return p.build(stripPreset(STYLE_PRESETS[5]))
}

function apartment(): Design {
  const p = new Plan()
  const [top, right, bottom, left] = p.outline([
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ])
  p.open(top, 'window', 1.6, 1.4)
  p.open(top, 'window', 4.0, 1.4)
  p.open(top, 'window', 8.0, 1.4)
  p.open(right, 'window', 6.6, 1.2)
  p.open(bottom, 'door', 5.5, 1.0)
  p.open(bottom, 'window', 2.0, 1.4)
  p.open(left, 'window', 1.5, 0.6, { sill: 1.4, height: 0.6 })

  const spine = p.wall([6, 0], [6, 8])
  p.open(spine, 'door', 3.45, 0.85)
  p.open(spine, 'door', 5.6, 0.85)
  p.wall([6, 4], [10, 4])
  p.wall([0, 5], [3, 5])
  const bathWall = p.wall([3, 5], [3, 8])
  p.open(bathWall, 'door', 0.7, 0.8)

  p.room('Living & kitchen', [
    [0, 0],
    [6, 0],
    [6, 5],
    [0, 5],
  ])
  p.room(
    'Hall',
    [
      [3, 5],
      [6, 5],
      [6, 8],
      [3, 8],
    ],
    'tile',
  )
  p.room(
    'Bathroom',
    [
      [0, 5],
      [3, 5],
      [3, 8],
      [0, 8],
    ],
    'marble',
  )
  p.room('Main bedroom', [
    [6, 0],
    [10, 0],
    [10, 4],
    [6, 4],
  ])
  p.room('Bedroom 2', [
    [6, 4],
    [10, 4],
    [10, 8],
    [6, 8],
  ])

  // Kitchen
  p.item('kitchenRun', 0.41, 1.5, 270)
  p.item('fridge', 0.45, 3.1, 270)
  p.item('island', 1.95, 1.5, 90)
  p.item('barStool', 2.65, 1.0, 90)
  p.item('barStool', 2.65, 1.5, 90)
  p.item('barStool', 2.65, 2.0, 90)
  // Dining
  p.item('roundDining', 1.9, 3.85, 0)
  p.item('diningChair', 1.9, 3.12, 0)
  p.item('diningChair', 1.9, 4.58, 180)
  p.item('diningChair', 1.17, 3.85, 270)
  p.item('diningChair', 2.63, 3.85, 90)
  // Living
  p.item('rugRect', 4.6, 2.3, 90)
  p.item('tvUnit', 5.72, 2.3, 90)
  p.item('sofa3', 3.85, 2.3, 270)
  p.item('coffeeTable', 4.75, 2.3, 90)
  p.item('floorLamp', 3.75, 0.45, 0)
  p.item('plantTall', 5.6, 4.55, 0)
  // Main bedroom
  p.item('bedDouble', 8.85, 1.95, 90)
  p.item('nightstand', 9.7, 0.75, 90)
  p.item('nightstand', 9.7, 3.15, 90)
  p.item('wardrobe', 7.05, 0.42, 0)
  p.item('rugRect', 8.2, 1.95, 90)
  // Bedroom 2 / office
  p.item('bedSingle', 8.95, 6.9, 90)
  p.item('desk', 7.0, 4.42, 0)
  p.item('officeChair', 7.0, 5.0, 180)
  p.item('bookshelf', 9.45, 4.25, 0)
  // Bathroom
  p.item('bathtub', 0.95, 7.52, 180)
  p.item('toilet', 2.45, 7.55, 180)
  p.item('vanity', 0.36, 5.75, 270)
  // Hall
  p.item('plantSmall', 5.65, 7.6, 0)
  return p.build(stripPreset(STYLE_PRESETS[0]))
}

function house(): Design {
  const p = new Plan()
  const [top, right, bottom, left] = p.outline([
    [0, 0],
    [12, 0],
    [12, 9],
    [0, 9],
  ])
  p.open(top, 'window', 2.0, 1.8)
  p.open(top, 'window', 5.5, 1.8)
  p.open(top, 'window', 9.5, 1.4)
  p.open(right, 'window', 2.0, 1.2)
  p.open(right, 'window', 6.5, 1.4)
  p.open(bottom, 'door', 6.0, 1.1)
  p.open(bottom, 'window', 2.2, 2.4, { height: 2.2, sill: 0.1 })
  p.open(bottom, 'window', 9.5, 1.4)
  p.open(left, 'window', 4.5, 1.6)

  const v1 = p.wall([8, 0], [8, 4.5])
  p.open(v1, 'door', 3.8, 0.9)
  const h1 = p.wall([8, 4.5], [12, 4.5])
  p.open(h1, 'door', 0.7, 0.85)
  const v2 = p.wall([8, 6.5], [8, 9])
  p.open(v2, 'door', 1.0, 0.8)
  p.wall([8, 6.5], [12, 6.5])

  p.room('Open living', [
    [0, 0],
    [8, 0],
    [8, 9],
    [0, 9],
  ])
  p.room('Study', [
    [8, 0],
    [12, 0],
    [12, 4.5],
    [8, 4.5],
  ])
  p.room(
    'Utility',
    [
      [8, 4.5],
      [12, 4.5],
      [12, 6.5],
      [8, 6.5],
    ],
    'tile',
  )
  p.room(
    'Guest bath',
    [
      [8, 6.5],
      [12, 6.5],
      [12, 9],
      [8, 9],
    ],
    'tile',
  )

  // Kitchen along the top wall
  p.item('kitchenRun', 1.5, 0.41, 0)
  p.item('stove', 3.0, 0.4, 0)
  p.item('kitchenSink', 3.7, 0.4, 0)
  p.item('fridge', 4.5, 0.45, 0)
  p.item('island', 2.6, 2.0, 0)
  p.item('barStool', 2.1, 2.7, 180)
  p.item('barStool', 2.6, 2.7, 180)
  p.item('barStool', 3.1, 2.7, 180)
  // Dining
  p.item('diningTable6', 6.0, 2.2, 0)
  for (const x of [5.4, 6.6]) {
    p.item('diningChair', x, 1.5, 0)
    p.item('diningChair', x, 2.9, 180)
  }
  p.item('diningChair', 4.85, 2.2, 270)
  p.item('diningChair', 7.15, 2.2, 90)
  // Lounge
  p.item('rugRect', 3.2, 6.2, 0)
  p.item('sectional', 2.2, 6.6, 180)
  p.item('coffeeTable', 3.2, 5.6, 0)
  p.item('tvUnit', 3.2, 4.15, 0)
  p.item('fireplace', 0.32, 6.5, 270)
  p.item('m_sheenChair', 5.2, 5.8, 270)
  p.item('m_plant', 0.55, 8.35, 0)
  p.item('m_vase', 6.0, 2.2, 0, 0.75)
  p.item('floorLamp', 5.4, 7.0, 0)
  // Study
  p.item('desk', 10.0, 0.5, 0)
  p.item('m_lamp', 10.5, 0.35, 0, 0.75)
  p.item('officeChair', 10.0, 1.15, 180)
  p.item('bookshelf', 11.72, 3.0, 90)
  p.item('m_damaskChair', 8.75, 3.6, 135)
  // Utility + bath
  p.item('kitchenBase', 11.6, 5.5, 90)
  p.item('toilet', 11.55, 8.45, 90)
  p.item('vanity', 10.0, 8.65, 180)
  p.item('shower', 11.45, 7.05, 90)
  return p.build(stripPreset(STYLE_PRESETS[1]))
}

export interface Template {
  id: string
  name: string
  description: string
  create: () => Design
}

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank canvas', description: 'Start from nothing and draw your own walls.', create: blank },
  { id: 'room', name: 'Single room', description: 'A 5 × 4 m room with a door and two windows.', create: emptyRoom },
  { id: 'studio', name: 'Studio apartment', description: '38 m² open studio with a separate bathroom.', create: studio },
  { id: 'apartment', name: 'Two-bedroom apartment', description: '80 m² with open kitchen, two bedrooms and bath.', create: apartment },
  { id: 'house', name: 'Family house – ground floor', description: '108 m² open-plan living, study and guest bath.', create: house },
]
