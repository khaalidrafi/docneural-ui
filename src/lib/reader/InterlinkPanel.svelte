<script lang="ts">
  // InterlinkPanel — the roam-connections rail next to the classic reader:
  // a settling local graph (1-hop, like org-roam-local-backlink-buffer) plus
  // the backlinks/outlinks lists with their context lines.
  import GraphView from '../graph/GraphView.svelte'
  import { backlinks, outlinks } from '../core/graph'
  import type { SynaptStore } from '../core/store.svelte'

  let { store }: { store: SynaptStore } = $props()

  const doc = $derived(store.selected)
  const local = $derived(store.local)
  const ins = $derived(doc ? backlinks(store.data, doc.id) : [])
  const outs = $derived(doc ? outlinks(store.data, doc.id) : [])

  function titleOf(id: string): string {
    return store.byId(id)?.title ?? id
  }
  function go(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }
</script>

<aside class="rail" aria-label="Interlinks">
  {#if !store.lite}
    <h3 class="sy-mono">⌁ local graph</h3>
    <div class="graph-box">
      {#if local && doc}
        <GraphView data={local} selectedId={doc.id} onNodeClick={go} />
      {/if}
    </div>
  {/if}

  <h3 class="sy-mono">⇤ backlinks <span class="count">{ins.length}</span></h3>
  {#if ins.length === 0}
    <p class="none sy-mono">orphan — nothing points here</p>
  {:else}
    <ul>
      {#each ins as l, i (`${l.source}-${i}`)}
        <li>
          <button class="link-btn" onclick={() => go(l.source)}>{titleOf(l.source)}</button>
          {#if l.context}<p class="ctx">{l.context}</p>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <h3 class="sy-mono">⇥ outgoing <span class="count">{outs.length}</span></h3>
  <ul>
    {#each outs as l, i (`${l.target}-${i}`)}
      <li>
        <button class="link-btn" onclick={() => go(l.target)}>{titleOf(l.target)}</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--sy-border);
    padding: 0.8rem 0.9rem;
    overflow-y: auto;
    background: color-mix(in srgb, var(--sy-bg-sunken) 50%, transparent);
  }
  h3 {
    font-family: var(--sy-font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: lowercase;
    color: var(--sy-fg-muted);
    margin: 0.9rem 0 0.4rem;
  }
  h3:first-child { margin-top: 0; }
  .count { color: var(--sy-accent-2); }
  .graph-box {
    position: relative;
    height: 220px;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    overflow: hidden;
    background: color-mix(in srgb, var(--sy-bg-sunken) 70%, transparent);
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin: 0.3rem 0; }
  .link-btn {
    font-family: var(--sy-font-mono);
    font-size: 0.8rem;
    color: var(--sy-accent);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .link-btn:hover { color: var(--sy-hot); }
  .ctx {
    font-size: 0.75rem;
    color: var(--sy-fg-faint);
    margin: 0.1rem 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .none { color: var(--sy-fg-faint); font-size: 0.8rem; }
</style>
