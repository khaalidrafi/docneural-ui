// Canvas colour resolution — the shim's copy of org-roam-lite-ui's
// orui/graph/colors contract, as docneural-ui depends on it.
//
// THE CONTRACT (see docneural-ui/src/lib/core/source.ts, whose parity test
// imports these three symbols through the orui/* alias):
//
//   1. hashString is djb2 seeded at 5381, abs() at the end. docneural-ui's
//      own hashString must stay byte-identical to this one — that equality is
//      what makes a source's DOM chip and its canvas neurons the same colour.
//   2. canvasTokens(get) reads the container's COMPUTED style through the
//      `get` callback: `--orui-node-palette` (comma-separated literal list —
//      canvas fillStyle cannot parse var()/color-mix(), so consumers must
//      bridge resolved values, never var() chains) and `--orui-link-color`.
//   3. nodeColor(node, tokens) = palette[djb2(node.tags[0]) % len].
//      An empty palette falls back to the link colour (or a neutral grey) so
//      an unthemed container paints something instead of throwing.
export type CanvasTokens = {
  palette: string[]
  link: string
}

export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function canvasTokens(get: (name: string) => string): CanvasTokens {
  const palette = (get('--orui-node-palette') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const link = (get('--orui-link-color') ?? '').trim()
  return { palette, link }
}

const NEUTRAL = '#9aa4b2'

/** Anything with a `tags` array; callers pass whole node objects, so the
 *  parameter accepts extra fields (title, id, degree…) without complaint. */
export type ColorableNode = { tags?: string[]; [k: string]: unknown }

export function nodeColor(
  node: ColorableNode | undefined | null,
  tokens: CanvasTokens | undefined | null
): string {
  const palette = tokens?.palette ?? []
  if (!palette.length) return tokens?.link || NEUTRAL
  const tag = node?.tags?.[0] ?? ''
  return palette[hashString(tag) % palette.length]
}
