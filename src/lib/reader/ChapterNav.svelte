<script lang="ts">
  // ChapterNav — the left rail of the reader: the ACTIVE manual's real
  // chapters, in reading order, with a quick filter. This is the docs-first
  // spine the site opens on — a table of contents, not a graph. Indirectly-
  // referenced stub sections are intentionally absent here (they show up in
  // the "on this page" rail and the command palette instead).
  //
  // The checkbox beside each chapter is the mobile-friendly scoping tool:
  // tick docs to narrow the synapses canvas to exactly those pages (store.
  // checked), because dragging tag chips is fiddly on a phone.
  import type { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import ManualTabs from '../ui/ManualTabs.svelte'

  let { store }: { store: DocneuralStore } = $props()

  let filter = $state('')
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    const list = store.chapters
    return q ? list.filter((c) => c.title.toLowerCase().includes(q)) : list
  })
</script>

<nav class="chapters" aria-label="Contents" style={sourceVars(store.manual)}>
  <button class="home {store.selected ? '' : 'active'} dn-mono" onclick={() => store.goHome()}>
    <span class="glyph">◈</span> WELCOME
  </button>
  <ManualTabs {store} />
  <div class="find">
    <span class="prompt dn-mono" aria-hidden="true">⌕</span>
    <input
      type="search"
      placeholder="filter chapters…"
      bind:value={filter}
      aria-label="Filter chapters"
    />
  </div>
  <div class="meta dn-label">
    <span>{shown.length} / {store.chapters.length} chapters</span>
  </div>
  {#if store.checked.length > 0}
    <div class="pinned dn-mono">
      <span>⌁ GRAPH: {store.checked.length} TICKED</span>
      <button onclick={() => store.clearChecked()}>clear</button>
    </div>
  {/if}
  <ol>
    {#each shown as c (c.id)}
      <li>
        <div class="row">
          <input
            type="checkbox"
            class="tick"
            checked={store.checked.includes(c.id)}
            onchange={() => store.toggleChecked(c.id)}
            aria-label="Show {c.title} in the synapses graph"
            title="tick to isolate in the synapses graph"
          />
          <button
            class="chapter"
            class:active={store.selected?.id === c.id}
            onclick={() => store.goto(c)}
            onpointerenter={() => store.prefetch([c.slug])}
          >{c.title}</button>
        </div>
      </li>
    {:else}
      <li class="empty dn-mono">no chapter matches “{filter}”</li>
    {/each}
  </ol>
</nav>

<style>
  .chapters {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    border-right: 1px solid var(--dn-border-strong);
    background: color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
    padding: 0.8rem 0.6rem 2rem;
    gap: 0.55rem;
  }
  .home {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-align: left;
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.45em 0.7em;
    cursor: pointer;
  }
  .home:hover { color: var(--dn-fg); border-color: var(--dn-accent-dim); }
  .home.active {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 55%, transparent);
    background: color-mix(in srgb, var(--dn-accent) 10%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--dn-accent) 16%, transparent);
  }
  .glyph { color: var(--dn-hot); }

  /* The filter field, marked with a search glyph. */
  .find {
    display: flex;
    align-items: center;
    gap: 0.4em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0 0.5em;
  }
  .find:focus-within { border-color: var(--dn-accent-dim); }
  .prompt { color: var(--dn-hot); font-size: 0.8rem; }
  input[type='search'] {
    background: none;
    border: none;
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: 0.78rem;
    padding: 0.4em 0;
    width: 100%;
    min-width: 0;
  }
  input[type='search']:focus { outline: none; }
  .meta { color: var(--dn-fg-faint); padding: 0 0.15em; }

  .pinned {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5em;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: var(--dn-accent);
    border: 1px dashed color-mix(in srgb, var(--dn-accent) 50%, transparent);
    border-radius: 2px;
    padding: 0.25em 0.6em;
  }
  .pinned button {
    font: inherit;
    color: var(--dn-accent-2);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .pinned button:hover { color: var(--dn-hot); }

  ol {
    list-style: none;
    counter-reset: ch;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    min-height: 0;
  }
  li { counter-increment: ch; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  /* A real touch target on phones (the row is ~2rem tall anyway). */
  .tick {
    width: 0.95rem;
    height: 0.95rem;
    margin: 0 0 0 0.35em;
    accent-color: var(--dn-src, var(--dn-accent));
    cursor: pointer;
    flex: none;
  }
  .chapter {
    display: block;
    flex: 1;
    min-width: 0;
    text-align: left;
    font-family: var(--dn-font-prose);
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--dn-fg-muted);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    padding: 0.32em 0.5em 0.32em 1.7em;
    cursor: pointer;
    position: relative;
    transition: color 120ms, background 120ms;
  }
  /* Chapter number from the reading-order counter, in mono — a manual, not
     a list. The number is what you navigate by in a technical doc. */
  .chapter::before {
    content: counter(ch);
    position: absolute;
    left: 0.2em;
    font-family: var(--dn-font-mono);
    font-size: 0.64rem;
    color: var(--dn-fg-faint);
  }
  .chapter:hover { color: var(--dn-fg); background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, transparent); }
  .chapter.active {
    color: var(--dn-src, var(--dn-accent));
    border-left-color: var(--dn-src, var(--dn-accent));
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
    font-weight: 600;
  }
  .chapter.active::before { color: var(--dn-src, var(--dn-accent)); }
  .empty { color: var(--dn-fg-faint); font-size: 0.78rem; padding: 0.5em; }
</style>
