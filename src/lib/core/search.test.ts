// Unit tests for heading search scoring. search.ts is deliberately
// Svelte-free: the index arrives from the site's build-search.mjs as
// JSON, so what is under test here is the ranking, not plumbing.
import { describe, expect, it } from 'vitest'
import { rankEntries, tokenize, type SearchEntry } from './search'

const ENTS: SearchEntry[] = [
  { s: 'org--Agenda-Views', t: 'Agenda Views', h: 'Agenda Views', a: 'Agenda-Views' },
  { s: 'org--Exporting', t: 'Exporting', h: 'Export Settings', a: 'Export-Settings' },
  { s: 'org--Exporting', t: 'Exporting', h: 'Exporting', a: 'Exporting' },
  { s: 'org--Agenda-Views', t: 'Agenda Views', h: 'Export Settings in the Agenda', a: 'Export-Settings-in-the-Agenda' },
  { s: 'org--Dates', t: 'Dates and Times', h: 'Introduction', a: 'Introduction' }
]

describe('tokenize', () => {
  it('splits on punctuation and lowercases', () => {
    expect(tokenize('Agenda Views, revisited!')).toEqual(['agenda', 'views', 'revisited'])
  })
  it('keeps CJK characters', () => {
    expect(tokenize('议程 视图')).toEqual(['议程', '视图'])
  })
})

describe('rankEntries', () => {
  it('ranks the exact heading phrase above scattered mentions', () => {
    const hits = rankEntries(ENTS, 'export settings')
    expect(hits[0].heading).toBe('Export Settings')
    expect(hits[0].matched).toBe('heading')
  })
  it('ranks a chapter-title match with matched=title', () => {
    const hits = rankEntries(ENTS, 'dates')
    expect(hits[0].matched).toBe('title')
    expect(hits[0].slug).toBe('org--Dates')
  })
  it('returns nothing for an empty query', () => {
    expect(rankEntries(ENTS, '   ')).toEqual([])
  })
  it('de-duplicates the same page+anchor and honours the limit', () => {
    const hits = rankEntries(ENTS, 'agenda', 3)
    expect(hits.length).toBeLessThanOrEqual(3)
    const keys = hits.map((h) => `${h.slug}#${h.anchor}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('weighs idf: a rare term outranks a corpus-wide one', () => {
    const ents = [
      ...ENTS,
      { s: 'org--Syntax', t: 'Syntax', h: 'The Syntax', a: 'The-Syntax' }
    ]
    // "the" appears in two headings, "introduction" in one; a query with
    // both must put the introduction hit first.
    const hits = rankEntries(ents, 'the introduction')
    expect(hits[0].heading).toBe('Introduction')
  })
})
