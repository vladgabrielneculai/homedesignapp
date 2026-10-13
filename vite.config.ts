import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any sub-path (GitHub Pages, Vercel, a plain folder).
export default defineConfig({
  base: './',
  plugins: [react()],
})
