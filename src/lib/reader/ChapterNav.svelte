<script lang="ts">
  // ChapterNav — the left rail of the reader: the manual's real chapters,
  // in reading order, with a quick filter. This is the docs-first spine the
  // site opens on — a table of contents, not a graph. The 391 indirectly-
  // referenced stub sections are intentionally absent here (they show up in
  // the "on this page" rail and the command palette instead).
  import type { SynaptStore } from '../core/store.svelte'

  let { store }: { store: SynaptStore } = $props()

  let filter = $state('')
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const list = store.chapters
    return q ? list.filter((c) => c.title.toLowerCase().includes(q)) : list
  })
</script>

<nav class="chapters" aria-label="Contents">
  <button class="home {store.selected ? '' : 'active'}" onclick={() => store.goHome()}>
    <span class="glyph">◈</span> Welcome
  </button>
  <input
    type="search"
    class="sy-mono"
    placeholder="filter chapters…"
    bind:value={filter}
    aria-label="Filter chapters"
  />
  <ol>
    {#each shown as c (c.id)}
      <li>
        <button
          class="chapter"
          class:active={store.selected?.id === c.id}
          onclick={() => store.goto(c)}
        >{c.title}</button>
      </li>
    {:else}
      <li class="empty sy-mono">no chapter matches “{filter}”</li>
    {/each}
  </ol>
</nav>

<style>
  .chapters {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--sy-border);
    background: color-mix(in srgb, var(--sy-bg-sunken) 45%, transparent);
    padding: 0.8rem 0.6rem 2rem;
    gap: 0.6rem;
  }
  .home {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-family: var(--sy-font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.02em;
    text-align: left;
    color: var(--sy-fg-muted);
    background: transparent;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.45em 0.7em;
    cursor: pointer;
  }
  .home:hover { color: var(--sy-fg); border-color: var(--sy-border-strong); }
  .home.active {
    color: var(--sy-accent);
    border-color: var(--sy-accent-dim);
    background: color-mix(in srgb, var(--sy-accent) 8%, transparent);
  }
  .glyph { color: var(--sy-accent-2); }
  input {
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    color: var(--sy-fg);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.4em 0.6em;
  }
  input:focus { border-color: var(--sy-accent-dim); }
  ol {
    list-style: none;
    counter-reset: ch;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    min-height: 0;
  }
  li { counter-increment: ch; }
  .chapter {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--sy-font-prose);
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--sy-fg-muted);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 4px 4px 0;
    padding: 0.32em 0.5em 0.32em 1.9em;
    cursor: pointer;
    position: relative;
  }
  /* Chapter number from the reading-order counter — a manual, not a list. */
  .chapter::before {
    content: counter(ch);
    position: absolute;
    left: 0.35em;
    font-family: var(--sy-font-mono);
    font-size: 0.68rem;
    color: var(--sy-fg-faint);
  }
  .chapter:hover { color: var(--sy-fg); background: var(--sy-bg-raise); }
  .chapter.active {
    color: var(--sy-accent);
    border-left-color: var(--sy-accent);
    background: color-mix(in srgb, var(--sy-accent) 10%, transparent);
    font-weight: 600;
  }
  .chapter.active::before { color: var(--sy-accent-dim); }
  .empty { color: var(--sy-fg-faint); font-size: 0.78rem; padding: 0.5em; }
</style>
