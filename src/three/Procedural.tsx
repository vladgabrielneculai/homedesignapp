import type { ReactNode } from 'react'
import type { CatalogEntry } from '../catalog/catalog'

/**
 * Procedurally built furniture. Local frame: width along x, depth along z (back at -z, front at +z),
 * height along y starting at the floor. All sizes come from the catalog entry so the 3D model
 * always matches the 2D footprint.
 */

export interface Palette {
  main: string
  wood: string
  metal: string
  accent: string
  fabric: string
}

type V3 = [number, number, number]

const WHITE = '#f4f3ef'
const PORCELAIN = '#fbfbf8'
const DARK = '#1d1e20'
const GLASS = '#cfe3ea'
const LEAF = '#4f7d45'
const POT = '#b8735a'

function Box({ p, s, c, r = 0.7, m = 0, children }: { p: V3; s: V3; c: string; r?: number; m?: number; children?: ReactNode }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} />
      {children}
    </mesh>
  )
}

function Cyl({ p, rt, rb = rt, h, c, r = 0.6, m = 0, seg = 24 }: { p: V3; rt: number; rb?: number; h: number; c: string; r?: number; m?: number; seg?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} />
    </mesh>
  )
}

function Ball({ p, rad, c, sx = 1, sy = 1, sz = 1 }: { p: V3; rad: number; c: string; sx?: number; sy?: number; sz?: number }) {
  return (
    <mesh position={p} scale={[sx, sy, sz]} castShadow>
      <sphereGeometry args={[rad, 16, 12]} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  )
}

/** Four legs inset from the corners of a w×d footprint. */
function Legs({ w, d, h, c, t = 0.04, inset = 0.05, metal = false }: { w: number; d: number; h: number; c: string; t?: number; inset?: number; metal?: boolean }) {
  const x = w / 2 - inset - t / 2
  const z = d / 2 - inset - t / 2
  return (
    <>
      {([
        [-x, -z],
        [x, -z],
        [-x, z],
        [x, z],
      ] as const).map(([lx, lz], i) => (
        <Box key={i} p={[lx, h / 2, lz]} s={[t, h, t]} c={c} r={metal ? 0.35 : 0.6} m={metal ? 0.7 : 0} />
      ))}
    </>
  )
}

