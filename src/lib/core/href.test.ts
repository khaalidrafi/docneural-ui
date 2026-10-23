// Tests for core/href.ts — the one parser both reading surfaces (DocReader
// and graph mode's NotePreview) use to decide "is this href a corpus page,
// and which heading in it". Navigation and the peek card must agree, so the
// cases below are the contract, not implementation details.
import { describe, expect, it } from 'vitest'
import { parseDocHref } from './href'

describe('parseDocHref', () => {
  it('parses the exporter’s plain cross-references', () => {
    expect(parseDocHref('docs/Agenda-Views.html')).toEqual({
      slug: 'Agenda-Views',
      anchor: null
    })
  })

  it('keeps the heading anchor', () => {
    expect(parseDocHref('docs/Agenda-Views.html#Exporting')).toEqual({
      slug: 'Agenda-Views',
      anchor: 'Exporting'
    })
  })

  it('admits the relative prefixes the export writes', () => {
    expect(parseDocHref('./docs/Foo.html')?.slug).toBe('Foo')
    expect(parseDocHref('../docs/Foo.html')?.slug).toBe('Foo')
    expect(parseDocHref('/docs/Foo.html')?.slug).toBe('Foo')
  })

  it('takes everything after the FIRST # as the anchor', () => {
    expect(parseDocHref('docs/Foo.html#a#b')).toEqual({ slug: 'Foo', anchor: 'a#b' })
  })

  it('reads a bare `#` as no anchor — the link names the page', () => {
    expect(parseDocHref('docs/Foo.html#')).toEqual({ slug: 'Foo', anchor: null })
  })

  it('refuses what is not a corpus page', () => {
    expect(parseDocHref('https://orgmode.org/manual/Agenda-Views.html')).toBeNull()
    expect(parseDocHref('#Agenda-Views')).toBeNull()
    expect(parseDocHref('mailto:org-mode@gnu.org')).toBeNull()
    expect(parseDocHref('')).toBeNull()
  })

  it('refuses near-misses of the scheme', () => {
    expect(parseDocHref('docs/Foo.htmlx')).toBeNull()
    expect(parseDocHref('docs/.html')).toBeNull()
    expect(parseDocHref('docs/Foo.org')).toBeNull()
  })

  it('matches a full URL that carries the corpus path (shipped, permissive)', () => {
    // The pattern the readers always ran is unanchored; the corpus writes
    // relative hrefs, so this only says the parser stays predictable for
    // absolute same-origin links instead of inventing a stricter rule here.
    expect(parseDocHref('https://docs.example/docs/Foo.html#bar')).toEqual({
      slug: 'Foo',
      anchor: 'bar'
    })
  })
})
