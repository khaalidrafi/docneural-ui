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
  import type { SynaptStore } from '../core/store.svelte'

  let { store }: { store: SynaptStore } = $props()

  const tags = $derived(commonTags(store.data))
  const isSource = (t: string) => store.manuals.includes(t)

  function toggleTag(tag: string): void {
    store.tags = store.tags.includes(tag)
      ? store.tags.filter((t) => t !== tag)
      : [...store.tags, tag]
  }
</script>

<div class="filter-bar">
  <label class="sy-label" for="gbq">filter chapters</label>
  <input
    id="gbq"
    type="search"
    class="sy-mono"
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
    background: var(--sy-bg-sunken);
    border: 1px solid var(--sy-border);
    border-radius: 2px;
    color: var(--sy-fg);
    font-family: var(--sy-font-mono);
    font-size: 0.8rem;
    padding: 0.45em 0.7em;
    width: 100%;
  }
  input:focus {
    outline: none;
    border-color: var(--sy-accent);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--sy-accent) 10%, transparent);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag-chip {
    font-family: var(--sy-font-mono);
    font-size: 0.7rem;
    color: var(--sy-src, var(--sy-fg-muted));
    background: transparent;
    border: 1px solid var(--sy-border-strong);
    border-radius: 2px;
    padding: 0.12em 0.55em;
    cursor: pointer;
    transition: color 120ms, border-color 120ms, background 120ms;
  }
  .tag-chip:hover { border-color: var(--sy-src, var(--sy-accent)); color: var(--sy-src, var(--sy-accent)); }
  .tag-chip.active {
    background: color-mix(in srgb, var(--sy-src, var(--sy-accent)) 18%, transparent);
    color: var(--sy-src, var(--sy-accent));
    border-color: var(--sy-src, var(--sy-accent));
  }
  /* A source chip keeps its hue even when unselected — the legend reading. */
  .tag-chip.src { border-color: color-mix(in srgb, var(--sy-src, var(--sy-accent)) 40%, transparent); }
</style>