function Sofa({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const arm = 0.18
  const seatH = 0.44
  const legH = 0.1
  const cushions = Math.max(1, Math.round((w - 2 * arm) / 0.7))
  const cw = (w - 2 * arm) / cushions
  return (
    <group>
      <Box p={[0, legH + (seatH - legH) / 2 - 0.05, 0]} s={[w, seatH - legH - 0.1, d]} c={pal.main} r={0.95} />
      <Box p={[0, (h + legH) / 2, -d / 2 + 0.11]} s={[w, h - legH, 0.22]} c={pal.main} r={0.95} />
      <Box p={[-w / 2 + arm / 2, legH + 0.29, 0.02]} s={[arm, 0.58, d - 0.04]} c={pal.main} r={0.95} />
      <Box p={[w / 2 - arm / 2, legH + 0.29, 0.02]} s={[arm, 0.58, d - 0.04]} c={pal.main} r={0.95} />
      {Array.from({ length: cushions }, (_, i) => (
        <Box key={i} p={[-w / 2 + arm + cw * (i + 0.5), seatH, 0.08]} s={[cw - 0.02, 0.14, d - 0.3]} c={pal.fabric} r={1} />
      ))}
      <Box p={[-w / 2 + arm + 0.25, seatH + 0.25, -d / 2 + 0.3]} s={[0.4, 0.36, 0.12]} c={pal.accent} r={1} />
      <Box p={[w / 2 - arm - 0.25, seatH + 0.25, -d / 2 + 0.3]} s={[0.4, 0.36, 0.12]} c={pal.accent} r={1} />
      <Legs w={w} d={d} h={legH} c={pal.wood} t={0.05} />
    </group>
  )
}

function Sectional({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const depth = 0.95
  const legH = 0.1
  return (
    <group>
      {/* main run along the back */}
      <Box p={[0, 0.27, -d / 2 + depth / 2]} s={[w, 0.34, depth]} c={pal.main} r={0.95} />
      <Box p={[0, (h + legH) / 2, -d / 2 + 0.11]} s={[w, h - legH, 0.22]} c={pal.main} r={0.95} />
      {/* chaise on the left */}
      <Box p={[-w / 2 + depth / 2, 0.27, depth / 2]} s={[depth, 0.34, d - depth]} c={pal.main} r={0.95} />
      <Box p={[w / 2 - 0.09, 0.39, -d / 2 + depth / 2]} s={[0.18, 0.58, depth]} c={pal.main} r={0.95} />
      <Box p={[0, 0.5, -d / 2 + depth / 2 + 0.1]} s={[w - 0.25, 0.14, depth - 0.25]} c={pal.fabric} r={1} />
      <Box p={[-w / 2 + depth / 2 + 0.03, 0.5, depth / 2 + 0.05]} s={[depth - 0.12, 0.14, d - depth - 0.1]} c={pal.fabric} r={1} />
      <Box p={[0.3, 0.75, -d / 2 + 0.3]} s={[0.45, 0.38, 0.12]} c={pal.accent} r={1} />
      <Box p={[-0.6, 0.75, -d / 2 + 0.3]} s={[0.45, 0.38, 0.12]} c={pal.accent} r={1} />
    </group>
  )
}

function Armchair({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, 0.28, 0.02]} s={[w - 0.3, 0.2, d - 0.2]} c={pal.main} r={0.95} />
      <Box p={[0, 0.42, 0.06]} s={[w - 0.32, 0.12, d - 0.3]} c={pal.fabric} r={1} />
      <Box p={[0, (h + 0.1) / 2 + 0.05, -d / 2 + 0.1]} s={[w, h - 0.15, 0.2]} c={pal.main} r={0.95} />
      <Box p={[-w / 2 + 0.08, 0.4, 0.02]} s={[0.16, 0.5, d - 0.04]} c={pal.main} r={0.95} />
      <Box p={[w / 2 - 0.08, 0.4, 0.02]} s={[0.16, 0.5, d - 0.04]} c={pal.main} r={0.95} />
      <Legs w={w} d={d} h={0.16} c={pal.wood} t={0.04} />
    </group>
  )
}

