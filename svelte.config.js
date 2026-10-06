// Svelte config: vitePreprocess lets <script lang="ts"> blocks in .svelte
// files type-check and compile (same setup as org-roam-lite-ui).
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess()
}
