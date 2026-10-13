import { use, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'

/**
 * Display styles for the 3D view, like SketchUp's Styles: from the realistic look to edge-drawn
 * styles (black edges and profiles over plain or colored faces).
 */
export type ViewStyle = 'realistic' | 'shaded' | 'sketchup' | 'hidden' | 'xray' | 'mono' | 'sketchy'

export interface ViewStyleInfo {
  id: ViewStyle
  name: string
  hint: string
  /** Draws edges and profile lines over the image. */
  edges: boolean
  /** Replaces every material with a plain one (undefined keeps the real colors and textures). */
  faces?: 'white' | 'mono' | 'xray'
  background: [string, string]
}

export const VIEW_STYLES: ViewStyleInfo[] = [
  { id: 'realistic', name: 'Realistic', hint: 'Sun, soft shadows, ambient occlusion and film tone mapping', edges: false, background: ['', ''] },
  { id: 'shaded', name: 'Shaded', hint: 'Colors and textures with simple lighting (fast)', edges: false, background: ['', ''] },
  { id: 'sketchup', name: 'SketchUp', hint: 'Colored faces with black edges and profiles, sky gradient', edges: true, background: ['#9fc2e4', '#eef3f7'] },
  { id: 'hidden', name: 'Hidden line', hint: 'White faces and black lines, like a drawing', edges: true, faces: 'white', background: ['#ffffff', '#ffffff'] },
  { id: 'xray', name: 'X-ray', hint: 'See-through faces to look inside', edges: true, faces: 'xray', background: ['#f4f6f8', '#ffffff'] },
  { id: 'mono', name: 'Monochrome', hint: 'Light grey shaded faces with edges', edges: true, faces: 'mono', background: ['#ffffff', '#f1f1f1'] },
  { id: 'sketchy', name: 'Sketchy', hint: 'Hand-drawn pencil lines on paper', edges: true, background: ['#f7f3ea', '#f7f3ea'] },
]

export function getViewStyle(id: string | undefined): ViewStyleInfo {
  return VIEW_STYLES.find((s) => s.id === id) ?? VIEW_STYLES[0]
}

const edgeFragment = /* glsl */ `
uniform sampler2D normalBuffer;
uniform vec3 lineColor;
uniform float jitter;
uniform float paper;
uniform float thickness;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// 1 / view depth is linear across a flat surface in screen space, so its second difference is zero on
// faces and large at creases and silhouettes, at any viewing angle.
float invZ(vec2 uv) {
  float d = readDepth(uv);
  if (d >= 0.99999) return 0.0;
  return -1.0 / getViewZ(d);
}

vec3 normalAt(vec2 uv) { return texture2D(normalBuffer, uv).xyz * 2.0 - 1.0; }

float edgeAt(vec2 uv, float px) {
  vec2 dx = vec2(texelSize.x * px, 0.0);
  vec2 dy = vec2(0.0, texelSize.y * px);
  float c = invZ(uv);
  float l = invZ(uv - dx), r = invZ(uv + dx), u = invZ(uv + dy), b = invZ(uv - dy);
  float bg = step(c, 0.0) + step(l, 0.0) + step(r, 0.0) + step(u, 0.0) + step(b, 0.0);
  // Object against the sky: always a profile line.
  if (bg > 0.0 && bg < 5.0) return 1.0;
  if (c <= 0.0) return 0.0;
  float lap = max(abs(l + r - 2.0 * c), abs(u + b - 2.0 * c)) / c;
  float depthEdge = smoothstep(0.012, 0.03, lap);
  vec3 n = normalAt(uv);
  float k = min(min(dot(n, normalAt(uv - dx)), dot(n, normalAt(uv + dx))), min(dot(n, normalAt(uv + dy)), dot(n, normalAt(uv - dy))));
  float normalEdge = 1.0 - smoothstep(0.8, 0.92, k);
  return max(depthEdge, normalEdge);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 p = uv;
  if (jitter > 0.0) {
    vec2 q = uv * resolution / 18.0;
    p += (vec2(noise(q), noise(q + 31.7)) - 0.5) * texelSize * jitter;
  }
  float e = edgeAt(p, thickness);
  // Sketchy: lines fade in and out along their length like pencil strokes.
  if (jitter > 0.0) e *= 0.55 + 0.45 * noise(uv * resolution / 6.0);
  vec3 base = inputColor.rgb;
  if (paper > 0.0) {
    float grain = noise(uv * resolution / 2.0) * 0.06 + noise(uv * resolution / 40.0) * 0.05;
    base = mix(base, vec3(0.97, 0.95, 0.9), 0.25 * paper) - grain * paper;
  }
  outputColor = vec4(mix(base, lineColor, clamp(e, 0.0, 1.0)), inputColor.a);
}
`

export class SketchEdgesEffect extends Effect {
  constructor() {
    super('SketchEdgesEffect', edgeFragment, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['normalBuffer', new THREE.Uniform(null)],
        ['lineColor', new THREE.Uniform(new THREE.Color('#1d1d1f'))],
        ['jitter', new THREE.Uniform(0)],
        ['paper', new THREE.Uniform(0)],
        ['thickness', new THREE.Uniform(1)],
      ]),
    })
  }
}

/** Edge and profile lines; put it inside an EffectComposer created with enableNormalPass. */
export function SketchEdges({ sketchy, thickness = 1 }: { sketchy?: boolean; thickness?: number }) {
  const ctx = use(EffectComposerContext)
  const effect = useMemo(() => new SketchEdgesEffect(), [])
  useEffect(() => {
    const u = effect.uniforms
    u.get('normalBuffer')!.value = ctx?.normalPass?.texture ?? null
    u.get('jitter')!.value = sketchy ? 2.6 : 0
    u.get('paper')!.value = sketchy ? 1 : 0
    u.get('thickness')!.value = thickness
    ;(u.get('lineColor')!.value as THREE.Color).set(sketchy ? '#3b3a38' : '#1d1d1f')
  }, [effect, ctx, sketchy, thickness])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} />
}

/** Vertical sky gradient used as the background of edge styles. */
export function GradientBackground({ top, bottom }: { top: string; bottom: string }) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const prev = scene.background
    scene.background = tex
    invalidate()
    return () => {
      scene.background = prev
      tex.dispose()
    }
  }, [scene, top, bottom, invalidate])
  return null
}

/**
 * Swaps every mesh's material for a plain one (white, grey or see-through) while a style that needs it
 * is active. The scene is rebuilt when the style changes, so originals don't need restoring.
 */
export function StyleMaterials({ faces }: { faces: NonNullable<ViewStyleInfo['faces']> }) {
  const mats = useMemo(() => {
    const solid =
      faces === 'white'
        ? new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
        : faces === 'mono'
          ? new THREE.MeshLambertMaterial({ color: '#e9e9e7', side: THREE.DoubleSide })
          : new THREE.MeshLambertMaterial({ color: '#dfe7ef', transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    const glass = new THREE.MeshBasicMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.25, depthWrite: false })
    return { solid, glass }
  }, [faces])
  useFrame(({ scene }) => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || o.userData.keepMaterial) return
      const first = Array.isArray(m.material) ? m.material[0] : m.material
      if (first === mats.solid || first === mats.glass) return
      const transparent = !!first && first.transparent && first.opacity < 0.9
      m.material = transparent ? mats.glass : mats.solid
    })
  })
  useEffect(
    () => () => {
      mats.solid.dispose()
      mats.glass.dispose()
    },
    [mats],
  )
  return null
}
