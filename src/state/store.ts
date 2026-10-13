import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { TEMPLATES } from '../catalog/templates'
import { uid } from '../lib/geometry'
import { productCatalogId, syncProducts } from '../catalog/products'
import { deleteBlob } from '../lib/blobStore'
import { forgetWallpaper } from '../three/wallTextures'
import type { Design, ModelTool, Product, Project, Room, Selection, Tool, Variant, ViewMode, Wallpaper } from '../types'

const HISTORY_LIMIT = 80

interface History {
  past: Design[]
  future: Design[]
}

interface State {
  // Persisted
  projects: Project[]
  products: Product[]
  wallpapers: Wallpaper[]
  currentProjectId: string | null
  snap: boolean

  // Session-only UI state
  tool: Tool
  placeCatalogId: string | null
  selection: Selection
  viewMode: ViewMode
  compare: [string, string] | null
  /** When set, the plan and 3D view show only this room. */
  focusRoomId: string | null
  history: History
  /** SketchUp-style tool of the 3D view, and whether keys go to it (the 3D view was used last). */
  modelTool: ModelTool
  modelKeys: boolean
  paintColor: string

  // Projects
  createProject: (name: string, templateId: string) => string
  openProject: (id: string | null) => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => void
  importProject: (p: Project) => string
  setThumbnail: (id: string, dataUrl: string) => void

  // Shop products
  saveProduct: (p: Product) => void
  deleteProduct: (id: string) => void
  importProducts: (list: Product[]) => void

  // Uploaded wallpapers
  saveWallpaper: (w: Wallpaper) => void
  deleteWallpaper: (id: string) => void
  importWallpapers: (list: Wallpaper[]) => void

  // Variants
  addVariant: (name: string, copyCurrent: boolean) => void
  switchVariant: (variantId: string) => void
  renameVariant: (variantId: string, name: string) => void
  deleteVariant: (variantId: string) => void

  // Design editing
  updateDesign: (fn: (d: Design) => Design, opts?: { record?: boolean }) => void
  checkpoint: () => void
  undo: () => void
  redo: () => void

  // UI
  setTool: (t: Tool) => void
  startPlacing: (catalogId: string) => void
  select: (s: Selection) => void
  setViewMode: (m: ViewMode) => void
  setCompare: (pair: [string, string] | null) => void
  setSnap: (v: boolean) => void
  focusRoom: (roomId: string | null) => void
  setModelTool: (t: ModelTool) => void
  setModelKeys: (v: boolean) => void
  setPaintColor: (c: string) => void
}

const emptyHistory = (): History => ({ past: [], future: [] })

/** Storage problems (private mode, quota exceeded) must never break editing. */
export const storageStatus = { lastError: null as string | null }

const pending = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function flush() {
  for (const [k, v] of pending) {
    try {
      localStorage.setItem(k, v)
      storageStatus.lastError = null
    } catch (e) {
      storageStatus.lastError = e instanceof Error ? e.message : 'Storage unavailable'
      console.warn('Could not save designs to browser storage:', e)
    }
  }
  pending.clear()
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush)

const safeStorage: Storage = {
  get length() {
    try {
      return localStorage.length
    } catch {
      return 0
    }
  },
  key: (i) => {
    try {
      return localStorage.key(i)
    } catch {
      return null
    }
  },
  getItem: (k) => {
    if (pending.has(k)) return pending.get(k)!
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  // Writes are debounced: dragging furniture would otherwise serialise every project on every frame.
  setItem: (k, v) => {
    pending.set(k, v)
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 250)
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  },
}

export function currentProject(s: Pick<State, 'projects' | 'currentProjectId'>): Project | undefined {
  return s.projects.find((p) => p.id === s.currentProjectId)
}

export function activeVariant(p: Project | undefined): Variant | undefined {
  return p?.variants.find((v) => v.id === p.activeVariantId) ?? p?.variants[0]
}

const clone = <T>(v: T): T => structuredClone(v)

