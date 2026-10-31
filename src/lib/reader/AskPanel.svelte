<script lang="ts">
  // AskPanel — "ask the corpus": a client-side RAG over the static export,
  // ready to use out of the box. Owner directive 2026-10-31 ("add some cool
  // AI integrations and features!"), re-applied as the "ready-to-use AI"
  // pass: the brain is a free public OpenAI-compatible endpoint, no key.
  //
  // How it works, end to end:
  //   1. the panel ships pointed at a free, keyless, CORS-open brain
  //      (core/ai.ts AI_DEFAULTS) — the visitor asks, it answers;
  //   2. retrieval ranks the corpus locally (core/ai.ts#rankContext: title
  //      hits, word credit, degree tiebreak) and fetches those pages' .org
  //      source — the lossless exporter output llms.txt already points at;
  //   3. one chat-completions call; the answer renders with the extract
  //      titles it can be checked against, each a click away, plus up to 3
  //      follow-up question chips the model itself proposes.
  //   Two more surfaces ride the same endpoint: ⚡ essence (this page →
  //   TL;DR + key points) and quiz me (this page → 3 questions + answers).
  //   No retrieval there — the open page's own .org source IS the context.
  //   A personal endpoint + key stays OPTIONAL (settings); the key lives in
  //   this browser's localStorage and is sent only to that URL.
  //
  // Honest failure is a feature: 429 says the free tier is crowded, 401
  // says the override key is wrong, a TypeError says the endpoint refused a
  // browser (CORS), an empty corpus rank says the question looks
  // off-corpus. No spinners beyond the one real await; the busy indicator
  // is a plain text line (animation-loop budget law: no new keyframes).
  import { fly } from 'svelte/transition'
  import { DocneuralStore } from '../core/store.svelte'
  import {
    loadAiConfig,
    saveAiConfig,
    rankContext,
    buildMessages,
    buildEssenceMessages,
    buildQuizMessages,
    endpointHeaders,
    sanitizeAnswer,
    parseFollowUps,
    EXTRACT_BUDGET,
    AI_DEFAULTS,
    type AiConfig,
    type ChatMessage
  } from '../core/ai'
  import { sourceVars } from '../core/source'
  import type { DocNode } from '../core/types'

  let { store }: { store: DocneuralStore } = $props()

  let cfg = $state<AiConfig>(loadAiConfig())
  let editing = $state(false)
  let question = $state('')
  let busy = $state(false)
  let busyCopy = $state('')
  let answer = $state('')
  let sources = $state<DocNode[]>([])
  let followUps = $state<string[]>([])
  let error = $state('')
  let inputEl: HTMLInputElement | undefined = $state()
  let panelEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (store.aiOpen) {
      answer = ''
      error = ''
      sources = []
      followUps = []
      editing = false // the brain works out of the box; settings are optional
      setTimeout(() => inputEl?.focus(), 30)
    }
  })

  function close(): void {
    store.aiOpen = false
  }

  function keepCfg(): void {
    saveAiConfig($state.snapshot(cfg) as AiConfig)
    editing = false
  }

  /** One chat-completions POST with the shared status handling: aborts at
   *  60 s (the free tier can stall — patience is part of the free-brain
   *  contract), never sends an empty Bearer, and turns every failure mode
   *  into an honest sentence. Returns the model's content trimmed, or null
   *  once `error` is set. */
  async function postChat(messages: ChatMessage[]): Promise<string | null> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60000)
    try {
      const res = await fetch(`${cfg.url}/chat/completions`, {
        method: 'POST',
        headers: endpointHeaders(cfg),
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.2
        }),
        signal: ctrl.signal
      })
      if (res.status === 401 || res.status === 403) {
        error = 'the endpoint rejected the key (401/403) — check it in settings'
        return null
      }
      if (res.status === 402) {
        error =
          'free tier quota reached (402) — try again later, or set your own endpoint in settings'
        return null
      }
      if (res.status === 429) {
        error =
          'free endpoint rate-limited (429) — wait a moment, or set your own endpoint in settings'
        return null
      }
      if (!res.ok) {
        error = `the endpoint answered ${res.status} ${res.statusText || ''} — see its docs`
        return null
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content?.trim() || 'the endpoint returned no content'
    } catch (e) {
      error = ctrl.signal.aborted
        ? 'the free brain took too long — try again in a moment'
        : e instanceof TypeError
          ? 'the browser could not reach the endpoint (network, or it refuses browser calls / CORS)'
          : String(e instanceof Error ? e.message : e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  /** Retrieve + call. Everything async and DOM-adjacent lives here; the
   *  ranking and the payload are pure (core/ai.ts, unit-tested). */
  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    busy = true
    error = ''
    answer = ''
    sources = []
    followUps = []
    busyCopy = `retrieving pages · calling ${cfg.model}…`
    try {
      const degreeOf = (id: string) => store.views.get(id)?.degree ?? 0
      const hits = store.search(q, 6)
      const pool = store.data.nodes.filter((n) => !n.stub)
      const picks = rankContext(q, pool, hits, degreeOf, 6)
      if (!picks.length) {
        error = 'nothing in this corpus matches those words — try a manual term'
        return
      }
      sources = picks
      const extracts: { title: string; slug: string; text: string }[] = []
      await Promise.all(
        picks.map(async (n) => {
          try {
            const res = await fetch(`${store.base}/docs/${n.slug}.org`)
            if (!res.ok) return
            const raw = await res.text()
            extracts.push({
              title: n.title,
              slug: n.slug,
              text: raw.length > EXTRACT_BUDGET ? raw.slice(0, EXTRACT_BUDGET) + '\n[…cut]' : raw
            })
          } catch {
            /* one missing page must not sink the answer */
          }
        })
      )
      if (!extracts.length) {
        error = 'could not fetch any page source — is the export served at ' + store.base + '/docs/?'
        return
      }
      const content = await postChat(buildMessages(q, extracts))
      if (content === null) return
      const clean = sanitizeAnswer(content) // reasoning models may inline <think>…
      const parsed = parseFollowUps(clean)
      answer = parsed.answer
      followUps = parsed.followUps
    } catch (e) {
      error = String(e instanceof Error ? e.message : e)
    } finally {
      busy = false
    }
  }

  /** The preset surfaces (⚡ essence / quiz me): no retrieval, no source
   *  chips, no follow-up parsing — the open page's own source goes to the
   *  brain whole, and the answer lands in the same .ask-answer area. */
  async function runPreset(kind: 'essence' | 'quiz'): Promise<void> {
    const sel = store.selected
    if (!sel || busy) return
    busy = true
    error = ''
    answer = ''
    sources = []
    followUps = []
    busyCopy = kind === 'essence' ? 'distilling this page…' : 'writing 3 questions…'
    try {
      let text = ''
      try {
        const res = await fetch(`${store.base}/docs/${sel.slug}.org`)
        if (!res.ok) {
          error = `could not fetch this page's source (${res.status}) — is the export served at ${store.base}/docs/?`
          return
        }
        const raw = await res.text()
        // Same budget the RAG extracts use: keeps one giant manual page from
        // blowing the anonymous tier's latency past the 60 s abort.
        text = raw.length > EXTRACT_BUDGET ? raw.slice(0, EXTRACT_BUDGET) + '\n[…cut]' : raw
      } catch (e) {
        error =
          e instanceof TypeError
            ? 'the browser could not reach the export (network?)'
            : String(e instanceof Error ? e.message : e)
        return
      }
      const content = await postChat(
        kind === 'essence' ? buildEssenceMessages(sel.title, text) : buildQuizMessages(sel.title, text)
      )
      if (content === null) return
      answer = sanitizeAnswer(content)
    } finally {
      busy = false
    }
  }

  /** A follow-up chip is a typed question: fill the input and fire. */
  function askNext(next: string): void {
    question = next
    void ask()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }
</script>

<svelte:window on:keydown={onKey} />

{#if store.aiOpen}
  <!-- One backdrop, one panel: static (no loops), reduced-motion visitors
       get the fade-free instant via the global parked rules. -->
  <div class="ask-backdrop" onclick={close} role="presentation">
    <div
      class="ask dn-dish"
      role="dialog"
      aria-modal="true"
      aria-label="Ask the corpus"
      bind:this={panelEl}
      onclick={(e) => e.stopPropagation()}
      transition:fly={{ y: 14, duration: 180 }}
      style={sourceVars(store.manual)}
    >
      <header class="ask-head">
        <p class="ask-title dn-mono">⌁ ask the corpus</p>
        <button class="ask-x dn-mono" onclick={close} title="Close (Esc)">×</button>
      </header>

      {#if editing}
        <section class="ask-cfg">
          <p class="ask-note">
            <strong>optional: bring your own endpoint</strong> — the panel already works with the
            free public brain, no key. A personal OpenAI-compatible endpoint overrides it. The key
            lives in this browser's localStorage and is sent only to the URL below.
          </p>
          {#if !cfg.key.trim()}
            <p class="ask-free dn-label">free public brain · no key needed</p>
          {/if}
          <label class="ask-field">
            <span class="dn-label">endpoint base</span>
            <input bind:value={cfg.url} spellcheck="false" placeholder={AI_DEFAULTS.url} />
          </label>
          <label class="ask-field">
            <span class="dn-label">api key</span>
            <input bind:value={cfg.key} type="password" spellcheck="false" placeholder="sk-… (optional)" />
          </label>
          <label class="ask-field">
            <span class="dn-label">model</span>
            <input bind:value={cfg.model} spellcheck="false" placeholder={AI_DEFAULTS.model} />
          </label>
          <div class="ask-row">
            <button class="ask-go dn-mono" onclick={keepCfg}>save</button>
            <button class="ask-alt dn-mono" onclick={() => (editing = false)}>back</button>
          </div>
        </section>
      {:else}
        <form
          class="ask-form"
          onsubmit={(e) => {
            e.preventDefault()
            void ask()
          }}
        >
          <div class="ask-box">
            <span class="ask-prompt dn-mono" aria-hidden="true">›</span>
            <input
              bind:this={inputEl}
              bind:value={question}
              placeholder={store.selected ? `ask about ${store.selected.title.toLowerCase()}…` : 'ask the manuals anything…'}
              aria-label="Your question"
            />
            <button class="ask-go dn-mono" type="submit" disabled={busy || !question.trim()}>
              {busy ? '…' : 'ask'}
            </button>
          </div>
          <div class="ask-row">
            {#if store.selected}
              <span class="ask-ctx dn-label">retrieval seeds: this page + title matches + hubs</span>
            {/if}
            <span class="ask-actions">
              {#if store.selected}
                <button
                  class="ask-alt dn-mono"
                  type="button"
                  disabled={busy}
                  onclick={() => void runPreset('essence')}>⚡ essence</button>
                <button
                  class="ask-alt dn-mono"
                  type="button"
                  disabled={busy}
                  onclick={() => void runPreset('quiz')}>quiz me</button>
              {/if}
              <button class="ask-alt dn-mono" type="button" onclick={() => (editing = true)}>settings</button>
            </span>
          </div>
        </form>

        {#if error}
          <p class="ask-error dn-mono" role="alert">✗ {error}</p>
        {/if}

        {#if answer}
          <article class="ask-answer">{answer}</article>
        {/if}

        {#if sources.length}
          <section class="ask-sources">
            <p class="dn-label">// sources used</p>
            <div class="ask-src-row">
              {#each sources as s (s.id)}
                <button
                  class="ask-src"
                  style={sourceVars(s.tags[0])}
                  onclick={() => {
                    close()
                    store.goto(s)
                  }}
                >{s.title}</button>
              {/each}
            </div>
          </section>
        {/if}

        {#if followUps.length}
          <section class="ask-sources">
            <p class="dn-label">// ask next</p>
            <div class="ask-src-row">
              {#each followUps as f (f)}
                <button class="ask-src" disabled={busy} onclick={() => askNext(f)}>{f}</button>
              {/each}
            </div>
          </section>
        {/if}

        {#if busy}
          <p class="ask-busy dn-mono" aria-live="polite">{busyCopy}</p>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .ask-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: color-mix(in srgb, var(--dn-bg) 72%, transparent);
    backdrop-filter: blur(2px);
    display: grid;
    place-items: start center;
    padding: 9vh 1rem 2rem;
  }
  .ask {
    width: min(46rem, 100%);
    max-height: 78vh;
    overflow: auto;
    background: var(--dn-bg);
    border: 1px solid var(--dn-border-strong);
    box-shadow: 0 18px 60px color-mix(in srgb, #000 45%, transparent);
    padding: 0 1.1rem 1.1rem;
  }
  .ask-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    background: var(--dn-bg);
    padding: 0.7rem 0 0.5rem;
    border-bottom: 1px solid var(--dn-border);
  }
  .ask-title {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: var(--dn-track);
    color: var(--dn-accent);
  }
  .ask-x {
    background: none;
    border: 1px solid var(--dn-border);
    color: var(--dn-fg-muted);
    min-width: 40px;
    min-height: 40px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .ask-x:hover {
    color: var(--dn-accent-2);
    border-color: var(--dn-accent-2);
  }
  .ask-note {
    color: var(--dn-fg-muted);
    font-size: 0.82rem;
    line-height: 1.55;
    margin: 0.8rem 0;
  }
  .ask-note strong {
    color: var(--dn-fg);
  }
  .ask-free {
    margin: 0.4rem 0;
    color: var(--dn-accent);
  }
  .ask-field {
    display: block;
    margin: 0.65rem 0;
  }
  .ask-field span {
    display: block;
    margin-bottom: 0.25rem;
  }
  .ask-field input {
    width: 100%;
    background: var(--dn-bg-raise, transparent);
    border: 1px solid var(--dn-border-strong);
    color: var(--dn-fg);
    padding: 0.55rem 0.6rem;
    font-family: inherit;
    font-size: 0.86rem;
    min-height: 40px;
  }
  .ask-field input:focus {
    outline: 2px solid var(--dn-accent);
    outline-offset: 1px;
  }
  .ask-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.7rem;
    min-height: 40px;
  }
  .ask-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
  }
  .ask-ctx {
    font-size: 0.62rem;
  }
  .ask-box {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--dn-border-strong);
    background: var(--dn-bg-raise, transparent);
    padding: 0.15rem 0.15rem 0.15rem 0.6rem;
    margin-top: 0.9rem;
  }
  .ask-prompt {
    color: var(--dn-accent);
  }
  .ask-box input {
    flex: 1 1 auto;
    background: none;
    border: 0;
    color: var(--dn-fg);
    font-family: inherit;
    font-size: 0.92rem;
    min-height: 44px;
  }
  .ask-box input:focus {
    outline: none;
  }
  .ask-box:focus-within {
    border-color: var(--dn-accent);
  }
  .ask-go {
    flex: 0 0 auto;
    background: var(--dn-accent);
    color: var(--dn-bg);
    border: 0;
    min-height: 40px;
    padding: 0 1rem;
    cursor: pointer;
    font-size: 0.72rem;
    letter-spacing: var(--dn-track);
  }
  .ask-go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ask-alt {
    background: none;
    border: 1px solid var(--dn-border);
    color: var(--dn-fg-muted);
    min-height: 40px;
    padding: 0 0.8rem;
    cursor: pointer;
    font-size: 0.66rem;
    letter-spacing: var(--dn-track);
  }
  .ask-alt:hover {
    color: var(--dn-fg);
    border-color: var(--dn-border-strong);
  }
  .ask-error {
    color: var(--dn-accent-2);
    font-size: 0.74rem;
    margin: 0.8rem 0 0;
  }
  .ask-answer {
    margin-top: 1rem;
    border-top: 1px solid var(--dn-border);
    padding-top: 0.9rem;
    color: var(--dn-fg);
    font-size: 0.92rem;
    line-height: 1.65;
    white-space: pre-wrap;
  }
  .ask-sources {
    margin-top: 1rem;
  }
  .ask-sources > p {
    margin: 0 0 0.4rem;
  }
  .ask-src-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .ask-src {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 45%, transparent);
    color: var(--dn-fg);
    min-height: 40px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.74rem;
  }
  .ask-src:hover {
    border-color: var(--dn-src, var(--dn-accent));
  }
  .ask-busy {
    color: var(--dn-fg-faint);
    font-size: 0.7rem;
    margin-top: 0.9rem;
  }
</style>
