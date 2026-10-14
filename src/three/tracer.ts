import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import type { WebGLPathTracer } from 'three-gpu-pathtracer'
import type { UNet } from 'oidn-web'
import { aiDenoise, loadAiDenoiser } from './aiDenoise'
import type { SunState } from './Outdoors'

/**
 * Path tracing of the design (three-gpu-pathtracer): light bounces between surfaces, daylight comes in
 * through the windows from the real sky, shadows are soft and glossy surfaces reflect their
 * surroundings. Used for Photo renders and for the live "Ray-traced" view, which refines the image
 * whenever the camera stops moving.
 */

/** What the tracer needs from a live 3D view. */
export interface TraceSource {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: SunState
}

const SKY_SCALE = 0.08

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

/** Average sky radiance seen sideways (what comes in through a window), in the tracer's units. */
function skyAverage(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): THREE.Color {
  const sky = new Sky()
  sky.scale.setScalar(1800)
  const u = sky.material.uniforms
  u.turbidity.value = 4
  u.rayleigh.value = 1.2
  u.mieCoefficient.value = 0.004
  u.mieDirectionalG.value = 0.8
  u.showSunDisc.value = 0
  u.sunPosition.value.copy(sunDir).multiplyScalar(1000)
  const scene = new THREE.Scene()
  scene.add(sky)
  const N = 16
  const target = new THREE.WebGLCubeRenderTarget(N, { type: THREE.FloatType, generateMipmaps: false })
  new THREE.CubeCamera(1, 4000, target).update(renderer, scene)
  const px = new Float32Array(N * N * 4)
  const sum = new THREE.Color(0, 0, 0)
  let n = 0
  for (const face of [0, 1, 2, 4, 5]) {
    renderer.readRenderTargetPixels(target, 0, 0, N, N, px, face)
    for (let i = 0; i < px.length; i += 4) {
      sum.r += px[i]
      sum.g += px[i + 1]
      sum.b += px[i + 2]
      n++
    }
  }
  target.dispose()
  sky.material.dispose()
  sky.geometry.dispose()
  return sum.multiplyScalar(SKY_SCALE / Math.max(1, n))
}

/**
 * Indoors almost all daylight arrives through small windows, which random light paths rarely find, so
 * the image stays grainy for a long time. Like the "sky portals" of V-Ray or Corona, an area light the
 * size of each indoor window's glass, shining into the room with the sky's color, lets the tracer aim
 * at the windows directly. (Only when rooms have ceilings: from above the open sky lights everything.)
 */
function addSkyPortals(scene: THREE.Scene, sky: THREE.Color) {
  const ceilings: THREE.Object3D[] = []
  const glass: THREE.Mesh[] = []
  scene.traverse((o) => {
    if (o.userData.isCeiling) ceilings.push(o)
    if (o.userData.windowGlass) glass.push(o as THREE.Mesh)
  })
  if (!ceilings.length || !glass.length || sky.r + sky.g + sky.b < 1e-4) return
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  for (const g of glass) {
    const { w, h } = g.userData.windowGlass as { w: number; h: number }
    const center = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld)
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld)
    // The indoor side is the one with a ceiling above it.
    let inward: THREE.Vector3 | null = null
    for (const dir of [normal, normal.clone().negate()]) {
      ray.set(center.clone().addScaledVector(dir, 0.5), new THREE.Vector3(0, 1, 0))
      if (ray.intersectObjects(ceilings, false).length) {
        inward = dir
        break
      }
    }
    if (!inward) continue
    const light = new THREE.RectAreaLight(sky.clone(), 1, w, h)
    light.position.copy(center).addScaledVector(inward, 0.02)
    light.lookAt(center.clone().addScaledVector(inward, 1))
    scene.add(light)
  }
}

