// visited.ts unit tests: the storage module behind the sidebar dots and
// the "% read" line. localStorage is stubbed (no DOM in unit tests).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k)
})

const { loadVisited, writeVisited } = await import('./visited')

beforeEach(() => store.clear())

describe('visited', () => {
  it('round-trips a slug through storage', () => {
    expect(writeVisited([], 'org--Intro')).toEqual(['org--Intro'])
    expect(loadVisited()).toEqual(['org--Intro'])
  })
  it('ignores a repeat visit', () => {
    expect(writeVisited(['a'], 'a')).toEqual(['a'])
  })
  it('bounds the list at 500 slugs', () => {
    const many = Array.from({ length: 600 }, (_, i) => `s${i}`)
    const next = writeVisited(many, 's600')
    expect(next.length).toBe(500)
    expect(next).toContain('s600')
  })
  it('survives a corrupt blob', () => {
    store.set('docneural:visited', '{"not":"an array"}')
    expect(loadVisited()).toEqual([])
  })
})
