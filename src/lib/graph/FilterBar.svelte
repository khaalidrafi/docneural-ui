<script lang="ts">
  // FilterBar — graph-mode controls, the same two affordances
  // org-roam-lite-ui puts top-left: a text search over node titles and
  // clickable tag chips. Filtering only hides nodes from the canvas; the
  // reader is never filtered (you can still reach hidden docs by URL).
  import { commonTags } from '../core/graph'
  import type { SynaptStore } from '../core/store.svelte'

  let { store }: { store: SynaptStore } = $props()

  const tags = $derived(commonTags(store.data))

  function toggleTag(tag: string): void {
    store.tags = store.tags.includes(tag)
      ? store.tags.filter((t) => t !== tag)
      : [...store.tags, tag]
  }
</script>

<div class="filter-bar">
  <input
    type="search"
    class="sy-mono"
    placeholder="⌕ search nodes…"
    bind:value={store.query}
    aria-label="Search nodes"
  />
  {#if tags.length > 0}
    <div class="tags">
      {#each tags as tag (tag)}
        <button
          class="tag-chip"
          class:active={store.tags.includes(tag)}
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
    font-family: var(--sy-font-mono);
  }
  input {
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    color: var(--sy-fg);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45em 0.7em;
    width: 100%;
  }
  input:focus {
    border-color: var(--sy-accent-dim);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tag-chip {
    font: inherit;
    font-size: 0.75rem;
    color: var(--sy-accent-2);
    background: transparent;
    border: 1px solid var(--sy-border-strong);
    border-radius: 999px;
    padding: 0.1em 0.7em;
    cursor: pointer;
  }
  .tag-chip:hover { border-color: var(--sy-accent-2); }
  .tag-chip.active {
    background: var(--sy-accent-2);
    color: var(--sy-bg);
    border-color: var(--sy-accent-2);
  }
</style>
