import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Keep the canvas engine in its own chunk: pages paint before the
        // graph sim ever starts (same trick as org-roam-lite-ui).
        manualChunks: { graph: ['force-graph'] }
      }
    }
  }
})
