<script lang="ts">
  // AskPanel — "ask this corpus", BYO key, nothing leaves by default.
  //
  // The site is static, so the answer comes from the assistant the READER
  // configures: any OpenAI-compatible endpoint (OpenAI, OpenRouter, a
  // local Ollama). The key lives in this browser's localStorage and the
  // request goes straight to the endpoint — the corpus is never sent to
  // us, because there is no us.
  //
  // The prompt is grounded in the page you are reading (plus the corpus
  // index), and every answer is expected to cite sections. Enter the
  // palette with `? what is a synapse?` to arrive here pre-filled.
  import { DocneuralStore } from '../core/store.svelte'
  import {
    askReady,
    askOnce,
    composeAskPrompt,
    loadAskSettings,
    saveAskSettings,
    type AskSettings
  } from '../core/ask'

  let {
    store,
    open = $bindable(false),
    initialQuery = $bindable('')
  }: {
    store: DocneuralStore
    open?: boolean
    initialQuery?: string
  } = $props()

  let q = $state(initialQuery)
  let settingsOpen = $state(false)
  let settings = $state<AskSettings>(loadAskSettings())
  let answer = $state('')
  let busy = $state(false)
  let error = $state('')

  $effect(() => {
    if (open && initialQuery && !q) q = initialQuery
  })

  function save(): void {
    saveAskSettings(settings)
    settingsOpen = false
  }

  async function ask(): Promise<void> {
    if (!q.trim()) return
    busy = true
    error = ''
    answer = ''
    try {
      const doc = store.selected
      const html = doc ? store.bodies.get(doc.slug) : null
      const text = html
        ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim()
        : ''
      const prompt = composeAskPrompt({
        docTitle: doc?.title ?? '',
        docText: text,
        query: q.trim(),
        rawOrgUrl: doc ? `${store.base}/docs/${doc.slug}.org` : undefined
      })
      answer = await askOnce(prompt, settings)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') open = false
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask()
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Ask this corpus"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false
    }}
    onkeydown={onKey}
  >
    <div class="ask dn-hud">
      <div class="titlebar dn-mono">
        <span class="tb-l">? ask this corpus</span>
        <span class="tb-r">
          {store.selected ? `grounded in · ${store.selected.title}` : 'corpus-wide'}
        </span>
      </div>

      <div class="row">
        <span class="gt" aria-hidden="true">?</span>
        <input
          bind:value={q}
          type="text"
          placeholder="what is a synapse?"
          aria-label="Question"
        />
        <button class="go" onclick={ask} disabled={busy || !q.trim()}>
          {busy ? 'asking…' : 'ask ⏎'}
        </button>
      </div>

      {#if !askReady(settings) && !answer}
        <p class="hint dn-mono">
          No endpoint yet — answers come from <b>your</b> assistant (OpenAI-compatible;
          a local Ollama works with no key). The key stays in this browser and nothing
          is sent to us.
          <button class="link" onclick={() => (settingsOpen = !settingsOpen)}>
            {settingsOpen ? 'hide settings' : 'configure'}
          </button>
        </p>
      {/if}

      {#if settingsOpen}
        <div class="settings">
          <label>base url <input bind:value={settings.baseUrl} placeholder="https://api.openai.com/v1" /></label>
          <label>model <input bind:value={settings.model} placeholder="gpt-4o-mini" /></label>
          <label>key <input bind:value={settings.key} type="password" placeholder="sk-…" /></label>
          <button class="go" onclick={save}>save</button>
        </div>
      {/if}

      {#if error}<p class="err dn-mono" role="alert">{error}</p>{/if}
      {#if answer}
        <div class="answer">{answer}</div>
      {/if}

      <div class="bar dn-mono">
        <span>grounded in the open page · answers cite sections · ⌘/ctrl+⏎</span>
        <button class="link" onclick={() => (settingsOpen = !settingsOpen)}>settings</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 10vh 1rem 1rem;
    background: color-mix(in srgb, var(--dn-bg-sunken) 74%, transparent);
  }
  .ask {
    position: relative;
    width: min(38rem, 100%);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    box-shadow: 0 24px 60px color-mix(in srgb, var(--dn-bg-sunken) 85%, transparent);
    overflow: hidden;
    animation: dn-rise 160ms ease-out both;
  }
  .titlebar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45em 0.9em;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
    border-bottom: 1px solid var(--dn-border);
  }
  .tb-l { color: var(--dn-accent); }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.4em 0.9em;
  }
  .gt { color: var(--dn-fg-muted); font-family: var(--dn-font-mono); }
  .row input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: var(--dn-fg);
    font-family: var(--dn-font-prose);
    font-size: 0.95rem;
  }
  .row input:focus { outline: none; caret-color: var(--dn-accent); }
  .go {
    background: color-mix(in srgb, var(--dn-accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-accent) 45%, transparent);
    color: var(--dn-accent);
    padding: 0.3em 0.8em;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    font-family: var(--dn-font-mono);
  }
  .go:disabled { opacity: 0.5; cursor: default; }
  .hint {
    margin: 0 0 0.4em;
    padding: 0 0.9em;
    color: var(--dn-fg-muted);
    font-size: 0.72rem;
    line-height: 1.5;
  }
  .link {
    background: none;
    border: none;
    color: var(--dn-accent);
    cursor: pointer;
    font-family: var(--dn-font-mono);
    font-size: 0.7rem;
    text-decoration: underline;
    padding: 0;
  }
  .settings {
    display: grid;
    gap: 0.4em;
    padding: 0.6em 0.9em;
    border-top: 1px solid var(--dn-border);
  }
  .settings label {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 0.6em;
    align-items: center;
    font-size: 0.7rem;
    color: var(--dn-fg-faint);
    font-family: var(--dn-font-mono);
  }
  .settings input {
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border);
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: 0.75rem;
    padding: 0.35em 0.5em;
  }
  .settings .go { justify-self: end; }
  .err {
    margin: 0.4em 0.9em;
    color: var(--dn-accent-2, #f66);
    font-size: 0.75rem;
  }
  .answer {
    padding: 0.6em 0.9em 0.9em;
    font-family: var(--dn-font-prose);
    font-size: 0.88rem;
    line-height: 1.55;
    white-space: pre-wrap;
    max-height: 50vh;
    overflow-y: auto;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid var(--dn-border);
    padding: 0.5em 0.9em;
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 60%, transparent);
  }
</style>
