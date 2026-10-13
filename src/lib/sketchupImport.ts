import * as THREE from 'three'
import { productCatalogId } from '../catalog/products'
import { useStore } from '../state/store'
import { forgetUserModel, parseModel } from '../three/userModels'
import type { Product } from '../types'
import { putBlob } from './blobStore'
import { bounds, uid } from './geometry'
import { currentDesign } from './shapeOps'

/**
 * Opens SketchUp files. A .skp is converted by the local helper (the Vite server running on this
 * computer with the SketchUp SDK, see server/skpHelper.ts); a .dae (COLLADA export from SketchUp) is
 * read right in the browser. The model becomes one of "My products" and is placed in the design.
 */

export const SKETCHUP_ACCEPT = '.skp,.dae'

async function convertSkp(file: File): Promise<{ blob: Blob; name: string }> {
  let res: Response
  try {
    res = await fetch('api/skp/import', { method: 'POST', body: file, headers: { 'X-File-Name': encodeURIComponent(file.name) } })
  } catch {
    throw new Error('Could not reach the local SketchUp helper. Run the app with npm run dev on your computer.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? (res.status === 404 ? 'Opening .skp files needs the local helper: run the app on your computer with npm run dev.' : `The helper failed (${res.status}).`))
  }
  const info = JSON.parse(decodeURIComponent(res.headers.get('X-Skp-Info') ?? '%7B%7D')) as { name?: string }
  return { blob: await res.blob(), name: info.name || file.name.replace(/\.skp$/i, '') }
}

/** Imports a SketchUp file as a product and places it in the middle of the design. Returns its name. */
export async function importSketchUp(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext !== 'skp' && ext !== 'dae') throw new Error('Choose a SketchUp .skp file or a COLLADA .dae export.')
  const { blob, name } = ext === 'skp' ? await convertSkp(file) : { blob: file as Blob, name: file.name.replace(/\.dae$/i, '') }
  const format = ext === 'skp' ? 'glb' : 'dae'
  // Measure the model in meters (both formats come in upright and in real units).
  const object = await parseModel(blob, format)
  object.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  if (!(size.x > 0 || size.y > 0 || size.z > 0)) throw new Error('The model is empty.')
  const key = `model:${uid()}`
  await putBlob(key, blob)
  forgetUserModel(key)
  const product: Product = {
    id: uid(),
    name,
    store: 'SketchUp',
    currency: 'EUR',
    w: Math.max(0.01, size.x),
    d: Math.max(0.01, size.z),
    h: Math.max(0.01, size.y),
    shape: 'sideboard',
    color: '#d9d4cb',
    model: { key, fileName: file.name, format, upAxis: 'y', rotation: 0 },
    createdAt: Date.now(),
  }
  const s = useStore.getState()
  s.saveProduct(product)
  // Place it in the middle of the home (or at the origin of an empty design).
  const design = currentDesign()
  const pts = design?.walls.flatMap((w) => [w.a, w.b]) ?? []
  const b = pts.length ? bounds(pts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  const id = uid()
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  // Don't drop it on top of the previous import.
  const taken = design?.items.filter((i) => Math.abs(i.y - cy) < 0.01 && i.x >= cx - 0.01).length ?? 0
  const x = cx + taken * (product.w + 0.3)
  s.updateDesign((d) => ({ ...d, items: [...d.items, { id, catalogId: productCatalogId(product), x, y: cy, rotation: 0 }] }))
  s.select({ kind: 'item', id })
  return name
}
