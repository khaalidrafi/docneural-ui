<script lang="ts">
  // Toc — the manual's table of contents as a tree, the Home "contents"
  // section's body. Owner directive 2026-10-31: "Show TOC instead of listing
  // each page of the doc. We'll add hundreds of docs to this site later": a
  // 752-page manual collapses to its Info chapter tree. The tree is pure
  // data (core/graph.ts#manualToc, unit-testable); the recursion here is a
  // Svelte 5 snippet calling itself, one component for all depths.
  //
  // TOC RESCUE (network pass 2026-10-31, SPEC §2):
  //  - default open depth 2, ancestors of the active page force-expand;
  //  - the visitor's explicit open/closed choices persist per manual
  //    (localStorage `dn.toc.open.<manual>`, core/controls.ts);
  //  - one icon button flips depth-2 ↔ expand-all;
  //  - an in-TOC filter (250ms debounce) answers with ≤12 flat rows that
  //    each carry their breadcrumb path;
  //  - a manual with no Info structure renders as a FLAT reading-order list
    //  with degree badges — the A–Z letter fallback is gone, never letters;
  //  - flat lists past 300 rows window-render (no library, 40px rows).
  //
  // Branch rows pair a disclosure toggle (a real <details>; keyboard and
  // screen-reader semantics come free, and no <summary> ever nests an
  // interactive element) with the page link itself; leaf rows are just the
  // link.
  import type { DocNode } from '../core/types'
  import {
    filterToc,
    manualToc,
    TOC_OPEN_DEPTH,
    tocHasStructure,
    tocTitle,
    type TocNode
  } from '../core/graph'
  import { loadTocOpen, saveTocOpen } from '../core/controls'
  import { sourceVars } from '../core/source'

  let {
    chapters,
    goto,
    degree,
    activeId = null,
    manualKey = ''
  }: {
    chapters: DocNode[]
    goto: (c: DocNode) => void
    degree: Map<string, number>
    activeId?: string | null
    /** Storage scope for the open-state persistence (the manual's name). */
    manualKey?: string
  } = $props()

  // Deep-reactive on purpose: the disclosure state lives ON the tree nodes
  // (TocNode.open), and a $derived of a plain builder returns unproxied
  // objects whose writes nothing would see. $state deep-proxies the
  // assignment, so toggle writes re-render their row and nothing else.
  let tree = $state<TocNode[]>([])
  let allOpen = $state(false)
  let overrides = $state<Record<string, boolean>>({})
  let query = $state('')
  let settledQuery = $state('')
  let scrollEl: HTMLDivElement | undefined = $state()
  let winStart = $state(0)
  let winSize = $state(16)
  const ROW_H = 40 // must match the row min-height (tap-target law)

  // In-TOC filter: 250ms debounce between the keystroke and the walk.
  $effect(() => {
    const v = query
    const t = setTimeout(() => { settledQuery = v }, 250)
    return () => clearTimeout(t)
  })

  // Per-manual open-state persistence: switching manuals loads that manual's
  // own record of the visitor's explicit open/closed choices.
  $effect(() => {
    overrides = loadTocOpen(manualKey)
  })

  // Rebuild on data/scope change: defaults (depth 2), then the persisted
  // explicit choices, then the active page's ancestors force-open (session
  // only — deep links land visibly inside their section, without being
  // written into storage).
  $effect(() => {
    const built = manualToc(chapters)
    const eff = (n: TocNode, depth: number): void => {
      // Explicit choice first, then the depth-2 default (expand-all wins
      // over both while it is on).
      n.open = allOpen || (overrides[n.doc.id] ?? depth < TOC_OPEN_DEPTH)
      for (const c of n.children) eff(c, depth + 1)
    }
    for (const r of built) eff(r, 0)
    const id = activeId
    if (id != null) {
      const mark = (nodes: TocNode[]): boolean => {
        let hit = false
        for (const n of nodes) {
          if (n.doc.id === id || mark(n.children)) {
            n.open = true
            hit = true
          }
        }
        return hit
      }
      mark(built)
    }
    tree = built
    winStart = 0
  })

  const structured = $derived(tocHasStructure(tree))
  const hits = $derived(settledQuery.trim() ? filterToc(tree, settledQuery, 12) : [])
  // Only the flat fallback can exceed the window threshold here (the real
  // tree boots closed; org's 319 reading-order rows are the case to serve).
  const flat = $derived(!structured)
  const virtualize = $derived(flat && !settledQuery.trim() && tree.length > 300)

  // Measure the window once the scroll container exists (and after mounts).
  $effect(() => {
    const el = scrollEl
    if (!el) return
    winSize = Math.max(4, Math.ceil(el.clientHeight / ROW_H) + 8)
  })

  function onScroll(e: Event): void {
    const el = e.currentTarget as HTMLDivElement
    winStart = Math.max(0, Math.floor(el.scrollTop / ROW_H) - 4)
  }

  function recordToggle(n: TocNode, open: boolean): void {
    overrides = { ...overrides, [n.doc.id]: open }
    saveTocOpen(manualKey, overrides)
  }
