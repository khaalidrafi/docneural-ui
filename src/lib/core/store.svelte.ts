// Docneural app state. Svelte 5 runes module — this class *is* the store.
//
// org-roam-lite-ui receives graph snapshots and note text over a WebSocket
// from Emacs. The hosted theme has no Emacs: it loads one static
// `graph.json`, then fetches per-doc HTML fragments on demand. Everything
// else (modes, filters, selection) mirrors the old UI so users who know
// org-roam-ui feel at home.
//
// Docs-first: the site OPENS on the written word (reader/Home), and the
// org-roam graph is an enhancement we brand "synapses". Selection always
// resolves to a real content chapter — stub nodes (an Info section that has
// no page of its own) are transparently followed to their canonical home.

import type { DocLink, DocNode, GraphData, LayoutMode } from './types'
import { coCitations, dedupeGraphTags, egoGraph, filteredGraph, localGraph, nodeViews, type NodeView } from './graph'
import { sourceColor, sourceTitle } from './source'
import { loadLastRead, saveLastRead } from './lastRead'
import { loadLayout, writeLayout } from './layout'
import { loadSaved, writeSaved, type SavedMark } from './saved'

export type Mode = 'graph' | 'reader'

/* Ego-graph tuning. Two hops is the honest ceiling: a third hop over 29,017
   wires reaches the whole corpus, which is the hairball that makes a graph
   view answer nothing. Co-citations are capped because a hub chapter (the Org
   variable index has 1,122 synapses) would otherwise push 60 dashed edges
   into a 40-node view. */
const EGO_HOPS = 2
const COCITE_CAP = 8

export class DocneuralStore {
  /** URL prefix serving graph.json + docs/*.html. */
  base: string

  /** Extra-lite tier (org-roam-lite-ui's): no canvas, no filters, reader
   *  only. Explicit opt-in ONLY — the `lite` prop, ?lite=1, or the FULL/FAST
   *  header toggle. There is no deviceMemory auto-downgrade: it silently
   *  removed the SYNAPSES tab on low-memory Android phones, which is where
   *  the graph view was wanted most. Components check this BEFORE touching
   *  GraphView so a requested lite session never fetches the force-graph
   *  chunk. */
  lite: boolean

  data = $state<GraphData>({ nodes: [], links: [] })
  ready = $state(false)
  failed = $state<string | null>(null)

  /** Reader is the front door; synapses (the roam graph) is opt-in. */
  mode = $state<Mode>('reader')

  /** The chapter on screen — always a content node, never a stub. */
  selected = $state<DocNode | undefined>(undefined)
  /** Heading to scroll to inside `selected` (set when a stub redirects), or
   *  null. Consumed once by the reader so it does not re-scroll on redraw. */
  anchor = $state<string | null>(null)
  /** The node the reader actually asked for when it differs from `selected`
   *  (a redirected stub) — used to label the breadcrumb with its real title. */
  origin = $state<DocNode | null>(null)

  /** Where the reader stopped, mirrored from localStorage (core/lastRead.ts).
   *  The mirror exists because Home's `--resume` line must appear the moment
   *  you click back to the front door, and localStorage is not reactive. */
  lastRead = $state<{ slug: string; anchor: string | null } | null>(loadLastRead())

  /** The "ask the corpus" overlay (reader/AskPanel.svelte). Lives on the
   *  store so the command palette, the reader toolbar and a future header
   *  button all open the same panel over any surface. BYOK: the endpoint
   *  and key are the visitor's own (core/ai.ts); the store carries only the
   *  open flag, never the config. */
  aiOpen = $state(false)
  /** Record a reading position: the reactive copy and the durable one. */
  notePosition(slug: string, anchor: string | null): void {
    if (!this.lastRead || this.lastRead.slug !== slug || this.lastRead.anchor !== anchor) {
      this.lastRead = { slug, anchor }
      saveLastRead(slug, anchor)
    }
  }

  /** Sections the reader marked (core/saved.ts), mirrored into reactive state
   *  for the same reason lastRead is: Home paints the list, and storage does
   *  not notify. Newest first — the order the `b` key produces. */
  saved = $state<SavedMark[]>(loadSaved())
  /** `b` — mark the section you are under, or drop it if already marked.
   *  Returns whether it is now saved so the toast can say the right verb. */
  toggleSaved(slug: string, anchor: string | null, title: string): boolean {
    const mark: SavedMark = { slug, anchor: anchor ?? null, title, at: 0 }
    this.saved = writeSaved(this.saved, mark)
    return !this.saved.some((m) => m.slug === slug && m.anchor === mark.anchor)
  }
  isSaved(slug: string, anchor: string | null): boolean {
    return this.saved.some((m) => m.slug === slug && m.anchor === (anchor ?? null))
  }

