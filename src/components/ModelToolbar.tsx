import { useStore } from '../state/store'
import { TOOL_INFO, useToolUi } from '../three/ModelTools'
import type { ModelTool } from '../types'

const ICONS: Record<ModelTool, React.ReactNode> = {
  select: <path d="M5 3l12 9-5 1 3 6-2 1-3-6-4 4z" />,
  line: <path d="M4 20L20 4M4 20h0M20 4h0" strokeLinecap="round" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="0.5" />,
  circle: <circle cx="12" cy="12" r="8" />,
  push: (
    <>
      <path d="M4 15l8-4 8 4-8 4z" />
      <path d="M12 11V3M9 6l3-3 3 3" strokeLinecap="round" />
    </>
  ),
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" strokeLinecap="round" />,
  rotate: (
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" strokeLinecap="round" />
      <path d="M19 3v5h-5" strokeLinecap="round" />
    </>
  ),
  scale: (
    <>
      <rect x="3" y="11" width="10" height="10" />
      <path d="M13 11l8-8M15 3h6v6" strokeLinecap="round" />
    </>
  ),
  tape: (
    <>
      <circle cx="9" cy="13" r="6" />
      <path d="M15 17h6v2H9" />
      <circle cx="9" cy="13" r="1.5" />
    </>
  ),
  paint: (
    <>
      <path d="M5 11l7-7 7 7-7 7z" />
      <path d="M19 14c1.5 2 1.5 3.5 0 4.5" strokeLinecap="round" />
    </>
  ),
  erase: <path d="M8 20h12M4 15l9-9 6 6-8 8H8z" strokeLinejoin="round" />,
}

const ORDER: ModelTool[] = ['select', 'line', 'rect', 'circle', 'push', 'move', 'rotate', 'scale', 'tape', 'paint', 'erase']

export const PAINTS = ['#ece8df', '#ffffff', '#d9d4cb', '#a8a29a', '#5f6368', '#2b2b2b', '#c9a27e', '#9b6b43', '#6b4a32', '#d9a441', '#c96f53', '#8f3b2e', '#7d9a7a', '#3f6b5a', '#8fb3cf', '#2f5d8a', '#b9a7c9', '#e8c4c4']

/** SketchUp-like vertical tool palette, Measurements box and status line of the 3D view. */
export function ModelToolbar() {
  const tool = useStore((s) => s.modelTool)
  const paint = useStore((s) => s.paintColor)
  const { setModelTool, setPaintColor } = useStore.getState()
  const { value, typed, hint } = useToolUi()
  const info = TOOL_INFO[tool]
  return (
    <>
      <div className="model-tools" role="toolbar" aria-label="Modeling tools">
        {ORDER.map((t) => (
          <button
            key={t}
            className={tool === t ? 'active' : ''}
            onClick={() => {
              setModelTool(t)
              useStore.getState().setModelKeys(true)
            }}
            title={`${TOOL_INFO[t].name} (${TOOL_INFO[t].key})`}
            aria-label={TOOL_INFO[t].name}
            aria-pressed={tool === t}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              {ICONS[t]}
            </svg>
          </button>
        ))}
      </div>
      {tool === 'paint' && (
        <div className="paint-palette" aria-label="Paint colors">
          {PAINTS.map((c) => (
            <button key={c} className={'swatch' + (c === paint ? ' active' : '')} style={{ background: c }} onClick={() => setPaintColor(c)} aria-label={`Paint ${c}`} />
          ))}
          <label className="swatch custom" title="Custom color">
            <input type="color" value={paint} onChange={(e) => setPaintColor(e.target.value)} />
          </label>
        </div>
      )}
      <div className="model-status">
        <span className="model-hint">
          <strong>{info.name}</strong> · {hint ?? info.hint}
        </span>
        {info.vcb && (
          <span className="vcb" title="Type a value and press Enter, like SketchUp's Measurements box">
            <em>{info.vcb}</em>
            <span className={typed ? 'typed' : ''}>{typed || value || ' '}</span>
          </span>
        )}
      </div>
    </>
  )
}
