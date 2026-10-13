import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import type { LiveView } from './Viewer3D'

/**
 * Photo-realistic stills of a live 3D view, path traced with three-gpu-pathtracer: light bounces
 * around the rooms, the sky lights the interior through the windows, shadows are soft and glossy
 * surfaces reflect their surroundings. Samples accumulate until the target count is reached.
 */

const SKY_SCALE = 0.08

export interface PhotoOptions {
  width: number
  height: number
  samples: number
}

export interface PhotoProgress {
  phase: 'preparing' | 'rendering' | 'done'
  samples: number
  total: number
}

export interface PhotoJob {
  stop: () => void
  dispose: () => void
  /** Edge-aware smoothing of the remaining grain (display only; the samples are untouched). */
  setDenoise: (on: boolean) => void
}

/** The sky as a cube map (without the sun disc: the sun is the directional light). */
function skyCube(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): THREE.WebGLCubeRenderTarget {
  const sky = new Sky()
  sky.scale.setScalar(1800)
  const u = sky.material.uniforms
  u.turbidity.value = 4
  u.rayleigh.value = 1.2
  u.mieCoefficient.value = 0.004
  u.mieDirectionalG.value = 0.8
  u.cloudCoverage.value = 0.25
  u.cloudDensity.value = 0.5
  u.cloudElevation.value = 0.6
  u.showSunDisc.value = 0
  u.sunPosition.value.copy(sunDir).multiplyScalar(1000)
  const scene = new THREE.Scene()
  scene.add(sky)
  const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false })
  new THREE.CubeCamera(1, 4000, target).update(renderer, scene)
  sky.material.dispose()
  sky.geometry.dispose()
  return target
}

/**
 * The path tracer gives each mesh one material, so a mesh with a material per group (wall faces) would
 * shift every later mesh onto the wrong material. Split such meshes into one mesh per group.
 */
function splitMultiMaterial(mesh: THREE.Mesh) {
  const mats = mesh.material as THREE.Material[]
  const geo = mesh.geometry
  const index = geo.index
  if (!index || !mesh.parent) return
  for (const group of geo.groups) {
    const material = mats[group.materialIndex ?? 0]
    if (!material || group.count === 0) continue
    const part = geo.clone()
    part.clearGroups()
    part.setIndex(new THREE.BufferAttribute(index.array.slice(group.start, group.start + group.count), 1))
    const m = new THREE.Mesh(part, material)
    m.position.copy(mesh.position)
    m.quaternion.copy(mesh.quaternion)
    m.scale.copy(mesh.scale)
    m.userData = { ...mesh.userData }
    mesh.parent.add(m)
  }
  mesh.removeFromParent()
}

/** A copy of the live scene the path tracer can use: no sky mesh, no fog, lights with valid targets. */
function photoScene(view: LiveView): THREE.Scene {
  const scene = view.scene.clone()
  const drop: THREE.Object3D[] = []
  const multi: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && Array.isArray((o as THREE.Mesh).material)) multi.push(o as THREE.Mesh)
    if (o.userData.isSkyDome || (o as THREE.LineSegments).isLineSegments || !o.visible) drop.push(o)
    const light = o as THREE.DirectionalLight
    if (light.isDirectionalLight) light.target.updateMatrixWorld(true)
    // Ceilings are one-sided (invisible from above in the live view); the path tracer would let
    // sunlight straight through them, so make them solid from both sides.
    const mesh = o as THREE.Mesh
    // Small glowing surfaces (lamp shades) are only hit by chance and leave bright speckles that take
    // ages to clear. By day the lamps are off; at night their point lights do the lighting, so a
    // gentler glow is enough.
    const std = mesh.material as THREE.MeshStandardMaterial
    if (mesh.isMesh && !Array.isArray(mesh.material) && std.emissive && std.emissiveIntensity > 0 && std.emissive.getHex() !== 0) {
      const m = std.clone()
      m.emissiveIntensity = view.sun.night ? Math.min(m.emissiveIntensity, 0.8) : 0
      mesh.material = m
    }
    if (o.userData.isCeiling && mesh.isMesh) {
      const m = (mesh.material as THREE.Material).clone()
      m.side = THREE.DoubleSide
      mesh.material = m
    }
  })
  for (const o of drop) o.removeFromParent()
  for (const m of multi) splitMultiMaterial(m)
  scene.fog = null
  return scene
}

/**
 * Measures the rendered image's brightness and picks an exposure that puts the scene's average (log)
 * luminance at middle grey, ignoring the brightest few percent (windows, lamps) like a camera does.
 */
