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
  import { loadEngine, toRoam } from '../graph/roamBridge'
  import { backlinks, outlinks } from '../core/graph'
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
  // Pan onto the centre doc when the page changes (a plain focus request,
  // like Emacs' follow frame). Fresh object per run = the act-on-identity
  // contract GraphView expects.
  $effect(() => {
    const d = doc
    if (d) roam.setFocus({ id: d.id })
  })

  // Cap the signal lists so the rail stays light on a potato and readable.
  const CAP = 8
  const insShown = $derived(ins.slice(0, CAP))
  const outsShown = $derived(outs.slice(0, CAP))

  function titleOf(id: string): string {
    return store.byId(id)?.title ?? id
  }
  function go(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }
</script>

<aside class="rail" aria-label="Synapses">
  {#if toc.length > 1}
    <section>
      <h3 class="sy-mono">On this page</h3>
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
        <span class="spark">⌁</span> synapses
        <span class="count">{local.nodes.length - 1}</span>
      </h3>
      <div class="graph-box">
        <GraphView store={roam} onNodeClick={(n) => go(n.id)} {loadEngine} />
      </div>
      <button class="expand sy-mono" onclick={() => store.setMode('graph')}>
        open full graph ↗
      </button>
    </section>
  {/if}

  <section>
    <h3 class="sy-mono">⇤ afferent <span class="count">{ins.length}</span></h3>
    {#if ins.length === 0}
      <p class="none sy-mono">orphan — nothing cites here</p>
    {:else}
      <ul>
        {#each insShown as l, i (`${l.source}-${i}`)}
          <li>
            <button class="link-btn" onclick={() => go(l.source)}>{titleOf(l.source)}</button>
            {#if l.context}<p class="ctx">{l.context}</p>{/if}
          </li>
        {/each}
        {#if ins.length > CAP}
          <li><button class="more sy-mono" onclick={() => store.setMode('graph')}>
            +{ins.length - CAP} more…</button></li>
        {/if}
      </ul>
    {/if}
  </section>

  {#if outs.length > 0}
    <section>
      <h3 class="sy-mono">⇥ efferent <span class="count">{outs.length}</span></h3>
      <ul>
        {#each outsShown as l, i (`${l.target}-${i}`)}
          <li>
            <button class="link-btn" onclick={() => go(l.target)}>{titleOf(l.target)}</button>
          </li>
        {/each}
        {#if outs.length > CAP}
          <li><button class="more sy-mono" onclick={() => store.setMode('graph')}>
            +{outs.length - CAP} more…</button></li>
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
  h3 {
    font-family: var(--sy-font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--sy-fg-muted);
    margin: 0.8rem 0 0.4rem;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }
  section:first-child h3 { margin-top: 0; }
  .count { color: var(--sy-accent-2); }
  .spark { color: var(--sy-accent); animation: sy-pulse 2.4s ease-in-out infinite; }
  .synapse-head { color: var(--sy-accent-dim); }

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
    font-weight: 600;
  }

  .graph-box {
    position: relative;
    height: 210px;
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    overflow: hidden;
    background: color-mix(in srgb, var(--sy-bg-sunken) 70%, transparent);
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