function Table({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const top = 0.04
  return (
    <group>
      <Box p={[0, h - top / 2, 0]} s={[w, top, d]} c={pal.wood} r={0.55} />
      <Legs w={w} d={d} h={h - top} c={e.id === 'desk' ? pal.metal : pal.wood} t={0.05} metal={e.id === 'desk'} />
      {e.id === 'coffeeTable' && <Box p={[0, 0.12, 0]} s={[w - 0.14, 0.02, d - 0.14]} c={pal.wood} r={0.6} />}
      {e.id === 'desk' && (
        <>
          <Box p={[0.1, h + 0.2, -d / 2 + 0.15]} s={[0.55, 0.32, 0.02]} c={DARK} r={0.3} />
          <Box p={[0.1, h + 0.03, -d / 2 + 0.17]} s={[0.12, 0.06, 0.1]} c={pal.metal} r={0.4} />
          <Box p={[0.1, h + 0.01, 0.05]} s={[0.4, 0.015, 0.14]} c={DARK} r={0.4} />
        </>
      )}
    </group>
  )
}

function RoundTable({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, h } = e
  return (
    <group>
      <Cyl p={[0, h - 0.02, 0]} rt={w / 2} h={0.04} c={pal.wood} r={0.5} seg={40} />
      <Cyl p={[0, (h - 0.04) / 2, 0]} rt={0.05} h={h - 0.04} c={pal.wood} />
      <Cyl p={[0, 0.02, 0]} rt={w / 4} h={0.04} c={pal.wood} seg={32} />
      {e.id === 'roundDining' && <Ball p={[0, h + 0.08, 0]} rad={0.09} c={pal.accent} sy={0.9} />}
    </group>
  )
}

function DiningChair({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const seat = 0.46
  return (
    <group>
      <Box p={[0, seat, 0.02]} s={[w, 0.04, d - 0.04]} c={pal.wood} r={0.6} />
      <Box p={[0, seat + 0.035, 0.03]} s={[w - 0.06, 0.03, d - 0.12]} c={pal.fabric} r={1} />
      <Legs w={w} d={d} h={seat - 0.02} c={pal.wood} t={0.035} inset={0.03} />
      <Box p={[-w / 2 + 0.035, (seat + h) / 2, -d / 2 + 0.035]} s={[0.035, h - seat, 0.035]} c={pal.wood} />
      <Box p={[w / 2 - 0.035, (seat + h) / 2, -d / 2 + 0.035]} s={[0.035, h - seat, 0.035]} c={pal.wood} />
      <Box p={[0, h - 0.1, -d / 2 + 0.035]} s={[w, 0.16, 0.025]} c={pal.wood} />
    </group>
  )
}

function BarStool({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, h } = e
  return (
    <group>
      <Cyl p={[0, h - 0.03, 0]} rt={w / 2} h={0.05} c={pal.fabric} r={0.9} />
      <Cyl p={[0, h / 2, 0]} rt={0.025} h={h - 0.05} c={pal.metal} r={0.3} m={0.8} />
      <Cyl p={[0, 0.25, 0]} rt={w / 2 - 0.04} h={0.015} c={pal.metal} r={0.3} m={0.8} />
      <Cyl p={[0, 0.01, 0]} rt={w / 2 - 0.02} h={0.02} c={pal.metal} r={0.3} m={0.8} />
    </group>
  )
}

function OfficeChair({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15]} rotation={[0, a, 0]} castShadow>
            <boxGeometry args={[0.04, 0.03, 0.3]} />
            <meshStandardMaterial color={pal.metal} roughness={0.35} metalness={0.7} />
          </mesh>
        )
      })}
      <Cyl p={[0, 0.27, 0]} rt={0.025} h={0.4} c={pal.metal} r={0.3} m={0.8} />
      <Box p={[0, 0.5, 0.03]} s={[w - 0.1, 0.08, d - 0.12]} c={DARK} r={0.9} />
      <Box p={[0, (h + 0.55) / 2 + 0.03, -d / 2 + 0.08]} s={[w - 0.14, h - 0.6, 0.06]} c={DARK} r={0.9} />
      <Box p={[-w / 2 + 0.05, 0.66, 0.03]} s={[0.04, 0.03, 0.3]} c={pal.metal} r={0.4} m={0.5} />
      <Box p={[w / 2 - 0.05, 0.66, 0.03]} s={[0.04, 0.03, 0.3]} c={pal.metal} r={0.4} m={0.5} />
    </group>
  )
}

function Bed({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const pillows = w > 1.2 ? 2 : 1
  return (
    <group>
      <Box p={[0, 0.17, 0.02]} s={[w, 0.26, d - 0.04]} c={pal.wood} r={0.65} />
      <Box p={[0, 0.4, 0.04]} s={[w - 0.06, 0.22, d - 0.1]} c={PORCELAIN} r={0.95} />
      <Box p={[0, 0.53, 0.3]} s={[w - 0.02, 0.05, d * 0.62]} c={pal.main} r={1} />
      <Box p={[0, 0.48, d / 2 - 0.08]} s={[w - 0.02, 0.16, 0.04]} c={pal.main} r={1} />
      <Box p={[0, h / 2 + 0.05, -d / 2 + 0.04]} s={[w + 0.04, h - 0.1, 0.08]} c={pal.wood} r={0.6} />
      {Array.from({ length: pillows }, (_, i) => (
        <Box key={i} p={[pillows === 1 ? 0 : (i - 0.5) * (w / 2), 0.58, -d / 2 + 0.33]} s={[pillows === 1 ? w - 0.25 : w / 2 - 0.12, 0.13, 0.42]} c={WHITE} r={1} />
      ))}
      <Box p={[0, 0.57, 0.5]} s={[w - 0.04, 0.03, 0.4]} c={pal.accent} r={1} />
    </group>
  )
}

function Cabinet({ e, pal, color }: { e: CatalogEntry; pal: Palette; color: string }) {
  const { w, d, h } = e
  const doors = Math.max(1, Math.round(w / 0.5))
  const dw = w / doors
  const legH = e.id === 'sideboard' || e.id === 'dresser' || e.id === 'nightstand' ? 0.12 : 0
  const bodyH = h - legH
  const drawers = e.id === 'dresser' || e.id === 'nightstand' || e.id === 'filing'
  const rows = drawers ? (e.id === 'nightstand' ? 2 : 3) : 1
  return (
    <group>
      <Box p={[0, legH + bodyH / 2, 0]} s={[w, bodyH, d]} c={color} r={0.6} />
      {Array.from({ length: drawers ? rows : doors }, (_, i) => {
        if (drawers) {
          const rh = bodyH / rows
          return (
            <group key={i}>
              <Box p={[0, legH + rh * (i + 0.5), d / 2 + 0.006]} s={[w - 0.03, rh - 0.02, 0.012]} c={color} r={0.55} />
              <Box p={[0, legH + rh * (i + 0.5), d / 2 + 0.02]} s={[Math.min(0.2, w / 3), 0.015, 0.015]} c={pal.metal} r={0.3} m={0.7} />
            </group>
          )
        }
        return (
          <group key={i}>
            <Box p={[-w / 2 + dw * (i + 0.5), legH + bodyH / 2, d / 2 + 0.006]} s={[dw - 0.01, bodyH - 0.02, 0.012]} c={color} r={0.55} />
            <Box p={[-w / 2 + dw * (i + 0.5) + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), legH + bodyH * 0.55, d / 2 + 0.02]} s={[0.015, 0.14, 0.015]} c={pal.metal} r={0.3} m={0.7} />
          </group>
        )
      })}
      {legH > 0 && <Legs w={w} d={d} h={legH} c={pal.metal} t={0.025} inset={0.04} metal />}
    </group>
  )
}

