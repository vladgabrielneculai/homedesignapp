import { useEffect, useState } from 'react'
import { getBlob } from './blobStore'
import { loadImage } from './images'

/** Longest side, in pixels, that imported plans are stored at (PDF pages are rendered to this). */
const MAX_SIDE = 3200

export interface PlanImage {
  blob: Blob
  w: number
  h: number
  name: string
}

async function pdfToImage(file: File): Promise<PlanImage> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(6, MAX_SIDE / Math.max(base.width, base.height)) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the PDF page.'))), 'image/png'))
    return { blob, w: canvas.width, h: canvas.height, name: file.name }
  } finally {
    // Also stops the PDF worker.
    task.destroy()
  }
}

async function imageFile(file: File): Promise<PlanImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    if (s === 1) return { blob: file, w: img.naturalWidth, h: img.naturalHeight, name: file.name }
    // Very large scans are scaled down to keep storage and drawing fast.
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * s)
    canvas.height = Math.round(img.naturalHeight * s)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.9))
    return { blob, w: canvas.width, h: canvas.height, name: file.name }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Reads a floor plan from an image or the first page of a PDF. */
export function readPlanFile(file: File): Promise<PlanImage> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  return isPdf ? pdfToImage(file) : imageFile(file)
}

/** Object URL for a blob stored in IndexedDB (revoked when the key changes). */
export function useBlobUrl(key: string | undefined): string | undefined {
  const [state, setState] = useState<{ key: string; url: string } | null>(null)
  useEffect(() => {
    if (!key) return
    let url: string | undefined
    let alive = true
    getBlob(key).then((b) => {
      if (!alive || !b) return
      url = URL.createObjectURL(b)
      setState({ key, url })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [key])
  return state && state.key === key ? state.url : undefined
}
