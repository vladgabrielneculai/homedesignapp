import { useMemo } from 'react'
import { itemEntry } from '../catalog/catalog'
import { TEMPLATES } from '../catalog/templates'
import { getFloor } from '../catalog/styles'
import { itemColor } from '../lib/colors'
import { bounds, wallAngle, wallLength } from '../lib/geometry'
import type { Design } from '../types'
import { PlanSymbol } from './PlanSymbol'

/** Static, non-interactive miniature of a design's floor plan. */
export function MiniPlan({ design }: { design: Design }) {
  const pts = design.walls.flatMap((w) => [w.a, w.b])
  if (!pts.length) {
    return (
      <svg viewBox="0 0 160 100" className="mini-plan">
        <rect width="160" height="100" fill="#f7f8f9" />
        <text x="80" y="54" textAnchor="middle" fontSize="11" fill="#8a929a">
          Empty canvas
        </text>
      </svg>
    )
  }
  const b = bounds(pts)
  const pad = 0.6
  const vb = `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}`
  return (
    <svg viewBox={vb} className="mini-plan" preserveAspectRatio="xMidYMid meet">
      <rect x={b.minX - pad} y={b.minY - pad} width={b.maxX - b.minX + pad * 2} height={b.maxY - b.minY + pad * 2} fill="#f7f8f9" />
      {design.rooms.map((r) => (
        <polygon key={r.id} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')} fill={getFloor(r.floor ?? design.style.floor).base} opacity={0.45} />
      ))}
      {design.items.map((it) => {
        const e = itemEntry(it)
        return (
          <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}>
            <PlanSymbol e={e} color={itemColor(it, e, design.style)} stroke="#6b7177" />
          </g>
        )
      })}
      {design.walls.map((w) => (
        <rect
          key={w.id}
          transform={`translate(${w.a.x} ${w.a.y}) rotate(${(wallAngle(w) * 180) / Math.PI})`}
          x={-w.thickness / 2}
          y={-w.thickness / 2}
          width={wallLength(w) + w.thickness}
          height={w.thickness}
          fill="#383c42"
        />
      ))}
    </svg>
  )
}

export function TemplatePreview({ templateId }: { templateId: string }) {
  const design = useMemo(() => TEMPLATES.find((t) => t.id === templateId)!.create(), [templateId])
  return <MiniPlan design={design} />
}
