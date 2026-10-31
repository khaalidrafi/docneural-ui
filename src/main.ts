import '../styles/docneural-ui.css'
import { mount } from 'svelte'
import Demo from './Demo.svelte'

// EXPLICIT DARK ARM (theme-boot hardening, real-browser sweep 2026-10-31):
// the very first paint must already carry a resolved data-theme attribute —
// never a frame of unset theme. The CSS keeps a `:root:not([data-theme])`
// fallback for no-JS crawlers, but with JS on, the attribute is set HERE,
// synchronously, before mount() renders anything: stored choice first
// (toggleTheme persists it), else the system preference, else dark. The
// media-query arm can no longer disagree with the toggle arm.
const root = document.documentElement
if (!root.dataset.theme) {
  let stored: string | null = null
  try {
    stored = localStorage.getItem('docneural:theme')
  } catch {
    /* private mode */
  }
  const systemLight =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
  root.dataset.theme = stored === 'light' || stored === 'dark' ? stored : systemLight ? 'light' : 'dark'
}

// Playground entry: mounts the theme against sample fixtures in
// public/sample/ (what a site build would produce). See README.org.
mount(Demo, { target: document.getElementById('app')! })
