import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { skpHelper } from './server/skpHelper.ts'

// Relative base so the build works from any sub-path (GitHub Pages, Vercel, a plain folder).
export default defineConfig(({ mode }) => {
  // Local settings such as SKETCHUP_SDK_DIR live in .env.local (not committed).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [react(), skpHelper(env.SKETCHUP_SDK_DIR)],
  }
})
