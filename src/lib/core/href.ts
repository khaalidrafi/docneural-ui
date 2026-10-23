// The static export's cross-reference scheme, parsed once.
//
// Every in-corpus link the exporter writes is `docs/<slug>.html`, optionally
// naming a heading as `#anchor`. Two reading surfaces resolve those hrefs —
// DocReader (navigation + peek card) and graph mode's NotePreview (same two)
// — and they must agree on what counts as a corpus link, so the one regex
// lives here instead of a copy in each component. DocReader carried this
// exact pattern inline (openPeek + onContentClick) before it was extracted.
//
// Anything else — `https://…`, a bare `#anchor`, `mailto:` — returns null:
// the browser keeps the link, and the peek card has nothing to say about it.

/** A cross-reference the export produced: which chapter, which heading. */
export type DocHref = {
  slug: string
  /** Heading id after `#`, or null when the link names the whole page. */
  anchor: string | null
}

// `(?:^|\/)?` admits the relative prefixes the export writes (`docs/…`,
// `./docs/…`, `../docs/…`); the anchor group takes everything after the
// FIRST `#`, so a heading id that itself contains `#` still round-trips.
// Deliberately unanchored at the start, byte-for-byte the shipped readers'
// pattern — an href that merely CONTAINS a corpus path resolves, which is
// the contract both surfaces have always run on.
const DOC_HREF = /(?:^|\/)?docs\/([^#]+)\.html(?:#(.*))?$/

export function parseDocHref(href: string): DocHref | null {
  const m = DOC_HREF.exec(href)
  if (!m) return null
  // `docs/Foo.html#` names a page, not a heading: an empty anchor reads as
  // none, the way every consumer (`if (m.anchor)`) treats it anyway.
  return { slug: m[1], anchor: m[2] || null }
}
