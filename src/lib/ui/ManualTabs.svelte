<script lang="ts">
  // ManualTabs — one row of corpus tabs, one per manual present in
  // graph.json (whatever technologies the corpus covers). A doc
  // aggregator needs a way to hop between manuals that is not "search for
  // a page in the other one"; this is that row. Shown in the reader's
  // sidebar and on Home; hidden entirely when the corpus is one manual.
  //
  // Each tab carries its source's hue through --dn-src — the same colour the
  // canvas paints that corpus with — so the tab row doubles as a legend:
  // the colour you click is the colour the graph will show you.
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'

  let { store }: { store: DocneuralStore } = $props()

  const manuals = $derived(store.manuals)
</script>

{#if manuals.length > 1}
  <div class="manual-tabs" role="tablist" aria-label="Source">
    {#each manuals as m (m)}
      <button
        role="tab"
        class="tab dn-mono"
        class:active={store.manual === m}
        aria-selected={store.manual === m}
        style={sourceVars(m)}
        onclick={() => store.showManual(m)}
        title={DocneuralStore.manualTitle(m)}
      ><span class="bracket">[</span>{DocneuralStore.manualTitle(m)}<span class="bracket">]</span></button>
    {/each}
  </div>
{/if}

<style>
  .manual-tabs {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .tab {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.25em 0.55em;
    cursor: pointer;
    transition: color 120ms, border-color 120ms, background 120ms, box-shadow 120ms;
  }
  .bracket { color: var(--dn-border-strong); margin: 0 0.15em; }
  .tab:hover { color: var(--dn-fg); border-color: var(--dn-src, var(--dn-accent-dim)); }
  /* Active = lit in the source's own hue, never the generic accent: two tabs
     can look different from each other at a glance. */
  .tab.active {
    color: var(--dn-accent);
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 60%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 20%, transparent);
  }
  .tab.active .bracket { color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, transparent); }
</style>