  // Graph-mode UI filter state (ported from org-roam-lite-ui filters).
  query = $state('')
  tags = $state<string[]>([])

  /** Canvas scope. `ego` = around the chapter being read (see `visible`);
   *  `corpus` = every node the filters pass. A chip in graph mode flips it,
   *  and `ego` with no selection is simply the corpus, so the default can
   *  never show an empty canvas. */
  scope = $state<'ego' | 'corpus'>('ego')
  toggleScope(): void {
    this.scope = this.scope === 'ego' ? 'corpus' : 'ego'
  }

  /** Canvas physics. `cluster` is force-graph's own default and shows that a
   *  corpus hangs together; `spread` spaces every node by the width of its own
   *  title, so an overview can be READ instead of admired. The store only
   *  names the mode — the forces live in graph/neuronEngine.ts, which is in
   *  the lazy canvas chunk and must not be imported from here. */
  layout = $state<LayoutMode>(loadLayout())
  toggleLayout(): void {
    // Three questions, one button: packed clusters (shape) -> spread (titles
    // readable) -> lattice (fixed distance, Owner law 2026-10-28) -> packed.
    this.layout =
      this.layout === 'cluster' ? 'spread' : this.layout === 'spread' ? 'lattice' : 'cluster'
    writeLayout(this.layout)
  }

  /** Docs ticked in the sidebar. Non-empty means the synapses canvas shows
   *  exactly these docs (plus the wires between them) — a hand-built local
   *  graph, and the mobile-friendly way to scope the hairball. */
  checked = $state<string[]>([])
  toggleChecked(id: string): void {
    this.checked = this.checked.includes(id)
      ? this.checked.filter((x) => x !== id)
      : [...this.checked, id]
  }
  clearChecked(): void {
    this.checked = []
  }

  /** The manual the reader's TOC shows. This is a doc AGGREGATOR (Emacs,
   *  Guix, Org, ...), but a human reads one manual at a time: the exporter
   *  stamps every node's FIRST tag with its manual, and the chapter tree +
   *  Home contents grid scope to this value. '' = show everything (single
   *  corpus, or graph data without manual tags). */
  manual = $state('')

  /** Every manual present in the corpus, in scan order (the exporter walks
   *  the corpus manual by manual, so node order groups them). */
  get manuals(): string[] {
    const seen = new Set<string>()
    for (const n of this.data.nodes) if (n.tags[0]) seen.add(n.tags[0])
    return [...seen]
  }

  /** Reader-facing name for a corpus: "org" -> "Org", "emacs" -> "GNU Emacs".
   *  Deliberately NOT "<x> Manual" — this site aggregates docs from arbitrary
   *  projects, and a project's real name is the label, not a suffix we invent.
   *  Lives in core/source.ts so the graph's colour and this name come from the
   *  same tag. */
  static manualTitle(m: string): string {
    return sourceTitle(m)
  }

  /** The hue one corpus wears — identical to the colour its nodes get on the
   *  synapses canvas (see core/source.ts). */
  static manualHue(m: string): string | null {
    return sourceColor(m)
  }

  /** Everything known about each corpus, for the Home source strip and the
   *  header readout: real pages (stubs excluded, same rule as `chapters`),
   *  and the synapses that touch them. */
  get sources(): { name: string; pages: number; links: number; hue: string | null }[] {
    const pages = new Map<string, number>()
    const idToSource = new Map<string, string>()
    for (const n of this.data.nodes) {
      const m = n.tags[0] ?? ''
      idToSource.set(n.id, m)
      if (!n.stub) pages.set(m, (pages.get(m) ?? 0) + 1)
    }
    const links = new Map<string, number>()
    for (const l of this.data.links) {
      // Count a wire once, under the corpus it starts from; a cross-source
      // citation is the interesting case, and it shows up as a wire on both
      // sides, which is the honest reading.
      const m = idToSource.get(l.source) ?? ''
      links.set(m, (links.get(m) ?? 0) + 1)
    }
    return this.manuals.map((m) => ({
      name: m,
      pages: pages.get(m) ?? 0,
      links: links.get(m) ?? 0,
      hue: sourceColor(m)
    }))
  }