function Bookshelf({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  const shelves = 5
  const bookColors = [pal.accent, pal.main, '#8c4a3b', '#355070', '#d8c9a8', '#4b6043']
  return (
    <group>
      <Box p={[-w / 2 + 0.01, h / 2, 0]} s={[0.02, h, d]} c={pal.wood} />
      <Box p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, d]} c={pal.wood} />
      <Box p={[0, h / 2, -d / 2 + 0.005]} s={[w, h, 0.01]} c={pal.wood} />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Box key={i} p={[0, 0.02 + (i * (h - 0.04)) / shelves, 0]} s={[w - 0.02, 0.025, d]} c={pal.wood} />
      ))}
      {Array.from({ length: shelves }, (_, row) =>
        Array.from({ length: 7 }, (_, i) => {
          if ((row * 7 + i) % 5 === 3) return null
          const bh = 0.2 + ((row + i * 3) % 4) * 0.025
          return (
            <Box
              key={`${row}-${i}`}
              p={[-w / 2 + 0.08 + i * 0.1, 0.035 + (row * (h - 0.04)) / shelves + bh / 2, 0.02]}
              s={[0.07, bh, d - 0.1]}
              c={bookColors[(row * 3 + i) % bookColors.length]}
              r={0.8}
            />
          )
        }),
      )}
    </group>
  )
}

function TvUnit({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d } = e
  return (
    <group>
      <Cabinet e={{ ...e, h: 0.48, id: 'sideboard' }} pal={pal} color={pal.wood} />
      <Box p={[0, 0.52, -0.05]} s={[0.35, 0.02, 0.2]} c={DARK} r={0.4} />
      <Box p={[0, 0.6, -0.05]} s={[0.05, 0.16, 0.04]} c={DARK} r={0.4} />
      <Box p={[0, 0.94, -0.05]} s={[Math.min(1.45, w - 0.2), 0.62, 0.04]} c={DARK} r={0.15} m={0.2} />
      <Box p={[0, 0.94, -0.028]} s={[Math.min(1.41, w - 0.24), 0.58, 0.002]} c="#0a0c10" r={0.05} m={0.4} />
      <Ball p={[w / 2 - 0.15, 0.58, d / 2 - 0.15]} rad={0.07} c={pal.accent} sy={1.3} />
    </group>
  )
}

