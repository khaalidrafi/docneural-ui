// Per-SOURCE identity: the colour and the display name of a documentation
// source (Org, GNU Emacs, GNU Guix, ...).
//
// This site aggregates docs from many projects, so "which source is this?" is
// the single most informative fact a UI element can carry. It gets one colour,
// and that colour is not invented here: org-roam-lite-ui paints a graph node
// with `palette[hashString(firstTag) % palette.length]` (see
// orui/graph/colors.ts), where `palette` is the literal comma list our theme
// carries as --dn-graph-palette. Hashing the same way against the same list
// means a source's chip, its tab, its heading sigil and its neurons on the
// canvas are provably ONE colour — no second palette to drift out of sync.
//
// hashString must stay byte-identical to orui's: it is what makes the DOM hue
// and the canvas hue agree, and changing either one silently decouples them.
//
// Colour reaches the DOM as an inline `--dn-src` custom property (CSS cannot
// compute a hash), and every rule in docneural-ui.css reads `var(--dn-src, ...)`
// with the theme accent as the fallback, so an element with no source still
// looks finished.

/** djb2 string hash — copied from orui/graph/colors.ts ON PURPOSE. Keep in step. */
export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Real project names for the corpora people actually export. Anything absent
 *  falls through to the humanizer below, so a new source still reads well —
 *  this list is polish, not a registry. */
const SOURCE_NAMES: Record<string, string> = {
  org: 'Org',
  emacs: 'GNU Emacs',
  guix: 'GNU Guix',
  'org-roam': 'Org Roam',
  python: 'Python',
  rust: 'Rust',
  nix: 'Nix',
  vim: 'Vim',
  git: 'Git',
  linux: 'Linux',
  svelte: 'Svelte',
  typescript: 'TypeScript',
  bash: 'Bash',
  guile: 'GNU Guile'
}

/** "guix" -> "GNU Guix"; "kubernetes" -> "Kubernetes"; "std_docs" -> "Std Docs".
 *  Underscores/dashes become word breaks, then each word capitalises — enough
 *  for a source nobody thought to name here. */
export function sourceTitle(tag: string | undefined): string {
  if (!tag) return ''
  const known = SOURCE_NAMES[tag.toLowerCase()]
  if (known) return known
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// --dn-graph-palette is read through getComputedStyle, which resolves the
// var()/theme cascade for us — so this returns the ACTIVE theme's list, and a
// theme flip changes the DOM hues the same way it changes the canvas: within
// the poll window. 500 ms matches GraphView's own canvas-token poll exactly,
// so the chips and the neurons never visibly disagree about when it is
// afternoon.
let parsed: { raw: string; colors: string[] } | null = null
let readAt = 0

/** The active theme's node palette, as literal colours, indexed 0..7. */
export function graphPalette(): string[] {
  if (typeof document === 'undefined') return []
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (!parsed || now - readAt > 500) {
    readAt = now
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--dn-graph-palette')
      .trim()
    // Reuse the previous array when the list did not change: components call
    // this per row, and a theme flip is the only event that invalidates it.
    if (parsed && parsed.raw === raw) return parsed.colors
    parsed = { raw, colors: raw.split(',').map((c) => c.trim()).filter(Boolean) }
  }
  return parsed.colors
}

/** The colour one source wears, everywhere. null when there is no palette to
 *  index (a theme that cleared it, or a headless test with no styles) — the
 *  caller then falls back to the theme accent, which is what `var(--dn-src,
 *  var(--dn-accent))` already does in CSS. */
export function sourceColor(tag: string | undefined): string | null {
  if (!tag) return null
  const p = graphPalette()
  if (!p.length) return null
  return p[hashString(tag) % p.length]
}

/** Inline `style` attribute value carrying the source hue for one element's
 *  subtree. Use as `style={sourceVars(m)}` on a container: every descendant
 *  rule that reads var(--dn-src) picks it up, so a card, its chip and its
 *  hover glow all take the source's colour from one attribute. */
export function sourceVars(tag: string | undefined): string {
  const c = sourceColor(tag)
  return c ? `--dn-src:${c}` : ''
}
