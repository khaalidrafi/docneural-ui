<script lang="ts">
  // SynapseRail — the right rail of the reader. This is where org-roam-lite-ui
  // lives INSIDE the docs experience: a settling local graph (1-hop, like
  // org-roam-local-backlink-buffer) plus the afferent/efferent link lists.
  // "On this page" (the article TOC with scroll-spy) shares the rail, so the
  // reader keeps its bearings in either dimension — within the doc, or across
  // the corpus.
  //
  // The mini-map is the same orui GraphView as the hero mode (its own store
  // instance, fed the 1-hop snapshot through roamBridge). The centre doc is
  // the biggest node in a 1-hop graph by construction — a star's hub has the
  // highest degree, and GraphView sizes nodes by degree — so it marks itself;
  // no bespoke highlight needed.
  import GraphView from 'orui/graph/GraphView.svelte'
  import { createGraphStore } from 'orui/state/graphStore'
  import { toRoam } from '../graph/roamBridge'
  import { makeNeuronLoader } from '../graph/neuronEngine'
  import { backlinks, groupWires, outlinks } from '../core/graph'
  import { sourceVars } from '../core/source'
  import type { SynaptStore } from '../core/store.svelte'

  let {
    store,
    toc = [],
    activeId = null,
    onJump = (_id: string) => {}
  }: {
    store: SynaptStore
    toc?: { id: string; text: string; level: number }[]
    activeId?: string | null
    onJump?: (id: string) => void
  } = $props()

  const doc = $derived(store.selected)
  const local = $derived(store.local)
  const ins = $derived(doc ? backlinks(store.data, doc.id) : [])
  const outs = $derived(doc ? outlinks(store.data, doc.id) : [])

  // Mini-map store: same orui machinery as the hero graph, its own instance.
  // applyGraphdata re-seeds nothing the reader cares about losing — the rail
  // remounts per doc anyway; within one doc the engine reuses node objects
  // by id, so the layout settles once and stays put.
  const roam = createGraphStore()
  $effect(() => {
    const l = local
    if (l) roam.applyGraphdata(toRoam(l))
  })
  // Citation prose is one small file per node (ctx/<id>.json), asked for when
  // a page opens. Fire-and-forget: ctxFor() re-reads `contexts`, so the prose
  // appears under each afferent as soon as it lands.
  $effect(() => {
    const d = doc
    if (d) store.loadContext(d.id)
  })

  // Pan onto the centre doc when the page changes (a plain focus request,
  // like Emacs' follow frame). Fresh object per run = the act-on-identity
  // contract GraphView expects.
  $effect(() => {
    const d = doc
    if (d) roam.setFocus({ id: d.id })
  })

  // Mini-map painting: compact neuron loader — small solid somas instead of
  // force-graph's degree-sized discs (a 210px box made the hub a blue blob),
  // labels off, hot-ness carried by a ring. The centre doc is the hot node:
  // selection is read live through the closure, so it wears a ring without a
  // re-sync.
  let boxEl: HTMLDivElement | undefined = $state()
  const NO_NB: Set<string> = new Set()
  const minimapLoad = makeNeuronLoader({
    tokenEl: () => boxEl,
    selected: () => doc?.id ?? null,
    neighbors: () => NO_NB,
    compact: true
  })

  // Cap the signal lists so the rail stays light on a potato and readable.
  const CAP = 8
  /* Afferents/efferents are grouped per citing chapter (core/graph.ts
   * groupWires), because an index chapter that cites you 612 times is ONE
   * fact, not 612 rows. The header keeps both numbers: how many wires, and
   * how many chapters are pulling them. */
  const insG = $derived(groupWires(ins, 'source'))
  const outsG = $derived(groupWires(outs, 'target'))
  const insShown = $derived(insG.slice(0, CAP))
  const outsShown = $derived(outsG.slice(0, CAP))

  function titleOf(id: string): string {
    return store.byId(id)?.title ?? id
  }
  function go(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }
</script>