function Fireplace({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c={WHITE} r={0.8} />
      <Box p={[0, h + 0.03, 0.02]} s={[w + 0.1, 0.06, d + 0.06]} c={pal.wood} r={0.5} />
      <Box p={[0, 0.38, d / 2 - 0.08]} s={[w * 0.55, 0.56, 0.18]} c={DARK} r={0.9} />
      <Ball p={[0, 0.2, d / 2 - 0.1]} rad={0.09} c="#ff8a3d" sy={1.6} />
      <pointLight position={[0, 0.35, d / 2 + 0.1]} intensity={0.6} distance={2.5} color="#ff9a52" />
    </group>
  )
}

function KitchenRun({ e, pal, color }: { e: CatalogEntry; pal: Palette; color: string }) {
  const { w, d } = e
  const units = Math.round(w / 0.6)
  return (
    <group>
      <Cabinet e={{ ...e, h: 0.88, id: 'kitchenBase' }} pal={pal} color={color} />
      <Box p={[0, 0.9, 0.01]} s={[w, 0.04, d + 0.02]} c={pal.wood} r={0.4} />
      {/* sink + hob */}
      <Box p={[-w / 2 + 0.9, 0.915, 0.02]} s={[0.5, 0.01, 0.38]} c="#b8bcc0" r={0.2} m={0.8} />
      <Cyl p={[-w / 2 + 0.9, 1.0, -d / 2 + 0.08]} rt={0.012} h={0.2} c={pal.metal} r={0.2} m={0.9} />
      <Box p={[w / 2 - 0.6, 0.922, 0.02]} s={[0.58, 0.008, 0.5]} c={DARK} r={0.1} m={0.3} />
      {/* backsplash + wall cabinets */}
      <Box p={[0, 1.2, -d / 2 + 0.01]} s={[w, 0.56, 0.02]} c={WHITE} r={0.3} />
      <Box p={[0, 1.83, -d / 2 + 0.18]} s={[w, 0.7, 0.35]} c={color} r={0.6} />
      {Array.from({ length: units }, (_, i) => (
        <Box key={i} p={[-w / 2 + (w / units) * (i + 0.5), 1.83, -d / 2 + 0.36]} s={[w / units - 0.01, 0.68, 0.012]} c={color} r={0.55} />
      ))}
    </group>
  )
}

function Stove({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c={pal.metal} r={0.35} m={0.6} />
      <Box p={[0, h + 0.005, 0]} s={[w - 0.02, 0.01, d - 0.02]} c={DARK} r={0.1} m={0.3} />
      <Box p={[0, h * 0.45, d / 2 + 0.005]} s={[w - 0.1, h * 0.5, 0.01]} c="#15171a" r={0.1} m={0.3} />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Cyl key={`${sx}${sz}`} p={[sx * 0.14, h + 0.012, sz * 0.13]} rt={0.08} h={0.006} c="#3a3c40" r={0.3} />
        )),
      )}
    </group>
  )
}

function Fridge({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c="#d9dcdf" r={0.25} m={0.5} />
      <Box p={[0, h * 0.68, d / 2 + 0.003]} s={[w - 0.02, 0.01, 0.006]} c={DARK} r={0.4} />
      <Box p={[-w / 2 + 0.07, h * 0.82, d / 2 + 0.03]} s={[0.02, 0.4, 0.03]} c={pal.metal} r={0.2} m={0.9} />
      <Box p={[-w / 2 + 0.07, h * 0.45, d / 2 + 0.03]} s={[0.02, 0.5, 0.03]} c={pal.metal} r={0.2} m={0.9} />
    </group>
  )
}

function Island({ e, pal, color }: { e: CatalogEntry; pal: Palette; color: string }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, (h - 0.04) / 2, -0.12]} s={[w - 0.1, h - 0.04, d - 0.3]} c={color} r={0.6} />
      <Box p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={pal.wood} r={0.35} />
    </group>
  )
}

function Bathtub({ e }: { e: CatalogEntry }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, h / 2, 0]} s={[w, h, d]} c={PORCELAIN} r={0.2} />
      <mesh position={[0, h - 0.06, 0]} scale={[(w - 0.16) / 2, 0.12, (d - 0.14) / 2]}>
        <cylinderGeometry args={[1, 0.9, 1, 32]} />
        <meshStandardMaterial color="#cfe6ee" roughness={0.05} />
      </mesh>
      <Cyl p={[w / 2 - 0.1, h + 0.08, 0]} rt={0.015} h={0.16} c="#c0c4c8" r={0.15} m={0.9} />
    </group>
  )
}

