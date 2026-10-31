// ai.ts — the brains of "ask the corpus", kept DOM-free and unit-testable.
//
// Owner directive 2026-10-31: "add some cool AI integrations and features!"
// The site is static (GitHub Pages, no backend, no tracker), so the AI runs
// entirely in the visitor's browser. The default brain is a free public
// OpenAI-compatible endpoint that works out of the box, no key — the site
// is useful the moment it loads. A personal endpoint + key is an OPTIONAL
// override (same code path; the visitor's config simply replaces the
// defaults). Retrieval stays local either way: titles, degrees and
// per-page .org source the exporter already ships, one chat-completions
// call from the browser. Nothing is proxied, nothing is stored server-side.
//
// The fetch itself lives in AskPanel.svelte (it needs DOM error states);
// everything that can be wrong on its own lives here.

import type { DocNode } from './types'

export type AiConfig = {
  /** OpenAI-compatible base URL, no trailing slash. */
  url: string
  /** OPTIONAL personal key. Stays in localStorage; goes only to `url`,
   *  and only when non-empty (never an empty Bearer). */
  key: string
  model: string
}

/** One chat message, shaped the way every OpenAI-compatible endpoint takes it. */
export type ChatMessage = { role: 'system' | 'user'; content: string }

const KEY = 'docneural:ai'
export const AI_DEFAULTS: AiConfig = {
  // The free public brain: CORS-open, anonymous tier, no key needed.
  // `${url}/chat/completions` is the OpenAI-compatible chat path.
  url: 'https://text.pollinations.ai/openai',
  key: '',
  model: 'openai'
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

/** Headers for one chat-completions POST. Always JSON; the Authorization
 *  header appears ONLY when a non-empty key is configured — the free public
 *  brain is keyless and an empty Bearer can make strict endpoints 401. */
export function endpointHeaders(cfg: AiConfig): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const key = cfg.key.trim()
  if (key) headers.authorization = `Bearer ${key}`
  return headers
}

/** The anonymous-tier model is a reasoning model and may inline its thinking
 *  as one leading <think>…</think> block. Strip ONE leading block (the body
 *  after it is the actual answer) and trim; text without a block passes
 *  through unchanged. */
export function sanitizeAnswer(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>/i, '').trim()
}

/** The RAG prompt asks the model to end with one final line
 *  "FOLLOW-UPS: q1 | q2 | q3" so the panel can offer clickable next
 *  questions. Parse that line out: the rest is the answer. Only a TRAILING
 *  line counts (a marker mid-answer is prose, not protocol); each candidate
 *  is trimmed, 4–90 chars, deduped case-insensitively, 3 max. No marker →
 *  the trimmed original with no follow-ups. */
export function parseFollowUps(answer: string): { answer: string; followUps: string[] } {
  const trimmed = answer.trim()
  const lines = trimmed.split('\n')
  const last = (lines[lines.length - 1] ?? '').trim()
  if (!last.startsWith('FOLLOW-UPS:')) return { answer: trimmed, followUps: [] }
  const followUps: string[] = []
  const seen = new Set<string>()
  for (const raw of last.slice('FOLLOW-UPS:'.length).split('|')) {
    const item = raw.trim()
    if (item.length < 4 || item.length > 90) continue
    const k = item.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    followUps.push(item)
    if (followUps.length === 3) break
  }
  return { answer: lines.slice(0, -1).join('\n').trim(), followUps }
}

/** Per-extract character budget: 6 extracts × ~7.5 kB ≈ 11k tokens of
 *  context — inside every model's comfort zone, and long enough that most
 *  manual pages fit whole. */
export const EXTRACT_BUDGET = 7500

/** Chat-completions payload. The extracts are fenced and titled so the model
 *  can cite them; the instruction pins it to the corpus and makes
 *  "not covered" a first-class answer instead of an invitation to
 *  hallucinate. The FOLLOW-UPS line is the panel's "ask next" chips. */
export function buildMessages(question: string, extracts: { title: string; slug: string; text: string }[]): ChatMessage[] {
  const ctx = extracts
    .map((e) => `<extract title="${e.title}" slug="${e.slug}">\n${e.text}\n</extract>`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You answer questions about a documentation corpus (GNU manuals exported from Org). ' +
        'Use ONLY the <extract> blocks supplied. Cite the extract titles you used, like [Title]. ' +
        'If the extracts do not cover the question, say exactly that — never guess. Be concise. ' +
        'End your answer with one final line reading "FOLLOW-UPS:" followed by exactly 3 ' +
        'suggested follow-up questions separated by " | ".'
    },
    {
      role: 'user',
      content: `Manual extracts:\n\n${ctx}\n\nQuestion: ${question}`
    }
  ]
}

/** ⚡ essence: one page → its TL;DR + 3 key points. No retrieval, no corpus
 *  rank — the page's own .org source IS the context. Same grounding law as
 *  buildMessages: the given text is the whole world. */
export function buildEssenceMessages(title: string, text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You distill one documentation page (GNU manuals exported from Org). ' +
        'Use ONLY the page text supplied — never guess beyond it. ' +
        'Reply with a 2–3 sentence TL;DR of the page, then a line reading exactly "KEY POINTS", ' +
        'then exactly 3 bullet points, each starting with "- ".'
    },
    {
      role: 'user',
      content: `Page: ${title}\n\nPage text:\n${text}`
    }
  ]
}

/** quiz me: one page → 3 questions, then the answers. Same grounding law:
 *  the questions must be answerable from the page text alone. */
export function buildQuizMessages(title: string, text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You quiz a reader on one documentation page (GNU manuals exported from Org). ' +
        'Use ONLY the page text supplied — never guess beyond it. ' +
        'Write exactly 3 questions about the page, one per line, numbered "Q1." "Q2." "Q3."; ' +
        'then a line reading exactly "ANSWERS"; then short answers, one per line, ' +
        '"A1." "A2." "A3.", each kept to a sentence or less.'
    },
    {
      role: 'user',
      content: `Page: ${title}\n\nPage text:\n${text}`
    }
  ]
}
