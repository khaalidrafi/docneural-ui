<script lang="ts">
  // SynaptApp — shell: header (wordmark, mode switch, ⌘K, theme) then the
  // active surface. Docs-first: the site opens on Home (a real front door),
  // the reader shows a chapter, and the org-roam graph is the opt-in
  // "synapses" mode. One store drives all three so a selection survives
  // switching between them.
  import { onMount } from 'svelte'
  import SynapsesGraph from './graph/SynapsesGraph.svelte'
  import FilterBar from './graph/FilterBar.svelte'
  import NotePreview from './reader/NotePreview.svelte'
  import DocReader from './reader/DocReader.svelte'
  import Home from './reader/Home.svelte'
  import CommandPalette from './ui/CommandPalette.svelte'
  import { SynaptStore } from './core/store.svelte'

  let {
    base = '.',
    title = 'synapt',
    lite = false
  }: {
    base?: string
    title?: string
    lite?: boolean
  } = $props()

  // Toggle state for graph/lite mode
  let forceLite = $state(false);

  // Lite resolution mirrors org-roam-lite-ui: explicit ?lite=1 or the
  // `lite` prop, plus a courtesy auto-detect — a potato with deviceMemory
  // <= 2 GB should never pay for a force-graph simulation it can't run.
  let liteOn = $derived(
    lite ||
      forceLite ||
      new URLSearchParams(location.search).get('lite') === '1' ||
      ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2
  )

  const store = $derived(new SynaptStore(base, liteOn))
  $effect(() => {
    void store.load()
  })

  let paletteOpen = $state(false)
  let helpOpen = $state(false)
  let theme = $state<string | null>(null)

  function toggleTheme(): void {
    const cur = document.documentElement.dataset.theme
    theme = cur === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
  }

  function toggleLite(): void {
    forceLite = !forceLite;
    location.reload();
  }

  function onNodeClick(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }

  // Global keyboard layer...
  onMount(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | 0 = 0
    function onKey(e: KeyboardEvent): void {
      const t = e.target as HTMLElement
      const typing =
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        paletteOpen = !paletteOpen
        return
      }
      if (e.key === 'Escape') {
        paletteOpen = false
        helpOpen = false
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?') { helpOpen = !helpOpen; return }

      if (pendingG) {
        clearTimeout(gTimer)
        pendingG = false
        if (e.key === 'd') return store.setMode('reader')
        if (e.key === 's') return store.setMode('graph')
        if (e.key === 'h') return store.goHome()
        return
      }
      if (e.key === 'g') {
        pendingG = true
        gTimer = setTimeout(() => (pendingG = false), 700)
        return
      }

      if (e.key === '[') { const p = store.prevChapter(); if (p) store.goto(p, 'reader'); return }
      if (e.key === ']') { const n = store.nextChapter(); if (n) store.goto(n, 'reader'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(gTimer)
    }
  })
</script>

<header class="shell">
  <button class="brand sy-mono" onclick={() => store.goHome()} aria-label="{title} home">
    ~/{title}<span class="sy-caret">▌</span>
  </button>

  <nav class="modes" aria-label="View mode">
    <button class:active={store.mode === 'reader'} onclick={() => store.setMode('reader')}>
      ▤ docs
    </button>
    {#if !store.lite}
      <button class:active={store.mode === 'graph'} onclick={() => store.setMode('graph')}>
        <span class="spark">⌁</span> synapses
      </button>
    {/if}
  </nav>

  <div class="tools">
    <button class="tool kbd" onclick={() => (paletteOpen = true)} aria-label="Search (Ctrl-K)">
      ⌕ <span class="hintkey">⌘K</span>
    </button>
    <button class="tool" onclick={() => (helpOpen = true)} aria-label="Keyboard help">?</button>
    <button class="tool" onclick={toggleLite} aria-label="Toggle lite mode">
      {store.lite ? 'fast' : 'full'}
    </button>
    <button class="tool" onclick={toggleTheme} aria-label="Toggle theme">☾</button>
  </div>
</header>

{#if store.failed}
  <div class="fatal sy-mono">
    ⚠ {store.failed}
    <p>expected `{base}/graph.json` from a site build</p>
  </div>
{:else if !store.ready}
  <div class="boot sy-mono"><span class="spark">⌁</span> firing synapses…</div>
{:else if store.mode === 'graph' && !store.lite}
  <section class="synapse-mode">
    <div class="canvas-wrap">
      <SynapsesGraph {store} {onNodeClick} />
    </div>
    <div class="controls">
      <FilterBar {store} />
    </div>
    <div class="mode-tag sy-mono"><span class="spark">⌁</span> synapses · {store.visible.links.length} wires</div>
    <NotePreview {store} />
  </section>
{:else if store.selected}
  <section class="reader-mode">
    <DocReader {store} />
  </section>
{:else}
  <Home {store} />
{/if}

<CommandPalette bind:open={paletteOpen} {store} />

{#if helpOpen}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) helpOpen = false }}
    onkeydown={(e) => { if (e.key === 'Escape') helpOpen = false }}
  >
    <div class="help">
      <h3 class="sy-mono">synapt — keys &amp; idea</h3>
      <p class="blurb">
        A documentation reader <em>enhanced</em> with an org-roam graph. The written
        word is the home page; <span class="spark">⌁ synapses</span> is the connection
        graph between docs — named for Hebb's law, since every citation resolved
        strengthens the link.
      </p>
      <dl>
        <dt>⌘K / Ctrl-K</dt><dd>command palette (jump anywhere)</dd>
        <dt>g then d</dt><dd>docs mode</dd>
        <dt>g then s</dt><dd>synapses mode</dd>
        <dt>g then h</dt><dd>home</dd>
        <dt>[  /  ]</dt><dd>previous / next chapter</dd>
        <dt>?</dt><dd>this help</dd>
        <dt>esc</dt><dd>close overlays</dd>
      </dl>
      <button class="close sy-mono" onclick={() => (helpOpen = false)}>close</button>
    </div>
  </div>
{/if}

<style>
  .shell {
    display: flex;
    align-items: center;
    gap: 1rem;
    height: var(--sy-header-h);
    padding: 0 1rem;
    border-bottom: 1px solid var(--sy-border);
    background: color-mix(in srgb, var(--sy-bg-sunken) 70%, transparent);
  }
  .brand {
    font-family: var(--sy-font-mono);
    font-size: 1rem;
    color: var(--sy-fg);
    letter-spacing: 0.02em;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .brand:hover { color: var(--sy-accent); }

  .modes {
    display: flex;
    gap: 0.3rem;
    font-family: var(--sy-font-mono);
    font-size: 0.8rem;
    margin-left: 0.4rem;
  }
  .modes button {
    color: var(--sy-fg-muted);
    background: transparent;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.25em 0.8em;
    cursor: pointer;
    transition: all 120ms;
  }
  .modes button:hover { color: var(--sy-fg); border-color: var(--sy-border-strong); }
  .modes button.active {
    color: var(--sy-bg);
    background: var(--sy-accent);
    border-color: var(--sy-accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--sy-accent) 45%, transparent);
  }
  .spark { color: var(--sy-accent); animation: sy-pulse 2.6s ease-in-out infinite; }
  .modes button.active .spark { color: var(--sy-bg); }

  .tools { display: flex; gap: 0.35rem; margin-left: auto; align-items: center; }
  .tool {
    font-family: var(--sy-font-mono);
    font-size: 0.85rem;
    color: var(--sy-fg-muted);
    background: transparent;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.25em 0.6em;
    cursor: pointer;
    transition: all 120ms;
  }
  .tool:hover { color: var(--sy-accent); border-color: var(--sy-accent-dim); }
  .tool .hintkey { color: var(--sy-fg-faint); font-size: 0.72rem; margin-left: 0.3em; }

  @media (max-width: 600px) {
    .modes { display: none; }
    .tool.kbd { display: none; }
    .shell { padding: 0 0.5rem; gap: 0.5rem; }
  }

  .synapse-mode {
    position: relative;
    height: calc(100dvh - var(--sy-header-h));
    min-height: 0;
  }
  .canvas-wrap { position: absolute; inset: 0; }
  .controls {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    width: 240px;
    z-index: 2;
    padding: 0.7rem;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    background: color-mix(in srgb, var(--sy-bg) 85%, transparent);
    backdrop-filter: blur(4px);
  }
  @media (max-width: 600px) {
    .controls { left: 0.5rem; width: calc(100vw - 1rem); }
  }
  .mode-tag {
    position: absolute;
    bottom: 0.9rem;
    left: 0.9rem;
    z-index: 2;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--sy-fg-muted);
    background: color-mix(in srgb, var(--sy-bg) 75%, transparent);
    border: 1px solid var(--sy-border);
    border-radius: 999px;
    padding: 0.2em 0.9em;
  }
  .reader-mode {
    height: calc(100dvh - var(--sy-header-h));
    min-height: 0;
  }

  .fatal { padding: 2rem; color: var(--sy-amber); font-size: 0.9rem; }
  .fatal p { color: var(--sy-fg-faint); }
  .boot {
    padding: 3rem;
    text-align: center;
    color: var(--sy-accent-dim);
    font-size: 0.9rem;
    letter-spacing: 0.1em;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: color-mix(in srgb, var(--sy-bg-sunken) 60%, transparent);
    backdrop-filter: blur(3px);
  }
  .help {
    width: min(34rem, 100%);
    background: var(--sy-bg);
    border: 1px solid var(--sy-border-strong);
    border-radius: 10px;
    padding: 1.4rem 1.6rem;
    box-shadow: 0 24px 60px color-mix(in srgb, var(--sy-bg-sunken) 75%, transparent);
  }
  .help h3 { margin: 0 0 0.6rem; font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sy-accent); }
  .blurb { color: var(--sy-fg-muted); font-size: 0.9rem; line-height: 1.6; margin: 0 0 1rem; }
  .blurb em { color: var(--sy-fg); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; }
  dt { font-family: var(--sy-font-mono); font-size: 0.8rem; color: var(--sy-accent-2); }
  dd { margin: 0; font-size: 0.85rem; color: var(--sy-fg-muted); }
  .close {
    margin-top: 1.2rem;
    font-size: 0.78rem;
    color: var(--sy-bg);
    background: var(--sy-accent);
    border: none;
    border-radius: var(--sy-radius);
    padding: 0.35em 1em;
    cursor: pointer;
  }
  @keyframes sy-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