function Shower({ e }: { e: CatalogEntry }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, 0.03, 0]} s={[w, 0.06, d]} c={PORCELAIN} r={0.2} />
      <mesh position={[0, h / 2, d / 2 - 0.01]}>
        <boxGeometry args={[w, h - 0.1, 0.01]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.25} roughness={0.05} />
      </mesh>
      <mesh position={[w / 2 - 0.01, h / 2, 0]}>
        <boxGeometry args={[0.01, h - 0.1, d]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.25} roughness={0.05} />
      </mesh>
      <Cyl p={[0, h - 0.15, -d / 2 + 0.25]} rt={0.11} h={0.02} c="#c0c4c8" r={0.15} m={0.9} />
      <Box p={[0, h - 0.1, -d / 2 + 0.12]} s={[0.02, 0.02, 0.24]} c="#c0c4c8" r={0.15} m={0.9} />
    </group>
  )
}

function Toilet({ e }: { e: CatalogEntry }) {
  const { w, d, h } = e
  return (
    <group>
      <Box p={[0, h - 0.18, -d / 2 + 0.09]} s={[w, 0.36, 0.18]} c={PORCELAIN} r={0.2} />
      <mesh position={[0, 0.2, 0.06]} scale={[w / 2 - 0.02, 0.2, (d - 0.2) / 2]} castShadow>
        <cylinderGeometry args={[1, 0.75, 2, 24]} />
        <meshStandardMaterial color={PORCELAIN} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.41, 0.06]} scale={[w / 2 - 0.01, 0.02, (d - 0.18) / 2]}>
        <cylinderGeometry args={[1, 1, 1, 24]} />
        <meshStandardMaterial color={WHITE} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Vanity({ e, pal, color }: { e: CatalogEntry; pal: Palette; color: string }) {
  const { w, d, h } = e
  const kitchen = e.id === 'kitchenSink'
  return (
    <group>
      <Cabinet e={{ ...e, h: h - 0.04, id: 'kitchenBase' }} pal={pal} color={color} />
      <Box p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={kitchen ? pal.wood : WHITE} r={0.3} />
      <mesh position={[0, h + (kitchen ? -0.005 : 0.06), 0.03]} scale={[w / 2 - 0.12, kitchen ? 0.01 : 0.06, d / 2 - 0.1]}>
        <cylinderGeometry args={[1, kitchen ? 1 : 0.8, 2, 24]} />
        <meshStandardMaterial color={kitchen ? '#b8bcc0' : PORCELAIN} roughness={0.15} metalness={kitchen ? 0.8 : 0} />
      </mesh>
      <Cyl p={[0, h + 0.12, -d / 2 + 0.06]} rt={0.012} h={0.24} c="#c0c4c8" r={0.15} m={0.9} />
      {!kitchen && <Box p={[0, h + 0.65, -d / 2 + 0.01]} s={[w - 0.1, 0.7, 0.02]} c="#dfe9ee" r={0.02} m={0.9} />}
    </group>
  )
}

function Rug({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, d } = e
  if (e.id === 'rugRound')
    return (
      <group>
        <Cyl p={[0, 0.006, 0]} rt={w / 2} h={0.012} c={pal.accent} r={1} seg={48} />
        <Cyl p={[0, 0.009, 0]} rt={w / 2 - 0.12} h={0.012} c={pal.fabric} r={1} seg={48} />
      </group>
    )
  return (
    <group>
      <Box p={[0, 0.006, 0]} s={[w, 0.012, d]} c={pal.accent} r={1} />
      <Box p={[0, 0.009, 0]} s={[w - 0.2, 0.012, d - 0.2]} c={pal.fabric} r={1} />
      <Box p={[0, 0.012, 0]} s={[w - 0.5, 0.012, d - 0.5]} c={pal.accent} r={1} />
    </group>
  )
}

