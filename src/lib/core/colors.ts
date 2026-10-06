// Deterministic node colors — ported verbatim in behavior from
// org-roam-lite-ui (src/lib/graph/colors.ts). A node's color is a stable
// function of its first tag (or title when untagged), so the graph looks
// organized without shipping any theme payload across the wire, and colors
// survive sorting/reloading. 50% lightness stays readable on both page modes.

export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) | 0
    h = (h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function nodeColor(node: { title: string; tags: string[] }): string {
  const seed = node.tags[0] ?? node.title
  const hue = hashString(seed) % 360
  return `hsl(${hue}, 55%, 50%)`
}
