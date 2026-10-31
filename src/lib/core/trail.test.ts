// trail.test.ts — the trail's storage contract, offline and pure. No fetch,
// no DOM: a stubbed globalThis.localStorage is the whole world (node env,
// same shape the vitest config runs the rest of core/ in).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRAIL_MAX, appendTrail, clearTrail, loadTrail, trailText } from './trail'
import { DocneuralStore } from './store.svelte'
import type { DocNode } from './types'

type LS = {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
}

const g = globalThis as Record<string, unknown>
const KEY = 'docneural:trail'
let backing: Map<string, string>
let throwOnWrite: boolean

beforeEach(() => {
  backing = new Map()
  throwOnWrite = false
  g.localStorage = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (throwOnWrite) throw new Error('blocked')
      backing.set(k, v)
    },
    removeItem: (k: string) => {
      backing.delete(k)
    }
  } satisfies LS
})

afterEach(() => {
  delete g.localStorage
})

describe('trail storage', () => {
  it('appends in visit order and persists', () => {
    let t: string[] = []
    t = appendTrail(t, 'a')
    t = appendTrail(t, 'b')
    t = appendTrail(t, 'c')
    expect(t).toEqual(['a', 'b', 'c'])
    expect(loadTrail()).toEqual(['a', 'b', 'c'])
  })

  it('keeps a revisited stop in place — a re-read is not a new stop', () => {
    let t: string[] = []
    t = appendTrail(t, 'a')
    t = appendTrail(t, 'b')
    t = appendTrail(t, 'c')
    t = appendTrail(t, 'a') // revisit the oldest
    expect(t).toEqual(['a', 'b', 'c'])
    // No reorder, and no storage churn on the revisit either.
    expect(backing.get(KEY)).toEqual(JSON.stringify(['a', 'b', 'c']))
  })

  it('evicts the OLDEST stop past the 12 cap (head survives)', () => {
    let t: string[] = []
    for (let i = 0; i < TRAIL_MAX + 2; i++) t = appendTrail(t, `s${i}`)
    expect(t).toHaveLength(TRAIL_MAX)
    expect(t[0]).toBe('s2') // s0, s1 FIFO-evicted
    expect(t[t.length - 1]).toBe('s13') // the head always survives
    expect(loadTrail()).toEqual(t)
  })

  it('falls back to a session-only array when storage blocks writes', () => {
    throwOnWrite = true
    let t: string[] = []
    t = appendTrail(t, 'a')
    t = appendTrail(t, 'b')
    // Identical UI input, no throw, nothing persisted.
    expect(t).toEqual(['a', 'b'])
    expect(backing.has(KEY)).toBe(false)
    expect(loadTrail()).toEqual([])
  })

  it('ignores junk on load: non-array JSON, non-string entries, over-cap', () => {
    backing.set(KEY, '{"nope":true}')
    expect(loadTrail()).toEqual([])
    backing.set(KEY, JSON.stringify(['a', 3, null, 'b']))
    expect(loadTrail()).toEqual(['a', 'b'])
    backing.set(KEY, JSON.stringify(Array.from({ length: 30 }, (_, i) => `x${i}`)))
    expect(loadTrail()).toHaveLength(TRAIL_MAX)
  })

  it('clearTrail removes the stored trail', () => {
    let t: string[] = []
    t = appendTrail(t, 'a')
    expect(loadTrail()).toEqual(['a'])
    clearTrail()
    expect(loadTrail()).toEqual([])
    expect(backing.has(KEY)).toBe(false)
  })
})

describe('trailText export', () => {
  it('serializes the resolved stops as a numbered markdown route', () => {
    const out = trailText([
      { slug: 'org--Agenda-Views', title: 'Agenda Views' },
      { slug: 'emacs--Basic-Files', title: 'Basic Files' }
    ])
    expect(out).toBe(
      '# trail — docneural\n\n1. [Agenda Views](?doc=org--Agenda-Views)\n2. [Basic Files](?doc=emacs--Basic-Files)\n'
    )
  })

  it('is empty for an empty trail', () => {
    expect(trailText([])).toBe('')
  })
})

// The read path: slugs the live index does not know are dropped WITHOUT
// pruning storage, so a slug that returns in a later export rejoins.
function node(p: Partial<DocNode> & { id: string }): DocNode {
  return { slug: p.id, title: p.id, tags: [], ...p }
}

describe('trail read path (store)', () => {
  it('drops missing slugs when resolving, and never prunes storage', () => {
    const store = new DocneuralStore()
    store.data = {
      nodes: [node({ id: 'c1', title: 'Chapter One' }), node({ id: 'c3', title: 'Chapter Three' })],
      links: []
    }
    const stored = ['c1', 'gone-mid', 'c3']
    store.trail = stored
    const resolved = store.trailResolved
    expect(resolved.map((n) => n.id)).toEqual(['c1', 'c3'])
    // Storage is untouched: 'gone-mid' can rejoin after a re-export.
    expect(store.trail).toEqual(stored)
    expect(store.trailResolved.length).toBe(2) // <2 surviving stops hides chrome
  })
})