  /** Point the TOC at a manual; if a chapter is open, jump to that manual's
   *  first chapter (a dead TOC on another manual's page is worse than a
   *  page change). From Home there is no selection: only the list switches. */
  showManual(name: string): void {
    this.manual = name
    if (this.selected) {
      const first = this.chapters[0]
      if (first) this.goto(first)
    }
  }

  // Fetched doc bodies, keyed by slug. '' while loading, null on 404.
  bodies = $state<Map<string, string | null>>(new Map())
  // In-flight fetches, so double-clicks share one request.
  private inflight = new Map<string, Promise<string | null>>()

  constructor(base = '.', lite = false) {
    this.base = base.replace(/\/+$/, '')
    this.lite = lite
  }

  /** Boot payload: the slim pass ships graph.json in three sizes — brotli
   *  (76 kB on the manuals corpus), gzip, and the plain JSON dev/preview
   *  middleware always negotiated server-side. Static hosts like GitHub
   *  Pages serve files verbatim with NO Content-Encoding, so the walk is
   *  client-side now: fetch the .br, decompress with DecompressionStream,
   *  fall back to .gz, then to the plain artifact. Same origin, no extra
   *  boot request beyond the one that succeeds. */
  async fetchGraph(): Promise<GraphData> {
    const attempts: Array<[string, 'br' | 'gzip' | null]> = [
      ['graph.json.br', 'br'],
      ['graph.json.gz', 'gzip'],
      ['graph.json', null],
    ]
    let lastErr: unknown
    for (const [file, encoding] of attempts) {
      try {
        const res = await fetch(`${this.base}/${file}`)
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
        if (!encoding) return (await res.json()) as GraphData
        if (typeof res.arrayBuffer !== 'function') {
          throw new Error(`${file}: no arrayBuffer (mocked response?)`)
        }
        // lib.dom's CompressionFormat predates browsers accepting 'br';
        // the runtime (Chromium 103+, Firefox 113+) takes it fine.
        const buf = await res.arrayBuffer()
        if (encoding && typeof DecompressionStream === 'function') {
          const stream = new Response(buf).body
          if (!stream) throw new Error(`${file}: no body`)
          const text = await new Response(
            stream.pipeThrough(new DecompressionStream(encoding as 'gzip'))
          ).text()
          return JSON.parse(text) as GraphData
        }
        if (encoding) throw new Error(`${file}: DecompressionStream unavailable`)
        return JSON.parse(new TextDecoder().decode(buf)) as GraphData
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  }

  /** Load graph.json once; then honor the deep link in the URL if present. */
  async load(): Promise<void> {
    try {
      // Ingest normalization (dedupeGraphTags): the exporter can ride the same
      // tag twice onto one node, and a keyed `{#each doc.tags (tag)}` throws
      // `each_key_duplicate` on the first duplicate — the shipped corpus has
      // one on every node, which killed the graph-mode note preview. One
      // pure pass at the single ingest point fixes every consumer.
      this.data = dedupeGraphTags(await this.fetchGraph())
      this.ready = true
      // The size-aware layout default needs the corpus size, so it lands
      // here (the constructor ran before any fetch). A saved preference
      // already won inside loadLayout; this only fills the first visit.
      let savedLayout: string | null = null
      try {
        savedLayout = localStorage.getItem('docneural:layout')
      } catch {
        /* private mode */
      }
      if (!savedLayout) {
        this.layout = loadLayout(this.data.nodes.length)
      }
      // Home opens on the first manual's contents (the exporter scans
      // manuals in --doc order); a deep link below overrides via goto().
      if (!this.manual) this.manual = this.manuals[0] ?? ''
    } catch (e) {
      this.failed = e instanceof Error ? e.message : String(e)
      return
    }
    this.selectFromUrl()
    // Deep-link into the canvas: ?mode=graph (read once at load; a lite
    // machine is refused by setMode). Shareable entry into the synapses
    // view — and what lets a headless browser exercise graph mode by URL.
    if (new URLSearchParams(location.search).get('mode') === 'graph') {
      this.setMode('graph')
    }
  }

  /** Indexes over the loaded graph, rebuilt only when the graph object is
   *  replaced — once per load. They exist because these lookups are on the
   *  hot path (every hover, click, palette keystroke, pager step), and a
   *  linear scan of 1,559 nodes per pointerover is the kind of cost a Celeron
   *  reader actually feels. */
  private idx: {
    src: GraphData | null
    views: Map<string, NodeView>
    nodes: Map<string, DocNode>
    slugs: Map<string, DocNode>
  } = { src: null, views: new Map(), nodes: new Map(), slugs: new Map() }

  private index() {
    if (this.idx.src !== this.data) {
      const nodes = new Map<string, DocNode>()
      const slugs = new Map<string, DocNode>()
      for (const n of this.data.nodes) {
        nodes.set(n.id, n)
        if (!slugs.has(n.slug)) slugs.set(n.slug, n) // first wins: a corpus can
        // legitimately contain two nodes with the same slug (an Info Top and its
        // file), and the reader must not flicker between them.
      }
      this.idx = { src: this.data, views: nodeViews(this.data), nodes, slugs }
    }
    return this.idx
  }

  get views(): Map<string, NodeView> {
    return this.index().views
  }

  /** What the synapses canvas shows: query+tags filter first, then the
   *  sidebar tick list (when non-empty) narrows to exactly those docs and
   *  the wires between them.
   *
   *  In `ego` scope (the default) it narrows further to the two-hop
   *  neighbourhood of the chapter you are reading, plus its co-citations: the
   *  graph then answers the question a reader actually arrived with — what is
   *  connected to THIS — instead of painting 1,559 dots. `corpus` is one click
   *  away, so nothing is hidden, only ordered.
   *
   *  DERIVED, not a getter. This walks the whole link list — egoGraph, then
   *  filteredGraph, then coCitations — so as a plain getter every read paid
   *  for it again, and the canvas reads it several times per frame (rail,
   *  chips, GraphView props). On a search keystroke that was ~8 passes over
   *  29k links per repaint. As a derived it recomputes exactly once, when one
   *  of its five inputs changes, and every reader shares the result. */
  visible = $derived.by(() => {
    const g = filteredGraph(
      this.scope === 'ego' && this.selected
        ? egoGraph(this.data, this.selected.id, EGO_HOPS)
        : this.data,
      this.query,
      this.tags
    )
    if (this.scope === 'ego' && this.selected) this.cociteInto(g, this.selected.id)
    if (!this.checked.length) return g
    const keep = new Set(this.checked)
    return {
      nodes: g.nodes.filter((n) => keep.has(n.id)),
      links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target))
    }
  })

