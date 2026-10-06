// Shared data contract between the host site (org-docs-website's export
// pipeline) and the theme. The theme never talks to Emacs: everything it
// needs is two static artifacts —
//
//   <base>/graph.json   — the full doc graph (nodes + links, with context)
//   <base>/docs/slug.html — one Org-exported HTML <body> fragment per doc
//
// NotePreview fetches the fragment over plain HTTP; that replaces the
// `getText` WebSocket frame org-roam-lite-ui sends from Emacs.

/** One doc = one graph node. `slug` keys both the URL path and graph.json. */
export type DocNode = {
  id: string
  slug: string
  title: string
  /** First tag drives deterministic node color (see colors.ts). */
  tags: string[]
}

/** source links TO target; `context` is the source line around the link,
 *  shown in backlink lists (org-roam-style). */
export type DocLink = {
  source: string
  target: string
  context?: string
}

export type GraphData = {
  nodes: DocNode[]
  links: DocLink[]
}
