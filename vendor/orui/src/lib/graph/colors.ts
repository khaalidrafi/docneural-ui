// Deterministic node colors. No external palette needed: a node's color is a
// stable function of its first tag (or title when untagged), so the graph looks
// organized without shipping theme data, and colors survive re-sorts.
//
// A canvas CANNOT read CSS, which was the one theming hole the rest of the UI
// did not have: every DOM rule follows the --orui-* custom properties, so the
// graph was the only part of an embed that ignored the page's theme.
// `canvasTokens` closes that by reading the same properties (through a getter,
// so this stays testable without a style engine), and `nodeColor` then means —
//
//   --orui-node-palette: #a, #b, #c   categorical colours; the tag hash indexes in
//   --orui-node-color: #888           one flat colour for every node
//   neither                           the hsl() tag hash below (the default)
//
// Palette wins over flat: a theme that sets both is saying "use my categories,
// and here is the colour for whatever has no category".
//
// hashString must never change: it is why a node keeps its colour across a
// reload, and a page's saved palette depends on the index it produced.

/** djb2 string hash — tiny, stable across sessions. */
export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** The canvas colours a page's CSS asks for. `link` is never empty. */
export interface CanvasTokens {
  /** Colours from `--orui-node-palette`; empty when unset. */
  palette: string[]
  /** `--orui-node-color`, or null when unset. */
  flat: string | null
  /** `--orui-link-color`, with the historical grey as its fallback. */
  link: string
}

export const DEFAULT_LINK_COLOR = 'rgba(110,110,110,0.5)'

/**
 * A dimmed copy of a canvas colour, for paint that must read as "weaker" than
 * the real thing (GraphView draws co-citation edges — synthetic links the UI
 * itself computed — dashed at reduced strength so they never look like real
 * wires). Alpha is MULTIPLIED, not replaced: an already-half-transparent
 * default like the grey above lands near a fifth, not at opaque-ish 0.45.
 *
 * Same no-validation stance as parsePalette: the only consumers are hex
 * (#rgb / #rrggbb / #rrggbbaa) and rgb()/rgba() strings, since a theme sets
 * --orui-link-color with exactly that. Anything else (oklch(), color-mix())
 * is returned UNCHANGED — the dash still carries the difference, and a strict
 * parser here would dim perfection into a wrong colour.
 */
export function dimColor(color: string, dim = 0.45): string {
  const blended = (a: number): string => String(Math.round(a * dim * 1000) / 1000)
  let m = color.match(/^#([0-9a-f]+)$/i)
  if (m) {
    const h = m[1]
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a = 'f'] = h.split('')
      return `rgba(${parseInt(r + r, 16)},${parseInt(g + g, 16)},${parseInt(b + b, 16)},${blended(parseInt(a + a, 16) / 255)})`
    }
    if (h.length === 6 || h.length === 8) {
      const take = (i: number): number => parseInt(h.slice(i, i + 2), 16)
      const a = h.length === 8 ? take(6) / 255 : 1
      return `rgba(${take(0)},${take(2)},${take(4)},${blended(a)})`
    }
  }
  m = color.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    const [r, g, b] = parts
    const a = parts.length >= 4 ? parts[3] : 1
    return `rgba(${r},${g},${b},${blended(a)})`
  }
  return color
}

/**
 * Split a comma list of colours. No validation, deliberately: the value only
 * ever reaches canvas `fillStyle`, which ignores what it cannot parse, and a
 * strict checker here would reject colours (oklch(), color-mix(), var() chains)
 * that the canvas handles fine. Empty items are dropped so "#a, ,#b" indexes 0..1.
 */
export function parsePalette(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

/**
 * Read the canvas tokens through `get` — the caller's way of reaching one
 * custom property, e.g. `(name) => getComputedStyle(el).getPropertyValue(name)`.
 * Taking the reader instead of an element keeps this pure.
 */
export function canvasTokens(get: (name: string) => string): CanvasTokens {
  return {
    palette: parsePalette(get('--orui-node-palette')),
    flat: get('--orui-node-color').trim() || null,
    link: get('--orui-link-color').trim() || DEFAULT_LINK_COLOR
  }
}

/**
 * Colour for one node. No `tokens` = the built-in hsl tag hash, which is what a
 * page that sets nothing gets. 50% lightness keeps nodes readable on both light
 * and dark page themes.
 */
export function nodeColor(
  node: { title: string; tags: string[] },
  tokens?: CanvasTokens
): string {
  const seed = node.tags[0] ?? node.title
  const hash = hashString(seed)
  if (tokens?.palette.length) return tokens.palette[hash % tokens.palette.length]
  if (tokens?.flat) return tokens.flat
  return `hsl(${hash % 360}, 55%, 50%)`
}