  /** Add the co-citation wires to an ego graph, in place. They are synthetic
   *  (the corpus never claims a link that is not there), so each is tagged
   *  `kind: 'cocite'` — which is what the graph engine reads to paint them
   *  dashed and dimmed, so a synthetic edge never masquerades as a real wire —
   *  and carries its evidence as `context`, exactly the field the rail and the
   *  note preview print, so a dashed-looking edge explains itself on click. */
  private cociteInto(g: GraphData, centerId: string): void {
    const inGraph = new Set(g.nodes.map((n) => n.id))
    for (const [id, shared] of coCitations(this.data, centerId, COCITE_CAP)) {
      if (!inGraph.has(id)) continue // only edges we can draw both ends of
      if (g.links.some((l) => (l.source === centerId && l.target === id) ||
                               (l.source === id && l.target === centerId))) continue
      g.links.push({
        source: centerId,
        target: id,
        context: `co-cited: ${shared} chapter${shared === 1 ? '' : 's'} cite both`,
        kind: 'cocite'
      })
    }
  }

  /** Neighborhood of the selected doc for the side panels. */
  get local(): GraphData | null {
    return this.selected ? localGraph(this.data, this.selected.id) : null
  }

  byId(id: string | undefined): DocNode | undefined {
    return id ? this.index().nodes.get(id) : undefined
  }

  bySlug(slug: string): DocNode | undefined {
    return this.index().slugs.get(slug)
  }

