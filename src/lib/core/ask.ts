// ask.ts — the "ask this corpus" prompt composer, and the BYO-key call.
//
// The site is static and stays static: no corpus ever leaves the machine
// unless the reader presses the button, and the answer comes from the
// assistant THEY configure — a key in localStorage, an OpenAI-compatible
// endpoint (OpenAI, OpenRouter, a local Ollama, anything speaking
// /chat/completions). The site needs no server, no account, and the
// corpus is never sent to us (we have no us).
//
// The prompt is the product: the page's own text, the corpus index, the
// raw-Org fallback URL, and a demand for citations an agent can verify.
// Pure functions here so the prompt shape is unit-testable without a
// network.

/** Where answers come from. `baseUrl` empty = the official OpenAI; a
 *  reader can point it at any compatible endpoint (Ollama, OpenRouter…). */
export type AskSettings = {
  baseUrl: string
  model: string
  key: string
}

const KEY = 'docneural:ask-settings'

const DEFAULTS: AskSettings = { baseUrl: '', model: 'gpt-4o-mini', key: '' }

/** The stored endpoint settings, or the defaults. Never throws. */
export function loadAskSettings(): AskSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const v = JSON.parse(raw) as Partial<AskSettings>
    return {
      baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl : DEFAULTS.baseUrl,
      model: typeof v.model === 'string' ? v.model : DEFAULTS.model,
      key: typeof v.key === 'string' ? v.key : DEFAULTS.key
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAskSettings(s: AskSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: the settings hold for this visit only */
  }
}

/** True when a reader can actually ask (a key, or a local endpoint that
 *  famously accepts any key). */
export function askReady(s: AskSettings): boolean {
  return !!s.key || /localhost|127\.0\.0\.1/.test(s.baseUrl)
}

export type AskContext = {
  /** Page title the question is about (may be '' → corpus-wide). */
  docTitle: string
  /** The page text (already trimmed). */
  docText: string
  /** The reader's question. */
  query: string
  /** Where the lossless chapter lives (the agent can re-fetch). */
  rawOrgUrl?: string
  /** The site's own corpus index (llms.txt). */
  corpus?: string
}

/** The prompt. System first with the citation demand, then the page, then
 *  the question — the shape that makes an answer verifiable: every claim
 *  names the section it came from, and "not in this page" is an allowed
 *  answer rather than a failure to hide. */
export function composeAskPrompt(ctx: AskContext): string {
  const lines: string[] = [
    'You answer questions about a documentation corpus, grounded ONLY in the',
    'context below. Rules:',
    '- Cite the section each claim comes from, as "§ <heading>".',
    '- If the context does not answer, say so plainly; never fill gaps from',
    '  general knowledge, and suggest which chapter to read next.',
    '- Be short. Two paragraphs unless asked for more.'
  ]
  if (ctx.docTitle) {
    lines.push('', `## Page: ${ctx.docTitle}`)
    if (ctx.rawOrgUrl) lines.push(`Full text: ${ctx.rawOrgUrl}`)
    lines.push('', ctx.docText.slice(0, 24_000))
  }
  if (ctx.corpus) {
    lines.push('', '## Corpus index (llms.txt)', ctx.corpus.slice(0, 4_000))
  }
  lines.push('', `## Question: ${ctx.query}`)
  return lines.join('\n')
}

/** One non-streaming chat completion against an OpenAI-compatible
 *  endpoint. Throws with the endpoint's own message on failure — the UI
 *  shows it verbatim, because "401" means the key, not the site. */
export async function askOnce(
  prompt: string,
  s: AskSettings,
  timeoutMs = 45_000
): Promise<string> {
  if (!askReady(s)) throw new Error('no endpoint configured — open settings')
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.key}`
      },
      body: JSON.stringify({
        model: s.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      }),
      signal: ctl.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`endpoint ${res.status}: ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return json.choices?.[0]?.message?.content ?? '(empty answer)'
  } finally {
    clearTimeout(timer)
  }
}
