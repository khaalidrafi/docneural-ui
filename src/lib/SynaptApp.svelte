<script lang="ts">
  // SynaptApp — shell: header (wordmark, mode switch), then one of the
  // two reading surfaces on the SAME store. Graph mode is the roam UI
  // (canvas + filters + in-graph preview); reader mode is the generic docs
  // UI. Both can reach every doc; switching keeps the selection.
  import GraphView from './graph/GraphView.svelte'
  import FilterBar from './graph/FilterBar.svelte'
  import NotePreview from './reader/NotePreview.svelte'
  import DocReader from './reader/DocReader.svelte'
  import { SynaptStore } from './core/store.svelte'

  let {
    base = '.',
    title = 'synapt',
    lite = false
  }: {
    /** URL prefix serving graph.json + docs/*.html. */
    base?: string
    title?: string
    /** Force the extra-lite tier; also auto-on for tiny machines. */
    lite?: boolean
  } = $props()

  // Lite resolution mirrors org-roam-lite-ui: explicit ?lite=1 or the
  // `lite` prop, plus a courtesy auto-detect — a potato with deviceMemory
  // <= 2 GB should never pay for a force-graph simulation it can't run.
  // svelte-ignore state_referenced_locally -- fixed for the page lifetime.
  const liteOn =
    lite ||
    new URLSearchParams(location.search).get('lite') === '1' ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2
  // svelte-ignore state_referenced_locally
  const store = new SynaptStore(base, liteOn)
  $effect(() => {
    void store.load()
  })

  function onNodeClick(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }
</script>

<header class="shell">
  <div class="brand sy-mono" aria-label="{title}">
    ~/{title}<span class="sy-caret">▌</span>
  </div>
  <nav class="modes" aria-label="View mode">
    {#if !store.lite}
      <button class:active={store.mode === 'graph'} onclick={() => store.setMode('graph')}>
        ⌁ graph
      </button>
    {/if}
    <button class:active={store.mode === 'reader'} onclick={() => store.setMode('reader')}>
      ▤ reader
    </button>
  </nav>
</header>

{#if store.failed}
  <div class="fatal sy-mono">
    ⚠ {store.failed}
    <p>expected `{base}/graph.json` from a site build</p>
  </div>
{:else if !store.ready}
  <div class="fatal sy-mono">· firing synapses…</div>
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
    height: var(--sy-header-h);
    padding: 0 1rem;
    border-bottom: 1px solid var(--sy-border);
    background: color-mix(in srgb, var(--sy-bg-sunken) 70%, transparent);
  }
  .brand {
    font-size: 1rem;
    color: var(--sy-fg);
    letter-spacing: 0.02em;
  }
  .modes {
    display: flex;
    gap: 0.3rem;
    font-family: var(--sy-font-mono);
    font-size: 0.8rem;
  }
  .modes button {
    color: var(--sy-fg-muted);
    background: transparent;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.25em 0.8em;
    cursor: pointer;
  }
  .modes button.active {
    color: var(--sy-bg);
    background: var(--sy-accent);
    border-color: var(--sy-accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--sy-accent) 45%, transparent);
  }
  .graph-mode {
    position: relative;
    height: calc(100dvh - var(--sy-header-h));
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
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    background: color-mix(in srgb, var(--sy-bg) 85%, transparent);
    backdrop-filter: blur(4px);
  }
  .reader-mode {
    height: calc(100dvh - var(--sy-header-h));
    min-height: 0;
  }
  .fatal {
    padding: 2rem;
    color: var(--sy-amber);
    font-size: 0.9rem;
  }
  .fatal p { color: var(--sy-fg-faint); }
</style>
