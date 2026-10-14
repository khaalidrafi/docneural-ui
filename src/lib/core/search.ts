// search.ts — heading-level search over the per-manual index.
//
// The palette used to match page titles only. A manual has ~30k headings
// and one "Introduction"; what a reader types is the SECTION name
// ("agenda views", "export settings"). The anchors already exist in the
// exported fragments — scripts/build-search.mjs in the site repo crawls
// them into one lazy JSON per manual, with the same fetch-on-demand
// contract ctx/ uses.
//
// Scoring is a small, honest BM25: field weights (a chapter title is
// worth more than a heading mention), idf over the index (a word in
// 30k headings is worth less than one in 40), and exact-substring
// bonus so typing a heading's contiguous words outranks scattering the
// same letters across the page. No dependencies, no WASM — the whole
// index is one array of ~100-char records, so the honest machine is a
// phone on 4 GB.

/** One row of search/<manual>.json, exactly as the exporter writes it. */
export type SearchEntry = {
  /** page slug (the node the heading lives on) */
  s: string
  /** page title */
  t: string
  /** heading text */
  h: string
  /** heading id (the #ANCHOR a hit lands on) */
  a: string
}

/** A ranked hit. `score` ranks; `matched` says which field hit so the UI
 *  can label it ("doc" vs "§ heading"). */
export type SearchHit = {
  slug: string
  pageTitle: string
  heading: string | null
  anchor: string | null
  score: number
  matched: 'title' | 'heading'
}

/** Words a query is made of: lowercased, punctuation dropped. Keeps
 *  CJK single characters (a Chinese manual has no spaces to split on). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** idf for one term across the whole index. A term in every document
 *  carries almost no signal ("the", "org"); the floor keeps a one-entry
 *  corpus from dividing by zero-level noise. */
function idf(df: number, nDocs: number): number {
  return Math.log(1 + (nDocs - df + 0.5) / (df + 0.5))
}

/** Rank `entries` against the query `q` (already trimmed).
 *
 *  Two fields, weighted: the chapter title (x3 — a reader who types the
 *  page name wants the page) and the heading (x2). A hit is any entry
 *  containing at least one query token in either field; the score is the
 *  sum over query tokens of idf x tf x weight, plus a whole-phrase bonus
 *  when the query appears verbatim in the field, which is what makes
 *  typing a full heading outrank the pages that merely share its words.
 */
export function rankEntries(
  entries: SearchEntry[],
  q: string,
  limit = 12
): SearchHit[] {
  const tokens = tokenize(q)
  if (!tokens.length || !entries.length) return []
  const nDocs = entries.length
  // Document frequency per token, over title+heading as one haystack.
  const df = new Map<string, number>()
  for (const e of entries) {
    const hay = `${e.t} ${e.h}`.toLowerCase()
    for (const t of tokens) {
      if (hay.includes(t)) df.set(t, (df.get(t) ?? 0) + 1)
    }
  }
  const hits: SearchHit[] = []
  for (const e of entries) {
    const title = e.t.toLowerCase()
    const head = e.h.toLowerCase()
    let titleScore = 0
    let headScore = 0
    for (const t of tokens) {
      const w = idf(df.get(t) ?? 0, nDocs)
      if (title.includes(t)) titleScore += w * 3
      if (head.includes(t)) headScore += w * 2
    }
    if (titleScore === 0 && headScore === 0) continue
    let score = titleScore + headScore
    // `matched` names the field that CARRIED the hit: a chapter named after
    // the query is a stronger answer than a heading that merely contains
    // a word of it, and the palette labels the row with it.
    const matched: SearchHit['matched'] = titleScore > headScore ? 'title' : 'heading'
    // Verbatim phrase bonus, MULTI-TOKEN queries only: typing a full
    // heading outranks pages sharing its words. With one token the
    // "phrase" is just the word, and the bonus would flatten idf — every
    // page containing "the" would beat the one rare word that mattered.
    if (tokens.length > 1) {
      const phrase = tokens.join(' ')
      if (title.includes(phrase)) score += 6
      if (head.includes(phrase)) score += 5
    }
    hits.push({
      slug: e.s,
      pageTitle: e.t,
      heading: head === title ? null : e.h,
      anchor: e.a,
      score,
      matched
    })
  }
  hits.sort((a, b) => b.score - a.score)
  // De-duplicate: several headings of one page can match the same query
  // and the first (highest) is the one a reader wants.
  const seen = new Set<string>()
  const out: SearchHit[] = []
  for (const h of hits) {
    const key = `${h.slug}#${h.anchor ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= limit) break
  }
  return out
}
