// Synapt app state. Svelte 5 runes module — this class *is* the store.
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

import type { DocNode, GraphData } from './types'
import { filteredGraph, localGraph, nodeViews, type NodeView } from './graph'

export type Mode = 'graph' | 'reader'

export class SynaptStore {
  /** URL prefix serving graph.json + docs/*.html. */
  base: string

  /** Extra-lite tier (org-roam-lite-ui's): no canvas, no filters, reader
   *  only. Set from ?lite=1 or low deviceMemory; components check this
   *  BEFORE touching GraphView so the force-graph chunk is never fetched. */
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

  // Graph-mode UI filter state (ported from org-roam-lite-ui filters).
  query = $state('')
  tags = $state<string[]>([])

  // Fetched doc bodies, keyed by slug. '' while loading, null on 404.
  bodies = $state<Map<string, string | null>>(new Map())
  // In-flight fetches, so double-clicks share one request.
  private inflight = new Map<string, Promise<string | null>>()

  constructor(base = '.', lite = false) {
    this.base = base.replace(/\/+$/, '')
    this.lite = lite
  }

  /** Load graph.json once; then honor the deep link in the URL if present. */
  async load(): Promise<void> {
    try {
      const res = await fetch(`${this.base}/graph.json`)
      if (!res.ok) throw new Error(`graph.json: HTTP ${res.status}`)
      this.data = (await res.json()) as GraphData
      this.ready = true
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

  get views(): Map<string, NodeView> {
    return nodeViews(this.data)
  }

  /** What the synapses canvas shows. */
  get visible(): GraphData {
    return filteredGraph(this.data, this.query, this.tags)
  }

  /** Neighborhood of the selected doc for the side panels. */
  get local(): GraphData | null {
    return this.selected ? localGraph(this.data, this.selected.id) : null
  }

  byId(id: string | undefined): DocNode | undefined {
    return id ? this.data.nodes.find((n) => n.id === id) : undefined
  }

  bySlug(slug: string): DocNode | undefined {
    return this.data.nodes.find((n) => n.slug === slug)
  }

  /** Content chapters (a node that is not a heading-less leaf stub is a real
   *  page), in reading order: walk Info's `next` chain from each head (a
   *  chapter no other chapter links `next` into), then walk any leftovers
   *  (side chains). */
  get chapters(): DocNode[] {
    const content = this.data.nodes.filter((n) => !n.stub)
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
    for (const n of content) if (!targeted.has(n.id)) walk(n)
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
  goto(doc: DocNode, mode?: Mode): void {
    if (mode) this.mode = mode
    const requested = doc.slug
    if (doc.redirect) {
      const home = this.bySlug(doc.redirect.slug)
      if (home) {
        this.selected = home
        this.anchor = doc.redirect.anchor ?? null
        this.origin = doc
        this.setUrl(requested)
        void this.body(home.slug)
        return
      }
    }
    this.selected = doc
    this.anchor = null
    this.origin = null
    this.setUrl(requested)
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

  private setUrl(slug: string | null): void {
    const url = new URL(location.href)
    if (slug) url.searchParams.set('doc', slug)
    else url.searchParams.delete('doc')
    history.replaceState(null, '', url)
  }

  /** Read ?doc=<slug> on first paint; absent/unknown → stay on Home. */
  private selectFromUrl(): void {
    const slug = new URLSearchParams(location.search).get('doc')
    const doc = slug ? this.bySlug(slug) : undefined
    if (doc) this.goto(doc)
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

  setMode(mode: Mode): void {
    // Lite machines can't opt into the canvas by deep link either.
    if (this.lite && mode === 'graph') return
    this.mode = mode
  }
}
