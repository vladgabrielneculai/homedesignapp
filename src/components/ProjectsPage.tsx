import { useRef, useState } from 'react'
import { TEMPLATES } from '../catalog/templates'
import { exportProjectJson, readProjectFile } from '../lib/export'
import { useStore } from '../state/store'
import { TemplatePreview } from './TemplatePreview'

export function ProjectsPage() {
  const projects = useStore((s) => s.projects)
  const { createProject, openProject, deleteProject, duplicateProject, renameProject, importProject } = useStore.getState()
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('modern')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="projects-page">
      <header className="projects-header">
        <div className="brand">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" width={32} height={32} />
          <div>
            <h1>Home Designer</h1>
            <p>Plan rooms in 2D, see them in 3D, and try out styles before you build.</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import project…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setError(null)
                const { project, products } = await readProjectFile(f)
                useStore.getState().importProducts(products)
                const id = importProject(project)
                openProject(id)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not import that file.')
              }
            }}
          />
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="new-project">
        <h2>Start a new design</h2>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={'template-card' + (templateId === t.id ? ' selected' : '')} onClick={() => setTemplateId(t.id)}>
              <TemplatePreview templateId={t.id} />
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
        <form
          className="create-row"
          onSubmit={(e) => {
            e.preventDefault()
            createProject(name, templateId)
            setName('')
          }}
        >
          <input className="input" placeholder={`Project name (e.g. "Our new flat")`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <button className="btn primary" type="submit">
            Create project
          </button>
        </form>
      </section>

      <section className="project-list">
        <h2>Your projects {projects.length > 0 && <span className="count">{projects.length}</span>}</h2>
        {!projects.length && <p className="muted">No projects yet. Choose a template above to get started. Projects are saved in this browser.</p>}
        <div className="project-grid">
          {sorted.map((p) => (
            <article key={p.id} className="project-card">
              <button className="thumb" onClick={() => openProject(p.id)} aria-label={`Open ${p.name}`}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className="thumb-empty">No preview yet</div>}
              </button>
              <div className="project-meta">
                <input
                  className="title-input"
                  value={p.name}
                  onChange={(e) => renameProject(p.id, e.target.value)}
                  aria-label="Project name"
                />
                <span className="muted small">
                  {p.variants.length} {p.variants.length === 1 ? 'variant' : 'variants'} · edited {new Date(p.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="card-actions">
                <button className="btn small primary" onClick={() => openProject(p.id)}>
                  Open
                </button>
                <button className="btn small" onClick={() => duplicateProject(p.id)}>
                  Duplicate
                </button>
                <button className="btn small" onClick={() => exportProjectJson(p, useStore.getState().products)}>
                  Export
                </button>
                <button
                  className="btn small danger"
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This cannot be undone.`)) deleteProject(p.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer className="credits">
        Realistic 3D models from the{' '}
        <a href="https://github.com/KhronosGroup/glTF-Sample-Assets" target="_blank" rel="noreferrer">
          Khronos glTF Sample Assets
        </a>{' '}
        (CC0 / CC BY 4.0, © Wayfair LLC and Darmstadt Graphics Group). See CREDITS.md.
      </footer>
    </div>
  )
}