/** Removes isolated "fireflies": a pixel can't be brighter (or darker) than all of its neighbours. */
const fireflyMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec2 px = 1.0 / vec2(textureSize(map, 0));
        vec4 c = texture2D(map, vUv);
        vec3 lo = vec3(1e9);
        vec3 hi = vec3(0.0);
        for (int i = -1; i <= 1; i++)
          for (int j = -1; j <= 1; j++) {
            if (i == 0 && j == 0) continue;
            vec3 s = texture2D(map, vUv + vec2(float(i), float(j)) * px).rgb;
            lo = min(lo, s);
            hi = max(hi, s);
          }
        gl_FragColor = vec4(clamp(c.rgb, lo, hi), c.a);
      }
    `,
  })

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

const helper = (o: THREE.Object3D) => {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (x.userData.noPick) return true
  return false
}

/** A copy of the live scene the path tracer can use: no sky mesh, helpers or fog, lights with valid targets. */
function traceScene(src: TraceSource): THREE.Scene {
  const scene = src.scene.clone()
  const drop: THREE.Object3D[] = []
  const multi: THREE.Mesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && Array.isArray((o as THREE.Mesh).material)) multi.push(o as THREE.Mesh)
    // Meshes without vertices (geometry not attached yet, empty helpers) would break the scene build.
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null
    if (g && !(g.attributes.position?.count > 0)) drop.push(o)
    if (o.userData.isSkyDome || (o as THREE.LineSegments).isLineSegments || (o as THREE.Line).isLine || !o.visible || (o.userData.noPick && helper(o))) drop.push(o)
    // By day the lamps are off: their small lights only add speckles via glossy bounces.
    if ((o as THREE.PointLight).isPointLight && !src.sun.night) drop.push(o)
    const light = o as THREE.DirectionalLight
    if (light.isDirectionalLight) light.target.updateMatrixWorld(true)
    const mesh = o as THREE.Mesh
    // Small glowing surfaces (lamp shades) are only hit by chance and leave bright speckles that take
    // ages to clear. By day the lamps are off; at night their point lights do the lighting, so a
    // gentler glow is enough.
    const std = mesh.material as THREE.MeshStandardMaterial
    if (mesh.isMesh && !Array.isArray(mesh.material) && std.emissive && std.emissiveIntensity > 0 && std.emissive.getHex() !== 0) {
      const m = std.clone()
      m.emissiveIntensity = src.sun.night ? Math.min(m.emissiveIntensity, 0.8) : 0
      mesh.material = m
    }
    // Ceilings are one-sided (invisible from above in the live view); the path tracer would let
    // sunlight straight through them, so make them solid from both sides.
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
  private target = new THREE.WebGLRenderTarget(64, 40, { type: THREE.FloatType })
  private quad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
    }),
  )

  exposure(renderer: THREE.WebGLRenderer, source: THREE.Texture): number {
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

/** Sample counts at which the AI denoiser cleans up the image. */
const AI_STEPS = [6, 24, 96, 300, 600]

/**
 * Renders what the AI denoiser needs besides the noisy image: each pixel's surface color (albedo)
 * and surface direction (normal), so it can tell real edges and textures from noise.
 */
function renderGuides(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
  const target = new THREE.WebGLRenderTarget(w, h)
  const read = () => {
    const px = new Uint8Array(w * h * 4)
    renderer.readRenderTargetPixels(target, 0, 0, w, h, px)
    return new Uint8ClampedArray(px.buffer)
  }
  const prev = { target: renderer.getRenderTarget(), bg: scene.background, env: scene.environment, override: scene.overrideMaterial, tone: renderer.toneMapping }
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setRenderTarget(target)
  scene.background = null
  scene.environment = null
  // Albedo: every surface in its own flat, unlit color.
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  const flat = new Map<THREE.Material, THREE.Material>()
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    swapped.push([m, m.material])
    const toFlat = (mat: THREE.Material) => {
      let f = flat.get(mat)
      if (!f) {
        const std = mat as THREE.MeshStandardMaterial
        f = new THREE.MeshBasicMaterial({ color: std.color ?? new THREE.Color(1, 1, 1), map: std.map ?? null, vertexColors: std.vertexColors, side: THREE.DoubleSide })
        flat.set(mat, f)
      }
      return f
    }
    m.material = Array.isArray(m.material) ? m.material.map(toFlat) : toFlat(m.material)
  })
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  renderer.render(scene, camera)
  const albedo = read()
  for (const [m, mat] of swapped) m.material = mat
  for (const f of flat.values()) f.dispose()
  // Normals, as the standard normal material encodes them.
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
  scene.overrideMaterial = normalMat
  renderer.clear()
  renderer.render(scene, camera)
  const normal = read()
  normalMat.dispose()
  scene.overrideMaterial = prev.override
  scene.background = prev.bg
  scene.environment = prev.env
  renderer.toneMapping = prev.tone
  renderer.setRenderTarget(prev.target)
  target.dispose()
  return { albedo, normal }
}

const sameMatrix = (a: THREE.Matrix4, b: THREE.Matrix4) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-7)

export class TracerSession {
  readonly renderer: THREE.WebGLRenderer
  private tracer!: WebGLPathTracer
  private denoiser!: THREE.ShaderMaterial & { map: THREE.Texture | null; sigma: number; threshold: number }
  private denoiseQuad!: FullScreenQuad
  private firefly = new FullScreenQuad(fireflyMaterial())
  private clean = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private meter = new ExposureMeter()
  private sky: THREE.WebGLCubeRenderTarget | null = null
  private camera = new THREE.PerspectiveCamera()
  private readings = 0
  private scene: THREE.Scene | null = null
  // AI denoising: the current image "generation" (bumped whenever the picture restarts), the last
  // clean result and which generation it belongs to.
  private ai: UNet | null = null
  private generation = 0
  private aiStep = 0
  private aiBusy: (() => void) | null = null
  private guides: { gen: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer> } | null = null
  private cleanImage: { gen: number; texture: THREE.DataTexture } | null = null
  private cleanQuad = new FullScreenQuad(new THREE.MeshBasicMaterial())
  /** Called when an AI-denoised image is shown (with its sample count). */
  onAiImage: ((samples: number) => void) | null = null
  denoise = true
  /** Exposure carried over between camera moves so the image doesn't jump in brightness. */
  exposure = 1.5

  private constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false, alpha: true })
    this.renderer.setPixelRatio(1)
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  static async create(canvas: HTMLCanvasElement, width: number, height: number): Promise<TracerSession> {
    const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer')
    const s = new TracerSession(canvas)
    s.renderer.setSize(width, height, false)
    const tracer = new WebGLPathTracer(s.renderer)
    tracer.bounces = 6
    tracer.transmissiveBounces = 6
    tracer.filterGlossyFactor = 0.5
    tracer.minSamples = 1
    tracer.renderDelay = 0
    tracer.fadeDuration = 0
    tracer.rasterizeScene = false
    tracer.tiles.set(2, 2)
    s.tracer = tracer
    // Smooth the grain while it lasts: strong on the first samples, fading as the image converges.
    s.denoiser = new DenoiseMaterial({ kSigma: 2 }) as unknown as TracerSession['denoiser']
    s.denoiseQuad = new FullScreenQuad(s.denoiser)
    loadAiDenoiser().then((unet) => (s.ai = unet))
    tracer.renderToCanvasCallback = (target, r, quad) => {
      const autoClear = r.autoClear
      r.autoClear = false
      if (s.denoise && s.cleanImage && s.cleanImage.gen === s.generation) {
        // The AI-denoised image (already exposed) until a newer one is ready.
        const mat = s.cleanQuad.material as THREE.MeshBasicMaterial
        mat.map = s.cleanImage.texture
        const exposure = r.toneMappingExposure
        r.toneMappingExposure = 1
        s.cleanQuad.render(r)
        r.toneMappingExposure = exposure
      } else if (s.denoise) {
        const n = Math.max(1, tracer.samples)
        // Fireflies first (the smoothing below keeps edges, so it would keep them too)…
        if (s.clean.width !== target.width || s.clean.height !== target.height) s.clean.setSize(target.width, target.height)
        ;(s.firefly.material as THREE.ShaderMaterial).uniforms.map.value = target.texture
        const prev = r.getRenderTarget()
        r.setRenderTarget(s.clean)
        s.firefly.render(r)
        r.setRenderTarget(prev)
        // …then edge-aware smoothing, strong on the first samples and fading as the image converges.
        s.denoiser.map = s.clean.texture
        s.denoiser.sigma = Math.min(6, Math.max(1.2, 7 / Math.sqrt(n / 16)))
        // Edge threshold in display terms (so it behaves the same at any exposure), loosened while the
        // image is still grainy so noise isn't mistaken for edges.
        s.denoiser.threshold = Math.max(0.12, 1.1 / Math.sqrt(n / 4)) / r.toneMappingExposure
        s.denoiseQuad.render(r)
      } else quad.render(r)
      r.autoClear = autoClear
    }
    return s
  }

  get samples(): number {
    return Math.floor(this.tracer.samples)
  }

  setSize(width: number, height: number) {
    const cur = this.renderer.getSize(new THREE.Vector2())
    if (cur.x === width && cur.y === height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    this.tracer.updateCamera()
    this.restart()
  }

  /** (Re)builds the scene from the live view: geometry, materials, lights and the sky for this sun. */
  setScene(src: TraceSource) {
    const scene = traceScene(src)
    this.sky?.dispose()
    this.sky = skyCube(this.renderer, src.sun.dir)
    scene.background = this.sky.texture
    scene.environment = this.sky.texture
    // The sky shader's radiance is tuned for display; scaled down, clear-sky light on the ground is
    // roughly a third of direct sunlight, as outdoors. At night the sky is nearly black and the lamps
    // do the work.
    scene.environmentIntensity = SKY_SCALE
    scene.backgroundIntensity = SKY_SCALE
    if (!src.sun.night) addSkyPortals(scene, skyAverage(this.renderer, src.sun.dir))
    this.copyCamera(src.camera)
    this.tracer.setScene(scene, this.camera)
    this.scene = scene
    this.restart()
  }

  /** The picture starts over: forget metering readings and AI results that belong to the old one. */
  private restart() {
    this.readings = 0
    this.generation++
    this.aiStep = 0
    this.aiBusy?.()
    this.aiBusy = null
  }

  private copyCamera(cam: THREE.PerspectiveCamera) {
    const size = this.renderer.getSize(new THREE.Vector2())
    this.camera.copy(cam)
    this.camera.aspect = size.x / Math.max(1, size.y)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  /** Follows the live camera; returns true when it moved (the image restarts). */
  syncCamera(cam: THREE.PerspectiveCamera): boolean {
    cam.updateMatrixWorld()
    const moved = !sameMatrix(cam.matrixWorld, this.camera.matrixWorld) || Math.abs(cam.fov - this.camera.fov) > 1e-6
    if (!moved) return false
    this.copyCamera(cam)
    this.tracer.updateCamera()
    this.restart()
    return true
  }

  /** Adds one sample (and meters the exposure early on, like a camera's auto exposure). */
  step() {
    this.renderer.toneMappingExposure = this.exposure
    this.tracer.renderSample()
    const n = this.samples
    if ((n >= 3 && this.readings === 0) || (n >= 16 && this.readings === 1)) {
      this.readings++
      this.exposure = this.meter.exposure(this.renderer, this.tracer.target.texture)
      this.renderer.toneMappingExposure = this.exposure
      this.redraw()
    }
    if (this.denoise && this.ai && !this.aiBusy && this.aiStep < AI_STEPS.length && n >= AI_STEPS[this.aiStep]) {
      this.aiStep++
      this.runAi()
    }
  }

  /** Whether the AI denoiser is available on this device (WebGPU), once it has loaded. */
  get aiReady(): boolean {
    return !!this.ai
  }

  /** Runs the AI denoiser on the current image now (e.g. when a photo is finished). */
  denoiseNow() {
    if (this.ai && !this.aiBusy) this.runAi()
  }

  private runAi() {
    const unet = this.ai
    const scene = this.scene
    const target = this.tracer.target
    if (!unet || !scene) return
    const gen = this.generation
    const samples = this.samples
    const w = target.width
    const h = target.height
    const color = new Float32Array(w * h * 4)
    this.renderer.readRenderTargetPixels(target, 0, 0, w, h, color)
    // Feed the image as the camera exposes it, so mid-grey sits where the model expects.
    for (let i = 0; i < color.length; i += 4) {
      color[i] *= this.exposure
      color[i + 1] *= this.exposure
      color[i + 2] *= this.exposure
      color[i + 3] = 1
    }
    if (!this.guides || this.guides.gen !== gen) this.guides = { gen, ...renderGuides(this.renderer, scene, this.camera, w, h) }
    const job = aiDenoise(unet, color, this.guides.albedo, this.guides.normal, w, h)
    let cancelled = false
    this.aiBusy = () => {
      cancelled = true
      job.abort()
    }
    job.result.then(
      (out) => {
        if (cancelled) return
        this.aiBusy = null
        if (gen !== this.generation) return
        const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.FloatType)
        tex.minFilter = tex.magFilter = THREE.NearestFilter
        tex.needsUpdate = true
        this.cleanImage?.texture.dispose()
        this.cleanImage = { gen, texture: tex }
        this.redraw()
        this.onAiImage?.(samples)
      },
      (e) => {
        if (!cancelled) console.warn('AI denoising failed:', e)
        this.aiBusy = null
      },
    )
  }

  /** Redraws the current image without adding a sample (e.g. after toggling the denoiser). */
  redraw() {
    const p = this.tracer.pausePathTracing
    this.tracer.pausePathTracing = true
    this.tracer.renderSample()
    this.tracer.pausePathTracing = p
  }

  dispose() {
    this.aiBusy?.()
    this.cleanImage?.texture.dispose()
    ;(this.cleanQuad.material as THREE.Material).dispose()
    this.cleanQuad.dispose()
    this.tracer.dispose()
    this.meter.dispose()
    this.denoiser.dispose()
    this.denoiseQuad.dispose()
    this.firefly.material.dispose()
    this.firefly.dispose()
    this.clean.dispose()
    this.sky?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
