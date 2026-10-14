// lastRead.ts — where you stopped reading, in localStorage.
//
// A manual is read across days, on a phone where the tab dies constantly, and
// the site has no account and no server to ask. The one thing worth persisting
// is the last page plus the heading you were under: opening the site and
// clicking "resume" beats re-searching for the chapter.
//
// Anchor rather than scroll offset on purpose — an offset is meaningless once
// the fragment reflows (or on a different screen), a heading id is stable and
// the reader already knows how to jump to one.

export type LastRead = { slug: string; anchor: string | null; at: number }

const KEY = 'org-docs:last-read'

/** The stored position, or null when there is nothing usable to resume. */
export function loadLastRead(): LastRead | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<LastRead>
    return typeof v.slug === 'string' ? { slug: v.slug, anchor: v.anchor ?? null, at: v.at ?? 0 } : null
  } catch {
    // Private mode / disabled storage: localStorage throws on read in some
    // browsers, and a stale JSON blob must never break the boot.
    return null
  }
}

/** Record the position. Best-effort: a full or blocked store is not an error. */
export function saveLastRead(slug: string, anchor: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ slug, anchor, at: Date.now() } satisfies LastRead))
  } catch {
    /* ignore */
  }
}
