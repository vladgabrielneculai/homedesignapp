import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { PRODUCT_SHAPES } from '../catalog/catalog'
import { CURRENCIES, STORES } from '../catalog/products'
import { deleteBlob, putBlob } from '../lib/blobStore'
import { uid } from '../lib/geometry'
import { useStore } from '../state/store'
import { forgetUserModel, formatFromName, MODEL_EXTENSIONS, parseModel } from '../three/userModels'
import type { Product } from '../types'
import { photoToDataUrl } from '../lib/images'

interface ModelDraft {
  file: File
  format: NonNullable<Product['model']>['format']
  /** Measured size of the model in its own units, after the chosen up-axis. */
  size: { x: number; y: number; z: number }
}

const cm = (m: number) => Math.round(m * 1000) / 10

export function ProductDialog({ product, onClose }: { product?: Product; onClose: () => void }) {
  const saveProduct = useStore((s) => s.saveProduct)
  const deleteProduct = useStore((s) => s.deleteProduct)
  const [name, setName] = useState(product?.name ?? '')
  const [store, setStore] = useState(product?.store ?? 'IKEA')
  const [url, setUrl] = useState(product?.url ?? '')
  const [price, setPrice] = useState(product?.price?.toString() ?? '')
  const [currency, setCurrency] = useState(product?.currency ?? 'EUR')
  const [w, setW] = useState(product ? String(cm(product.w)) : '')
  const [d, setD] = useState(product ? String(cm(product.d)) : '')
  const [h, setH] = useState(product ? String(cm(product.h)) : '')
  const [shape, setShape] = useState(product?.shape ?? 'sofa3')
  const [color, setColor] = useState(product?.color ?? '#b9b2a6')
  const [woodFinish, setWoodFinish] = useState(product?.woodFinish ?? false)
  const [photo, setPhoto] = useState<string | undefined>(product?.photo)
  const [model, setModel] = useState<ModelDraft | null>(null)
  const [keepModel, setKeepModel] = useState(!!product?.model)
  const [upAxis, setUpAxis] = useState<'y' | 'z'>(product?.model?.upAxis ?? 'y')
  const [rotation, setRotation] = useState(product?.model?.rotation ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const measure = async (file: File, axis: 'y' | 'z') => {
    const format = formatFromName(file.name)
    if (!format) throw new Error(`Supported 3D formats: ${MODEL_EXTENSIONS.join(', ')}`)
    const obj = await parseModel(file, format)
    if (axis === 'z') obj.rotation.x = -Math.PI / 2
    obj.updateMatrixWorld(true)
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
    if (!Number.isFinite(size.x) || size.x === 0) throw new Error('That model looks empty.')
    return { file, format, size: { x: size.x, y: size.y, z: size.z } }
  }

  const onModelFile = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      setModel(await measure(file, upAxis))
      setKeepModel(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that 3D model.')
    } finally {
      setBusy(false)
    }
  }

  // Re-measure when the up axis changes so "use model size" stays correct.
  useEffect(() => {
    if (!model) return
    let alive = true
    measure(model.file, upAxis).then((m) => alive && setModel(m), () => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upAxis])

  /** Model files rarely say their units; guess from the size (glTF is meters, most OBJ/FBX are cm or mm). */
  const useModelSize = () => {
    if (!model) return
    const { x, y, z } = model.size
    const biggest = Math.max(x, y, z)
    const toCm = biggest > 400 ? 0.1 : biggest > 8 ? 1 : 100
    const [a, b] = rotation % 180 === 0 ? [x, z] : [z, x]
    setW(String(Math.round(a * toCm * 10) / 10))
    setD(String(Math.round(b * toCm * 10) / 10))
    setH(String(Math.round(y * toCm * 10) / 10))
  }

  const save = async () => {
    const W = parseFloat(w) / 100
    const D = parseFloat(d) / 100
    const H = parseFloat(h) / 100
    if (!name.trim()) return setError('Give the product a name.')
    if (![W, D, H].every((v) => Number.isFinite(v) && v > 0.005 && v < 20)) return setError('Enter width, depth and height in centimeters (from the product page).')
    const p = price.trim() ? parseFloat(price.replace(',', '.')) : undefined
    if (p !== undefined && !Number.isFinite(p)) return setError('The price should be a number.')
    setBusy(true)
    try {
      let modelRef = keepModel && product?.model ? { ...product.model, upAxis, rotation } : undefined
      if (model) {
        const key = `model:${uid()}`
        await putBlob(key, model.file)
        modelRef = { key, fileName: model.file.name, format: model.format, upAxis, rotation }
      }
      // Drop the old file when it was replaced or removed.
      if (product?.model && product.model.key !== modelRef?.key) {
        deleteBlob(product.model.key).catch(() => {})
      }
      if (modelRef) forgetUserModel(modelRef.key)
      saveProduct({
        id: product?.id ?? uid(),
        name: name.trim(),
        store: store.trim() || 'Other',
        url: url.trim() || undefined,
        price: p,
        currency,
        w: W,
        d: D,
        h: H,
        shape,
        color,
        woodFinish,
        photo,
        model: modelRef,
        createdAt: product?.createdAt ?? Date.now(),
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the product.')
    } finally {
      setBusy(false)
    }
  }

  const currentModelName = model?.file.name ?? (keepModel ? product?.model?.fileName : undefined)

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-title" ref={dialogRef}>
        <header className="modal-head">
          <h2 id="product-title">{product ? 'Edit product' : 'Add a product from a shop'}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted small">
            Copy the details from the product page (on IKEA they're under <b>Measurements</b>). The item is placed at its real size, and its price goes on
            your shopping list.
          </p>
          <div className="form-grid">
            <label className="field span-2">
              <span>Product name *</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SÖDERHAMN 3-seat sofa" autoFocus />
            </label>
            <label className="field">
              <span>Store</span>
              <input className="input" list="stores" value={store} onChange={(e) => setStore(e.target.value)} />
              <datalist id="stores">
                {STORES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Price</span>
              <div className="input-row">
                <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field span-2">
              <span>Product link</span>
              <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.ikea.com/…" />
            </label>
            <div className="field span-2">
              <span>Size (cm) *</span>
              <div className="dims">
                <label>
                  W <input className="input" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width in cm" />
                </label>
                <label>
                  D <input className="input" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} aria-label="Depth in cm" />
                </label>
                <label>
                  H <input className="input" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} aria-label="Height in cm" />
                </label>
              </div>
            </div>
            <label className="field">
              <span>Looks like</span>
              <select className="input" value={shape} onChange={(e) => setShape(e.target.value)}>
                {PRODUCT_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Color / finish</span>
              <div className="input-row">
                <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Main color" />
                <label className="check small">
                  <input type="checkbox" checked={woodFinish} onChange={(e) => setWoodFinish(e.target.checked)} /> Wood grain
                </label>
              </div>
            </div>
            <div className="field">
              <span>Photo</span>
              <div className="photo-row">
                {photo ? <img src={photo} alt="" className="photo-preview" /> : <div className="photo-preview empty">No photo</div>}
                <div className="stack">
                  <label className="btn small">
                    {photo ? 'Replace…' : 'Upload…'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (!f) return
                        try {
                          setPhoto(await photoToDataUrl(f))
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Could not read the photo.')
                        }
                      }}
                    />
                  </label>
                  {photo && (
                    <button className="link small" onClick={() => setPhoto(undefined)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="field">
              <span>3D model (optional)</span>
              <label className="btn small">
                {currentModelName ? 'Replace file…' : 'Upload .glb / .gltf / .obj / .fbx…'}
                <input
                  type="file"
                  accept={MODEL_EXTENSIONS.join(',')}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onModelFile(f)
                  }}
                />
              </label>
              {currentModelName && (
                <span className="muted small">
                  {currentModelName}{' '}
                  <button
                    className="link small"
                    onClick={() => {
                      setModel(null)
                      setKeepModel(false)
                    }}
                  >
                    remove
                  </button>
                </span>
              )}
            </div>
            {currentModelName && (
              <div className="field span-2 model-opts">
                <label>
                  Up axis{' '}
                  <select className="input small" value={upAxis} onChange={(e) => setUpAxis(e.target.value as 'y' | 'z')}>
                    <option value="y">Y up (glTF, most files)</option>
                    <option value="z">Z up (SketchUp, 3ds Max, Blender exports)</option>
                  </select>
                </label>
                <label>
                  Turn{' '}
                  <select className="input small" value={rotation} onChange={(e) => setRotation(Number(e.target.value))}>
                    {[0, 90, 180, 270].map((r) => (
                      <option key={r} value={r}>
                        {r}°
                      </option>
                    ))}
                  </select>
                </label>
                {model && (
                  <button className="btn small" onClick={useModelSize} type="button" title="Fill W/D/H from the model's own size">
                    Use model size
                  </button>
                )}
              </div>
            )}
          </div>
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          {product && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Delete "${product.name}"? It will also be removed from every design that uses it.`)) {
                  deleteProduct(product.id)
                  onClose()
                }
              }}
            >
              Delete product
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Working…' : product ? 'Save changes' : 'Add to my products'}
          </button>
        </footer>
      </div>
    </div>
  )
}
