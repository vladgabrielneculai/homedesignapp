import type { Project } from '../types'

export function download(filename: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function safeName(name: string) {
  return name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'design'
}

/** Rasterise an SVG element (2D plan) into a PNG data URL at the given pixel ratio. */
export async function svgToPng(svg: SVGSVGElement, ratio = 2): Promise<string> {
  const w = svg.width.baseVal.value
  const h = svg.height.baseVal.value
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  // Inline the font so text renders the same outside the page.
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = 'text{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.sym *{vector-effect:non-scaling-stroke}'
  clone.insertBefore(style, clone.firstChild)
  const xml = new XMLSerializer().serializeToString(clone)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not render plan image'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = w * ratio
  canvas.height = h * ratio
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export const PROJECT_FILE_VERSION = 1

export function exportProjectJson(p: Project) {
  const { thumbnail: _thumbnail, ...rest } = p
  void _thumbnail
  const blob = new Blob([JSON.stringify({ app: 'home-designer', version: PROJECT_FILE_VERSION, project: rest }, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  download(`${safeName(p.name)}.homedesign.json`, url)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Parse and minimally validate an exported project file. */
export async function readProjectFile(file: File): Promise<Project> {
  const data = JSON.parse(await file.text())
  const p = data?.project ?? data
  if (!p || !Array.isArray(p.variants) || !p.variants.length) throw new Error('This file is not a Home Designer project.')
  for (const v of p.variants) {
    const d = v?.design
    if (!d || !Array.isArray(d.walls) || !Array.isArray(d.items) || !Array.isArray(d.rooms) || !Array.isArray(d.openings) || !d.style)
      throw new Error('The project file is missing design data.')
  }
  return {
    id: String(p.id ?? ''),
    name: String(p.name ?? 'Imported design'),
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Date.now(),
    variants: p.variants,
    activeVariantId: p.variants.some((v: { id: string }) => v.id === p.activeVariantId) ? p.activeVariantId : p.variants[0].id,
  }
}
