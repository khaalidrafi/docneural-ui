<script lang="ts">
  // Browse — the "every page" surface (Owner directive 2026-11-07):
  //   "The homepage is for highlighting popular docs. But, we also need a
  //    dedicated page where ALL docs can be navigated through sidebar,
  //    like devdocs."
  // DevDocs' shape, docneural's materials: a persistent sidebar tree of
  // EVERY manual (one collapsible group per corpus, each rendering the real
  // Info TOC via Toc.svelte), and the reader living in the main pane — pick
  // a page on the left, keep your place on the right, no surface switch.
  //
  // One filter above the groups answers across ALL manuals at once
  // (store.search), so "where is setq?" never needs the right manual first.
  // The sidebar reuses Toc.svelte with chrome=false — its per-manual filter
  // and ± button would repeat seven times under this single one.
  //
  // Phones: the sidebar collapses behind a toggle (40px tap target,
  // aria-expanded, zero animations — the perf law is absolute there).
  import Toc from './Toc.svelte'
  import DocReader from './DocReader.svelte'
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import { isPhoneLayout } from '../core/layout'

  let { store }: { store: DocneuralStore } = $props()

  const manuals = $derived(store.manuals)

  // Per-chapter synapse degree for the row badges (same rule as Home).
  const degree = $derived.by(() => {
    const m = new Map<string, number>()
    for (const [id, n] of store.views) m.set(id, n.degree)
    return m
  })

  // One group per manual; the active doc's manual opens itself (session
  // only — the <details> toggles below are the visitor's own choices).
  let groupOpen = $state<Record<string, boolean>>({})
  $effect(() => {
    const doc = store.selected
    const m = doc ? (doc.tags[0] ?? manuals[0] ?? '') : manuals[0]
    if (m && !groupOpen[m]) groupOpen = { ...groupOpen, [m]: true }
  })

  // The cross-manual filter: 250ms debounce, then store.search over every
  // node — the same index the palette and the rail use, so results agree.
  let query = $state('')
  let settled = $state('')
  $effect(() => {
    const v = query
    const t = setTimeout(() => (settled = v), 250)
    return () => clearTimeout(t)
  })
  const hits = $derived(settled.trim() ? store.search(settled, 40) : [])

  // Phone sidebar: a toggle, not a media-query miracle. Desktop keeps the
  // DevDocs shape (sidebar always visible); <=700px folds it away so the
  // page a reader opened gets the width.
  let phone = $state(isPhoneLayout())
  let sideOpen = $state(false)
  $effect(() => {
    const mq = matchMedia('(max-width: 700px)')
    const on = () => (phone = mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  })
</script>

<section class="browse" class:phone>
  {#if !phone || sideOpen}
    <aside class="side">
      <div class="find" role="search">
        <span class="prompt dn-mono" aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="Search every page…"
          aria-label="Search every page of every manual"
          bind:value={query}
        />
      </div>
      {#if settled.trim()}
        <nav class="hits" aria-label="Search results">
          {#each hits as h (h.id)}
            <button class="hit" class:active={store.selected?.id === h.id} style={sourceVars(h.tags[0])} onclick={() => store.goto(h)}>
              <span class="hit-t">{h.title}</span>
              <span class="hit-m dn-mono">{DocneuralStore.manualTitle(h.tags[0] ?? '') || h.tags[0]}</span>
            </button>
          {:else}
            <p class="empty dn-mono" role="note">no page matches “{settled.trim()}”</p>
          {/each}
        </nav>
      {:else}
        <nav class="groups" aria-label="All manuals">
          {#each manuals as m (m)}
            <details class="group" bind:open={groupOpen[m]} style={sourceVars(m)} data-active={store.manual === m}>
              <summary>
                <span class="g-t">{DocneuralStore.manualTitle(m) || m}</span>
                <span class="g-n dn-mono">{store.chaptersIn(m).length}</span>
              </summary>
              <div class="g-body">
                <Toc
                  chapters={store.chaptersIn(m)}
                  goto={(c) => store.goto(c)}
                  {degree}
                  activeId={store.selected?.id ?? null}
                  manualKey={m}
                  chrome={false}
                />
              </div>
            </details>
          {/each}
        </nav>
      {/if}
    </aside>
  {/if}

  <div class="main">
    {#if phone}
      <button
        class="side-toggle dn-mono"
        aria-expanded={sideOpen}
        aria-label={sideOpen ? 'Hide the manuals sidebar' : 'Show the manuals sidebar'}
        onclick={() => (sideOpen = !sideOpen)}
      >{sideOpen ? '◂ all manuals' : '▸ all manuals'}</button>
    {/if}
    {#if store.selected}
      <DocReader {store} />
    {:else}
      <div class="land dn-brackets">
        <p class="l-head dn-mono">// browse · every page of every manual</p>
        <p class="l-body">
          {store.data.nodes.length} pages across {manuals.length} corpora, each in the sidebar.
          Pick any page — the reader opens right here, and the tree keeps your place.
        </p>
        <p class="l-meta dn-mono">☰ sidebar tree · ⌕ cross-manual search · ▤ reader stays in the pane</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .browse {
    display: grid;
    grid-template-columns: minmax(260px, 340px) 1fr;
    gap: 0;
    align-items: start;
  }
  /* The DevDocs contract: the TREE stays put while the page scrolls. */
  .side {
    position: sticky;
    top: 0;
    max-height: 100vh;
    overflow-y: auto;
    padding: 0.5rem 0.6rem 1.5rem;
    border-right: 1px solid var(--dn-border);
    scrollbar-width: thin;
    scrollbar-color: var(--dn-border) transparent;
  }
  .side::-webkit-scrollbar { width: 10px; }
  .side::-webkit-scrollbar-thumb {
    background: var(--dn-border);
    border: 3px solid transparent;
    background-clip: content-box;
  }
  .find {
    display: flex;
    align-items: center;
    gap: 0.4em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0 0.5em;
    min-height: 40px; /* tap-target law */
    margin-bottom: 0.5rem;
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

  .group {
    border-bottom: 1px solid var(--dn-border);
  }
  .group summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 40px; /* tap-target law */
    cursor: pointer;
    list-style: none;
    padding: 0 0.35rem;
  }
  .group summary::-webkit-details-marker { display: none; }
  .group summary::before {
    content: '▸';
    color: var(--dn-src, var(--dn-accent));
    font-size: 0.72rem;
  }
  .group[open] summary::before { content: '▾'; }
  .group summary:hover { background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, transparent); }
  .g-t {
    flex: 1 1 auto;
    font-size: 0.9rem;
    color: var(--dn-fg);
  }
  .group[data-active='true'] .g-t { color: var(--dn-src, var(--dn-accent)); font-weight: 600; }
  .g-n {
    font-size: 0.62rem;
    color: var(--dn-fg-faint);
    letter-spacing: var(--dn-track);
  }
  .g-body {
    margin: 0 0 0.35rem 0.6rem;
    padding-left: 0.4rem;
    border-left: 1px solid var(--dn-border);
  }

  .hits {
    display: flex;
    flex-direction: column;
  }
  .hit {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
    background: none;
    border: 0;
    border-bottom: 1px solid var(--dn-border);
    min-height: 40px;
    padding: 0.4rem 0.35rem;
    color: var(--dn-fg);
    cursor: pointer;
  }
  .hit:hover { color: var(--dn-src, var(--dn-accent)); }
  .hit.active { color: var(--dn-src, var(--dn-accent)); font-weight: 600; }
  .hit-t { font-size: 0.85rem; }
  .hit-m {
    flex: 0 0 auto;
    font-size: 0.58rem;
    color: var(--dn-fg-faint);
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
  }
  .empty { color: var(--dn-fg-faint); font-size: 0.72rem; padding: 0.75rem 0.35rem; }

  .main { min-width: 0; }
  .side-toggle {
    display: none;
  }

  .land {
    margin: 3rem auto;
    max-width: 34rem;
    padding: 1.5rem;
    text-align: center;
  }
  .l-head { color: var(--dn-accent); font-size: 0.8rem; letter-spacing: var(--dn-track); }
  .l-body { margin: 0.9rem 0; color: var(--dn-fg); font-size: 0.95rem; line-height: 1.6; }
  .l-meta { color: var(--dn-fg-faint); font-size: 0.66rem; letter-spacing: var(--dn-track); }

  /* Phone: one column; the sidebar folds behind the toggle. Zero
     animations — the perf law is absolute here. */
  @media (max-width: 700px) {
    .browse { grid-template-columns: 1fr; }
    .side {
      position: static;
      max-height: none;
      border-right: 0;
      border-bottom: 1px solid var(--dn-border);
    }
    .side-toggle {
      display: block;
      width: 100%;
      min-height: 40px;
      background: var(--dn-bg-sunken);
      border: 1px solid var(--dn-border);
      border-radius: 2px;
      color: var(--dn-fg-muted);
      font-size: 0.74rem;
      letter-spacing: var(--dn-track);
      text-transform: uppercase;
      cursor: pointer;
      margin-bottom: 0.35rem;
    }
    .side-toggle:focus-visible { outline: 2px solid var(--dn-accent); outline-offset: 2px; }
  }
</style>
