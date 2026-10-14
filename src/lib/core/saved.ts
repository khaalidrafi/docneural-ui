// saved.ts — the sections you marked, in localStorage.
//
// A 277-page manual is not read once: you bounce between the five sections
// that actually matter to the task at hand, and re-finding them by search is
// the friction that makes people keep a note file open beside the browser.
// A bookmark list is the same habit, stored where the reader already is.
//
// Keyed by slug + anchor (not by id) because a marked position must survive a
// re-export of the corpus, and the reader already knows how to jump to an
// anchor. Title is stored so the list paints without a graph lookup — a saved
// section whose page is gone shows its own name instead of nothing.

export type SavedMark = { slug: string; anchor: string | null; title: string; at: number }

const KEY = 'org-docs:saved'
/* Bound the list: an unbounded bookmark pile is a second, worse table of
   contents, and the storage write is JSON of the whole array. */
const MAX = 24

/** One line per mark: what it is, in the shape the UI needs. */
const same = (a: SavedMark, slug: string, anchor: string | null) =>
  a.slug === slug && a.anchor === (anchor ?? null)

/** The marks, most recent first, or [] when storage is unavailable. */
export function loadSaved(): SavedMark[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return (v as SavedMark[])
      .filter((m) => m && typeof m.slug === 'string')
      .slice(0, MAX)
  } catch {
    // Private mode / disabled storage / a blob from an older shape.
    return []
  }
}

/** Add `mark`, or drop it if it is already there — `b` is a toggle. */
export function writeSaved(list: SavedMark[], mark: SavedMark): SavedMark[] {
  const hit = list.find((m) => same(m, mark.slug, mark.anchor))
  const next = hit
    ? list.filter((m) => m !== hit)
    : [{ ...mark, at: Date.now() }, ...list].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore: a blocked store still keeps the in-memory list for this visit */
  }
  return next
}