<aside class="rail" aria-label="Synapses" style={sourceVars(doc?.tags[0] ?? store.manual)}>
  {#if toc.length > 1}
    <section>
      <h3 class="sy-mono">// on this page</h3>
      <ul class="toc">
        {#each toc as h (h.id)}
          <li class:sub={h.level === 3}>
            <button class:here={activeId === h.id} onclick={() => onJump(h.id)}>{h.text}</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !store.lite && local && doc}
    <section>
      <h3 class="sy-mono synapse-head">
        <span class="sy-neuron-mark spark-mark" aria-hidden="true"></span>
        <span class="spark">⌁</span> local graph
        <span class="count">{local.nodes.length - 1}</span>
      </h3>
      <div class="graph-box" bind:this={boxEl}>
        <GraphView store={roam} onNodeClick={(n) => go(n.id)} loadEngine={minimapLoad} />
      </div>
      <button class="expand sy-mono" onclick={() => store.setMode('graph')}>
        open full graph ↗
      </button>
    </section>
  {/if}

  <section>
    <h3 class="sy-mono">
      ⇤ afferent <span class="count">{ins.length}</span>
      {#if insG.length !== ins.length}<span class="from">from {insG.length} chapters</span>{/if}
    </h3>
    {#if ins.length === 0}
      <p class="none sy-mono">orphan — nothing cites here</p>
    {:else}
      <ul>
        {#each insShown as g (g.id)}
          <li>
            <button class="link-btn" onclick={() => go(g.id)}>
              {titleOf(g.id)}{#if g.n > 1}<span class="multi">×{g.n}</span>{/if}
            </button>
            {#if store.ctxFor(g.link)}<p class="ctx">{store.ctxFor(g.link)}</p>{/if}
          </li>
        {/each}
        {#if insG.length > CAP}
          <li><button class="more sy-mono" onclick={() => store.setMode('graph')}>
            +{insG.length - CAP} more chapters…</button></li>
        {/if}
      </ul>
    {/if}
  </section>

  {#if outs.length > 0}
    <section>
      <h3 class="sy-mono">
        ⇥ efferent <span class="count">{outs.length}</span>
        {#if outsG.length !== outs.length}<span class="from">to {outsG.length} chapters</span>{/if}
      </h3>
      <ul>
        {#each outsShown as g (g.id)}
          <li>
            <button class="link-btn" onclick={() => go(g.id)}>
              {titleOf(g.id)}{#if g.n > 1}<span class="multi">×{g.n}</span>{/if}
            </button>
          </li>
        {/each}
        {#if outsG.length > CAP}
          <li><button class="more sy-mono" onclick={() => store.setMode('graph')}>
            +{outsG.length - CAP} more chapters…</button></li>
        {/if}
      </ul>
    </section>
  {/if}
</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 0;
    border-left: 1px solid var(--sy-border);
    padding: 0.9rem 0.9rem 2rem;
    overflow-y: auto;
    background: color-mix(in srgb, var(--sy-bg-sunken) 50%, transparent);
  }
  /* Tablet: the rail drops out (no room beside sidebar + article). Phone:
     it reappears STACKED under the article — the roam view must be
     reachable on a phone, just not beside the text. This lives here rather
     than in DocReader because a scoped `.rail.s-hash` rule outranks any
     :global(.rail) the parent writes — the hide attempt silently failed. */
  @media (max-width: 1100px) {
    .rail { display: none; }
  }
  @media (max-width: 700px) {
    .rail {
      display: flex;
      border-left: none;
      border-top: 1px solid var(--sy-border);
    }
  }
  h3 {
    font-family: var(--sy-font-mono);
    font-size: 0.66rem;
    letter-spacing: var(--sy-track);
    text-transform: uppercase;
    color: var(--sy-fg-muted);
    margin: 0.9rem 0 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }
  section:first-child h3 { margin-top: 0; }
  .count { color: var(--sy-accent-2); }
  /* "×612" — how much one chapter leans on this one. Kept quiet: it is a
     weight, not a headline, and the title is what you click. */
  .multi {
    margin-left: 0.4em;
    color: var(--sy-fg-faint);
    font-size: 0.82em;
  }
  /* "from 5 chapters" next to the wire count: the grouped half of the fact. */
  .from {
    color: var(--sy-fg-faint);
    font-size: 0.72em;
    letter-spacing: 0.04em;
  }
  .spark { color: var(--sy-accent); animation: sy-pulse 2.4s ease-in-out infinite; }
  .synapse-head { color: var(--sy-src, var(--sy-accent-dim)); }
  .spark-mark { width: 0.62em; height: 0.62em; }

  .toc { list-style: none; margin: 0; padding: 0; }
  .toc li { margin: 0; }
  .toc li.sub { padding-left: 0.8em; }
  .toc button {
    display: block;
    width: 100%;
    text-align: left;
    font-family: var(--sy-font-prose);
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--sy-fg-muted);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    padding: 0.22em 0.5em;
    cursor: pointer;
  }
  .toc button:hover { color: var(--sy-fg); }
  .toc button.here {
    color: var(--sy-accent);
    border-left-color: var(--sy-accent);
    background: color-mix(in srgb, var(--sy-accent) 8%, transparent);
    font-weight: 600;
  }

  .graph-box {
    position: relative;
    height: 210px;
    border: 1px solid var(--sy-border-strong);
    /* notched corner: the mini-map is an instrument window, not a card */
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--sy-notch)), calc(100% - var(--sy-notch)) 100%, 0 100%);
    overflow: hidden;
    /* Same canvas-theme bridge as the hero graph (SynapsesGraph): the mini
       map must not be the one spot where the site palette breaks. */
    --orui-link-color: var(--sy-graph-link);
    --orui-node-palette: var(--sy-graph-palette);
    /* Same agar dish as hero mode, at mini-map scale: the mini-map is the
       same tissue as the full graph, just a smaller dish. */
    background-color: var(--sy-graph-bg);
    background-image:
      radial-gradient(circle at 1px 1px, var(--sy-dish-dot-1) 1px, transparent 0),
      radial-gradient(circle at 9px 13px, var(--sy-dish-dot-2) 1px, transparent 0);
    background-size: 28px 28px, 37px 37px;
  }
  /* Phone: stacked under the article, so the box gets the width it lost and
     the somas room to breathe — this is where a 210px hairball used to die. */
  @media (max-width: 700px) {
    .graph-box { height: 260px; }
  }
  .expand {
    margin-top: 0.4rem;
    font-size: 0.72rem;
    color: var(--sy-accent-2);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .expand:hover { color: var(--sy-hot); }

  ul { list-style: none; margin: 0; padding: 0; }
  li { margin: 0.3rem 0; }
  .link-btn {
    font-family: var(--sy-font-mono);
    font-size: 0.78rem;
    color: var(--sy-accent);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .link-btn:hover { color: var(--sy-hot); }
  .ctx {
    font-size: 0.72rem;
    color: var(--sy-fg-faint);
    margin: 0.1rem 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .none { color: var(--sy-fg-faint); font-size: 0.78rem; }
  .more {
    font-size: 0.7rem;
    color: var(--sy-accent-2);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .more:hover { text-decoration: underline; }
</style>
