import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' så att sajten fungerar från valfri undermapp (t.ex. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  // MapLibre 6 laddar sin worker relativt sin egen modul; förbuntning bryter den sökvägen
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