class ExposureMeter {
  readings = 0
  private target = new THREE.WebGLRenderTarget(64, 40, { type: THREE.FloatType })
  private quad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
    }),
  )

  exposure(renderer: THREE.WebGLRenderer, source: THREE.Texture): number {
    this.readings++
    const mat = this.quad.material as THREE.ShaderMaterial
    mat.uniforms.map.value = source
    const prev = renderer.getRenderTarget()
    const prevTone = renderer.toneMapping
    renderer.toneMapping = THREE.NoToneMapping
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
    renderer.setRenderTarget(prev)
    renderer.toneMapping = prevTone
    const px = new Float32Array(64 * 40 * 4)
    renderer.readRenderTargetPixels(this.target, 0, 0, 64, 40, px)
    const lum: number[] = []
    for (let i = 0; i < px.length; i += 4) lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])
    lum.sort((a, b) => a - b)
    const kept = lum.slice(0, Math.floor(lum.length * 0.95))
    const logAvg = Math.exp(kept.reduce((s, l) => s + Math.log(1e-4 + l), 0) / Math.max(1, kept.length))
    return Math.max(0.4, Math.min(30, 0.2 / logAvg))
  }

  dispose() {
    this.target.dispose()
    this.quad.material.dispose()
    this.quad.dispose()
  }
}

export async function startPhoto(view: LiveView, canvas: HTMLCanvasElement, opts: PhotoOptions, onProgress: (p: PhotoProgress) => void): Promise<PhotoJob> {
  onProgress({ phase: 'preparing', samples: 0, total: opts.samples })
  const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer')
  // Let the dialog paint "Preparing…" before the (synchronous) scene build.
  await new Promise((r) => setTimeout(r, 30))

  const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false })
  renderer.setPixelRatio(1)
  renderer.setSize(opts.width, opts.height, false)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = photoScene(view)
  const sky = skyCube(renderer, view.sun.dir)
  scene.background = sky.texture
  scene.environment = sky.texture
  // The sky shader's radiance is tuned for display; scaled down, clear-sky light on the ground is roughly a
  // third of direct sunlight, as outdoors. At night the sky is nearly black and the lamps do the work.
  scene.environmentIntensity = SKY_SCALE
  scene.backgroundIntensity = SKY_SCALE
  // Starting exposure; refined from the image itself once the first samples are in (see autoExposure).
  renderer.toneMappingExposure = 1.5

  const camera = view.camera.clone()
  camera.aspect = opts.width / opts.height
  camera.updateProjectionMatrix()

  const tracer = new WebGLPathTracer(renderer)
  tracer.bounces = 6
  tracer.transmissiveBounces = 6
  tracer.filterGlossyFactor = 0.5
  tracer.minSamples = 1
  tracer.renderDelay = 0
  tracer.fadeDuration = 0
  tracer.tiles.set(2, 2)
  tracer.setScene(scene, camera)

  // Smooth the grain while it lasts: strong on the first samples, fading as the image converges.
  let denoise = true
  const denoiser = new DenoiseMaterial({ kSigma: 2 })
  const denoiseQuad = new FullScreenQuad(denoiser)
  tracer.renderToCanvasCallback = (target, r, quad) => {
    const autoClear = r.autoClear
    r.autoClear = false
    if (denoise) {
      const s = Math.max(1, tracer.samples)
      denoiser.map = target.texture
      denoiser.sigma = Math.max(1, 5 / Math.sqrt(s / 16))
      // Edge threshold in display terms (so it behaves the same at any exposure), loosened while the
      // image is still very grainy so speckles aren't mistaken for edges.
      denoiser.threshold = Math.max(0.1, 0.6 / Math.sqrt(s / 4)) / r.toneMappingExposure
      denoiseQuad.render(r)
    } else quad.render(r)
    r.autoClear = autoClear
  }

  let raf = 0
  let stopped = false
  const meter = new ExposureMeter()
  const tick = () => {
    if (stopped) return
    tracer.renderSample()
    const samples = Math.floor(tracer.samples)
    // Meter early, then once more on a cleaner image, like a camera's auto exposure.
    if ((samples === 3 && meter.readings === 0) || (samples === 16 && meter.readings === 1)) {
      renderer.toneMappingExposure = meter.exposure(renderer, tracer.target.texture)
      tracer.renderSample() // redraw the canvas with the new exposure
    }
    if (samples >= opts.samples) {
      onProgress({ phase: 'done', samples, total: opts.samples })
      return
    }
    onProgress({ phase: 'rendering', samples, total: opts.samples })
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      cancelAnimationFrame(raf)
    },
    setDenoise: (on) => {
      denoise = on
      // Redraw the current image without adding a sample.
      const p = tracer.pausePathTracing
      tracer.pausePathTracing = true
      tracer.renderSample()
      tracer.pausePathTracing = p
    },
    dispose: () => {
      stopped = true
      cancelAnimationFrame(raf)
      tracer.dispose()
      meter.dispose()
      denoiser.dispose()
      denoiseQuad.dispose()
      sky.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