/** Apply fn to the active variant's design of the current project. */
function mapActiveDesign(s: State, fn: (d: Design) => Design): Project[] {
  return s.projects.map((p) => {
    if (p.id !== s.currentProjectId) return p
    return {
      ...p,
      updatedAt: Date.now(),
      variants: p.variants.map((v) => (v.id === p.activeVariantId ? { ...v, design: fn(v.design) } : v)),
    }
  })
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projects: [],
      products: [],
      wallpapers: [],
      currentProjectId: null,
      snap: true,

      tool: 'select',
      placeCatalogId: null,
      selection: null,
      viewMode: 'split',
      compare: null,
      focusRoomId: null,
      history: emptyHistory(),
      modelTool: 'select',
      modelKeys: false,
      paintColor: '#c9a27e',

      createProject: (name, templateId) => {
        const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
        const variant: Variant = { id: uid(), name: 'Option A', design: template.create() }
        const project: Project = {
          id: uid(),
          name: name.trim() || template.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          variants: [variant],
          activeVariantId: variant.id,
        }
        set((s) => ({ projects: [project, ...s.projects] }))
        get().openProject(project.id)
        return project.id
      },

      openProject: (id) =>
        set({
          currentProjectId: id,
          selection: null,
          tool: 'select',
          placeCatalogId: null,
          history: emptyHistory(),
          compare: null,
          focusRoomId: null,
          viewMode: get().viewMode === 'compare' ? 'split' : get().viewMode,
        }),

      renameProject: (id, name) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)) })),

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
        })),

      duplicateProject: (id) =>
        set((s) => {
          const src = s.projects.find((p) => p.id === id)
          if (!src) return {}
          const copy: Project = { ...clone(src), id: uid(), name: `${src.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }
          return { projects: [copy, ...s.projects] }
        }),

      importProject: (p) => {
        const project: Project = { ...p, id: uid(), updatedAt: Date.now() }
        set((s) => ({ projects: [project, ...s.projects] }))
        return project.id
      },

      setThumbnail: (id, dataUrl) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, thumbnail: dataUrl } : p)) })),

      saveProduct: (p) =>
        set((s) => ({
          products: s.products.some((x) => x.id === p.id) ? s.products.map((x) => (x.id === p.id ? p : x)) : [p, ...s.products],
          // Edits change how existing items render; bump updatedAt so thumbnails refresh.
          projects: s.projects.map((pr) => (pr.id === s.currentProjectId ? { ...pr, updatedAt: Date.now() } : pr)),
        })),

      deleteProduct: (id) =>
        set((s) => {
          const product = s.products.find((p) => p.id === id)
          if (product?.model) deleteBlob(product.model.key).catch(() => {})
          const cid = productCatalogId({ id })
          return {
            products: s.products.filter((p) => p.id !== id),
            // Remove placed copies everywhere so no design points at a missing product.
            projects: s.projects.map((pr) => ({
              ...pr,
              variants: pr.variants.map((v) => ({ ...v, design: { ...v.design, items: v.design.items.filter((i) => i.catalogId !== cid) } })),
            })),
            selection: null,
          }
        }),

      importProducts: (list) =>
        set((s) => {
          const known = new Set(s.products.map((p) => p.id))
          return { products: [...list.filter((p) => !known.has(p.id)), ...s.products] }
        }),

      saveWallpaper: (w) =>
        set((s) => ({ wallpapers: s.wallpapers.some((x) => x.id === w.id) ? s.wallpapers.map((x) => (x.id === w.id ? w : x)) : [w, ...s.wallpapers] })),

      deleteWallpaper: (id) =>
        set((s) => {
          const wp = s.wallpapers.find((w) => w.id === id)
          if (wp) {
            deleteBlob(wp.key).catch(() => {})
            forgetWallpaper(wp.key)
          }
          // Walls that used it go back to their default paint.
          const strip = (d: Design): Design => ({
            ...d,
            walls: d.walls.map((w) => {
              if (!w.sides) return w
              const sides = { ...w.sides }
              for (const k of ['a', 'b'] as const) if (sides[k]?.kind === 'image' && sides[k].id === id) delete sides[k]
              return { ...w, sides }
            }),
          })
          return {
            wallpapers: s.wallpapers.filter((w) => w.id !== id),
            projects: s.projects.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, design: strip(v.design) })) })),
          }
        }),

      importWallpapers: (list) =>
        set((s) => {
          const known = new Set(s.wallpapers.map((w) => w.id))
          return { wallpapers: [...list.filter((w) => !known.has(w.id)), ...s.wallpapers] }
        }),

      addVariant: (name, copyCurrent) =>
        set((s) => {
          const project = currentProject(s)
          const current = activeVariant(project)
          if (!project || !current) return {}
          const blankDesign: Design = { walls: [], openings: [], rooms: [], items: [], style: clone(current.design.style) }
          const variant: Variant = { id: uid(), name, design: copyCurrent ? clone(current.design) : blankDesign }
          return {
            projects: s.projects.map((p) =>
              p.id === project.id ? { ...p, variants: [...p.variants, variant], activeVariantId: variant.id, updatedAt: Date.now() } : p,
            ),
            selection: null,
            history: emptyHistory(),
          }
        }),

      // Variants made by duplicating share room ids, so the focused room carries over.
      switchVariant: (variantId) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === s.currentProjectId ? { ...p, activeVariantId: variantId } : p)),
          selection: null,
          history: emptyHistory(),
        })),

      renameVariant: (variantId, name) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === s.currentProjectId ? { ...p, variants: p.variants.map((v) => (v.id === variantId ? { ...v, name } : v)) } : p,
          ),
        })),

      deleteVariant: (variantId) =>
        set((s) => {
          const project = currentProject(s)
          if (!project || project.variants.length <= 1) return {}
          const variants = project.variants.filter((v) => v.id !== variantId)
          const activeVariantId = project.activeVariantId === variantId ? variants[0].id : project.activeVariantId
          return {
            projects: s.projects.map((p) => (p.id === project.id ? { ...p, variants, activeVariantId } : p)),
            selection: null,
            history: emptyHistory(),
            compare: null,
            viewMode: s.viewMode === 'compare' ? 'split' : s.viewMode,
          }
        }),

      updateDesign: (fn, opts) => {
        if (opts?.record !== false) get().checkpoint()
        set((s) => ({ projects: mapActiveDesign(s, fn) }))
      },

      checkpoint: () =>
        set((s) => {
          const design = activeVariant(currentProject(s))?.design
          if (!design) return {}
          return { history: { past: [...s.history.past, clone(design)].slice(-HISTORY_LIMIT), future: [] } }
        }),

      undo: () =>
        set((s) => {
          const design = activeVariant(currentProject(s))?.design
          const prev = s.history.past.at(-1)
          if (!design || !prev) return {}
          return {
            projects: mapActiveDesign(s, () => prev),
            history: { past: s.history.past.slice(0, -1), future: [clone(design), ...s.history.future] },
            selection: null,
          }
        }),

      redo: () =>
        set((s) => {
          const design = activeVariant(currentProject(s))?.design
          const next = s.history.future[0]
          if (!design || !next) return {}
          return {
            projects: mapActiveDesign(s, () => next),
            history: { past: [...s.history.past, clone(design)], future: s.history.future.slice(1) },
            selection: null,
          }
        }),

      setTool: (tool) => set({ tool, placeCatalogId: null, selection: tool === 'select' ? get().selection : null }),
      startPlacing: (catalogId) => set({ tool: 'place', placeCatalogId: catalogId, selection: null }),
      select: (selection) => set({ selection }),
      setViewMode: (viewMode) => set({ viewMode }),
      setCompare: (compare) => set({ compare }),
      setSnap: (snap) => set({ snap }),
      setModelTool: (modelTool) => set({ modelTool }),
      setModelKeys: (modelKeys) => set({ modelKeys }),
      setPaintColor: (paintColor) => set({ paintColor }),
      focusRoom: (focusRoomId) =>
        set((s) => ({
          focusRoomId,
          // Keep the selection only if it is the room itself.
          selection: s.selection?.kind === 'room' && s.selection.id === focusRoomId ? s.selection : null,
          tool: s.tool === 'room' ? 'select' : s.tool,
          viewMode: s.viewMode === 'compare' ? 'split' : s.viewMode,
        })),
    }),
    {
      name: 'home-designer-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ projects: s.projects, products: s.products, wallpapers: s.wallpapers, currentProjectId: s.currentProjectId, snap: s.snap }),
    },
  ),
)

// Keep the catalog's registry of user products in sync with the store.
syncProducts(useStore.getState().products)
useStore.subscribe((s, prev) => {
  if (s.products !== prev.products) syncProducts(s.products)
})

export function useDesign(): Design | undefined {
  return useStore((s) => activeVariant(currentProject(s))?.design)
}

/** The room being edited on its own, if any (ignores a focus on a room that no longer exists). */
export function useFocusRoom(): Room | undefined {
  return useStore((s) => {
    const d = activeVariant(currentProject(s))?.design
    return s.focusRoomId ? d?.rooms.find((r) => r.id === s.focusRoomId) : undefined
  })
}

export function useProject(): Project | undefined {
  return useStore((s) => currentProject(s))
}
