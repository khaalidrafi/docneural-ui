// visited.ts — which chapters you have opened, in localStorage.
//
// Two features want the same fact: the sidebar dot that gives a 277-page
// manual a shape, and "you have read 41% of The Org Manual". Both are
// "chapters this reader has actually opened", and neither is worth a
// request — so it is one bounded set in storage, like lastRead.
//
// Bounded like saved.ts: an unbounded set turns the storage write into
// a JSON of the whole corpus on every chapter change.

const KEY = 'docneural:visited'
const MAX = 500

/** Slugs opened, oldest first (the order the sidebar marks get painted). */
export function loadVisited(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return (v as unknown[]).filter((x): x is string => typeof x === 'string').slice(-MAX)
  } catch {
    return []
  }
}

/** Add a slug (most recent last); returns the new list. */
export function writeVisited(list: string[], slug: string): string[] {
  const next = list.includes(slug) ? list : [...list, slug].slice(-MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore: the in-memory set still holds for this visit */
  }
  return next
}
