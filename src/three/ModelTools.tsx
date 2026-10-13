import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { create } from 'zustand'
import { itemEntry } from '../catalog/catalog'
import { withSideFinish } from '../catalog/wallFinishes'
import { uid } from '../lib/geometry'
import {
  addDimension,
  addWorldShape,
  applyPushPull,
  currentDesign,
  deleteShapes,
  duplicateShapes,
  paintFace,
  pushPullMesh,
  selectShapes,
  transformShapes,
} from '../lib/shapeOps'
import { arr, faceNormal, meshOf, planeBasis, polygonMesh, shapeBox, shapeMatrix, vec } from '../lib/solid'
import { useStore } from '../state/store'
import type { Design, ModelTool, SolidMesh, Vec3 } from '../types'
import { buildShapeGeometry, DimensionLine, formatLength, SHAPE_COLOR } from './Shapes'

/**
 * SketchUp-style modeling tools for the 3D view: draw faces on any surface, Push/Pull them into
 * solids, move/rotate/scale, measure and paint. Like SketchUp, exact values can be typed while a
 * tool is in use (Measurements box) and points snap to corners, midpoints and the red/green/blue axes.
 */

export const TOOL_INFO: Record<ModelTool, { name: string; key: string; hint: string; vcb?: string }> = {
  select: { name: 'Select', key: 'Space', hint: 'Click a shape or item to select it (Shift adds). Drag to orbit.' },
  line: { name: 'Line', key: 'L', hint: 'Click corners on a surface; click the first corner again to make a face.', vcb: 'Length' },
  rect: { name: 'Rectangle', key: 'R', hint: 'Click one corner on a surface, then the opposite corner. Type width;depth for exact size.', vcb: 'Dimensions' },
  circle: { name: 'Circle', key: 'C', hint: 'Click the center on a surface, then the edge. Type a radius.', vcb: 'Radius' },
  push: { name: 'Push/Pull', key: 'P', hint: 'Click a face of a shape, move, click again. Type a distance.', vcb: 'Distance' },
  move: { name: 'Move', key: 'M', hint: 'Click a shape or item, move, click to drop. Hold Ctrl to move a copy. ↑ moves vertically.', vcb: 'Distance' },
  rotate: { name: 'Rotate', key: 'Q', hint: 'Click a shape or item, turn it with the mouse (15° steps), click. Type an angle.', vcb: 'Angle' },
  scale: { name: 'Scale', key: 'S', hint: 'Click a shape or item, move the mouse to resize, click. Type a factor (e.g. 1.5).', vcb: 'Scale' },
  tape: { name: 'Tape measure', key: 'T', hint: 'Click two points to measure; the dimension stays on the model.', vcb: 'Length' },
  paint: { name: 'Paint bucket', key: 'B', hint: 'Click faces of shapes, walls or furniture to paint them. Shift paints a whole shape.' },
  erase: { name: 'Eraser', key: 'E', hint: 'Click a shape, item or dimension to delete it.' },
}

export const TOOL_KEYS: Record<string, ModelTool> = { ' ': 'select', l: 'line', r: 'rect', c: 'circle', p: 'push', m: 'move', q: 'rotate', s: 'scale', t: 'tape', b: 'paint', e: 'erase' }

/** What the toolbar overlay shows: Measurements box label/value and the status hint. */
export const useToolUi = create<{ value: string; typed: string; hint: string | null }>(() => ({ value: '', typed: '', hint: null }))

/** Parses a typed length: "2.5", "2,5", "250cm", "2500 mm", "2.5m". */
export function parseLength(t: string): number | null {
  const m = t.trim().replace(',', '.').match(/^(-?\d*\.?\d+)\s*(mm|cm|m)?$/i)
  if (!m) return null
  const v = parseFloat(m[1])
  const unit = (m[2] ?? 'm').toLowerCase()
  return unit === 'mm' ? v / 1000 : unit === 'cm' ? v / 100 : v
}

function parseList(t: string): number[] | null {
  const parts = t.trim().split(/\s*[x×;*]\s*|\s+/).filter(Boolean)
  const vals = parts.map(parseLength)
  return vals.every((v) => v !== null) ? (vals as number[]) : null
}

interface Pick {
  point: THREE.Vector3
  normal: THREE.Vector3
  shapeId?: string
  face?: number
  itemId?: string
  wallId?: string
  roomId?: string
  ground?: boolean
}

interface Snap {
  point: THREE.Vector3
  kind: 'end' | 'mid' | 'axis' | 'face'
  axis?: 0 | 1 | 2
}

interface Plane {
  origin: THREE.Vector3
  normal: THREE.Vector3
  u: THREE.Vector3
  v: THREE.Vector3
  /** Paint of the face the drawing sits on. */
  color?: string
}

