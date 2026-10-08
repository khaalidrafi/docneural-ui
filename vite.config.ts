import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

// The site's graph mode reuses org-roam-lite-ui's real store + GraphView +
// filters (Layer 2).  orui is a SIBLING repo with no npm package, so alias
// `orui/*` -> ../org-roam-lite-ui/src/lib/*.  orui modules use RELATIVE internal
// imports, so this one alias resolves its whole subtree; '..' in fs.allow lets
// vite read the sibling.  The site's own vite.config mirrors this alias.
const ORUI_LIB = fileURLToPath(new URL('../org-roam-lite-ui/src/lib/', import.meta.url))

export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: [{ find: /^orui\/(.+)$/, replacement: `${ORUI_LIB}$1` }] },
  server: { fs: { allow: ['..'] } },
  test: {
    // Pure logic (graph.ts + the store's chapter/redirect/search contract)
    // runs headless in node — no jsdom on this 4 GB box. Only the reader
    // COMPONENTS need a DOM, and they are verified in a real browser instead.
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
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
