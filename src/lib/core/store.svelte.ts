// Mycelium app state. Svelte 5 runes module — this class *is* the store.
//
// org-roam-lite-ui receives graph snapshots and note text over a WebSocket
// from Emacs. The hosted theme has no Emacs: it loads one static
// `graph.json`, then fetches per-doc HTML fragments on demand. Everything
// else (modes, filters, selection) mirrors the old UI so users who know
// org-roam-ui feel at home.

import type { DocNode, GraphData } from './types'
import { filteredGraph, localGraph, nodeViews, type NodeView } from './graph'

export type Mode = 'graph' | 'reader'

export class MyceliumStore {
  /** URL prefix serving graph.json + docs/*.html. */
  base: string

  data = $state<GraphData>({ nodes: [], links: [] })
  ready = $state(false)
  failed = $state<string | null>(null)

  mode = $state<Mode>('graph')

  /** Selected node (graph click / reader navigation). */
  selected = $state<DocNode | undefined>(undefined)

  // Graph-mode UI filter state (ported from org-roam-lite-ui filters).
  query = $state('')
  tags = $state<string[]>([])

  // Fetched doc bodies, keyed by slug. '' while loading, null on 404.
  bodies = $state<Map<string, string | null>>(new Map())
  // In-flight fetches, so double-clicks share one request.
  private inflight = new Map<string, Promise<string | null>>()

  constructor(base = '.') {
    this.base = base.replace(/\/+$/, '')
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
  }

  get views(): Map<string, NodeView> {
    return nodeViews(this.data)
  }

  /** What the graph canvas shows. */
  get visible(): GraphData {
    return filteredGraph(this.data, this.query, this.tags)
  }

  /** Neighborhood of the selected doc for the side panels. */
  get local(): GraphData | null {
    return this.selected ? localGraph(this.data, this.selected.id) : null
  }

  byId(id: string): DocNode | undefined {
    return this.data.nodes.find((n) => n.id === id)
  }

  bySlug(slug: string): DocNode | undefined {
    return this.data.nodes.find((n) => n.slug === slug)
  }

  /** Navigate to a doc: select, remember in URL, fetch its body. */
  goto(doc: DocNode, mode?: Mode): void {
    this.selected = doc
    if (mode) this.mode = mode
    // Deep-link form: ?doc=<slug> — refresh-safe and shareable.
    const url = new URL(location.href)
    url.searchParams.set('doc', doc.slug)
    history.replaceState(null, '', url)
    void this.body(doc.slug)
  }

  private selectFromUrl(): void {
    const slug = new URLSearchParams(location.search).get('doc')
    const doc = slug ? this.bySlug(slug) : undefined
    if (doc) this.goto(doc)
    else if (this.data.nodes.length > 0) this.selected = this.data.nodes[0]
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
    this.mode = mode
  }
}
