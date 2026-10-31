// Shared data contract between the host site (org-docs' export
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
 *  shown in backlink lists (org-roam-style). `kind: 'cocite'` marks a
 *  SYNTHETIC edge the UI itself computed (a co-citation: two chapters cited
 *  together by the corpus) — never a corpus wire — so the graph can paint
 *  it differently (dashed, dimmed) instead of passing it off as real.
 *  `kind: 'bridge'` marks a RECOVERED cross-manual wire (core/bridges.ts):
 *  a literal text reference the xref miner found in one manual's prose that
 *  points into another manual. Also painted dashed (in the mined hue) with
 *  its evidence — a recovered match states where it came from, never
 *  masquerades as an export link. */
export type DocLink = {
  source: string
  target: string
  context?: string
  kind?: 'cocite' | 'bridge'
  /** Every recovered citing line, when more than one hit mined the same
   *  pair (the deduped bridge keeps them all — SPEC §5). */
  provenance?: string[]
}

export type GraphData = {
  nodes: DocNode[]
  links: DocLink[]
}

/** A hover/long-press peek card, already measured by the reader: where the
 *  pointer is and which wire it is on. `why` is NOT stored here on purpose —
 *  the citation sentence arrives with the ctx file, so the card reads it from
 *  the store and updates the moment it lands. See reader/LinkPeek.svelte. */
export type Peek = {
  x: number
  y: number
  fromId: string
  toId: string
  degree: number
}

/** The three graph layouts, named from the visitor's question. `cluster` keeps
 *  force-graph's own defaults and shows how a corpus hangs together; `spread`
 *  pushes every node far enough from its neighbours that its title can be
 *  read; `lattice` pins every neuron to a fixed-distance grid cell (Owner law
 *  2026-10-28: "ALL nodes will maintain a fixed distance so that the overview
 *  can be seen clearly other than crowded clusters") — deterministic,
 *  simulation-free, spacing IS the message. Lives here (not in
 *  graph/neuronEngine.ts) because the store must name it without importing
 *  the canvas module into the boot chunk. */
export type LayoutMode = 'cluster' | 'spread' | 'lattice'