function Plant({ e }: { e: CatalogEntry }) {
  const { w, h } = e
  const potH = h * 0.28
  const leaves = e.id === 'plantTall' ? 9 : 6
  return (
    <group>
      <Cyl p={[0, potH / 2, 0]} rt={w * 0.36} rb={w * 0.28} h={potH} c={POT} r={0.9} />
      <Cyl p={[0, potH * 0.55 + (h - potH) * 0.3, 0]} rt={0.012} h={(h - potH) * 0.6} c="#6b5236" />
      {Array.from({ length: leaves }, (_, i) => {
        const a = (i / leaves) * Math.PI * 2
        const y = potH + (h - potH) * (0.35 + 0.6 * ((i * 7) % leaves) / leaves)
        const r = w * 0.28
        return <Ball key={i} p={[Math.cos(a) * r, y, Math.sin(a) * r]} rad={w * 0.22} c={LEAF} sy={0.55} sx={1.2} />
      })}
      <Ball p={[0, h - w * 0.15, 0]} rad={w * 0.24} c="#5c8f4f" sy={0.8} />
    </group>
  )
}

function FloorLamp({ e, pal }: { e: CatalogEntry; pal: Palette }) {
  const { w, h } = e
  return (
    <group>
      <Cyl p={[0, 0.015, 0]} rt={w * 0.4} h={0.03} c={pal.metal} r={0.3} m={0.7} />
      <Cyl p={[0, h / 2, 0]} rt={0.012} h={h - 0.2} c={pal.metal} r={0.3} m={0.7} />
      <mesh position={[0, h - 0.13, 0]} castShadow>
        <cylinderGeometry args={[0.13, w / 2, 0.28, 32, 1, true]} />
        <meshStandardMaterial color="#f5ead6" emissive="#ffdca0" emissiveIntensity={0.35} side={2} roughness={0.9} />
      </mesh>
      <pointLight position={[0, h - 0.2, 0]} intensity={0.8} distance={4} color="#ffd9a0" />
    </group>
  )
}

export function ProceduralItem({ e, pal, mainColor }: { e: CatalogEntry; pal: Palette; mainColor: string }) {
  const p = { ...pal, main: mainColor }
  switch (e.id) {
    case 'sofa3':
    case 'sofa2':
      return <Sofa e={e} pal={p} />
    case 'sectional':
      return <Sectional e={e} pal={p} />
    case 'armchair':
      return <Armchair e={e} pal={p} />
    case 'coffeeTable':
    case 'diningTable6':
    case 'diningTable4':
    case 'desk':
      return <Table e={e} pal={{ ...p, wood: mainColor }} />
    case 'roundCoffee':
    case 'roundDining':
      return <RoundTable e={e} pal={{ ...p, wood: mainColor }} />
    case 'diningChair':
      return <DiningChair e={e} pal={{ ...p, wood: mainColor }} />
    case 'barStool':
      return <BarStool e={e} pal={{ ...p, metal: mainColor }} />
    case 'officeChair':
      return <OfficeChair e={e} pal={{ ...p, metal: mainColor }} />
    case 'bedKing':
    case 'bedDouble':
    case 'bedSingle':
      return <Bed e={e} pal={p} />
    case 'bookshelf':
      return <Bookshelf e={e} pal={{ ...p, wood: mainColor }} />
    case 'tvUnit':
      return <TvUnit e={e} pal={{ ...p, wood: mainColor }} />
    case 'fireplace':
      return <Fireplace e={e} pal={p} />
    case 'kitchenRun':
      return <KitchenRun e={e} pal={p} color={mainColor} />
    case 'kitchenSink':
    case 'vanity':
      return <Vanity e={e} pal={p} color={mainColor} />
    case 'stove':
      return <Stove e={e} pal={{ ...p, metal: mainColor }} />
    case 'fridge':
      return <Fridge e={e} pal={p} />
    case 'island':
      return <Island e={e} pal={p} color={mainColor} />
    case 'bathtub':
      return <Bathtub e={e} />
    case 'shower':
      return <Shower e={e} />
    case 'toilet':
      return <Toilet e={e} />
    case 'rugRect':
    case 'rugRound':
      return <Rug e={e} pal={{ ...p, accent: mainColor }} />
    case 'plantTall':
    case 'plantSmall':
      return <Plant e={e} />
    case 'floorLamp':
      return <FloorLamp e={e} pal={{ ...p, metal: mainColor }} />
    default:
      return <Cabinet e={e} pal={p} color={mainColor} />
  }
}
