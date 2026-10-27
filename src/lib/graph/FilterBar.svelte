<script lang="ts">
  // FilterBar — graph-mode controls, the same two affordances
  // org-roam-lite-ui puts top-left: a text search over node titles and
  // clickable tag chips. Filtering only hides nodes from the canvas; the
  // reader is never filtered (you can still reach hidden docs by URL).
  //
  // A chip that names a SOURCE wears that source's graph hue, so the filter
  // row and the canvas agree about which colour is which corpus.
  import { commonTags } from '../core/graph'
  import { sourceVars } from '../core/source'
  import type { DocneuralStore } from '../core/store.svelte'

  let { store }: { store: DocneuralStore } = $props()

  const tags = $derived(commonTags(store.data))
  const isSource = (t: string) => store.manuals.includes(t)

  function toggleTag(tag: string): void {
    store.tags = store.tags.includes(tag)
      ? store.tags.filter((t) => t !== tag)
      : [...store.tags, tag]
  }
</script>

<div class="filter-bar">
  <label class="dn-label" for="gbq">filter chapters</label>
  <input
    id="gbq"
    type="search"
    class="dn-mono"
    placeholder="title contains…"
    bind:value={store.query}
    aria-label="Search nodes"
  />
  {#if tags.length > 0}
    <div class="tags">
      {#each tags as tag (tag)}
        <button
          class="tag-chip"
          class:active={store.tags.includes(tag)}
          class:src={isSource(tag)}
          style={isSource(tag) ? sourceVars(tag) : ''}
          onclick={() => toggleTag(tag)}
        >#{tag}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  label { padding: 0 0.1em; }
  input {
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: 0.8rem;
    padding: 0.45em 0.7em;
    width: 100%;
  }
  input:focus {
    outline: none;
    border-color: var(--dn-accent);
    box-shadow:
      inset 0 0 12px color-mix(in srgb, var(--dn-accent) 12%, transparent),
      0 0 12px color-mix(in srgb, var(--dn-accent) 22%, transparent);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag-chip {
    font-family: var(--dn-font-mono);
    font-size: 0.7rem;
    color: var(--dn-accent);
    background: transparent;
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    padding: 0.12em 0.55em;
    cursor: pointer;
    transition: color 120ms, border-color 120ms, background 120ms, box-shadow 120ms;
  }
  .tag-chip:hover { border-color: var(--dn-src, var(--dn-accent)); color: var(--dn-accent); }
  .tag-chip.active {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 18%, transparent);
    color: var(--dn-accent);
    border-color: var(--dn-src, var(--dn-accent));
    text-shadow: 0 0 8px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 22%, transparent);
  }
  /* A source chip keeps its hue even when unselected — the legend reading. */
  .tag-chip.src { border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 40%, transparent); }
</style>
