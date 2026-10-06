<script lang="ts">
  // MyceliumApp — shell: header (wordmark, mode switch), then one of the
  // two reading surfaces on the SAME store. Graph mode is the roam UI
  // (canvas + filters + in-graph preview); reader mode is the generic docs
  // UI. Both can reach every doc; switching keeps the selection.
  import GraphView from './graph/GraphView.svelte'
  import FilterBar from './graph/FilterBar.svelte'
  import NotePreview from './reader/NotePreview.svelte'
  import DocReader from './reader/DocReader.svelte'
  import { MyceliumStore } from './core/store.svelte'

  let {
    base = '.',
    title = 'mycelium'
  }: {
    /** URL prefix serving graph.json + docs/*.html. */
    base?: string
    title?: string
  } = $props()

  // `base` selects where the WHOLE app reads its static data; it is fixed
  // for the page lifetime by design (svelte-ignore below).
  // svelte-ignore state_referenced_locally
  const store = new MyceliumStore(base)
  $effect(() => {
    void store.load()
  })

  function onNodeClick(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }
</script>

<header class="shell">
  <div class="brand myc-mono" aria-label="{title}">
    ~/{title}<span class="myc-caret">▌</span>
  </div>
  <nav class="modes" aria-label="View mode">
    <button class:active={store.mode === 'graph'} onclick={() => store.setMode('graph')}>
      ⌁ graph
    </button>
    <button class:active={store.mode === 'reader'} onclick={() => store.setMode('reader')}>
      ▤ reader
    </button>
  </nav>
</header>

{#if store.failed}
  <div class="fatal myc-mono">
    ⚠ {store.failed}
    <p>expected `{base}/graph.json` from a site build</p>
  </div>
{:else if !store.ready}
  <div class="fatal myc-mono">· extending hyphae…</div>
{:else if store.mode === 'graph'}
  <section class="graph-mode">
    <div class="canvas-wrap">
      <GraphView data={store.visible} selectedId={store.selected?.id} {onNodeClick} />
    </div>
    <div class="controls">
      <FilterBar {store} />
    </div>
    <NotePreview {store} />
  </section>
{:else}
  <section class="reader-mode">
    <DocReader {store} />
  </section>
{/if}

<style>
  .shell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--myc-header-h);
    padding: 0 1rem;
    border-bottom: 1px solid var(--myc-border);
    background: color-mix(in srgb, var(--myc-bg-sunken) 70%, transparent);
  }
  .brand {
    font-size: 1rem;
    color: var(--myc-fg);
    letter-spacing: 0.02em;
  }
  .modes {
    display: flex;
    gap: 0.3rem;
    font-family: var(--myc-font-mono);
    font-size: 0.8rem;
  }
  .modes button {
    color: var(--myc-fg-muted);
    background: transparent;
    border: 1px solid var(--myc-border);
    border-radius: var(--myc-radius);
    padding: 0.25em 0.8em;
    cursor: pointer;
  }
  .modes button.active {
    color: var(--myc-bg);
    background: var(--myc-accent);
    border-color: var(--myc-accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--myc-accent) 45%, transparent);
  }
  .graph-mode {
    position: relative;
    height: calc(100dvh - var(--myc-header-h));
    min-height: 0;
  }
  .canvas-wrap {
    position: absolute;
    inset: 0;
  }
  .controls {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    width: 240px;
    z-index: 2;
    padding: 0.7rem;
    border: 1px solid var(--myc-border);
    border-radius: var(--myc-radius);
    background: color-mix(in srgb, var(--myc-bg) 85%, transparent);
    backdrop-filter: blur(4px);
  }
  .reader-mode {
    height: calc(100dvh - var(--myc-header-h));
    min-height: 0;
  }
  .fatal {
    padding: 2rem;
    color: var(--myc-amber);
    font-size: 0.9rem;
  }
  .fatal p { color: var(--myc-fg-faint); }
</style>