  /** Content chapters (a node that is not a heading-less leaf stub is a real
   *  page) of the ACTIVE manual, in reading order: walk Info's `next` chain
   *  from each head (a chapter no other chapter links `next` into) in id
   *  order, then walk
   *  any leftovers (side chains). Untagged nodes always show — single-corpus
   *  data carries no manual tag, and per-manual grouping is the exporter's
   *  first tag. */
  get chapters(): DocNode[] {
    const content = this.data.nodes.filter(
      (n) => !n.stub && (!this.manual || !n.tags[0] || n.tags[0] === this.manual)
    )
    const inSet = new Set(content.map((n) => n.id))
    const targeted = new Set(content.map((n) => n.next).filter(Boolean) as string[])
    const seen = new Set<string>()
    const order: DocNode[] = []
    const walk = (start: DocNode) => {
      let cur: DocNode | undefined = start
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        order.push(cur)
        cur = cur.next && inSet.has(cur.next) ? this.byId(cur.next) : undefined
      }
    }
    // Heads walked in ID order, not array order: ids are
    // `<manual>--<file>', so a manual's Info Top node (id `emacs', whose
    // `next' the exporter wires to the real first chapter) sorts before
    // every fragment head and the manual opens at its cover, not at
    // "Abbrev Concepts". The exporter's --reading-order sorts the same
    // way -- the two must agree or llms-full.txt and the reader diverge.
    const heads = content
      .filter((n) => !targeted.has(n.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const n of heads) walk(n)
    for (const n of content) if (!seen.has(n.id)) walk(n)
    return order
  }
  /** Ancestor chain for breadcrumbs, nearest-first, excluding `self`.
   *  The Org manual's real chapters have no resolvable `up` (the synthetic
   *  top node isn't a file), so this is short; the in-page TOC does the rest. */
  ancestorsOf(doc: DocNode): DocNode[] {
    const chain: DocNode[] = []
    const seen = new Set<string>([doc.id])
    let cur = this.byId(doc.up)
    while (cur && !seen.has(cur.id)) {
      chain.push(cur)
      seen.add(cur.id)
      cur = this.byId(cur.up)
    }
    return chain
  }

  prevChapter(): DocNode | undefined {
    return this.contentSibling(this.selected?.prev)
  }
  nextChapter(): DocNode | undefined {
    return this.contentSibling(this.selected?.next)
  }
  private contentSibling(id: string | undefined): DocNode | undefined {
    // Same rule as `chapters`: a stub is not a page, so the pager never
    // lands on one — a chain that continues only through a stub reads as
    // ended here (the stub's own content lives at its redirect target,
    // which the `next` field does not name).
    const n = this.byId(id)
    return n && !n.stub ? n : undefined
  }

  /** Navigate to a doc, transparently following a stub's redirect.
   *  The URL keeps the slug the reader asked for, so ?doc=<stub> stays a
   *  valid, shareable deep link even though a different chapter renders. */
  goto(doc: DocNode, mode?: Mode, anchor?: string | null): void {
    if (mode) this.mode = mode
    // Opening a doc retargets the TOC to its manual — the sidebar you see
    // is the one containing the page you are reading (a palette jump from
    // Org to Emacs carries the whole TOC along with it).
    if (doc.tags[0]) this.manual = doc.tags[0]
    const requested = doc.slug
    // An explicit anchor wins over a stub's redirect target: it is the
    // heading a copied link was made from, and the reader asked for it.
    if (doc.redirect) {
      const home = this.bySlug(doc.redirect.slug)
      if (home) {
        this.selected = home
        this.anchor = anchor ?? doc.redirect.anchor ?? null
        this.origin = doc
        this.setUrl(requested, anchor)
        void this.body(home.slug)
        return
      }
    }
    this.selected = doc
    this.anchor = anchor ?? null
    this.origin = null
    this.setUrl(requested, anchor)
    void this.body(doc.slug)
  }

  /** Back to the welcome screen: reader mode, nothing selected, no deep link. */
  goHome(): void {
    this.mode = 'reader'
    this.selected = undefined
    this.origin = null
    this.anchor = null
    this.setUrl(null)
  }

  private setUrl(slug: string | null, anchor?: string | null): void {
    const url = new URL(location.href)
    if (slug) url.searchParams.set('doc', slug)
    else url.searchParams.delete('doc')
    // The heading goes in the hash so a copied link is a real deep link: it
    // names the section even after the query string is stripped, and a paste
    // into a chat shows `#Agenda-Views` where the reader stopped.
    url.hash = anchor ? `#${encodeURIComponent(anchor)}` : ''
    history.replaceState(null, '', url)
  }

  /** Read ?doc=<slug>[#anchor] on first paint; absent/unknown → stay on Home. */
  private selectFromUrl(): void {
    const slug = new URLSearchParams(location.search).get('doc')
    const doc = slug ? this.bySlug(slug) : undefined
    if (!doc) return
    let anchor: string | null = null
    try {
      anchor = decodeURIComponent(location.hash.slice(1)) || null
    } catch {
      /* a hand-typed % in the hash is not worth losing the page over */
    }
    this.goto(doc, undefined, anchor)
  }

