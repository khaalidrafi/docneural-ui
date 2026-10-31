<script lang="ts">
  // Library — the document library drawer (network pass 2026-10-31, SPEC §6.2).
  //
  // ⌘⇧K / Ctrl-Shift-K, the manual-tabs `+` and the reader rail all drive ONE
  // store flag (store.libraryOpen), so the same shelf opens from any surface.
  // The drawer answers the aggregator question the TOC cannot: not "where am
  // I inside THIS manual" but "what are ALL the manuals, and what is in
  // each". A 320px rail of shelves:
  //
  //   - grouped by manual; each group's header row carries the manual's
  //     title plus its `N neurons · M synapses` readout — the same numbers
  //     the Home source strip prints, so the shelf and the front door never
  //     disagree about a corpus's size;
  //   - the reading trail (core/trail.ts) is pinned at the top as RECENTS —
  //     max 8, newest first, mirrored to localStorage `dn.library.recents`
  //     so the shelf survives a cleared trail;
  //   - the doc on screen is marked (aria-current + the source rail);
  //   - a filter narrows every manual at once; no match says exactly what
  //     was loaded (`No document matches — {n} manuals loaded.`);
  //   - past 200 rows the list window-renders — the same 40px-row pattern
  //     as the TOC's flat fallback (no library, no deps).
  //
  // Tokens: --dn-panel-* (the synapse click card's ink, so an overlay reads
  // as an overlay in both arms). 40px taps. NO new animation: a drawer that
  // slides is a drawer that delays — it mounts placed.
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import { loadRecents, saveRecents, RECENTS_MAX } from '../core/controls'
  import type { DocNode } from '../core/types'

  let { store }: { store: DocneuralStore } = $props()

  const ROW_H = 40 // must match the row heights (tap-target law)
  const VIRTUALIZE_AT = 200 // SPEC §6.2: window-render past 200 rows

  let q = $state('')
  let filterInput: HTMLInputElement | undefined = $state()
  let scrollEl: HTMLDivElement | undefined = $state()
  let winStart = $state(0)
  let winSize = $state(16)

  // Fresh shelf on every open: the filter forgets, the window re-measures,
  // the field takes focus (the palette's contract).
  $effect(() => {
    if (store.libraryOpen) {
      q = ''
      winStart = 0
      requestAnimationFrame(() => filterInput?.focus())
    }
  })

  // Recents ARE the trail, persisted: every stop is mirrored into
  // `dn.library.recents` (max 8, oldest last — controls.ts owns the cap) so
  // the drawer can still show a shelf after the trail itself is cleared,
  // and a slug a later export brings back rejoins on its own.
  $effect(() => {
    saveRecents(store.trail)
  })

  // Newest first for display: the trail is oldest-first. When the trail is
  // empty (cleared this session) the stored shelf stands in.
  const recents = $derived.by(() => {
    if (store.trailResolved.length) return store.trailResolved.slice(-RECENTS_MAX).reverse()
    return loadRecents()
      .reverse()
      .map((s) => store.bySlug(s))
      .filter((n): n is DocNode => !!n)
  })

  // Manual sizes, keyed — the group header readouts.
  const stats = $derived(new Map(store.sources.map((s) => [s.name, s])))

  /** One windowed row: a group header (label) or an openable document. */
  type Row =
    | { kind: 'label'; id: string; text: string; count: string; manual?: string }
    | { kind: 'doc'; id: string; doc: DocNode; manual: string; recent?: boolean }

  const rows = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    // A library query is not scoped to the TOC's manual — that is the whole
    // point of the drawer. Matches stay in corpus order; virtualizing keeps
    // a broad needle (one letter) as cheap as the full shelf.
    if (needle) {
      const out: Row[] = []
      for (const n of store.data.nodes) {
        if (n.stub) continue
        if (n.title.toLowerCase().includes(needle)) {
          out.push({ kind: 'doc', id: `f:${n.id}`, doc: n, manual: n.tags[0] ?? '' })
        }
      }
      return out
    }
    const out: Row[] = []
    if (recents.length) {
      out.push({ kind: 'label', id: 'recents', text: 'recents', count: '' })
      for (const n of recents) {
        out.push({ kind: 'doc', id: `r:${n.id}`, doc: n, manual: n.tags[0] ?? '', recent: true })
      }
    }
    const manuals = store.manuals
    for (const m of manuals) {
      const s = stats.get(m)
      out.push({
        kind: 'label',
        id: `m:${m}`,
        text: DocneuralStore.manualTitle(m),
        count: `${s?.pages ?? 0} neurons · ${s?.links ?? 0} synapses`,
        manual: m
      })
      // Content pages in exporter order (the store's own reading-order walk
      // is the same sequence — chapters() adds only the manual scoping that
      // this per-manual grouping already does).
      for (const n of store.data.nodes) {
        if (n.stub || n.tags[0] !== m) continue
        out.push({ kind: 'doc', id: `m:${m}:${n.id}`, doc: n, manual: m })
      }
    }
    // Stragglers a single-corpus export ships without manual stamps still
    // belong on the shelf — grouped under their own header, never dropped.
    const tagged = new Set(manuals)
    const rest = store.data.nodes.filter((n) => !n.stub && !tagged.has(n.tags[0] ?? ''))
    if (rest.length) {
      out.push({ kind: 'label', id: 'x:', text: 'other', count: `${rest.length} neurons` })
      for (const n of rest) out.push({ kind: 'doc', id: `x:${n.id}`, doc: n, manual: '' })
    }
    return out
  })

  const virtualize = $derived(rows.length > VIRTUALIZE_AT)

  // Measure the window once the scroll container exists, as the TOC does.
  $effect(() => {
    const el = scrollEl
    if (!el) return
    winSize = Math.max(4, Math.ceil(el.clientHeight / ROW_H) + 8)
  })

  // A new row list (open, or a new filter) reads from the top.
  $effect(() => {
    void rows
    winStart = 0
  })

  function onScroll(e: Event): void {
    const el = e.currentTarget as HTMLDivElement
    winStart = Math.max(0, Math.floor(el.scrollTop / ROW_H) - 4)
  }

  function choose(doc: DocNode): void {
    store.goto(doc)
    store.libraryOpen = false
  }
