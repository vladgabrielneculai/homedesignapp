import type { CatalogEntry } from '../catalog/catalog'
import { mix } from '../lib/colors'

/** Top-down drawing of a catalog item in its local frame (centered, back edge at -d/2). */
export function PlanSymbol({ e, color, stroke = '#3b3f45' }: { e: CatalogEntry; color: string; stroke?: string }) {
  const { w, d } = e
  const x0 = -w / 2
  const y0 = -d / 2
  const fill = mix(color, '#ffffff', 0.35)
  const dark = mix(color, '#000000', 0.15)
  // The `sym` class applies `vector-effect: non-scaling-stroke` to every child (the attribute is not inherited).
  const common = { stroke, strokeWidth: 1, className: 'sym' }

  switch (e.symbol) {
    case 'sofa': {
      const back = Math.min(0.22, d * 0.25)
      const arm = Math.min(0.18, w * 0.12)
      if (e.id === 'sectional') {
        return (
          <g {...common}>
            <path d={`M${x0},${y0} H${-x0} V${y0 + 0.95} H${x0 + 0.95} V${-y0} H${x0} Z`} fill={fill} />
            <rect x={x0} y={y0} width={w} height={back} fill={dark} />
            <line x1={x0 + 0.95} y1={y0 + back} x2={x0 + 0.95} y2={y0 + 0.95} />
          </g>
        )
      }
      const seats = Math.max(1, Math.round((w - 2 * arm) / 0.7))
      const cw = (w - 2 * arm) / seats
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} rx={0.06} fill={fill} />
          <rect x={x0} y={y0} width={w} height={back} fill={dark} />
          <rect x={x0} y={y0} width={arm} height={d} fill={dark} />
          <rect x={-x0 - arm} y={y0} width={arm} height={d} fill={dark} />
          {Array.from({ length: seats - 1 }, (_, i) => (
            <line key={i} x1={x0 + arm + cw * (i + 1)} y1={y0 + back} x2={x0 + arm + cw * (i + 1)} y2={-y0 - 0.05} />
          ))}
        </g>
      )
    }
    case 'chair':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} rx={Math.min(w, d) * 0.12} fill={fill} />
          <rect x={x0} y={y0} width={w} height={Math.min(0.12, d * 0.2)} fill={dark} />
        </g>
      )
    case 'table':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} rx={0.03} fill={fill} />
          <rect x={x0 + 0.06} y={y0 + 0.06} width={w - 0.12} height={d - 0.12} fill="none" opacity={0.4} />
        </g>
      )
    case 'roundTable':
      return (
        <g {...common}>
          <ellipse rx={w / 2} ry={d / 2} fill={fill} />
          <ellipse rx={w / 2 - 0.06} ry={d / 2 - 0.06} fill="none" opacity={0.4} />
        </g>
      )
    case 'bed': {
      const pillows = w > 1.2 ? 2 : 1
      const pw = pillows === 1 ? w - 0.3 : w / 2 - 0.15
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} rx={0.04} fill="#fbfaf7" />
          <rect x={x0} y={y0} width={w} height={0.08} fill={dark} />
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={pillows === 1 ? -pw / 2 : i === 0 ? x0 + 0.1 : 0.05} y={y0 + 0.14} width={pw} height={0.36} rx={0.06} fill="#ffffff" />
          ))}
          <rect x={x0 + 0.02} y={y0 + d * 0.36} width={w - 0.04} height={d * 0.62} rx={0.03} fill={fill} />
          <line x1={x0 + 0.02} y1={y0 + d * 0.36 + 0.18} x2={-x0 - 0.02} y2={y0 + d * 0.36 + 0.18} />
        </g>
      )
    }
    case 'cabinet':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill={fill} />
          <line x1={x0} y1={-y0 - 0.04} x2={-x0} y2={-y0 - 0.04} />
          {e.id === 'kitchenRun' && <rect x={-x0 - 0.66} y={y0 + 0.06} width={0.58} height={d - 0.14} fill="none" />}
          {e.id === 'kitchenRun' && <rect x={x0 + 0.65} y={y0 + 0.11} width={0.5} height={0.38} rx={0.04} fill="#d5dade" />}
        </g>
      )
    case 'bath':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} rx={0.08} fill="#fbfbf8" />
          <rect x={x0 + 0.08} y={y0 + 0.08} width={w - 0.16} height={d - 0.16} rx={0.2} fill="#dcecf1" />
          <circle cx={-x0 - 0.22} cy={0} r={0.03} fill="#ffffff" />
        </g>
      )
    case 'toilet':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={0.18} rx={0.03} fill="#fbfbf8" />
          <ellipse cx={0} cy={y0 + 0.18 + (d - 0.18) / 2} rx={w / 2 - 0.02} ry={(d - 0.18) / 2} fill="#fbfbf8" />
          <ellipse cx={0} cy={y0 + 0.2 + (d - 0.2) / 2} rx={w / 2 - 0.08} ry={(d - 0.2) / 2 - 0.07} fill="#e7eff2" />
        </g>
      )
    case 'sink':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill={fill} />
          <ellipse cx={0} cy={0.03} rx={w / 2 - 0.12} ry={d / 2 - 0.1} fill="#e7eff2" />
          <circle cx={0} cy={y0 + 0.06} r={0.02} fill={stroke} />
        </g>
      )
    case 'shower':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill="#eef5f7" />
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} opacity={0.5} />
          <line x1={-x0} y1={y0} x2={x0} y2={-y0} opacity={0.5} />
          <circle r={0.04} fill="#ffffff" />
        </g>
      )
    case 'plant': {
      const r = Math.min(w, d) / 2
      return (
        <g {...common}>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2
            return <circle key={i} cx={Math.cos(a) * r * 0.45} cy={Math.sin(a) * r * 0.45} r={r * 0.5} fill="#7fae6b" />
          })}
          <circle r={r * 0.4} fill="#5c8f4f" />
        </g>
      )
    }
    case 'rug':
      return e.id === 'rugRound' ? (
        <g {...common}>
          <circle r={w / 2} fill={fill} opacity={0.75} />
          <circle r={w / 2 - 0.12} fill="none" strokeDasharray="4 3" />
        </g>
      ) : (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill={fill} opacity={0.75} />
          <rect x={x0 + 0.12} y={y0 + 0.12} width={w - 0.24} height={d - 0.24} fill="none" strokeDasharray="4 3" />
        </g>
      )
    case 'lamp':
      return (
        <g {...common}>
          <circle r={w / 2} fill="#fdf3dc" />
          <circle r={w / 6} fill={dark} />
        </g>
      )
    case 'stove':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill="#4b4e53" />
          {[-1, 1].map((sx) => [-1, 1].map((sy) => <circle key={`${sx}${sy}`} cx={sx * 0.14} cy={sy * 0.13} r={0.08} fill="none" stroke="#c9ccd0" />))}
        </g>
      )
    case 'tv':
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill={fill} />
          <rect x={-Math.min(1.45, w - 0.2) / 2} y={y0 + 0.12} width={Math.min(1.45, w - 0.2)} height={0.05} fill="#1d1e20" />
        </g>
      )
    default:
      return (
        <g {...common}>
          <rect x={x0} y={y0} width={w} height={d} fill={fill} />
          <line x1={x0} y1={y0} x2={-x0} y2={-y0} opacity={0.5} />
          <line x1={-x0} y1={y0} x2={x0} y2={-y0} opacity={0.5} />
        </g>
      )
  }
}
