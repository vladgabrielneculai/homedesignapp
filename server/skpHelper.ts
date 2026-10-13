import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { SkpApi } from './skp/api.ts'

/**
 * Local helper that opens SketchUp (.skp) files for the app. It runs inside the Vite server on your
 * own computer (npm run dev / npm run preview) and uses the official SketchUp SDK, which you download
 * yourself and point to with SKETCHUP_SDK_DIR in .env.local. Nothing is sent anywhere else.
 *
 *   GET  /api/skp/status   → { ok, message }
 *   POST /api/skp/import   body: the .skp file → a .glb model; size and name in the X-Skp-Info header
 */

const MAX_BYTES = 400 * 1024 * 1024

/** `createApi` replaces the real SDK (used for testing on machines without it). */
export function skpHelper(sdkDir: string | undefined, createApi?: () => Promise<SkpApi>): Plugin {
  let api: Promise<SkpApi> | null = null
  const load = () => {
    if (createApi) return (api ??= createApi())
    if (!sdkDir) throw new Error('Set SKETCHUP_SDK_DIR in .env.local to the folder of the SketchUp SDK (see README), then restart npm run dev.')
    api ??= import('./skp/sdk.ts').then((m) => m.loadSketchUpApi(sdkDir))
    api.catch(() => (api = null))
    return api
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BYTES) {
          reject(new Error('The file is too large (over 400 MB).'))
          req.destroy()
        } else parts.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(parts)))
      req.on('error', reject)
    })

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0]
    if (url === '/api/skp/status' && req.method === 'GET') {
      try {
        await load()
        return json(res, 200, { ok: true, message: 'SketchUp SDK ready.' })
      } catch (e) {
        return json(res, 200, { ok: false, message: e instanceof Error ? e.message : String(e) })
      }
    }
    if (url === '/api/skp/import' && req.method === 'POST') {
      let dir: string | null = null
      try {
        const body = await readBody(req)
        if (body.length < 64) throw new Error('The file is empty.')
        const sdk = await load()
        const { convertSkp } = await import('./skp/convert.ts')
        dir = mkdtempSync(path.join(tmpdir(), 'skp-import-'))
        const file = path.join(dir, 'model.skp')
        writeFileSync(file, body)
        const rawName = decodeURIComponent(String(req.headers['x-file-name'] ?? 'SketchUp model'))
        const result = convertSkp(sdk, file, rawName.replace(/\.skp$/i, ''))
        res.statusCode = 200
        res.setHeader('Content-Type', 'model/gltf-binary')
        res.setHeader('X-Skp-Info', encodeURIComponent(JSON.stringify({ name: result.name, size: result.size, triangles: result.triangles })))
        res.end(result.glb)
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) })
      } finally {
        if (dir) rmSync(dir, { recursive: true, force: true })
      }
      return
    }
    next()
  }

  return {
    name: 'skp-helper',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next))
    },
  }
}