</script>

{#snippet row(r: Row)}
  {#if r.kind === 'label'}
    <div class="grp dn-mono" style={r.manual ? sourceVars(r.manual) : ''}>
      <span class="g-name">{r.text}</span>
      {#if r.count}<span class="g-count">{r.count}</span>{/if}
    </div>
  {:else}
    <div class="docrow" style={sourceVars(r.manual)} class:recent={r.recent}>
      <button
        class="doc"
        class:active={r.doc.id === store.selected?.id}
        aria-current={r.doc.id === store.selected?.id ? 'true' : undefined}
        onclick={() => choose(r.doc)}
      >
        <span class="t">{r.doc.title}</span>
        {#if r.recent}<span class="mark dn-mono" aria-hidden="true">↺</span>{/if}
      </button>
    </div>
  {/if}
{/snippet}

{#if store.libraryOpen}
  <div class="scrim" role="presentation" onclick={() => (store.libraryOpen = false)}></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Library" tabindex="-1">
    <header class="head">
      <h2 class="dn-mono">Library</h2>
      <button
        class="close"
        onclick={() => (store.libraryOpen = false)}
        aria-label="Close the document library"
      >✕</button>
    </header>
    <div class="find">
      <span class="prompt dn-mono" aria-hidden="true">⌕</span>
      <input
        bind:this={filterInput}
        bind:value={q}
        type="search"
        placeholder="filter the library…"
        aria-label="Filter the library"
      />
    </div>
    {#if virtualize}
      <!-- Window render (SPEC §2.6 pattern): container height / 40px rows. -->
      <div class="shelf shelf-scroll" bind:this={scrollEl} onscroll={onScroll}>
        <div style:height="{winStart * ROW_H}px" aria-hidden="true"></div>
        {#each rows.slice(winStart, winStart + winSize) as r (r.id)}
          {@render row(r)}
        {/each}
        <div style:height="{Math.max(0, rows.length - winStart - winSize) * ROW_H}px" aria-hidden="true"></div>
      </div>
    {:else}
      <div class="shelf">
        {#each rows as r (r.id)}
          {@render row(r)}
        {:else}
          <p class="empty dn-mono">No document matches — {store.manuals.length} manuals loaded.</p>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 28;
    background: color-mix(in srgb, var(--dn-bg-sunken) 74%, transparent);
  }
  .drawer {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(320px, 92vw); /* SPEC §6.2: 320px of rail (phones get 92vw) */
    z-index: 29; /* the ⌘K palette (30) stays on top when both are open */
    display: flex;
    flex-direction: column;
    background: var(--dn-panel-bg);
    color: var(--dn-panel-ink);
    border-right: 1px solid var(--dn-border-strong);
    box-shadow: 0 0 40px color-mix(in srgb, var(--dn-bg-sunken) 85%, transparent);
  }
  .drawer:focus { outline: none; }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5em;
    min-height: var(--dn-header-h);
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--dn-border);
  }
  .head h2 {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    font-weight: 600;
    color: var(--dn-panel-ink);
  }
  .close {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    color: var(--dn-panel-ink-dim);
    background: none;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    cursor: pointer;
  }
  .close:hover { color: var(--dn-panel-ink); border-color: var(--dn-border-strong); }
  .close:focus-visible { outline: 2px solid var(--dn-accent); outline-offset: 2px; }
  .find {
    display: flex;
    align-items: center;
    gap: 0.4em;
    min-height: 40px; /* tap-target law */
    margin: 0.55rem 0.6rem 0.35rem;
    padding: 0 0.5em;
    background: color-mix(in srgb, var(--dn-bg-sunken) 55%, transparent);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
  }
  .find:focus-within { border-color: var(--dn-accent-dim); }
  .prompt { color: var(--dn-hot); font-size: 0.8rem; }
  .find input {
    background: none;
    border: none;
    color: var(--dn-panel-ink);
    font-family: var(--dn-font-mono);
    font-size: 0.78rem;
    padding: 0.4em 0;
    width: 100%;
    min-width: 0;
  }
  .find input:focus { outline: none; }
  .shelf {
    flex: 1;
    min-height: 0;
    padding-bottom: 1rem;
  }
  /* Long shelves scroll INSIDE the drawer; the scrollbar is thin and themed,
     never the browser default (the TOC's recipe). */
  .shelf-scroll {
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--dn-border) transparent;
  }
  .shelf-scroll::-webkit-scrollbar { width: 10px; }
  .shelf-scroll::-webkit-scrollbar-thumb {
    background: var(--dn-border);
    border: 3px solid transparent;
    background-clip: content-box;
  }
  .shelf-scroll::-webkit-scrollbar-track { background: transparent; }
  /* Group header = the manual row: name in the source's hue, size readout
     right. 40px, like every other row, so the window math stays exact. */
  .grp {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6em;
    min-height: 40px;
    padding: 0.6em 0.7em 0.2em;
    font-size: 0.62rem;
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    border-bottom: 1px solid var(--dn-border);
  }
  .g-name { color: var(--dn-src, var(--dn-accent)); font-weight: 600; white-space: nowrap; }
  .g-count {
    color: var(--dn-panel-ink-dim);
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    text-transform: none;
    white-space: nowrap;
  }
  .docrow { border-bottom: 1px solid var(--dn-border); }
  .doc {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5em;
    width: 100%;
    min-height: 40px; /* tap-target law — and the ROW_H the window math reads */
    text-align: left;
    color: var(--dn-panel-ink);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    padding: 0.3em 0.7em;
    cursor: pointer;
    font-family: var(--dn-font-prose);
    font-size: 0.84rem;
    line-height: 1.3;
  }
  /* Rows are uniform 40px: a long title clips instead of wrapping. */
  .doc .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc:hover {
    color: var(--dn-src, var(--dn-accent));
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, transparent);
  }
  /* The doc on screen: the slot-in-a-rack state grammar (fill + rail, never
     glow), lit in its own source's hue. */
  .doc.active {
    color: var(--dn-src, var(--dn-accent));
    font-weight: 600;
    border-left-color: var(--dn-src, var(--dn-accent));
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
  }
  .mark { flex: none; color: var(--dn-src, var(--dn-accent)); font-size: 0.72rem; }
  .empty { color: var(--dn-panel-ink-dim); font-size: 0.78rem; padding: 1rem 0.7em; }
</style>
