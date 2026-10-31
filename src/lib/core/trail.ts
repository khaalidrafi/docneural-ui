// trail.ts — the visitor's reading path, in localStorage.
//
// lastRead remembers ONE stop (where you stopped); the trail remembers the
// ROAD: every chapter the visitor actually opened, in visit order. A 277-page
// manual is read as a journey — five sections, a detour, a return — and the
// front door should be able to say "here is the journey, resume where it
// left off". The same list serializes to a plain-text route (trailText) that
// an agent can ingest without parsing the DOM, the graph, or a screenshot.
// One store, two readers.
//
// Keyed by SLUG, not id — the same reasoning as saved.ts: a stored position
// must survive a corpus re-export, and slugs are what the exporter names.
// The read path drops slugs the live index does not know (the read-side
// contract in store.svelte.ts); storage itself is never pruned, so a slug
// that returns in a later export rejoins the trail.
//
// Append-only on purpose: a RE-READ is not a new stop. Revisiting a chapter
// keeps it where it was earned; the head (most recent entry) only moves when
// a NEW chapter is opened. Cap is 12 — the lit route on the canvas must stay
// legible, and 12 hops is already a story. Overflow evicts the OLDEST stop
// (FIFO), never the head.

export const TRAIL_MAX = 12

const KEY = 'docneural:trail'

/** The stored trail, oldest first, or [] when there is nothing usable. */
export function loadTrail(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return (v as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, TRAIL_MAX)
  } catch {
    // Private mode / disabled storage / a blob from an older shape: boot
    // must never break on a trail.
    return []
  }
}

/**
 * Record a stop. Returns the next trail: `slug` appended, duplicates ignored
 * IN PLACE (no reorder on revisit), oldest evicted past the cap. Best-effort
 * persistence — a blocked or full store throws on write, and the trail
 * degrades to a session-only array with an identical UI and no error copy
 * (the `lastRead`/`saved` contract).
 */
export function appendTrail(list: string[], slug: string): string[] {
  if (list.includes(slug)) return list
  const next = [...list, slug].slice(-TRAIL_MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* session-only: the in-memory list still works this visit */
  }
  return next
}

/** Drop the whole trail, in memory and on disk. Best-effort on the disk half. */
export function clearTrail(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * The plain-text export: an ordered markdown route an agent can ingest.
 * `# trail — docneural` + numbered `1. [Title](?doc=slug)` lines. Takes the
 * RESOLVED stops (missing slugs already dropped by the read path), so the
 * payload never names a page the corpus cannot serve.
 */
export function trailText(stops: ReadonlyArray<{ slug: string; title: string }>): string {
  if (!stops.length) return ''
  const lines = stops.map((s, i) => `${i + 1}. [${s.title}](?doc=${s.slug})`)
  return `# trail — docneural\n\n${lines.join('\n')}\n`
}

/**
 * One synapse's citation, in the trail's own markdown voice (the click
 * card's "Copy citation" reuses this formatter — network pass 2026-10-31):
 * `source → target` as two wiki-links plus the recovered/citing line when
 * one exists. Same `?doc=` URL contract as the trail, so a pasted citation
 * is a navigable deep link and not just prose.
 */
export function synapseCitation(
  a: { slug: string; title: string },
  b: { slug: string; title: string },
  ctx?: string
): string {
  const line = `[${a.title}](?doc=${a.slug}) → [${b.title}](?doc=${b.slug})`
  return ctx ? `${line} — “${ctx}”\n` : `${line}\n`
}