type Target = { shapes: string[] } | { item: string }

type Op =
  | { kind: 'line'; plane: Plane; pts: THREE.Vector3[] }
  | { kind: 'rect'; plane: Plane; a: THREE.Vector3 }
  | { kind: 'circle'; plane: Plane; c: THREE.Vector3 }
  | { kind: 'push'; shapeId: string; face: number; start: THREE.Vector3; normal: THREE.Vector3; dist: number }
  | { kind: 'move'; target: Target; base: THREE.Vector3; delta: THREE.Vector3; vertical: boolean }
  | { kind: 'rotate'; target: Target; center: THREE.Vector3; a0: number; angle: number }
  | { kind: 'scale'; target: Target; center: THREE.Vector3; r0: number; factor: number }
  | { kind: 'tape'; a: THREE.Vector3 }

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
const AXIS_COLORS = ['#e03131', '#2f6fdf', '#2f9e44']
const SNAP_PX = 12

/** Snaps a face normal onto the nearest axis when it is almost aligned (floors, walls). */
function cleanNormal(n: THREE.Vector3): THREE.Vector3 {
  for (const a of AXES) if (Math.abs(n.dot(a)) > 0.996) return a.clone().multiplyScalar(Math.sign(n.dot(a)))
  return n.clone().normalize()
}

function makePlane(p: Pick, design: Design): Plane {
  const normal = cleanNormal(p.normal)
  const { u, v } = planeBasis(normal)
  let color: string | undefined
  if (p.shapeId !== undefined && p.face !== undefined) {
    const s = design.shapes?.find((x) => x.id === p.shapeId)
    const mesh = s && meshOf(design, s)
    color = mesh?.faceColors?.[p.face] ?? s?.color
  }
  // Lift drawings a hair off the surface so they don't flicker into it.
  return { origin: p.point.clone().addScaledVector(normal, 0.0005), normal, u, v, color }
}

function rayPlane(ray: THREE.Ray, plane: Plane): THREE.Vector3 | null {
  const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(plane.normal, plane.origin)
  return ray.intersectPlane(pl, new THREE.Vector3())
}

