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
import type { DocNode } from './types'

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

/** What a clicked corpus link should DO — the decision both prose surfaces
 *  run, in one place, so a citation's `#heading` can no longer be dropped
 *  between parsing and `store.goto` (the audit's cross-doc anchor drop). */
export type DocLinkRoute =
  | { kind: 'goto'; doc: DocNode; anchor: string | null } // another page (or this one, no heading): navigate
  | { kind: 'here'; doc: DocNode; anchor: string } // this page + heading: scroll in place
  | { kind: 'dead' } // corpus href, but the graph has no such page
  | { kind: 'external' } // not the export's scheme: the browser keeps it

/** Route one clicked href. `resolve` looks a slug up in the live graph
 *  (store.bySlug); `current` is the doc on screen, if any. The anchor comes
 *  back DECODED — the store keeps plain ids (selectFromUrl decodes, setUrl
 *  re-encodes) and the reader's in-page scroll wants the plain id too. */
export function routeDocLink(
  href: string,
  resolve: (slug: string) => DocNode | undefined,
  current: DocNode | undefined
): DocLinkRoute {
  const m = parseDocHref(href)
  if (!m) return { kind: 'external' }
  const doc = resolve(m.slug)
  if (!doc) return { kind: 'dead' }
  let anchor: string | null = null
  if (m.anchor) {
    try {
      anchor = decodeURIComponent(m.anchor)
    } catch {
      // A malformed escape (a heading id literally named `100%`) must not
      // throw inside a click handler: the raw text is better than nothing.
      anchor = m.anchor
    }
  }
  if (current && doc.id === current.id && anchor) return { kind: 'here', doc, anchor }
  return { kind: 'goto', doc, anchor }
}
