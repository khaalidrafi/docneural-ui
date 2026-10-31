// ai.ts — the brains of "ask the corpus", kept DOM-free and unit-testable.
//
// Owner directive 2026-10-31: "add some cool AI integrations and features!"
// The site is static (GitHub Pages, no backend, no tracker), so the one AI
// integration that fits WITHOUT a server is a BYOK client-side RAG: the
// visitor's own OpenAI-compatible endpoint, their key in their localStorage,
// retrieval over the corpus the exporter already ships (titles, degrees and
// per-page .org source), and one chat-completions call from the browser.
// Nothing is proxied, nothing is stored server-side, and the panel says so.
//
// The fetch itself lives in AskPanel.svelte (it needs DOM error states);
// everything that can be wrong on its own lives here.

import type { DocNode } from './types'

export type AiConfig = {
  /** OpenAI-compatible base URL, no trailing slash. */
  url: string
  /** The visitor's own key. Stays in localStorage; goes only to `url`. */
  key: string
  model: string
}

const KEY = 'docneural:ai'
export const AI_DEFAULTS: AiConfig = {
  url: 'https://api.openai.com/v1',
  key: '',
  model: 'gpt-4o-mini'
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...AI_DEFAULTS }
    const p = JSON.parse(raw) as Partial<AiConfig>
    return {
      url: typeof p.url === 'string' && p.url.trim() ? p.url.trim().replace(/\/+$/, '') : AI_DEFAULTS.url,
      key: typeof p.key === 'string' ? p.key : '',
      model: typeof p.model === 'string' && p.model.trim() ? p.model.trim() : AI_DEFAULTS.model
    }
  } catch {
    return { ...AI_DEFAULTS }
  }
}

export function saveAiConfig(cfg: AiConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* private mode: the in-memory copy still works for this visit */
  }
}

/** The retrieval scorer: how well one doc answers `query`. Title dominates
 *  (a page named for the thing beats a page that merely mentions it), the
 *  query's words add partial credit, degree breaks ties (a heavily-wired
 *  page is a better corpus ambassador than an orphan). Deterministic. */
export function askScore(n: DocNode, words: string[], degree: number): number {
  const title = n.title.toLowerCase()
  let s = 0
  if (words.some((w) => title.includes(w))) s += 10
  for (const w of words) if (w.length > 2 && title.includes(w)) s += 2
  s += Math.min(4, Math.sqrt(degree) / 2)
  return s
}

/** Pick the docs whose .org source goes into the prompt: title hits first
 *  (the store's own search), then the scorer's best, deduped by id, capped.
 *  The doc already on screen rides along when it scores anything at all —
 *  "ask about THIS page" is the common case. */
export function rankContext(
  query: string,
  nodes: DocNode[],
  titleHits: DocNode[],
  degreeOf: (id: string) => number,
  limit = 6
): DocNode[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const scored = nodes
    .map((n) => ({ n, s: askScore(n, words, degreeOf(n.id) ?? 0) }))
    .filter((x) => x.s > 2)
    .sort((a, b) => b.s - a.s || (a.n.id < b.n.id ? -1 : 1))
    .map((x) => x.n)
  const out: DocNode[] = []
  const seen = new Set<string>()
  const push = (n: DocNode) => {
    if (!seen.has(n.id) && out.length < limit) {
      seen.add(n.id)
      out.push(n)
    }
  }
  for (const n of titleHits) push(n)
  for (const n of scored) push(n)
  return out
}

/** Chat-completions payload. The extracts are fenced and titled so the model
 *  can cite them; the instruction pins it to the corpus and makes
 *  "not covered" a first-class answer instead of an invitation to hallucinate. */
export function buildMessages(
  question: string,
  extracts: { title: string; slug: string; text: string }[]
): { role: 'system' | 'user'; content: string }[] {
  const ctx = extracts
    .map((e) => `<extract title="${e.title}" slug="${e.slug}">\n${e.text}\n</extract>`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You answer questions about a documentation corpus (GNU manuals exported from Org). ' +
        'Use ONLY the <extract> blocks supplied. Cite the extract titles you used, like [Title]. ' +
        'If the extracts do not cover the question, say exactly that — never guess. Be concise.'
    },
    {
      role: 'user',
      content: `Manual extracts:\n\n${ctx}\n\nQuestion: ${question}`
    }
  ]
}

/** Per-extract character budget: 6 extracts × ~7.5 kB ≈ 11k tokens of
 *  context — inside every model's comfort zone, and long enough that most
 *  manual pages fit whole. */
export const EXTRACT_BUDGET = 7500