/** Closest point on the line (origin + t·dir) to the ray. */
function closestOnLine(ray: THREE.Ray, origin: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 {
  const w0 = ray.origin.clone().sub(origin)
  const b = ray.direction.dot(dir)
  const d = ray.direction.dot(w0)
  const e = dir.dot(w0)
  const denom = 1 - b * b
  const t = denom < 1e-6 ? e : (e - b * d) / denom
  return origin.clone().addScaledVector(dir, t)
}

function targetCenter(design: Design, t: Target): THREE.Vector3 {
  if ('item' in t) {
    const it = design.items.find((i) => i.id === t.item)
    return it ? new THREE.Vector3(it.x, it.elevation ?? 0, it.y) : new THREE.Vector3()
  }
  const box = new THREE.Box3()
  for (const s of design.shapes ?? []) if (t.shapes.includes(s.id)) box.union(shapeBox(design, s))
  const c = box.getCenter(new THREE.Vector3())
  c.y = box.min.y
  return c
}

/** World-space outline of one face of a shape, as a single-face mesh. */
function faceWorld(design: Design, shapeId: string, fi: number): SolidMesh | null {
  const s = design.shapes?.find((x) => x.id === shapeId)
  const mesh = s && meshOf(design, s)
  if (!s || !mesh || !mesh.faces[fi]) return null
  const m = shapeMatrix(s)
  const nm = new THREE.Matrix3().getNormalMatrix(m)
  const n = faceNormal(mesh, fi).applyMatrix3(nm).normalize()
  return polygonMesh(
    mesh.faces[fi].map((k) => arr(vec(mesh.verts[k]).applyMatrix4(m).addScaledVector(n, 0.002))),
    n,
  )
}

export function ModelTools({ design, onPreview }: { design: Design; onPreview: (p: { shapeId: string; mesh: SolidMesh } | null) => void }) {
  const tool = useStore((s) => s.modelTool)
  const { camera, gl, scene, invalidate } = useThree()
  const [op, setOpState] = useState<Op | null>(null)
  const opRef = useRef<Op | null>(null)
  const [hover, setHover] = useState<Pick | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null)
  const designRef = useRef(design)
  designRef.current = design
  const down = useRef<{ x: number; y: number; started: boolean } | null>(null)
  const ctrl = useRef(false)

  const setOp = (o: Op | null) => {
    opRef.current = o
    setOpState(o)
    invalidate()
  }

  // Points the cursor can snap to: shape corners and edge midpoints, wall corners.
  const snapPoints = useMemo(() => {
    const pts: { p: THREE.Vector3; kind: 'end' | 'mid' }[] = []
    for (const s of design.shapes ?? []) {
      const mesh = meshOf(design, s)
      if (!mesh) continue
      const m = shapeMatrix(s)
      const w = mesh.verts.map((v) => vec(v).applyMatrix4(m))
      for (const p of w) pts.push({ p, kind: 'end' })
      for (const f of mesh.faces) for (let i = 0; i < f.length; i++) pts.push({ p: w[f[i]].clone().add(w[f[(i + 1) % f.length]]).multiplyScalar(0.5), kind: 'mid' })
    }
    for (const wl of design.walls)
      for (const e of [wl.a, wl.b]) {
        pts.push({ p: new THREE.Vector3(e.x, 0, e.y), kind: 'end' })
        pts.push({ p: new THREE.Vector3(e.x, wl.height, e.y), kind: 'end' })
      }
    return pts
  }, [design])

  // Leaving a tool cancels what it was doing.
  useEffect(() => {
    if (opRef.current) cancel()
    setHover(null)
    setSnap(null)
    useToolUi.setState({ typed: '', value: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  const ndc = (e: { clientX: number; clientY: number }) => {
    const r = gl.domElement.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }
  const toScreen = (p: THREE.Vector3) => {
    const r = gl.domElement.getBoundingClientRect()
    const q = p.clone().project(camera)
    return new THREE.Vector2(((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height)
  }
  const mouseScreen = (e: { clientX: number; clientY: number }) => {
    const r = gl.domElement.getBoundingClientRect()
    return new THREE.Vector2(e.clientX - r.left, e.clientY - r.top)
  }

  const pick = (e: { clientX: number; clientY: number }): { pick: Pick | null; ray: THREE.Ray } => {
    const rc = new THREE.Raycaster()
    rc.setFromCamera(ndc(e), camera)
    const hits = rc.intersectObjects(scene.children, true)
    for (const h of hits) {
      const o = h.object as THREE.Mesh
      if (!o.isMesh || !h.face) continue
      let visible = true
      let skip = false
      const data: Record<string, unknown> = {}
      for (let x: THREE.Object3D | null = o; x; x = x.parent) {
        if (!x.visible) visible = false
        if (x.userData.noPick || x.userData.isSkyDome) skip = true
        for (const k of ['shapeId', 'itemId', 'wallId', 'roomId', 'triFace']) if (x.userData[k] !== undefined && data[k] === undefined) data[k] = x.userData[k]
      }
      if (!visible || skip) continue
      const normal = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(o.matrixWorld)).normalize()
      if (normal.dot(rc.ray.direction) > 0) normal.negate()
      const triFace = data.triFace as number[] | undefined
      return {
        ray: rc.ray,
        pick: {
          point: h.point.clone(),
          normal,
          shapeId: data.shapeId as string | undefined,
          face: triFace && h.faceIndex != null ? triFace[h.faceIndex] : undefined,
          itemId: data.itemId as string | undefined,
          wallId: data.wallId as string | undefined,
          roomId: data.roomId as string | undefined,
        },
      }
    }
    const g = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    return { ray: rc.ray, pick: g ? { point: g, normal: new THREE.Vector3(0, 1, 0), ground: true } : null }
  }

  /** Inference: nearby corner/midpoint, else the red/green/blue axis through `anchor`, else the surface. */
  const infer = (e: { clientX: number; clientY: number }, ray: THREE.Ray, fallback: THREE.Vector3 | null, anchor?: THREE.Vector3, plane?: Plane): Snap | null => {
    const ms = mouseScreen(e)
    let best: Snap | null = null
    let bestD = SNAP_PX
    for (const c of snapPoints) {
      if (plane && Math.abs(c.p.clone().sub(plane.origin).dot(plane.normal)) > 0.01) continue
      const d = toScreen(c.p).distanceTo(ms)
      if (d < bestD) {
        bestD = d
        best = { point: c.p.clone(), kind: c.kind }
      }
    }
    if (best) return best
    if (anchor) {
      let bestAxis: Snap | null = null
      let ad = 10
      AXES.forEach((dir, i) => {
        if (plane && Math.abs(dir.dot(plane.normal)) > 0.01) return
        const p = closestOnLine(ray, anchor, dir)
        if (p.distanceTo(anchor) < 1e-4) return
        const d = toScreen(p).distanceTo(ms)
        if (d < ad) {
          ad = d
          bestAxis = { point: p, kind: 'axis', axis: i as 0 | 1 | 2 }
        }
      })
      if (bestAxis) return bestAxis
    }
    return fallback ? { point: fallback, kind: 'face' } : null
  }

  const value = (text: string) => useToolUi.setState({ value: text })

  const cancel = () => {
    const o = opRef.current
    // Move/rotate/scale edit the design live; put it back as it was.
    if (o && (o.kind === 'move' || o.kind === 'rotate' || o.kind === 'scale')) {
      restart()
      dropCheckpoint()
    }
    onPreview(null)
    setOp(null)
    value('')
  }

  // ---- live transforms of the selected target (recorded once at the start) ----
  const applyTarget = (t: Target, matrix: THREE.Matrix4, itemFn: (it: Design['items'][number]) => Design['items'][number]) => {
    if ('item' in t) useStore.getState().updateDesign((d) => ({ ...d, items: d.items.map((i) => (i.id === t.item ? itemFn(i) : i)) }), { record: false })
    else transformShapes(t.shapes, matrix, false)
  }
  const beginTransform = () => {
    useStore.getState().checkpoint()
  }
  const dropCheckpoint = () => useStore.setState((st) => ({ history: { ...st.history, past: st.history.past.slice(0, -1) } }))
  /** Undo the live preview of the last step and re-apply the transform from the start state. */
  const restart = () => {
    const s = useStore.getState()
    const prev = s.history.past.at(-1)
    if (prev) s.updateDesign(() => structuredClone(prev), { record: false })
  }

  const targetAt = (p: Pick | null): Target | null => {
    if (!p) return null
    if (p.shapeId) {
      const sel = useStore.getState().selection
      return { shapes: sel?.kind === 'shapes' && sel.ids.includes(p.shapeId) ? sel.ids : [p.shapeId] }
    }
    if (p.itemId) return { item: p.itemId }
    return null
  }

  // ---- finishing operations ----
  const finishShape = (pts: THREE.Vector3[], plane: Plane, name: string) => {
    const world = polygonMesh(
      pts.map((p) => arr(p)),
      plane.normal,
    )
    const id = addWorldShape(world, name, plane.color)
    selectShapes([id])
    useToolUi.setState({ hint: 'Face made. Press P (Push/Pull) to pull it up into 3D.' })
  }

  const rectCorners = (o: Extract<Op, { kind: 'rect' }>, p: THREE.Vector3, size?: [number, number]) => {
    const d = p.clone().sub(o.a)
    let w = d.dot(o.plane.u)
    let h = d.dot(o.plane.v)
    if (size) {
      w = Math.sign(w || 1) * size[0]
      h = Math.sign(h || 1) * size[1]
    }
    const a = o.a
    return { pts: [a.clone(), a.clone().addScaledVector(o.plane.u, w), a.clone().addScaledVector(o.plane.u, w).addScaledVector(o.plane.v, h), a.clone().addScaledVector(o.plane.v, h)], w, h }
  }

  const circlePts = (o: Extract<Op, { kind: 'circle' }>, r: number) =>
    Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2
      return o.c.clone().addScaledVector(o.plane.u, Math.cos(a) * r).addScaledVector(o.plane.v, Math.sin(a) * r)
    })

  const finishPush = (o: Extract<Op, { kind: 'push' }>, dist: number) => {
    onPreview(null)
    if (Math.abs(dist) > 1e-4) applyPushPull(o.shapeId, o.face, dist)
    setOp(null)
    value(formatLength(Math.abs(dist)))
  }

  const finishMove = (o: Extract<Op, { kind: 'move' }>, delta: THREE.Vector3, copy: boolean) => {
    restart()
    dropCheckpoint()
    const s = useStore.getState()
    if (copy) {
      const t = o.target
      if ('item' in t) {
        const it = currentDesign()?.items.find((i) => i.id === t.item)
        if (it) {
          const id = uid()
          s.updateDesign((d) => ({ ...d, items: [...d.items, { ...it, id, x: it.x + delta.x, y: it.y + delta.z, elevation: Math.max(0, (it.elevation ?? 0) + delta.y) || undefined }] }))
          s.select({ kind: 'item', id })
        }
      } else duplicateShapes(t.shapes, arr(delta))
    } else {
      s.checkpoint()
      applyTarget(o.target, new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z), (i) => ({ ...i, x: i.x + delta.x, y: i.y + delta.z, elevation: Math.max(0, (i.elevation ?? 0) + delta.y) || undefined }))
    }
    setOp(null)
    value(formatLength(delta.length()))
  }

  const rotateMatrix = (c: THREE.Vector3, angle: number) =>
    new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationY((-angle * Math.PI) / 180)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
  const scaleMatrix = (c: THREE.Vector3, f: number) =>
    new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(f, f, f)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))

  const previewRotate = (o: Extract<Op, { kind: 'rotate' }>, angle: number) => {
    restart()
    applyTarget(o.target, rotateMatrix(o.center, angle), (i) => ({ ...i, rotation: (((i.rotation + angle) % 360) + 360) % 360 }))
  }
  const previewScale = (o: Extract<Op, { kind: 'scale' }>, f: number) => {
    restart()
    applyTarget(o.target, scaleMatrix(o.center, f), (i) => {
      const e = itemEntry(i)
      return { ...i, w: e.w * f, d: e.d * f, h: e.h * f }
    })
  }
  const previewMove = (o: Extract<Op, { kind: 'move' }>, delta: THREE.Vector3) => {
    restart()
    applyTarget(o.target, new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z), (i) => ({ ...i, x: i.x + delta.x, y: i.y + delta.z, elevation: Math.max(0, (i.elevation ?? 0) + delta.y) || undefined }))
  }

  // ---- pointer handling ----
  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: PointerEvent) => {
      ctrl.current = e.ctrlKey || e.metaKey
      if (tool === 'select') return
      const { pick: p, ray } = pick(e)
      const o = opRef.current
      setHover(p)
      let sn: Snap | null = null
      switch (o?.kind) {
        case 'line': {
          const onPlane = rayPlane(ray, o.plane)
          sn = infer(e, ray, onPlane, o.pts.at(-1), o.plane)
          if (sn) {
            const len = sn.point.distanceTo(o.pts.at(-1)!)
            value(formatLength(len))
          }
          break
        }
        case 'rect': {
          const onPlane = rayPlane(ray, o.plane)
          sn = infer(e, ray, onPlane, undefined, o.plane)
          if (sn) {
            const { w, h } = rectCorners(o, sn.point)
            value(`${formatLength(Math.abs(w))} × ${formatLength(Math.abs(h))}`)
          }
          break
        }
        case 'circle': {
          const onPlane = rayPlane(ray, o.plane)
          sn = infer(e, ray, onPlane, undefined, o.plane)
          if (sn) value(formatLength(sn.point.distanceTo(o.c)))
          break
        }
        case 'push': {
          const q = closestOnLine(ray, o.start, o.normal)
          let dist = q.clone().sub(o.start).dot(o.normal)
          // Snap the pull to the height of a nearby corner (pull to match another shape).
          const near = infer(e, ray, null)
          if (near && near.kind !== 'face') dist = near.point.clone().sub(o.start).dot(o.normal)
          dist = Math.round(dist * 1000) / 1000
          const shape = designRef.current.shapes?.find((x) => x.id === o.shapeId)
          const mesh = shape && pushPullMesh(designRef.current, shape, o.face, dist)
          if (mesh) onPreview({ shapeId: o.shapeId, mesh })
          opRef.current = { ...o, dist }
          value(formatLength(Math.abs(dist)))
          sn = { point: o.start.clone().addScaledVector(o.normal, dist), kind: 'face' }
          break
        }
        case 'move': {
          let target: THREE.Vector3
          if (o.vertical) target = closestOnLine(ray, o.base, AXES[1])
          else {
            const pl: Plane = { origin: o.base, normal: AXES[1], u: AXES[0], v: AXES[2] }
            target = rayPlane(ray, pl) ?? o.base
          }
          sn = infer(e, ray, target, o.base) ?? { point: target, kind: 'face' }
          const delta = sn.point.clone().sub(o.base)
          if (!o.vertical && sn.kind !== 'end' && sn.kind !== 'mid') delta.y = 0
          delta.set(Math.round(delta.x * 1000) / 1000, Math.round(delta.y * 1000) / 1000, Math.round(delta.z * 1000) / 1000)
          previewMove(o, delta)
          opRef.current = { ...o, delta }
          value(formatLength(delta.length()))
          break
        }
        case 'rotate': {
          const pl: Plane = { origin: o.center, normal: AXES[1], u: AXES[0], v: AXES[2] }
          const q = rayPlane(ray, pl)
          if (!q) break
          let a = (Math.atan2(q.z - o.center.z, q.x - o.center.x) * 180) / Math.PI - o.a0
          a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15
          a = ((a % 360) + 540) % 360 - 180
          previewRotate(o, a)
          opRef.current = { ...o, angle: a }
          value(`${a}°`)
          sn = { point: q, kind: 'face' }
          break
        }
        case 'scale': {
          const pl: Plane = { origin: o.center, normal: AXES[1], u: AXES[0], v: AXES[2] }
          const q = rayPlane(ray, pl)
          if (!q) break
          let f = Math.max(0.05, new THREE.Vector2(q.x - o.center.x, q.z - o.center.z).length() / o.r0)
          f = e.shiftKey ? Math.round(f * 100) / 100 : Math.round(f * 20) / 20
          previewScale(o, f)
          opRef.current = { ...o, factor: f }
          value(`× ${f.toFixed(2)}`)
          sn = { point: q, kind: 'face' }
          break
        }
        case 'tape': {
          sn = infer(e, ray, p?.point ?? null, o.a)
          if (sn) value(formatLength(sn.point.distanceTo(o.a)))
          break
        }
        default:
          if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'tape' || tool === 'move') sn = infer(e, ray, p?.point ?? null)
      }
      setSnap(sn)
      setCursor(sn?.point ?? p?.point ?? null)
      invalidate()
    }

    const onDown = (e: PointerEvent) => {
      useStore.getState().setModelKeys(true)
      if (e.button !== 0 || tool === 'select') return
      down.current = { x: e.clientX, y: e.clientY, started: !opRef.current }
      click(e)
    }
    const onUp = (e: PointerEvent) => {
      const d = down.current
      down.current = null
      // Press-drag-release works like click-move-click for drawing and pulling.
      if (d && d.started && opRef.current && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) click(e)
    }

    const click = (e: PointerEvent) => {
      const { pick: p, ray } = pick(e)
      const o = opRef.current
      const des = designRef.current
      const s = useStore.getState()
      switch (tool) {
        case 'line': {
          if (!o) {
            if (!p) return
            const sn = infer(e, ray, p.point)
            const plane = makePlane(p, des)
            setOp({ kind: 'line', plane, pts: [sn ? sn.point.clone() : p.point.clone()] })
            return
          }
          if (o.kind !== 'line') return
          const sn = infer(e, ray, rayPlane(ray, o.plane), o.pts.at(-1), o.plane)
          if (!sn) return
          if (o.pts.length >= 3 && toScreen(o.pts[0]).distanceTo(mouseScreen(e)) < SNAP_PX) {
            finishShape(o.pts, o.plane, 'Shape')
            setOp(null)
            return
          }
          setOp({ ...o, pts: [...o.pts, sn.point.clone()] })
          return
        }
        case 'rect': {
          if (!o) {
            if (!p) return
            const sn = infer(e, ray, p.point)
            setOp({ kind: 'rect', plane: makePlane(p, des), a: sn ? sn.point.clone() : p.point.clone() })
            return
          }
          if (o.kind !== 'rect') return
          const sn = infer(e, ray, rayPlane(ray, o.plane), undefined, o.plane)
          if (!sn) return
          const { pts, w, h } = rectCorners(o, sn.point)
          if (Math.abs(w) < 0.005 || Math.abs(h) < 0.005) return
          finishShape(pts, o.plane, 'Rectangle')
          setOp(null)
          return
        }
        case 'circle': {
          if (!o) {
            if (!p) return
            const sn = infer(e, ray, p.point)
            setOp({ kind: 'circle', plane: makePlane(p, des), c: sn ? sn.point.clone() : p.point.clone() })
            return
          }
          if (o.kind !== 'circle') return
          const sn = infer(e, ray, rayPlane(ray, o.plane), undefined, o.plane)
          if (!sn) return
          const r = sn.point.distanceTo(o.c)
          if (r < 0.005) return
          finishShape(circlePts(o, r), o.plane, 'Circle')
          setOp(null)
          return
        }
        case 'push': {
          if (o?.kind === 'push') {
            finishPush(o, o.dist)
            return
          }
          if (!p?.shapeId || p.face === undefined) {
            useToolUi.setState({ hint: 'Push/Pull works on faces you have drawn: draw a rectangle (R) or circle (C) first.' })
            return
          }
          setOp({ kind: 'push', shapeId: p.shapeId, face: p.face, start: p.point.clone(), normal: cleanNormal(p.normal), dist: 0 })
          return
        }
        case 'move':
        case 'rotate':
        case 'scale': {
          if (o?.kind === 'move') return finishMove(o, o.delta, e.ctrlKey || e.metaKey)
          if (o?.kind === 'rotate' || o?.kind === 'scale') {
            // The design already shows the result and the start is in the undo history.
            setOp(null)
            return
          }
          const t = targetAt(p)
          if (!t || !p) {
            useToolUi.setState({ hint: 'Click a shape or a piece of furniture.' })
            return
          }
          if ('shapes' in t) selectShapes(t.shapes)
          else s.select({ kind: 'item', id: t.item })
          beginTransform()
          const center = targetCenter(des, t)
          if (tool === 'move') {
            const sn = infer(e, ray, p.point)
            setOp({ kind: 'move', target: t, base: sn ? sn.point.clone() : p.point.clone(), delta: new THREE.Vector3(), vertical: false })
          } else if (tool === 'rotate') {
            setOp({ kind: 'rotate', target: t, center, a0: (Math.atan2(p.point.z - center.z, p.point.x - center.x) * 180) / Math.PI, angle: 0 })
          } else {
            const r0 = Math.max(0.05, new THREE.Vector2(p.point.x - center.x, p.point.z - center.z).length())
            setOp({ kind: 'scale', target: t, center, r0, factor: 1 })
          }
          return
        }
        case 'tape': {
          const sn = infer(e, ray, p?.point ?? null, o?.kind === 'tape' ? o.a : undefined)
          if (!sn) return
          if (o?.kind === 'tape') {
            if (sn.point.distanceTo(o.a) > 0.001) addDimension(arr(o.a), arr(sn.point))
            setOp(null)
          } else setOp({ kind: 'tape', a: sn.point.clone() })
          return
        }
        case 'paint': {
          if (!p) return
          const color = s.paintColor
          if (p.shapeId) paintFace(p.shapeId, e.shiftKey ? null : (p.face ?? null), color)
          else if (p.itemId) s.updateDesign((d) => ({ ...d, items: d.items.map((i) => (i.id === p.itemId ? { ...i, color } : i)) }))
          else if (p.wallId) {
            const w = des.walls.find((x) => x.id === p.wallId)
            if (!w) return
            const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
            const side = p.normal.x * -Math.sin(ang) + p.normal.z * Math.cos(ang) > 0 ? 'a' : 'b'
            s.updateDesign((d) => ({ ...d, walls: d.walls.map((x) => (x.id === w.id ? withSideFinish(x, side, { kind: 'paint', color }) : x)) }))
          }
          return
        }
        case 'erase': {
          if (p?.shapeId) deleteShapes([p.shapeId])
          else if (p?.itemId) s.updateDesign((d) => ({ ...d, items: d.items.filter((i) => i.id !== p.itemId) }))
          return
        }
      }
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene, tool, snapPoints])

  // ---- keyboard: tool shortcuts, Measurements box, Esc ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable]')) return
      const s = useStore.getState()
      if (!s.modelKeys || e.ctrlKey || e.metaKey || e.altKey) return
      const ui = useToolUi.getState()
      const o = opRef.current
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        if (ui.typed) useToolUi.setState({ typed: '' })
        else if (o) cancel()
        else if (s.modelTool !== 'select') s.setModelTool('select')
        else s.select(null)
        return
      }
      // Typing a value: digits start it (while a tool is in use); then units and separators too.
      const startsValue = /^[\d.,-]$/.test(e.key) && !!o
      const continuesValue = !!ui.typed && /^[\d.,;x×* a-z]$/i.test(e.key)
      if (startsValue || continuesValue) {
        e.preventDefault()
        e.stopImmediatePropagation()
        useToolUi.setState({ typed: ui.typed + e.key })
        return
      }
      if (e.key === 'Backspace' && ui.typed) {
        e.preventDefault()
        e.stopImmediatePropagation()
        useToolUi.setState({ typed: ui.typed.slice(0, -1) })
        return
      }
      if (e.key === 'Enter') {
        if (ui.typed) {
          e.preventDefault()
          e.stopImmediatePropagation()
          applyTyped(ui.typed)
          useToolUi.setState({ typed: '' })
        }
        return
      }
      if (e.key === 'ArrowUp' && o?.kind === 'move') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setOp({ ...o, vertical: !o.vertical })
        return
      }
      const k = e.key.toLowerCase()
      if (TOOL_KEYS[k] && !e.shiftKey) {
        e.preventDefault()
        e.stopImmediatePropagation()
        s.setModelTool(TOOL_KEYS[k])
      }
    }
    const applyTyped = (text: string) => {
      const o = opRef.current
      const des = designRef.current
      if (!o) return
      switch (o.kind) {
        case 'line': {
          const len = parseLength(text)
          const last = o.pts.at(-1)!
          const dir = (cursorRef.current ?? last).clone().sub(last)
          if (len === null || dir.lengthSq() < 1e-9) return
          const p = last.clone().addScaledVector(dir.normalize(), len)
          setOp({ ...o, pts: [...o.pts, p] })
          return
        }
        case 'rect': {
          const v = parseList(text)
          if (!v || v.length < 2) return
          const { pts } = rectCorners(o, cursorRef.current ?? o.a.clone().add(o.plane.u).add(o.plane.v), [v[0], v[1]])
          finishShape(pts, o.plane, 'Rectangle')
          setOp(null)
          return
        }
        case 'circle': {
          const r = parseLength(text)
          if (!r) return
          finishShape(circlePts(o, r), o.plane, 'Circle')
          setOp(null)
          return
        }
        case 'push': {
          const d = parseLength(text)
          if (d === null) return
          finishPush(o, Math.sign(o.dist || 1) * d)
          return
        }
        case 'move': {
          const d = parseLength(text)
          const dir = o.delta.clone()
          if (d === null || dir.lengthSq() < 1e-9) return
          finishMove(o, dir.normalize().multiplyScalar(d), ctrl.current)
          return
        }
        case 'rotate': {
          const a = parseFloat(text.replace(',', '.'))
          if (!Number.isFinite(a)) return
          previewRotate(o, a)
          setOp(null)
          return
        }
        case 'scale': {
          const f = parseFloat(text.replace(',', '.'))
          if (!(f > 0)) return
          previewScale(o, f)
          setOp(null)
          return
        }
        case 'tape': {
          const len = parseLength(text)
          const dir = (cursorRef.current ?? o.a).clone().sub(o.a)
          if (len === null || dir.lengthSq() < 1e-9) return
          addDimension(arr(o.a), arr(o.a.clone().addScaledVector(dir.normalize(), len)))
          setOp(null)
          return
        }
      }
      void des
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cursorRef = useRef<THREE.Vector3 | null>(null)
  cursorRef.current = cursor

  useEffect(() => {
    useToolUi.setState({ hint: null })
  }, [tool])

  // ---- drawing of previews ----
  const hoverFace = useMemo(() => {
    if (!hover?.shapeId || hover.face === undefined || !(tool === 'push' || tool === 'paint') || op) return null
    return faceWorld(design, hover.shapeId, hover.face)
  }, [hover, tool, op, design])

  const draft: THREE.Vector3[] | null = useMemo(() => {
    if (!op || !cursor) return null
    if (op.kind === 'line') return [...op.pts, cursor]
    if (op.kind === 'rect') return [...rectCorners(op, cursor).pts, op.a]
    if (op.kind === 'circle') {
      const r = cursor.distanceTo(op.c)
      const pts = circlePts(op, r)
      return [...pts, pts[0]]
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, cursor])

  return (
    <group userData={{ noPick: true }}>
      {hoverFace && <FaceHighlight mesh={hoverFace} color={tool === 'paint' ? useStore.getState().paintColor : '#2f80ed'} />}
      {draft && <Polyline pts={draft} color="#1f2937" />}
      {op?.kind === 'line' && cursor && <DimensionLine dim={{ a: arr(op.pts.at(-1)!), b: arr(cursor) }} color="#1f2937" live />}
      {op?.kind === 'tape' && cursor && <DimensionLine dim={{ a: arr(op.a), b: arr(cursor) }} live />}
      {op && snap?.kind === 'axis' && snap.axis !== undefined && (
        <AxisGuide origin={op?.kind === 'line' ? op.pts.at(-1)! : op?.kind === 'tape' ? op.a : op?.kind === 'move' ? op.base : snap.point} axis={snap.axis} />
      )}
      {snap && snap.kind !== 'face' && tool !== 'select' && (
        <mesh position={snap.point} renderOrder={5}>
          <sphereGeometry args={[0.04, 12, 8]} />
          <meshBasicMaterial color={snap.kind === 'end' ? '#2f9e44' : snap.kind === 'mid' ? '#15aabf' : AXIS_COLORS[snap.axis ?? 0]} depthTest={false} transparent />
        </mesh>
      )}
    </group>
  )
}

function FaceHighlight({ mesh, color }: { mesh: SolidMesh; color: string }) {
  const geo = useMemo(() => buildShapeGeometry(mesh, color), [mesh, color])
  useEffect(
    () => () => {
      geo.geometry.dispose()
      geo.edges.dispose()
    },
    [geo],
  )
  return (
    <mesh geometry={geo.geometry} renderOrder={4}>
      <meshBasicMaterial color={color} transparent opacity={0.35} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Polyline({ pts, color }: { pts: THREE.Vector3[]; color: string }) {
  const line = useMemo(() => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }))
    l.renderOrder = 5
    l.userData.noPick = true
    return l
  }, [pts, color])
  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    },
    [line],
  )
  return <primitive object={line} />
}

function AxisGuide({ origin, axis }: { origin: THREE.Vector3; axis: 0 | 1 | 2 }) {
  const pts = useMemo(() => [origin.clone().addScaledVector(AXES[axis], -50), origin.clone().addScaledVector(AXES[axis], 50)], [origin, axis])
  return <Polyline pts={pts} color={AXIS_COLORS[axis]} />
}

export const DEFAULT_SHAPE_COLOR = SHAPE_COLOR
export type { Vec3 }
