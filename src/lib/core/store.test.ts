// Unit tests for the store's docs-first contract: the chapter tree built from
// Info's `next` chain, transparent stub->canonical redirect, and the reader
// pager that must skip stubs. These run in node; the URL/fetch side of `goto`
// is exercised with tiny global stubs, not jsdom.
import { beforeEach, describe, expect, it } from 'vitest'
import { DocneuralStore } from './store.svelte'
import type { DocNode, GraphData } from './types'

function node(p: Partial<DocNode> & { id: string }): DocNode {
  return { slug: p.id, title: p.id, tags: [], ...p }
}

// One real chain c1 -> c2 -> c3; a side chapter c4 that points into a stub;
// and two stubs: `s` (unresolvable) and `r` (redirects to c2 with an anchor).
function fixture(): GraphData {
  const c1 = node({ id: 'c1', title: 'Chapter One', next: 'c2' })
  const c2 = node({ id: 'c2', title: 'Chapter Two', next: 'c3' })
  const c3 = node({ id: 'c3', title: 'Chapter Three' })
  const c4 = node({ id: 'c4', title: 'Side Chapter', next: 's' })
  const s = node({ id: 's', title: 'Leaf Stub', stub: true })
  const r = node({ id: 'r', title: 'Redirect Stub', stub: true, redirect: { slug: 'c2', anchor: 'Beamer' } })
  return { nodes: [c1, c2, c3, c4, s, r], links: [] }
}

// Minimal browser globals so `goto`'s setUrl/body can run under node.
let lastUrl = ''
let fetchCount = 0
beforeEach(() => {
  lastUrl = ''
  fetchCount = 0
  const g = globalThis as Record<string, unknown>
  g.location = { href: 'http://site.test/', search: '' }
  g.history = { replaceState: (_: unknown, __: string, url: URL) => { lastUrl = url.toString() } }
  g.fetch = () => {
    fetchCount++
    const body = JSON.stringify(fixture())
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve(JSON.parse(body))
    })
  }
})

describe('chapters', () => {
  it('excludes stubs and orders by the next-chain, heads first', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    const ids = store.chapters.map((n) => n.id)
    // Main chain walked from its head (c1); stubs (s, r) never appear.
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(ids).not.toContain('s')
    expect(ids).not.toContain('r')
  })
  it('walks chain heads in id order, so a manual Top opens first', () => {
    const store = new DocneuralStore()
    // Array order deliberately fights id order: the fragment head sorts
    // before the Top node in the array, but ids are `<manual>--<file>'
    // so the Top itself (bare manual id) must win the head walk. Without
    // this the Emacs manual opened at "Abbrev Concepts", not at its Top.
    store.data = {
      nodes: [
        node({ id: 'm--frag', title: 'Side Chain Start', tags: ['m'] }),
        node({ id: 'm', title: 'Top', tags: ['m'], next: 'm--intro' }),
        node({ id: 'm--intro', title: 'Introduction', tags: ['m'], next: 'm--body' }),
        node({ id: 'm--body', title: 'The Body', tags: ['m'] })
      ],
      links: []
    }
    store.manual = 'm'
    expect(store.chapters.map((n) => n.id)).toEqual(['m', 'm--intro', 'm--body', 'm--frag'])
  })
})

describe('contentSibling pager', () => {
  it('returns the next real chapter', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    store.selected = store.byId('c1')
    expect(store.nextChapter()?.id).toBe('c2')
    expect(store.prevChapter()).toBeUndefined()
  })
  it('skips a stub: a chapter whose next is a stub has no next chapter', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    store.selected = store.byId('c4') // c4.next === 's' (a stub)
    expect(store.nextChapter()).toBeUndefined()
  })
})

describe('goto', () => {
  it('selects a normal doc and clears redirect state', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    store.goto(store.byId('c1')!)
    expect(store.selected?.id).toBe('c1')
    expect(store.anchor).toBeNull()
    expect(store.origin).toBeNull()
    expect(lastUrl).toContain('doc=c1')
  })
  it('follows a stub redirect: renders the canonical chapter, remembers origin + anchor, keeps the stub slug in the URL', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    const stub = store.byId('r')!
    store.goto(stub)
    expect(store.selected?.id).toBe('c2') // canonical home, not the stub
    expect(store.origin?.id).toBe('r') // breadcrumb labels the stub
    expect(store.anchor).toBe('Beamer')
    expect(lastUrl).toContain('doc=r') // deep link stays shareable
    expect(fetchCount).toBeGreaterThan(0) // body of canonical fetched
  })
})