</script>

{#snippet leafRow(node: TocNode)}
  <div class="toc-row" style={sourceVars(node.doc.tags[0])} data-depth="0">
    <span class="toc-leaf-dot" aria-hidden="true"></span>
    <button class="toc-link" class:active={activeId === node.doc.id} onclick={() => goto(node.doc)}>{tocTitle(node.doc.title)}</button>
    <span class="toc-count dn-mono" aria-label="{degree.get(node.doc.id) ?? 0} synapses">{degree.get(node.doc.id) ?? 0}⌁</span>
  </div>
{/snippet}

{#snippet row(node: TocNode, depth: number)}
  {@const active = activeId === node.doc.id}
  {#if node.children.length > 0}
    <!-- The header IS the <summary>: a closed <details> without one hides
         every child including the row itself (the bug the first build had).
         Doc branches nest the page's goto button inside the summary —
         activating a nested interactive element does not toggle the
         disclosure, so title = navigate, row/arrow = expand. The override
         is recorded from the click (the toggle event fires for PROGRAMMATIC
         open changes too — every rebuild would pollute storage with its
         defaults): the timeout reads node.open after bind:open wrote it. -->
    <details class="toc-branch" bind:open={node.open} data-depth={depth}>
      <summary
        class="toc-row"
        style={sourceVars(node.doc.tags[0])}
        aria-label="{node.open ? 'Collapse ' : 'Expand '}{tocTitle(node.doc.title)}"
        onclick={(e) => {
          if ((e.target as HTMLElement).closest('.toc-link')) return
          setTimeout(() => recordToggle(node, node.open ?? false), 0)
        }}
      >
        <span class="tg dn-mono" aria-hidden="true">{node.open ? '▾' : '▸'}</span>
        <button class="toc-link" class:active onclick={() => goto(node.doc)}>{tocTitle(node.doc.title)}</button>
        <span class="toc-count dn-mono">{node.children.length}</span>
      </summary>
      <div class="toc-kids">
        {#each node.children as child (child.doc.id)}
          {@render row(child, depth + 1)}
        {/each}
      </div>
    </details>
  {:else}
    {@render leafRow(node)}
  {/if}
{/snippet}

<div class="toc-tools">
  <!-- The in-TOC filter (SPEC §2.4): 40px field, pinned at the rail top. -->
  <div class="find">
    <span class="prompt dn-mono" aria-hidden="true">⌕</span>
    <input
      type="search"
      placeholder="Filter chapters"
      aria-label="Filter chapters"
      bind:value={query}
    />
  </div>
  {#if !settledQuery.trim()}
    <!-- One icon button, two states (SPEC §2.3): depth 2 ↔ expand-all. -->
    <button
      class="toc-all dn-mono"
      aria-pressed={allOpen}
      aria-label={allOpen ? 'Collapse all chapters' : 'Expand all chapters'}
      title={allOpen ? 'Collapse all chapters' : 'Expand all chapters'}
      onclick={() => (allOpen = !allOpen)}
    >{allOpen ? '−' : '+'}</button>
  {/if}
</div>

{#if !structured && tree.length > 0}
  <!-- The flat badge (SPEC §2.5): honest about what the export carries. -->
  <p class="toc-flat dn-mono" role="note">flat list · no structure in export</p>
{/if}

{#if settledQuery.trim()}
  <!-- Filter results: ≤12 flat rows with breadcrumb paths. -->
  <nav class="toc" aria-label="Filtered chapters">
    {#each hits as h (h.node.doc.id)}
      <div class="toc-hit" style={sourceVars(h.node.doc.tags[0])}>
        <button class="toc-link" class:active={activeId === h.node.doc.id} onclick={() => goto(h.node.doc)}>
          {tocTitle(h.node.doc.title)}
        </button>
        <span class="toc-path dn-mono">{h.path.join(' › ')}</span>
      </div>
    {:else}
      <p class="toc-empty dn-mono">no chapter matches “{settledQuery.trim()}”</p>
    {/each}
  </nav>
{:else if virtualize}
  <!-- Window render (SPEC §2.6): container height / 40px rows, no library.
       Flat rows only — a tree's disclosure state cannot be windowed. -->
  <div class="toc toc-scroll" bind:this={scrollEl} onscroll={onScroll}>
    <div style:height="{winStart * ROW_H}px" aria-hidden="true"></div>
    {#each tree.slice(winStart, winStart + winSize) as node (node.doc.id)}
      {@render leafRow(node)}
    {/each}
    <div style:height="{Math.max(0, (tree.length - winStart - winSize)) * ROW_H}px" aria-hidden="true"></div>
  </div>
{:else}
  <nav class="toc" class:toc-scroll={flat && tree.length > 120} aria-label="Table of contents">
    {#each tree as node (node.doc.id)}
      {@render row(node, 0)}
    {:else}
      <p class="toc-empty dn-mono">No chapters parsed — showing reading order.</p>
    {/each}
  </nav>
{/if}

<style>
  .toc-tools {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0;
    background: color-mix(in srgb, var(--dn-bg) 92%, transparent);
  }
  .find {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 0.4em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0 0.5em;
    min-height: 40px; /* tap-target law */
  }
  .find:focus-within { border-color: var(--dn-accent-dim); }
  .prompt { color: var(--dn-hot); font-size: 0.8rem; }
  .find input {
    background: none;
    border: none;
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: 0.78rem;
    padding: 0.4em 0;
    width: 100%;
    min-width: 0;
  }
  .find input:focus { outline: none; }
  .toc-all {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    font-size: 1rem;
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    cursor: pointer;
  }
  .toc-all:hover { color: var(--dn-fg); border-color: var(--dn-accent-dim); }
  .toc-all:focus-visible { outline: 2px solid var(--dn-accent); outline-offset: 2px; }
  .toc-flat {
    margin: 0 0 0.35rem;
    font-size: 11px;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg-faint);
  }
  .toc {
    width: 100%;
  }
  .toc-empty {
    color: var(--dn-fg-faint);
    font-size: 0.72rem;
    padding: 1rem 0;
  }
  .toc-hit {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--dn-border);
  }
  .toc-path {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--dn-fg-faint);
    padding: 0 0.35rem 0.35rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc-branch {
    margin: 0;
  }
  .toc-branch > .toc-kids {
    /* The left rule is the tree: it shows nesting depth at a glance. */
    margin-left: 0.85rem;
    padding-left: 0.55rem;
    border-left: 1px solid var(--dn-toc-guide, var(--dn-border));
  }
  .toc-row {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 40px; /* tap-target law */
    border-bottom: 1px solid var(--dn-border);
  }
  .toc-row[data-depth='0'] {
    border-bottom-color: var(--dn-border-strong);
  }
  summary.toc-row {
    cursor: pointer;
    list-style: none; /* the arrow glyph is ours, not the browser's */
  }
  summary.toc-row::-webkit-details-marker {
    display: none;
  }
  summary.toc-row:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, transparent);
  }
  .tg {
    flex: 0 0 auto;
    width: 26px;
    display: grid;
    place-items: center;
    color: var(--dn-src, var(--dn-accent));
    font-size: 0.72rem;
  }
  .toc-leaf-dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin: 0 14px;
    border-radius: 50%;
    background: var(--dn-src, var(--dn-accent));
    opacity: 0.65;
  }
  .toc-link {
    flex: 1 1 auto;
    text-align: left;
    background: none;
    border: 0;
    padding: 0.45rem 0.35rem;
    min-height: 40px;
    color: var(--dn-fg);
    font-size: 0.9rem;
    line-height: 1.35;
    cursor: pointer;
  }
  .toc-link:hover {
    color: var(--dn-src, var(--dn-accent));
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .toc-link.active {
    color: var(--dn-src, var(--dn-accent));
    font-weight: 600;
  }
  .toc-count {
    flex: 0 0 auto;
    margin-right: 0.5rem;
    font-size: 0.62rem;
    color: var(--dn-fg-faint);
    letter-spacing: var(--dn-track);
  }

  /* Long flat lists scroll INSIDE the toc (the window render reads this
     height); the scrollbar is thin and themed, never the browser default. */
  .toc-scroll {
    max-height: 72vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--dn-border) transparent;
  }
  .toc-scroll::-webkit-scrollbar { width: 10px; }
  .toc-scroll::-webkit-scrollbar-thumb {
    background: var(--dn-border);
    border: 3px solid transparent;
    background-clip: content-box;
  }
  .toc-scroll::-webkit-scrollbar-track { background: transparent; }

</style>
