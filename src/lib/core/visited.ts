// visited.ts — which chapters you have opened, in localStorage.
//
// A 277-page manual has a shape, and the sidebar that hides it is the one
// you scroll every day: after a week of reading, "where have I been" is
// how you find "what is left". A visited mark is the lightest possible
// answer — one Set of slugs, no timestamps, no per-chapter bookkeeping.
//
// Slugs, not ids: the TOC, the marks and the reader all key off slugs, and
// a slug survives a re-export the way an anchor does. A slug from an older
// export that no longer resolves simply never matches a row — the same
// graceful drop `lastRead` already relies on.
//
// Bounded like `saved`: an unbounded set grows one byte per chapter forever,
// and a corpus rewrite could orphan all of it. 500 chapters is more than the
// biggest manual this exporter produces today.

const KEY = 'docneural:visited'
const MAX = 500

/** The stored slugs, oldest first, or [] when storage is unavailable. */
export function loadVisited(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return (v as unknown[]).filter((s): s is string => typeof s === 'string').slice(-MAX)
  } catch {
    // Private mode / disabled storage / a blob from an older shape.
    return []
  }
}

/** Add `slug` if missing (idempotent), persist, and return the next list.
 *  Order is preserved so the storage stays a stable diff-able log. */
export function writeVisited(list: string[], slug: string): string[] {
  if (list.includes(slug)) return list
  const next = [...list, slug].slice(-MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore: a blocked store still keeps the in-memory set for this visit */
  }
  return next
}
