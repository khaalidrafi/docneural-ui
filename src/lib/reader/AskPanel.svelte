<script lang="ts">
  // AskPanel — "ask the corpus": a BYOK client-side RAG over the static
  // export. Owner directive 2026-10-31 ("add some cool AI integrations").
  //
  // How it works, end to end:
  //   1. the visitor configures THEIR OWN OpenAI-compatible endpoint + key
  //      (core/ai.ts; localStorage `docneural:ai`, never sent anywhere but
  //      that endpoint, nothing proxied through us — there is no "us", the
  //      site is files on Pages);
  //   2. retrieval ranks the corpus locally (core/ai.ts#rankContext: title
  //      hits, word credit, degree tiebreak) and fetches those pages' .org
  //      source — the lossless exporter output llms.txt already points at;
  //   3. one chat-completions call; the answer renders with the extract
  //      titles it can be checked against, each a click away.
  //
  // Honest failure is a feature: 401 says the key is wrong, a TypeError
  // says the endpoint refused a browser (CORS), an empty corpus rank says
  // the question looks off-corpus. No spinners beyond the one real await.
  import { fly } from 'svelte/transition'
  import { DocneuralStore } from '../core/store.svelte'
  import {
    loadAiConfig,
    saveAiConfig,
    rankContext,
    buildMessages,
    EXTRACT_BUDGET,
    type AiConfig
  } from '../core/ai'
  import { sourceVars } from '../core/source'
  import type { DocNode } from '../core/types'

  let { store }: { store: DocneuralStore } = $props()

  let cfg = $state<AiConfig>(loadAiConfig())
  let editing = $state(false)
  let question = $state('')
  let busy = $state(false)
  let answer = $state('')
  let sources = $state<DocNode[]>([])
  let error = $state('')
  let inputEl: HTMLInputElement | undefined = $state()
  let panelEl: HTMLDivElement | undefined = $state()

  const configured = $derived(cfg.key.trim().length > 0)

  $effect(() => {
    if (store.aiOpen) {
      answer = ''
      error = ''
      sources = []
      editing = !configured
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

  /** Retrieve + call. Everything async and DOM-adjacent lives here; the
   *  ranking and the payload are pure (core/ai.ts, unit-tested). */
  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    busy = true
    error = ''
    answer = ''
    sources = []
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
      const res = await fetch(`${cfg.url}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.key.trim()}`
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: buildMessages(q, extracts),
          temperature: 0.2
        })
      })
      if (res.status === 401 || res.status === 403) {
        error = 'the endpoint rejected the key (401/403) — check it in settings'
        return
      }
      if (!res.ok) {
        error = `the endpoint answered ${res.status} ${res.statusText || ''} — see its docs`
        return
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      answer = data.choices?.[0]?.message?.content?.trim() || 'the endpoint returned no content'
    } catch (e) {
      error =
        e instanceof TypeError
          ? 'the browser could not reach the endpoint (network, or it refuses browser calls / CORS)'
          : String(e instanceof Error ? e.message : e)
    } finally {
      busy = false
    }
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
            This site is static — there is no server to proxy AI calls, so the panel
            uses <strong>your own</strong> OpenAI-compatible endpoint. The key lives in
            this browser's localStorage and is sent only to the URL below.
          </p>
          <label class="ask-field">
            <span class="dn-label">endpoint base</span>
            <input bind:value={cfg.url} spellcheck="false" placeholder="https://api.openai.com/v1" />
          </label>
          <label class="ask-field">
            <span class="dn-label">api key</span>
            <input bind:value={cfg.key} type="password" spellcheck="false" placeholder="sk-…" />
          </label>
          <label class="ask-field">
            <span class="dn-label">model</span>
            <input bind:value={cfg.model} spellcheck="false" placeholder="gpt-4o-mini" />
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
            <button class="ask-go dn-mono" type="submit" disabled={busy || !configured}>
              {busy ? '…' : 'ask'}
            </button>
          </div>
          <div class="ask-row">
            {#if store.selected}
              <span class="ask-ctx dn-label">retrieval seeds: this page + title matches + hubs</span>
            {/if}
            <button class="ask-alt dn-mono" type="button" onclick={() => (editing = true)}>settings</button>
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

        {#if busy}
          <p class="ask-busy dn-mono" aria-live="polite">retrieving pages · calling {cfg.model}…</p>
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
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.7rem;
    min-height: 40px;
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
