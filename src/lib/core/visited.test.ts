// visited.ts tests — node environment, so localStorage is absent and every
// call must degrade the way the private-mode path does (silently, in-memory).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadVisited, writeVisited } from './visited'

type Store = Record<string, string>

/** Minimal localStorage double: proves the module only ever touches the one
 *  key it owns, and lets each test start from a clean sheet. */
let backing: Store | null
let writes: string[]
beforeEach(() => {
  backing = {}
  writes = []
  const g = globalThis as Record<string, unknown>
  g.localStorage = {
    getItem: (k: string) => (k in backing! ? backing![k] : null),
    setItem: (k: string, v: string) => {
      writes.push(k)
      backing![k] = v
    }
  }
})
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage
})

describe('visited', () => {
  it('starts empty with no stored sheet', () => {
    backing = {}
    expect(loadVisited()).toEqual([])
  })

  it('persists a new slug and returns the grown list', () => {
    const next = writeVisited([], 'org--Agenda-Views')
    expect(next).toEqual(['org--Agenda-Views'])
    expect(loadVisited()).toEqual(['org--Agenda-Views'])
    expect(writes).toEqual(['docneural:visited'])
  })

  it('is idempotent: a seen chapter is not written twice', () => {
    const once = writeVisited([], 'emacs--Buffers')
    const again = writeVisited(once, 'emacs--Buffers')
    expect(again).toEqual(['emacs--Buffers'])
    expect(writes).toHaveLength(1) // the first write only
  })

  it('keeps insertion order so the store stays a diff-able log', () => {
    let list = writeVisited([], 'a')
    list = writeVisited(list, 'b')
    list = writeVisited(list, 'c')
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('bounds the log to the newest MAX entries', () => {
    let list: string[] = []
    for (let i = 0; i < 520; i++) list = writeVisited(list, `slug-${i}`)
    expect(list.length).toBe(500)
    expect(list[0]).toBe('slug-20') // oldest 20 dropped
    expect(list[list.length - 1]).toBe('slug-519')
    expect(loadVisited().length).toBe(500)
  })

  it('survives junk in storage without losing the sheet', () => {
    backing = { 'docneural:visited': 'not json' }
    expect(loadVisited()).toEqual([])
  })

  it('drops non-string entries from an old shape', () => {
    backing = { 'docneural:visited': JSON.stringify(['ok', 42, null, 'fine']) }
    expect(loadVisited()).toEqual(['ok', 'fine'])
  })

  it('degrades to in-memory when storage is blocked (private mode)', () => {
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    const next = writeVisited([], 'org--Tables')
    expect(next).toEqual(['org--Tables']) // this visit still works
    expect(loadVisited()).toEqual([]) // nothing durable, and no crash
  })
})
