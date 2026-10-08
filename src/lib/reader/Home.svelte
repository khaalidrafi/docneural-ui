<script lang="ts">
  // Home — the welcome screen the site opens on (reader mode, nothing
  // selected). It is a real front door, not the graph: what Synapt is, the
  // live shape of the corpus, a jump-to-anything box, and the chapter grid.
  // The synapses view is offered as an enhancement, never forced.
  import type { SynaptStore } from '../core/store.svelte'

  let { store }: { store: SynaptStore } = $props()

  const chapters = $derived(store.chapters)
  const docCount = $derived(store.data.nodes.length)
  const synCount = $derived(store.data.links.length)

  let query = $state('')
  const results = $derived(store.search(query, 9))

  const first = $derived(chapters[0])

  // Per-chapter synapse degree for the card badges (computed once a load).
  const degree = $derived.by(() => {
    const m = new Map<string, number>()
    const v = store.views
    for (const [id, n] of v) m.set(id, n.degree)
    return m
  })
</script>

<div class="home">
  <header class="hero">
    <div class="wordmark sy-mono">
      synapt<span class="sy-caret">▌</span>
    </div>
    <p class="tagline sy-mono">fire together, wire stronger</p>
    <p class="lede">
      A living reader for the <strong>Org Manual</strong> — split per Info node,
      exported by Emacs, and wired into an org-roam graph. Every page knows the
      pages it cites, and the ones that cite it.
    </p>

    <div class="stats sy-mono">
      <span class="stat"><b>{chapters.length}</b> chapters</span>
      <span class="dot">·</span>
      <span class="stat"><b>{docCount}</b> docs</span>
      <span class="dot">·</span>
      <span class="stat"><b>{synCount}</b> synapses</span>
    </div>
  </header>

  <div class="search-wrap">
    <div class="search-box">
      <span class="sy-mono prompt">jump ›</span>
      <input
        type="text"
        class="sy-mono"
        placeholder="search every node…  (⌘K)"
        bind:value={query}
        aria-label="Search docs"
      />
    </div>
    {#if query.trim()}
      <ul class="results">
        {#each results as r (r.id)}
          <li>
            <button onclick={() => store.goto(r)}>
              {r.title}
              {#if r.redirect}<span class="stub sy-mono">→ {r.redirect.slug}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="none sy-mono">nothing matches “{query}”</li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="cta-row">
    {#if first}
      <button class="cta primary" onclick={() => store.goto(first)}>
        <span class="cta-k">▤</span>
        <span class="cta-t">Start reading</span>
        <span class="cta-s">{first.title}</span>
      </button>
    {/if}
    {#if !store.lite}
      <button class="cta" onclick={() => store.setMode('graph')}>
        <span class="cta-k spark">⌁</span>
        <span class="cta-t">Explore synapses</span>
        <span class="cta-s">the whole graph, live</span>
      </button>
    {/if}
  </div>

  <section class="chapters-grid">
    <h2 class="sy-mono section-h">Contents</h2>
    <div class="grid">
      {#each chapters as c (c.id)}
        <button class="card" onclick={() => store.goto(c)}>
          <span class="card-deg sy-mono">{degree.get(c.id) ?? 0} ⌁</span>
          <span class="card-title">{c.title}</span>
        </button>
      {/each}
    </div>
  </section>

  <footer class="foot sy-mono">
    built by an Emacs batch <span class="sym">org-export</span> · graph modeled on
    <span class="sym">org-roam</span> · stable <span class="sym">id:</span> citations,
    readable by humans and LLMs alike
  </footer>
</div>

<style>
  .home {
    height: calc(100dvh - var(--sy-header-h));
    overflow-y: auto;
    padding: 3rem 1.5rem 4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }
  .hero { max-width: 62ch; text-align: center; }
  .wordmark {
    font-size: clamp(2.6rem, 8vw, 4.5rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--sy-fg);
    text-shadow: 0 0 34px color-mix(in srgb, var(--sy-accent) 30%, transparent);
  }
  .tagline {
    color: var(--sy-accent);
    letter-spacing: 0.16em;
    font-size: 0.82rem;
    margin: 0.3rem 0 1.2rem;
  }
  .lede { color: var(--sy-fg-muted); font-size: 1.02rem; line-height: 1.6; margin: 0; }
  .lede strong { color: var(--sy-fg); }
  .stats {
    display: flex;
    gap: 0.7em;
    justify-content: center;
    margin-top: 1.4rem;
    font-size: 0.82rem;
    color: var(--sy-fg-muted);
  }
  .stats b { color: var(--sy-accent-2); font-size: 1.05em; }
  .stats .dot { color: var(--sy-border-strong); }

  .search-wrap { width: min(46rem, 100%); }
  .search-box {
    display: flex;
    align-items: center;
    gap: 0.6em;
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border-strong);
    border-radius: var(--sy-radius);
    padding: 0.7em 1em;
  }
  .search-box:focus-within {
    border-color: var(--sy-accent-dim);
    box-shadow: 0 0 22px color-mix(in srgb, var(--sy-accent) 20%, transparent);
  }
  .prompt { color: var(--sy-accent); font-size: 0.85rem; }
  .search-box input {
    flex: 1;
    background: none;
    border: none;
    color: var(--sy-fg);
    font-size: 1rem;
  }
  .search-box input:focus { outline: none; }
  .results {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0.3rem;
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
  }
  .results li button {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--sy-font-prose);
    font-size: 0.9rem;
    color: var(--sy-fg);
    background: none;
    border: none;
    border-radius: 4px;
    padding: 0.45em 0.7em;
    cursor: pointer;
  }
  .results li button:hover { background: color-mix(in srgb, var(--sy-accent) 12%, transparent); color: var(--sy-accent); }
  .stub { font-size: 0.72rem; color: var(--sy-fg-faint); margin-left: 0.6em; }
  .none { padding: 0.5em 0.7em; color: var(--sy-fg-faint); }

  .cta-row { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
  .cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2em;
    min-width: 15rem;
    text-align: left;
    color: var(--sy-fg);
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border-strong);
    border-radius: var(--sy-radius);
    padding: 0.9em 1.1em;
    cursor: pointer;
    transition: transform 120ms, box-shadow 120ms, border-color 120ms;
  }
  .cta:hover { transform: translateY(-2px); border-color: var(--sy-accent-dim); box-shadow: 0 8px 24px color-mix(in srgb, var(--sy-accent) 16%, transparent); }
  .cta.primary { border-color: var(--sy-accent-dim); }
  .cta-k { font-size: 1.1rem; color: var(--sy-accent-2); }
  .cta-k.spark { color: var(--sy-accent); }
  .cta-t { font-family: var(--sy-font-mono); font-weight: 600; }
  .cta-s { font-size: 0.78rem; color: var(--sy-fg-muted); }

  .chapters-grid { width: min(64rem, 100%); }
  .section-h {
    font-size: 0.75rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sy-fg-muted);
    margin: 0 0 0.8rem;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.6rem; }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
    text-align: left;
    font-family: var(--sy-font-prose);
    color: var(--sy-fg);
    background: color-mix(in srgb, var(--sy-bg-raise) 70%, transparent);
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.8em 0.9em;
    cursor: pointer;
    transition: border-color 120ms, background 120ms;
  }
  .card:hover { border-color: var(--sy-accent-dim); background: color-mix(in srgb, var(--sy-accent) 8%, transparent); }
  .card-title { font-size: 0.9rem; }
  .card-deg { align-self: flex-end; font-size: 0.68rem; color: var(--sy-accent-2); }

  .foot { max-width: 60ch; text-align: center; font-size: 0.72rem; color: var(--sy-fg-faint); line-height: 1.9; }
  .foot .sym { color: var(--sy-accent-dim); }
  @keyframes sy-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
