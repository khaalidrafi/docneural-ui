// Unit tests for the store's docs-first contract: the chapter tree built from
// Info's `next` chain, transparent stub->canonical redirect, and the reader
// pager that must skip stubs. These run in node; the URL/fetch side of `goto`
// is exercised with tiny global stubs, not jsdom.
import { beforeEach, describe, expect, it } from 'vitest'
import { SynaptStore } from './store.svelte'
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
    const store = new SynaptStore()
    store.data = fixture()
    const ids = store.chapters.map((n) => n.id)
    // Main chain walked from its head (c1); stubs (s, r) never appear.
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(ids).not.toContain('s')
    expect(ids).not.toContain('r')
  })
})

describe('contentSibling pager', () => {
  it('returns the next real chapter', () => {
    const store = new SynaptStore()
    store.data = fixture()
    store.selected = store.byId('c1')
    expect(store.nextChapter()?.id).toBe('c2')
    expect(store.prevChapter()).toBeUndefined()
  })
  it('skips a stub: a chapter whose next is a stub has no next chapter', () => {
    const store = new SynaptStore()
    store.data = fixture()
    store.selected = store.byId('c4') // c4.next === 's' (a stub)
    expect(store.nextChapter()).toBeUndefined()
  })
})

describe('goto', () => {
  it('selects a normal doc and clears redirect state', () => {
    const store = new SynaptStore()
    store.data = fixture()
    store.goto(store.byId('c1')!)
    expect(store.selected?.id).toBe('c1')
    expect(store.anchor).toBeNull()
    expect(store.origin).toBeNull()
    expect(lastUrl).toContain('doc=c1')
  })
  it('follows a stub redirect: renders the canonical chapter, remembers origin + anchor, keeps the stub slug in the URL', () => {
    const store = new SynaptStore()
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
    const store = new SynaptStore()
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
    const store = new SynaptStore()
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
    const store = new SynaptStore('.', true)
    store.data = fixture()
    store.setMode('graph')
    expect(store.lite).toBe(true)
    expect(store.mode).toBe('reader')
  })
})

describe('?mode=graph deep link', () => {
  it('opens straight on the canvas after the data loads', async () => {
    ;(globalThis as Record<string, unknown>).location = {
      href: 'http://site.test/',
      search: '?mode=graph'
    }
    const store = new SynaptStore()
    await store.load()
    expect(store.ready).toBe(true)
    expect(store.mode).toBe('graph')
  })
  it('is refused on the lite tier (setMode is the one gate)', async () => {
    ;(globalThis as Record<string, unknown>).location = {
      href: 'http://site.test/',
      search: '?mode=graph'
    }
    const store = new SynaptStore('.', true)
    await store.load()
    expect(store.mode).toBe('reader')
  })
})
