import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLE_PRESETS } from '../catalog/styles'
import { download, exportProjectJson, safeName, svgToPng } from '../lib/export'
import { roomDesign } from '../lib/roomFocus'
import { activeVariant, useFocusRoom, useProject, useStore } from '../state/store'
import { capture3D, Viewer3D } from '../three/Viewer3D'
import type { ViewMode } from '../types'
import { Editor2D, planSvgs } from './Editor2D'
import { deleteSelection, duplicateSelectedItem, nudgeSelectedItem, PropertiesPanel, rotateSelectedItem } from './PropertiesPanel'
import { PhotoDialog } from './PhotoDialog'
import { ShoppingList } from './ShoppingList'
import { Sidebar } from './Sidebar'
import { MiniPlan } from './TemplatePreview'

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: '2d', label: '2D plan' },
  { id: 'split', label: 'Split' },
  { id: '3d', label: '3D' },
  { id: 'compare', label: 'Compare' },
]

function saveThumbnail() {
  const { currentProjectId, setThumbnail, focusRoomId } = useStore.getState()
  if (focusRoomId) return // the thumbnail shows the whole home
  const shot = capture3D('main', 480)
  if (currentProjectId && shot) setThumbnail(currentProjectId, shot)
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable]')) return
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && k === 'd') {
        e.preventDefault()
        duplicateSelectedItem()
        return
      }
      if (mod) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (k === 'r' && s.selection?.kind === 'item') {
        rotateSelectedItem(e.shiftKey ? -90 : 90)
        return
      }
      const step = e.shiftKey ? 0.25 : 0.05
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }
      if (arrows[k] && s.selection?.kind === 'item') {
        e.preventDefault()
        nudgeSelectedItem(...arrows[k])
        return
      }
      const tools: Record<string, Parameters<typeof s.setTool>[0]> = { v: 'select', w: 'wall', m: 'room', d: 'door', n: 'window' }
      if (tools[k]) s.setTool(tools[k])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function EditorPage() {
  const project = useProject()
  const viewMode = useStore((s) => s.viewMode)
  const selection = useStore((s) => s.selection)
  const canUndo = useStore((s) => s.history.past.length > 0)
  const canRedo = useStore((s) => s.history.future.length > 0)
  const focus = useFocusRoom()
  const { openProject, renameProject, setViewMode, undo, redo, select, focusRoom } = useStore.getState()
  const [menuOpen, setMenuOpen] = useState(false)
  const [shopping, setShopping] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  useShortcuts()

  // Refresh the project thumbnail a few seconds after edits settle.
  const updatedAt = project?.updatedAt
  useEffect(() => {
    if (viewMode === '2d' || viewMode === 'compare') return
    const t = setTimeout(saveThumbnail, 2500)
    return () => clearTimeout(t)
  }, [updatedAt, viewMode])

  const variant = project && activeVariant(project)
  const design = variant?.design
  // In room focus the 3D view and shopping list only see that room.
  const shown = useMemo(() => (design && focus ? roomDesign(design, focus) : design), [design, focus])

  if (!project || !variant || !shown) return null
  const frameKey = `${project.id}:${variant.id}:${focus?.id ?? ''}`
  const viewName = focus ? `${variant.name}-${focus.name}` : variant.name

  const exportPlan = async () => {
    const svg = planSvgs.get('main')
    if (!svg) return alert('Switch to the 2D plan or split view to export the floor plan.')
    download(`${safeName(project.name)}-${safeName(viewName)}-plan.png`, await svgToPng(svg))
  }
  const export3D = () => {
    const shot = capture3D('main')
    if (!shot) return alert('Switch to the 3D or split view to export a 3D image.')
    download(`${safeName(project.name)}-${safeName(viewName)}-3d.png`, shot)
  }

  return (
    <div className="editor-page">
      <header className="topbar">
        <button
          className="btn ghost"
          onClick={() => {
            saveThumbnail()
            openProject(null)
          }}
          title="Back to all projects"
        >
          ← Projects
        </button>
        <input className="project-title" value={project.name} onChange={(e) => renameProject(project.id, e.target.value)} aria-label="Project name" />
        <div className="topbar-group">
          <button className="btn icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button className="btn icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
        {variant.design.rooms.length > 0 && (
          <label className={'room-picker' + (focus ? ' active' : '')} title="Show and edit one room at a time">
            <span>Room</span>
            <select className="input small" value={focus?.id ?? ''} onChange={(e) => focusRoom(e.target.value || null)}>
              <option value="">Whole home</option>
              {variant.design.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || 'Unnamed room'}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="segmented view-modes" role="tablist" aria-label="View">
          {VIEW_MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={viewMode === m.id} className={viewMode === m.id ? 'active' : ''} onClick={() => setViewMode(m.id)} disabled={m.id === 'compare' && project.variants.length < 2} title={m.id === 'compare' && project.variants.length < 2 ? 'Create a second variant to compare' : undefined}>
              {m.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setShopping(true)} title="Products, quantities and prices in this design">
          Shopping list
        </button>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            Export ▾
          </button>
          {menuOpen && (
            <div className="menu" onClick={() => setMenuOpen(false)}>
              <button onClick={() => setPhoto('main')} disabled={viewMode === '2d' || viewMode === 'compare'}>
                Photo-realistic image…
              </button>
              <button onClick={export3D} disabled={viewMode === '2d' || viewMode === 'compare'}>
                3D view as PNG
              </button>
              <button onClick={exportPlan} disabled={viewMode === '3d' || viewMode === 'compare'}>
                Floor plan as PNG
              </button>
              <button onClick={() => exportProjectJson(project, useStore.getState())}>Project file (.json)</button>
            </div>
          )}
        </div>
      </header>

      <div className={'workspace' + (viewMode === 'compare' ? ' compare-mode' : '')}>
        {viewMode !== 'compare' && <Sidebar />}
        <div className="stage-col">
          {focus && viewMode !== 'compare' && (
            <div className="focus-banner" role="status">
              <span>
                Editing <strong>{focus.name || 'this room'}</strong> on its own. The rest of the home is hidden.
              </span>
              <span className="spacer" />
              <button className="btn small" onClick={() => focusRoom(null)}>
                Show whole home
              </button>
            </div>
          )}
          <main className={`stage stage-${viewMode}`}>
            {viewMode === 'compare' ? (
              <CompareView />
            ) : (
              <>
                {viewMode !== '3d' && (
                  <section className="pane pane-2d">
                    <Editor2D />
                  </section>
                )}
                {viewMode !== '2d' && (
                  <section className="pane pane-3d">
                    <Viewer3D
                      id="main"
                      design={shown}
                      singleRoom={!!focus}
                      onPhoto={setPhoto}
                      frameKey={frameKey}
                      selectedItemId={selection?.kind === 'item' ? selection.id : null}
                      onSelectItem={(id) => select(id ? { kind: 'item', id } : null)}
                    />
                  </section>
                )}
              </>
            )}
          </main>
        </div>
        {viewMode !== 'compare' && <PropertiesPanel />}
      </div>
      <VariantsBar />
      {photo && <PhotoDialog viewId={photo} name={`${project.name}-${viewName}`} onClose={() => setPhoto(null)} />}
      {shopping && <ShoppingList design={shown} title={`${project.name} – ${variant.name}${focus ? ` – ${focus.name}` : ''}`} onClose={() => setShopping(false)} />}
    </div>
  )
}

function VariantsBar() {
  const project = useProject()
  const viewMode = useStore((s) => s.viewMode)
  const { addVariant, switchVariant, renameVariant, deleteVariant } = useStore.getState()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!adding) return
    const close = (e: PointerEvent) => !addRef.current?.contains(e.target as Node) && setAdding(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [adding])

  if (!project) return null
  const nextName = `Option ${String.fromCharCode(65 + (project.variants.length % 26))}`

  return (
    <footer className="variants-bar">
      <span className="variants-label">Variants</span>
      <div className="variant-tabs">
        {project.variants.map((v) => (
          <div key={v.id} className={'variant-tab' + (v.id === project.activeVariantId ? ' active' : '')}>
            {editing === v.id ? (
              <input
                autoFocus
                className="input small"
                defaultValue={v.name}
                onBlur={(e) => {
                  renameVariant(v.id, e.target.value.trim() || v.name)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button onClick={() => switchVariant(v.id)} onDoubleClick={() => setEditing(v.id)} title="Click to open · double-click to rename">
                <span className="variant-mini">
                  <MiniPlan design={v.design} />
                </span>
                {v.name}
              </button>
            )}
            {v.id === project.activeVariantId && project.variants.length > 1 && viewMode !== 'compare' && (
              <button
                className="variant-x"
                title="Delete this variant"
                onClick={() => {
                  if (confirm(`Delete variant "${v.name}"?`)) deleteVariant(v.id)
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="menu-wrap up" ref={addRef}>
        <button className="btn small" onClick={() => setAdding((v) => !v)}>
          + New variant
        </button>
        {adding && (
          <div className="menu">
            <button
              onClick={() => {
                addVariant(nextName, true)
                setAdding(false)
              }}
            >
              Duplicate current variant
              <span className="muted small">Try a new style or layout without losing this one</span>
            </button>
            <button
              onClick={() => {
                addVariant(nextName, false)
                setAdding(false)
              }}
            >
              Empty variant
              <span className="muted small">Start a different floor plan from scratch</span>
            </button>
          </div>
        )}
      </div>
    </footer>
  )
}

function CompareView() {
  const project = useProject()
  const compare = useStore((s) => s.compare)
  const { setCompare } = useStore.getState()
  if (!project || project.variants.length < 2) return null
  const ids = project.variants.map((v) => v.id)
  const [left, right] =
    compare && ids.includes(compare[0]) && ids.includes(compare[1])
      ? compare
      : [project.activeVariantId, ids.find((id) => id !== project.activeVariantId)!]
  const pick = (side: 0 | 1, id: string) => setCompare(side === 0 ? [id, right] : [left, id])

  return (
    <div className="compare">
      {([left, right] as const).map((vid, side) => {
        const v = project.variants.find((x) => x.id === vid)!
        return (
          <div key={side} className="compare-pane">
            <div className="compare-head">
              <select className="input small" value={vid} onChange={(e) => pick(side as 0 | 1, e.target.value)}>
                {project.variants.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <span className="muted small">
                {v.design.items.length} items · {STYLE_PRESETS.find((p) => p.presetId === v.design.style.presetId)?.name ?? 'Custom style'}
              </span>
            </div>
            <div className="compare-3d">
              <Viewer3D id={`compare-${side}`} design={v.design} frameKey={`${project.id}:${vid}:${side}`} compact />
            </div>
            <div className="compare-plan">
              <MiniPlan design={v.design} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
