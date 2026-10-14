import type { UNet } from 'oidn-web'

/**
 * AI denoising with Intel Open Image Denoise (the denoiser of Blender, V-Ray and Corona), run on the
 * GPU through WebGPU by oidn-web. Given the noisy path-traced image plus the surface colors (albedo)
 * and directions (normals), it reconstructs a clean image from a few samples. Needs a browser with
 * WebGPU (Chrome or Edge); elsewhere the tracer keeps its simpler smoothing filter.
 */

let loading: Promise<UNet | null> | null = null

export function loadAiDenoiser(): Promise<UNet | null> {
  loading ??= (async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null
    const { initUNetFromURL } = await import('oidn-web')
    // Weights: Intel's "rt_hdr_alb_nrm" model (Apache 2.0), served from public/oidn.
    return initUNetFromURL(`${import.meta.env.BASE_URL}oidn/rt_hdr_alb_nrm.tza`, undefined, { aux: true, hdr: true })
  })().catch((e) => {
    console.warn('AI denoiser unavailable, using the basic filter:', e)
    return null
  })
  return loading
}

/** Denoises an HDR image (RGBA floats, already exposed) with its albedo and normal images. */
export function aiDenoise(unet: UNet, color: Float32Array, albedo: Uint8ClampedArray<ArrayBuffer>, normal: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): { result: Promise<Float32Array>; abort: () => void } {
  let abort = () => {}
  const result = new Promise<Float32Array>((resolve, reject) => {
    abort = unet.tileExecute({
      color: { data: color, width, height },
      albedo: new ImageData(albedo, width, height),
      normal: new ImageData(normal, width, height),
      done: (out) => resolve(out.data),
      error: reject,
    })
  })
  return { result, abort }
}
