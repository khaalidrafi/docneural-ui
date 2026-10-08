// Shared data contract between the host site (org-docs-website's export
// pipeline) and the theme. The theme never talks to Emacs: everything it
// needs is two static artifacts —
//
//   <base>/graph.json   — the full doc graph (nodes + links, with context)
//   <base>/docs/slug.html — one Org-exported HTML <body> fragment per doc
//
// NotePreview fetches the fragment over plain HTTP; that replaces the
// `getText` WebSocket frame org-roam-lite-ui sends from Emacs.

/** One doc = one graph node. `slug` keys both the URL path and graph.json.
 *
 *  The exporter also rides the Org manual's Info structure along as optional
 *  fields so the reader can behave like a real documentation site without
 *  ever parsing Org:
 *  - `up`/`next`/`prev` are the node ids of the Info navigation header, the
 *    chapter's parent and its neighbours (only the ~20 real chapters carry
 *    these; they give us breadcrumbs, the chapter tree and prev/next).
 *  - `redirect` marks an "indirectly referenced" stub — a file with no body
 *    of its own that only points at a section inside a real doc. The reader
 *    follows it to `docs/<slug>.html#<anchor>` instead of showing a stub. */
export type DocNode = {
  id: string
  slug: string
  title: string
  /** First tag drives deterministic node color (see colors.ts). */
  tags: string[]
  up?: string
  next?: string
  prev?: string
  /** Heading-less leaf (an Info "indirectly referenced" node). True for
   *  every stub, whether or not `redirect` resolved — this is what keeps
   *  stubs out of the reader's chapter tree. */
  stub?: boolean
  redirect?: { slug: string; anchor?: string | null }
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