describe('goHome', () => {
  it('returns to reader mode with nothing selected and no deep link', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    store.goto(store.byId('c1')!)
    store.setMode('graph')
    store.goHome()
    expect(store.mode).toBe('reader')
    expect(store.selected).toBeUndefined()
    expect(store.anchor).toBeNull()
    expect(lastUrl).not.toContain('doc=')
  })
})

describe('search', () => {
  it('is a case-insensitive title substring search with a limit', () => {
    const store = new DocneuralStore()
    store.data = fixture()
    expect(store.search('chapter').map((n) => n.id).sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(store.search('SIDE')).toEqual(['c4'].map((id) => store.byId(id)!))
    expect(store.search('two', 1)).toHaveLength(1)
    expect(store.search('')).toEqual([])
    expect(store.search('   ')).toEqual([])
  })
})

describe('lite tier', () => {
  it('cannot be forced into graph mode', () => {
    const store = new DocneuralStore('.', true)
    store.data = fixture()
    store.setMode('graph')
    expect(store.lite).toBe(true)
    expect(store.mode).toBe('reader')
  })
})

// The aggregator contract: nodes carry their manual as the FIRST tag (set
// stamped by the exporter), and the reader's TOC scopes to one manual.
describe('manual scoping', () => {
  function multiFixture(): GraphData {
    return {
      nodes: [
        node({ id: 'a1', slug: 'a1', title: 'Alpha One', tags: ['alpha'], next: 'a2' }),
        node({ id: 'a2', slug: 'a2', title: 'Alpha Two', tags: ['alpha'] }),
        node({ id: 'b1', slug: 'b1', title: 'Beta One', tags: ['beta'], next: 'b2' }),
        node({ id: 'b2', slug: 'b2', title: 'Beta Two', tags: ['beta'] })
      ],
      links: []
    }
  }

  it('manuals lists corpora in first-seen order', () => {
    const store = new DocneuralStore()
    store.data = multiFixture()
    expect(store.manuals).toEqual(['alpha', 'beta'])
  })

  it('chapters scopes to the active manual, and an empty manual shows all', () => {
    const store = new DocneuralStore()
    store.data = multiFixture()
    store.manual = 'beta'
    expect(store.chapters.map((n) => n.id)).toEqual(['b1', 'b2'])
    store.manual = ''
    expect(store.chapters.map((n) => n.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('goto retargets the TOC to the doc manual (palette jumps carry it)', () => {
    const store = new DocneuralStore()
    store.data = multiFixture()
    store.manual = 'alpha'
    store.goto(store.byId('b1')!)
    expect(store.manual).toBe('beta')
    expect(store.chapters.map((n) => n.id)).toEqual(['b1', 'b2'])
  })

  it('showManual lands an open reader on the other manual first chapter', () => {
    const store = new DocneuralStore()
    store.data = multiFixture()
    store.goto(store.byId('a1')!)
    store.showManual('beta')
    expect(store.selected?.id).toBe('b1')
    // With nothing selected it only retargets the list (Home behavior).
    store.selected = undefined
    store.showManual('alpha')
    expect(store.selected).toBeUndefined()
    expect(store.manual).toBe('alpha')
  })

  it('load leaves manual empty for untagged data (single-corpus stays unscoped)', async () => {
    ;(globalThis as Record<string, unknown>).location = { href: 'http://site.test/', search: '' }
    const store = new DocneuralStore()
    await store.load() // the beforeEach fetch stub serves `fixture()` (no tags)
    expect(store.ready).toBe(true)
    expect(store.manual).toBe('')
    expect(store.chapters.map((n) => n.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('manualTitle renders the reader-facing label', () => {
    // Real project names, no invented " Manual" suffix: the site hosts
    // arbitrary corpora, so the label is whatever the project calls itself.
    expect(DocneuralStore.manualTitle('org')).toBe('Org')
    expect(DocneuralStore.manualTitle('emacs')).toBe('GNU Emacs')
    expect(DocneuralStore.manualTitle('std_docs')).toBe('Std Docs')
    expect(DocneuralStore.manualTitle('')).toBe('')
  })

  it('sources reports per-corpus pages and wires, stubs excluded', async () => {
    ;(globalThis as Record<string, unknown>).location = { href: 'http://site.test/', search: '' }
    const store = new DocneuralStore()
    store.data = {
      nodes: [
        { id: 'a1', slug: 'a--1', title: 'A one', tags: ['alpha'] },
        { id: 'a2', slug: 'a--2', title: 'A two', tags: ['alpha'] },
        { id: 'a3', slug: 'a--3', title: 'A stub', tags: ['alpha'], stub: true },
        { id: 'b1', slug: 'b--1', title: 'B one', tags: ['beta'] }
      ],
      links: [{ source: 'a1', target: 'b1' }, { source: 'b1', target: 'a2' }]
    }
    store.ready = true
    const src = store.sources
    expect(src.map((s) => s.name)).toEqual(['alpha', 'beta'])
    expect(src[0].pages).toBe(2) // a3 is a pointer, not a page
    expect(src[0].links).toBe(1) // the wire that starts inside alpha
    expect(src[1].links).toBe(1)
  })
})

describe('?mode=graph deep link', () => {
  it('opens straight on the canvas after the data loads', async () => {
    ;(globalThis as Record<string, unknown>).location = {
      href: 'http://site.test/',
      search: '?mode=graph'
    }
    const store = new DocneuralStore()
    await store.load()
    expect(store.ready).toBe(true)
    expect(store.mode).toBe('graph')
  })
  it('is refused on the lite tier (setMode is the one gate)', async () => {
    ;(globalThis as Record<string, unknown>).location = {
      href: 'http://site.test/',
      search: '?mode=graph'
    }
    const store = new DocneuralStore('.', true)
    await store.load()
    expect(store.mode).toBe('reader')
  })
})

// The ego view's synthesized edge category: visible must carry the co-cite
// marker at SYNTHESIS time (the canvas tests it O(1) per link per frame — no
// context string matching anywhere), and every unmarked link it emits must be
// a real wire straight out of graph.json.
describe('visible: co-citation edges', () => {
  function cociteFixture(): GraphData {
    return {
      nodes: [
        node({ id: 'center', title: 'Centre' }),
        node({ id: 'hub', title: 'Hub' }),
        node({ id: 'x', title: 'Co-cited' })
      ],
      links: [
        { source: 'hub', target: 'center' },
        { source: 'hub', target: 'x' }
      ]
    }
  }

  it('synthesizes co-cite wires WITH the kind marker and their evidence', () => {
    const store = new DocneuralStore()
    store.data = cociteFixture()
    store.goto(store.byId('center')!)
    const cocites = store.visible.links.filter((l) => l.kind === 'cocite')
    expect(cocites.map((l) => `${l.source}>${l.target}`)).toEqual(['center>x'])
    expect(cocites[0].context).toBe('co-cited: 1 chapter cite both')
  })

  it('leaves every unmarked link a real wire from graph.json, unchanged', () => {
    const store = new DocneuralStore()
    store.data = cociteFixture()
    store.goto(store.byId('center')!)
    for (const l of store.visible.links) {
      if (l.kind === 'cocite') continue
      expect(store.data.links).toContain(l) // same object, no marker, no rewrite
    }
  })

  it('honours the co-cite cap: 9 candidates still yield at most COCITE_CAP edges', () => {
    const store = new DocneuralStore()
    // Nine hubs each cite the centre AND one distinct chapter of their own —
    // every candidate is two hops out, so all nine qualify before the cap.
    store.data = {
      nodes: [node({ id: 'center' }), ...Array.from({ length: 9 }, (_, i) => node({ id: `h${i}` })), ...Array.from({ length: 9 }, (_, i) => node({ id: `t${i}` }))],
      links: [
        ...Array.from({ length: 9 }, (_, i) => ({ source: `h${i}`, target: 'center' })),
        ...Array.from({ length: 9 }, (_, i) => ({ source: `h${i}`, target: `t${i}` }))
      ]
    }
    store.goto(store.byId('center')!)
    const cocites = store.visible.links.filter((l) => l.kind === 'cocite')
    expect(cocites.length).toBe(8)
    expect(cocites[0].context).toMatch(/^co-cited: 1 chapter cite both$/)
  })
})