  /** Case-insensitive title search over every node (palette + rail filter). */
  search(q: string, limit = 0): DocNode[] {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const hits: DocNode[] = []
    for (const n of this.data.nodes) {
      if (n.title.toLowerCase().includes(needle)) {
        hits.push(n)
        if (limit && hits.length >= limit) break
      }
    }
    return hits
  }

  /** Cached fetch of one Org-exported HTML fragment; null if missing. */
  body(slug: string): Promise<string | null> {
    const cached = this.bodies.get(slug)
    if (cached !== undefined) return Promise.resolve(cached)
    const pending = this.inflight.get(slug)
    if (pending) return pending
    const p = (async () => {
      try {
        const res = await fetch(`${this.base}/docs/${slug}.html`)
        const html = res.ok ? await res.text() : null
        this.bodies.set(slug, html)
        // Re-assign so Map mutations trip $state reads.
        this.bodies = new Map(this.bodies)
        return html
      } catch {
        this.bodies.set(slug, null)
        return null
      } finally {
        this.inflight.delete(slug)
      }
    })()
    this.inflight.set(slug, p)
    return p
  }

  /** Warm the fragment cache for pages the reader is about to click, so the
   *  next chapter paints from memory. Bounded and polite: a few at a time,
   *  never on a metered/slow link, and `body()` already de-duplicates, so a
   *  prefetch that the reader then clicks is one request, not two. */
  prefetch(slugs: string[]): void {
    if (this.saveData) return
    for (const s of slugs.slice(0, 8)) void this.body(s)
  }

  /** Save-Data header, or a connection the browser thinks is slow. Chrome
   *  reports `saveData` and `effectiveType`; other browsers give no hint, in
   *  which case we still prefetch (it is 8 fragments, not the corpus). */
  get saveData(): boolean {
    const c = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (!c) return false
    return !!c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g'
  }

  // Citation prose, fetched per node from `ctx/<id>.json`. graph.json used to
  // carry the sentence around every wire — 69% of its bytes — to render a
  // dozen of them in the rail. Slim builds (see scripts/slim-graph.mjs) drop
  // the field and the rail asks for the one node it is showing; a fat build
  // still works because ctxFor() falls back to the inline context.
  contexts = $state<Map<string, Record<string, string>>>(new Map())
  private ctxInflight = new Map<string, Promise<void>>()

  loadContext(id: string): void {
    if (this.contexts.has(id) || this.ctxInflight.has(id)) return
    const p = (async () => {
      try {
        const res = await fetch(`${this.base}/ctx/${id}.json`)
        if (res.ok) {
          this.contexts.set(id, (await res.json()) as Record<string, string>)
          this.contexts = new Map(this.contexts)
        }
      } catch {
        /* no prose for this node; the rail shows the link without it */
      } finally {
        this.ctxInflight.delete(id)
      }
    })()
    this.ctxInflight.set(id, p)
    void p
  }

  /** The sentence around one wire: lazy file first, inline field as fallback. */
  ctxFor(l: DocLink): string | undefined {
    const key = `${l.source}>${l.target}`
    return (
      this.contexts.get(l.source)?.[key] ??
      this.contexts.get(l.target)?.[key] ??
      l.context
    )
  }

  /** (source>target) -> the link itself, built once per loaded graph.
   *  A hover peek has to answer in the same tick as the pointer, and there
   *  are 29,017 links: scanning them per pointerover is not an answer. Keyed
   *  in both directions because the reader hovers a wire in whichever
   *  direction the prose wrote it.
   *
   *  Invalidation compares the ARRAY IDENTITY, never a length: a corpus that
   *  has both A->B and B->A writes fewer than 2*len keys (they collide), so a
   *  size check would rebuild all 29,017 of them on every single hover. */
  private wireIndex = new Map<string, DocLink>()
  private wireIndexSrc: DocLink[] | null = null
  wire(a: string, b: string): DocLink | undefined {
    if (this.wireIndexSrc !== this.data.links) {
      this.wireIndex = new Map()
      for (const l of this.data.links) {
        this.wireIndex.set(`${l.source}>${l.target}`, l)
        this.wireIndex.set(`${l.target}>${l.source}`, l)
      }
      this.wireIndexSrc = this.data.links
    }
    return this.wireIndex.get(`${a}>${b}`)
  }

  setMode(mode: Mode): void {
    // Lite machines can't opt into the canvas by deep link either.
    if (this.lite && mode === 'graph') return
    this.mode = mode
  }
}
