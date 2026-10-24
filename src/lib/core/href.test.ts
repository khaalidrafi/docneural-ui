// Tests for core/href.ts — the one parser both reading surfaces (DocReader
// and graph mode's NotePreview) use to decide "is this href a corpus page,
// and which heading in it", plus the one click-routing decision both surfaces
// run on a parsed link. Navigation and the peek card must agree, so the
// cases below are the contract, not implementation details.
import { describe, expect, it } from 'vitest'
import { parseDocHref, routeDocLink } from './href'
import type { DocNode } from './types'

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

/* ---------- routeDocLink ----------
   The click decision both prose surfaces run: is this link external, dead,
   a same-page heading, or a navigation — and when it is a navigation, the
   citation's heading rides along to goto instead of dying in the parse. */
describe('routeDocLink', () => {
  const doc = (id: string): DocNode => ({ id, slug: id, title: id, tags: [] })
  const graph = new Map(
    ['Foo', 'Bar'].map((slug) => [slug, doc(slug)])
  )
  const resolve = (slug: string): DocNode | undefined => graph.get(slug)

  it('a cross-doc citation with a heading yields a goto that CARRIES the anchor, decoded', () => {
    // THE defect: both surfaces used to goto(target) here and drop the
    // heading — the reader never landed where the citation pointed.
    expect(routeDocLink('docs/Bar.html#Export%20Setup', resolve, doc('Foo'))).toEqual({
      kind: 'goto',
      doc: doc('Bar'),
      anchor: 'Export Setup'
    })
  })

  it('a plain cross-doc link navigates with no anchor', () => {
    expect(routeDocLink('docs/Bar.html', resolve, doc('Foo'))).toEqual({
      kind: 'goto',
      doc: doc('Bar'),
      anchor: null
    })
  })

  it('a same-doc heading link stays here: the reader scrolls instead of re-selecting', () => {
    expect(routeDocLink('docs/Foo.html#Exporting', resolve, doc('Foo'))).toEqual({
      kind: 'here',
      doc: doc('Foo'),
      anchor: 'Exporting'
    })
  })

  it('a same-doc link without a heading is still a goto (a re-select, anchor cleared)', () => {
    expect(routeDocLink('docs/Foo.html', resolve, doc('Foo'))).toEqual({
      kind: 'goto',
      doc: doc('Foo'),
      anchor: null
    })
  })

  it('what is not a corpus link stays the browser’s', () => {
    expect(routeDocLink('https://orgmode.org/manual/Foo.html', resolve, doc('Foo'))).toEqual({
      kind: 'external'
    })
    expect(routeDocLink('#in-page', resolve, doc('Foo'))).toEqual({ kind: 'external' })
  })

  it('a corpus slug the graph never had is dead, not external', () => {
    // The surfaces keep their own policies for this (the reader stays put,
    // the preview lets the browser go); the router only has to say which
    // world the click is in.
    expect(routeDocLink('docs/Ghost.html', resolve, doc('Foo'))).toEqual({ kind: 'dead' })
  })

  it('a malformed escape cannot throw inside a click handler', () => {
    // A heading id literally named `100%` — decodeURIComponent would throw
    // URIError mid-click; the raw text is the graceful answer.
    expect(routeDocLink('docs/Bar.html#100%', resolve, doc('Foo'))).toEqual({
      kind: 'goto',
      doc: doc('Bar'),
      anchor: '100%'
    })
  })
})
