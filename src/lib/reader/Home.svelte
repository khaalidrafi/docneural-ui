<script lang="ts">
  // Home — the welcome screen the site opens on (reader mode, nothing
  // selected). It is a real front door, not the graph: what the site is, the
  // live shape of the corpus, a jump-to-anything box, and the chapter grid of
  // one manual (tabs hop between the manuals this aggregator carries).
  //
  // This is also where the AGGREGATOR identity lives: the sources strip shows
  // every corpus the export carries, each wearing the exact hue the synapses
  // canvas gives its nodes (core/source.ts), with its page and wire counts.
  // Nothing here assumes Emacs, Guix or Org — the copy is written for
  // "documentation from anywhere", because that is what the exporter emits.
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import ManualTabs from '../ui/ManualTabs.svelte'
  import CorpusField from './CorpusField.svelte'

  /* Instrument-style count-up on the corpus readout: the numbers sweep from
     zero once on mount, mono digits make it read like a boot readout.
     Reduced-motion visitors (and crawlers) just get the final value. */
  function countup(node: HTMLElement, target: number) {
    if (!Number.isFinite(target)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t0 = performance.now()
    const DUR = 900
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR)
      const eased = 1 - Math.pow(1 - k, 3)
      node.textContent = String(Math.round(target * eased))
      if (k < 1) requestAnimationFrame(tick)
    }
    node.textContent = '0'
    requestAnimationFrame(tick)
  }

  let { store, title = 'org-docs' }: { store: DocneuralStore; title?: string } = $props()

  const chapters = $derived(store.chapters)
  const docCount = $derived(store.data.nodes.length)
  // `pages` on the tty must be the whole site, not the selected manual's TOC:
  // the strip below lists 485 + 485 + 277 pages, so a "24" here (chapters for
  // one corpus) reads as a broken counter. Stubs are heading references that
  // redirect to a real page, so they are not pages.
  const pageCount = $derived(store.data.nodes.filter((n) => !n.stub).length)
  const synCount = $derived(store.data.links.length)
  const sources = $derived(store.sources)
  // The `--stats` output lists corpora by their tag, i.e. the way you would
  // name a directory, not the display name the cards wear.
  const sourceList = $derived(sources.map((s) => s.name).join(' ') || '1')

  let query = $state('')
  const results = $derived(store.search(query, 9))

  const first = $derived(chapters[0])

  // Where the reader stopped last time (written by DocReader through the
  // store). Resolved against the live graph every time it changes, because a
  // slug saved from an older export may not exist in this corpus.
  const last = $derived.by(() => {
    const v = store.lastRead
    if (!store.ready || !v) return null
    const node = store.bySlug(v.slug)
    return node ? { node, anchor: v.anchor } : null
  })
  function resume(): void {
    if (last) store.goto(last.node, 'reader', last.anchor)
  }

  // The sections marked with `b`, newest first. Resolved against the live
  // graph exactly like `last`: a mark saved from an older export can name a
  // page that no longer exists, and a dead entry in a bookmark list is worse
  // than a missing one. The stored title paints, so a card is never blank.
  const marks = $derived.by(() => {
    if (!store.ready) return []
    return store.saved.flatMap((m) => {
      const node = store.bySlug(m.slug)
      return node ? [{ ...m, node }] : []
    })
  })

  // Per-chapter synapse degree for the row badges (computed once a load).
  const degree = $derived.by(() => {
    const m = new Map<string, number>()
    for (const [id, n] of store.views) m.set(id, n.degree)
    return m
  })

  /* The terminal status line, STATIC (DS-COOLEST directive 21): the 24ms
     $state typewriter was a JS re-render loop — the most expensive thing on
     Home after the hero filters. The line renders once, real corpus facts,
     aria-hidden (the stats block carries them for real), caret blinks via
     CSS only (the one surviving desktop loop beside the rail sweep). */
  const feedLine = $derived(`// ${synCount} synapses primed — ego lens armed`)

  // A source card: open that corpus and land its first chapter (showManual
  // alone only retargets the TOC; here there is no selection, so we do it).
  function openManual(m: string): void {
    store.showManual(m)
    const c = store.chapters[0]
    if (c) store.goto(c)
  }

  // A manual can carry ~500 chapters; painting all of them on a potato is
  // slow and useless to skim. Show a first page, offer the rest on demand.
  // (Reset when the TOC's manual changes -- the $effect below.)
  let showAll = $state(false)
  $effect(() => {
    void store.manual
    showAll = false
  })
</script>

<div class="home">
  <header class="hero" style={sourceVars(store.manual)}>
    <!-- DS-COOLEST pass: the hero is a two-column instrument (directive 9).
         Left = the identity column (kicker/wordmark/rail/tagline/feed/lede/
         CTAs/readout), right = the Corpus Plate (directive 11) — the REAL
         graph drawn once, not a decoration. The seam between them is a
         hairline border, the instrument seam. -->
    <div class="id">
      <p class="kicker dn-label">// knowledge uplink · online</p>
      <div class="wordmark dn-mono dn-gradient-text">
        <span class="dn-neuron-mark mark" aria-hidden="true"></span>{title.toUpperCase()}
      </div>
      <!-- The power rail: a cyan filament sweep (transform-only, cheap —
           desktop loop 1 of 2; the caret blink is the other). -->
      <div class="rail" aria-hidden="true"></div>
      <p class="tagline dn-mono">docs are neurons · citations are axons · fire together, wire stronger</p>
      <p class="feed dn-mono" aria-hidden="true">{feedLine}<span class="feed-caret">▌</span></p>
    <p class="lede">
      One reader for documentation from <strong>anywhere</strong> — every manual
      split per section, exported from Org by Emacs, and wired into an org-roam
      graph of <strong>{synCount} firing synapses</strong>. Read it top to bottom,
      jump anywhere with ⌘K, or drop into the graph and follow the citations.
      Every page also ships as raw Org and as
      <span class="dn-mono">llms.txt</span> — machine-readable on purpose.
    </p>

    <!-- Exactly two CTAs, one job each (DS-COOLEST directive 13): the
         sources strip below already lists the corpora — the front door no
         longer offers the same destination twice. -->
    <div class="cta-row">
      {#if first}
        <button class="cta dn-notch" onclick={() => store.goto(first)}>
          <span class="cta-k">▤</span>
          <span class="cta-t">Start reading</span>
          <span class="cta-s">{first.title}</span>
        </button>
      {/if}
      {#if !store.lite}
        <button class="cta graph dn-notch" onclick={() => store.setMode('graph')}>
          <span class="cta-k spark">⌁</span>
          <span class="cta-t">Explore synapses</span>
          <span class="cta-s">the whole graph, live</span>
        </button>
      {/if}
    </div>

    <!-- The corpus readout, stated plainly. The size of the site IS the pitch,
         so the numbers get a panel of their own — but as a panel, not as a
         pretend shell session: no prompt, no window buttons, no "[ ok ]". -->
    <div class="stats dn-hud" role="status" aria-live="polite">
      <!-- The data bus: dashed readout strip across the panel's brow — the
           corpus counts ride in on it. -->
      <span class="bus" aria-hidden="true"></span>
      <div class="stats-hd dn-label">
        <span class="dn-neuron-mark" aria-hidden="true"></span>
        <span>this corpus</span>
      </div>
      <div class="dn-kv">
        <span>sources</span><span>{sources.length} · {sourceList}</span>
        <span>pages</span><span class="num" use:countup={pageCount}>{pageCount}</span>
        <span>neurons</span><span class="num" use:countup={docCount}>{docCount}</span>
        <span>synapses</span><span class="num"><b use:countup={synCount}>{synCount}</b> <em>firing</em></span>
        <span>artifacts</span><span class="files">graph.json · llms.txt · *.org</span>
      </div>
      <p class="note">indexed at build time — no database, no server</p>
      <!-- Resume, straight off the front door: the last page you were on, at
           the heading you were under. Only shown when the stored slug still
           exists in this corpus — a renamed chapter must not offer a dead link. -->
      {#if last}
        <button class="resume" onclick={resume}>
          <span class="r-lab">resume</span>
          <span class="r-to">{last.node.tags[0]}/{last.node.title}{last.anchor ? `#${last.anchor}` : ''}</span>
          <span class="r-go" aria-hidden="true">›</span>
        </button>
      {/if}
    </div>
    </div>
    <!-- The Corpus Plate: the product itself, drawn once (see CorpusField). -->
    <div class="plate">
      <CorpusField {store} />
    </div>
  </header>

  <!-- The marks you made with `b`, straight off the front door. This is the
       whole point of a bookmark list on a reference site: you return, and the
       five sections that matter to today's task are already in one place. -->
  {#if marks.length}
    <section class="saved" data-idx="01">
      <h2 class="section-h dn-label">
        // marked <span class="hint">{marks.length} section{marks.length === 1 ? '' : 's'} · b in the reader</span>
      </h2>
      <div class="mk-row">
        {#each marks as m (m.slug + '#' + (m.anchor ?? ''))}
          <button
            class="mk dn-mono"
            style={sourceVars(m.node.tags[0] ?? '')}
            onclick={() => store.goto(m.node, 'reader', m.anchor)}
          >
            <span class="mk-src">{m.node.tags[0] ?? 'corpus'}</span>
            <span class="mk-title">{m.title}</span>
            {#if m.anchor}<span class="mk-to">#{m.anchor}</span>{/if}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="sources" data-idx="02">
    <h2 class="dn-label section-h">// sources <span class="hint">each corpus wears its graph hue</span></h2>
    <div class="src-row">
      {#each sources as s, si (s.name)}
        <button class="src-card" style="--i: {si}; {sourceVars(s.name)}" onclick={() => openManual(s.name)}>
          <span class="src-name dn-mono">{DocneuralStore.manualTitle(s.name)}</span>
          <span class="src-meta dn-mono">{s.pages} pages · {s.links} wires</span>
          <span class="src-open">read ›</span>
        </button>
      {:else}
        <p class="none dn-mono">one corpus, no tags — everything is one source</p>
      {/each}
    </div>
  </section>

  <!-- The jump box. Monospace and left-labelled, which is enough: the field
       searches, it does not pretend to be a shell. -->
  <section class="search-wrap" data-idx="03">
    <div class="search-box dn-mono">
      <span class="prompt" aria-hidden="true">⌕</span>
      <input
        type="text"
        placeholder="search every chapter   (or press ⌘K)"
        bind:value={query}
        aria-label="Search docs"
      />
    </div>
    {#if query.trim()}
      <ul class="results">
        {#each results as r (r.id)}
          <li style={sourceVars(r.tags[0])}>
            <button onclick={() => store.goto(r)}>
              <span class="dot" aria-hidden="true"></span>
              {r.title}
              {#if r.redirect}<span class="stub">→ {r.redirect.slug}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="none">org-docs: no match for “{query}”</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="chapters-grid" data-idx="04">
    <div class="contents-head">
      <h2 class="section-h dn-label">
        contents // {DocneuralStore.manualTitle(store.manual) || 'all sources'}
      </h2>
      <ManualTabs {store} />
    </div>
    <div class="grid">
      {#each showAll ? chapters : chapters.slice(0, 60) as c, ci (c.id)}
        <button class="card" style="--i: {ci}; {sourceVars(c.tags[0])}" onclick={() => store.goto(c)}>
          <span class="card-title">{c.title}</span>
          <span class="card-deg dn-mono">{degree.get(c.id) ?? 0}⌁</span>
        </button>
      {/each}
      {#if !showAll && chapters.length > 60}
        <button class="card show-all dn-mono" onclick={() => (showAll = true)}>
          + {chapters.length - 60} more chapters
        </button>
      {/if}
    </div>
  </section>

  <footer class="foot dn-mono">
    exported by an Emacs batch <span class="sym">org-export</span> · graph modeled on
    <span class="sym">org-roam</span> · stable <span class="sym">id:</span> citations,
    readable by humans and LLMs alike —
    <a class="mach" href="{store.base}/llms.txt">llms.txt</a>
    <a class="mach" href="{store.base}/llms-full.txt">llms-full.txt</a>
    <a class="mach" href="{store.base}/graph.json">graph.json</a>
  </footer>
</div>

<style>
  .home {
    height: calc(100dvh - var(--dn-header-h));
    overflow-y: auto;
    /* DS-COOLEST directive 12 — one spine: every block shares one left edge
       and one width. The page is composed, not assembled. */
    max-width: 74rem;
    margin-inline: auto;
    padding: var(--dn-space-7) var(--dn-space-5) var(--dn-space-8);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--dn-space-7);
  }


  /* ---------- hero ---------- */
  /* DS-COOLEST directive 9: the hero is a two-column instrument, not a
     centered poster. Left = identity column with a hairline seam; right =
     the Corpus Plate. Asymmetric split reads as hardware. */
  .hero {
    position: relative;
    max-width: none;
    width: 100%;
    text-align: left;
    isolation: isolate;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: var(--dn-space-7);
    align-items: start;
    padding: var(--dn-space-5) 0 0;
  }
  .id {
    border-right: 1px solid var(--dn-hairline);
    padding-right: var(--dn-space-7);
    min-width: 0;
  }
  .plate {
    min-width: 0;
  }

  .kicker {
    color: var(--dn-acid);
    letter-spacing: var(--dn-track-wide);
    margin: 0;
    text-shadow: none;
    font-size: var(--dn-text-xs);
  }

  .wordmark {
    font-family: var(--dn-font-display);
    /* Hero display rides the ramp's top step (DS-COOLEST directive 1) —
       no more hardcoded clamp; the fill + paper ink come from the global
       .dn-gradient-text class (directive 7: filament, not neon sign). */
    font-size: var(--dn-text-4xl);
    font-weight: 400;
    letter-spacing: var(--dn-track-tight);
    line-height: var(--dn-lh-tight);
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    margin: 0.25rem 0 0;
  }

  .wordmark .mark { width: 0.55em; height: 0.55em; flex: none; }
  .tagline {
    color: var(--dn-accent-dim);
    letter-spacing: var(--dn-track);
    font-size: var(--dn-text-xs);
    text-transform: lowercase;
    margin: var(--dn-space-3) 0 0;
    text-shadow: none;
  }

  /* The terminal status line: static real corpus facts, caret blinking.
     aria-hidden in the markup; its facts are duplicated in the stats. */
  .feed {
    min-height: 1.2em;
    margin: var(--dn-space-2) 0 0;
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-tight);
    color: var(--dn-fg-faint);
    text-shadow: none;
  }

  .feed-caret {
    color: var(--dn-hot);
    /* The blink is the one surviving desktop loop on Home: a 1.1s steps()
       opacity toggle on a single glyph. Phones park it (see PHONE). */
    animation: dn-blink 1.1s steps(1, end) infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .feed-caret { animation: none; }
  }
  .lede {
    color: var(--dn-fg-muted);
    font-size: var(--dn-text-md);
    line-height: var(--dn-lh-body);
    margin: var(--dn-space-5) 0 0;
    max-width: 54ch;
  }

/* DS-COOLEST directive 10 — one rhythm ladder in the hero: the flex gap is
   dead, explicit margins compose the vertical rhythm. Five arbitrary gaps
   become five deliberate ones. */
.hero > .id > .cta-row { margin-top: var(--dn-space-5); }
.hero > .id > .stats { margin-top: var(--dn-space-6); }

  .lede strong { color: var(--dn-fg); }
  .lede .dn-mono { font-size: 0.9em; color: var(--dn-accent); }
  /* The readout plate (DS-COOLEST directive 15): the ONE framed module per
     screen. Border tier = control outline, 3px bus rail in the source hue,
     one inset keyline. The numbers speak in solid ink + one cyan accent —
     no gradient decay, no halo (directive 5). */
  .stats {
    width: 100%;
    margin-top: 0;
    text-align: left;
    display: grid;
    gap: var(--dn-space-3);
    padding: var(--dn-space-4) var(--dn-space-5);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    border-radius: 0;
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dn-fg) 6%, transparent);
  }
  :global([data-theme='light']) .stats {
    border-color: var(--dn-border);
    border-left-color: var(--dn-src, var(--dn-accent));
  }

  /* The glow behind the wordmark is long gone; nothing paints under the
     hero but the plate's own sunken wash. */
  .hero::before {
    content: none;
  }

  .stats-hd {
    display: flex;
    align-items: center;
    gap: 0.5em;
    color: var(--dn-fg-muted);
  }
  .stats-hd .dn-neuron-mark { width: 0.7em; height: 0.7em; }
  .stats .note { margin: 0; font-size: var(--dn-text-xs); color: var(--dn-fg-muted); }
  /* The readout is monospace: digits that do not shift width between builds are
     the difference between a machine's count and a sentence about a count. */
  .stats .dn-kv {
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-sm);
    align-items: baseline;
    row-gap: 0.35rem;
  }
  .stats .dn-kv > span:nth-child(odd) {
    text-transform: uppercase;
    letter-spacing: var(--dn-track);
    font-size: var(--dn-text-2xs);
    padding-top: 0.45em;
  }
  /* Big count-up numbers in solid ink (DS-COOLEST directive 5): the corpus
     size IS the pitch — size and weight carry it now, not neon. */
  .stats .dn-kv .num {
    font-size: var(--dn-text-2xl);
    line-height: 1.05;
    color: var(--dn-fg);
  }
  .stats .dn-kv .num b {
    font-weight: 600;
    color: var(--dn-accent);
    background: none;
    -webkit-background-clip: border-box;
    background-clip: border-box;
    text-shadow: none;
  }
  .stats .dn-kv .num em {
    font-style: normal;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    background: none;
    -webkit-background-clip: border-box;
    background-clip: border-box;
    text-shadow: none;
  }
  .stats .dn-kv .files { font-size: var(--dn-text-sm); }
  /* Resume: a labelled row, not a command line. The label says what it does,
     the value says where it goes. */
  .resume {
    display: flex;
    align-items: baseline;
    gap: 0.7em;
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-sm);
    text-align: left;
    color: var(--dn-fg-muted);
    background: color-mix(in srgb, var(--dn-accent) 7%, transparent);
    border: 1px solid var(--dn-border);
    border-radius: 3px;
    padding: 0.5em 0.8em;
    cursor: pointer;
  }
  .resume:hover {
    border-color: var(--dn-accent);
    color: var(--dn-accent);
  }
  .resume .r-lab {
    text-transform: uppercase;
    letter-spacing: var(--dn-track);
    font-size: var(--dn-text-2xs);
    color: var(--dn-accent);
  }
  .resume .r-to { color: var(--dn-fg); overflow-wrap: anywhere; }
  .resume:hover .r-to { text-decoration: underline; }
  .resume .r-go { margin-left: auto; }
  @media (max-width: 700px) {
    .stats { padding: 0.9rem 1rem; }
  }

  /* ---------- sources strip: the aggregator, shown not told ---------- */
  .sources { width: 100%; }

  /* ---------- marked sections ---------- */
  .saved { width: 100%; }
  .saved .section-h { margin-bottom: 0.5rem; }
  .mk-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .mk {
    display: inline-flex;
    align-items: baseline;
    gap: 0.45em;
    font: inherit;
    letter-spacing: var(--dn-track);
    text-align: left;
    color: var(--dn-fg);
    background: color-mix(in srgb, var(--dn-accent) 6%, transparent);
    border: 1px solid var(--dn-border);
    border-left: 2px solid var(--dn-src, var(--dn-accent));
    border-radius: 2px;
    padding: 0.3em 0.7em;
    cursor: pointer;
  }
  .mk:hover {
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 60%, transparent);
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
  }
  .mk .mk-src { color: var(--dn-accent); }
  .mk .mk-to { color: var(--dn-fg-faint); }
  .sources h2, .section-h { color: var(--dn-fg-muted); margin: 0 0 0.7rem; }
  .hint { color: var(--dn-fg-faint); text-transform: none; letter-spacing: var(--dn-track-tight); font-size: var(--dn-text-2xs); }
  /* DS-COOLEST directive 18 — the tick rule: every section header ends in a
     rule whose first 2px are lit in the accent. A reticle mark drawn with
     alignment, not effects; costs one gradient. */
  .section-h::after {
    content: "";
    display: block;
    height: 1px;
    margin-top: var(--dn-space-2);
    background: linear-gradient(90deg, var(--dn-accent) 0 2px, var(--dn-hairline) 2px 100%);
  }
  /* Directive 18 — the mono index gutter: each Home section announces its
     position like a manual page (01–04). Pure alignment, one text node. */
  .home > section::before {
    content: attr(data-idx);
    font: 400 var(--dn-text-2xs)/1 var(--dn-font-mono);
    letter-spacing: var(--dn-track-wide);
    color: var(--dn-fg-faint);
    display: block;
    margin-bottom: var(--dn-space-2);
  }
  /* Entrance choreography: a 24ms-per-card rise, capped so a 200-row grid
     does not turn into a slow curtain. Reduced motion is killed globally. */
  .card, .src-card {
    animation: dn-rise 340ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
    animation-delay: calc(min(var(--i, 0), 16) * 24ms);
  }
  .src-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.5rem;
  }
  .src-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--dn-space-1);
    text-align: left;
    color: var(--dn-fg);
    /* Flat card: solid fill + hairline border + source-hue rail (directive
       6: a MARK, not a material — 2px at 55% at rest, full on hover). */
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-left: 2px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, var(--dn-border));
    border-radius: 0;
    padding: var(--dn-space-3) var(--dn-space-4);
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .src-card:hover {
    background-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, var(--dn-bg-raise));
    border-left-color: var(--dn-src, var(--dn-accent));
  }
  .src-name { font-size: var(--dn-text-sm); font-weight: 600; color: var(--dn-accent); letter-spacing: var(--dn-track-tight); }
  .src-meta { font-size: var(--dn-text-xs); color: var(--dn-fg-faint); letter-spacing: var(--dn-track-tight); }
  .src-open {
    position: absolute;
    right: 0.7em;
    top: 0.7em;
    font-size: var(--dn-text-xs);
    font-family: var(--dn-font-mono);
    color: var(--dn-accent);
    opacity: 0;
    transition: opacity 120ms;
  }
  .src-card:hover .src-open { opacity: 1; }
  .none { color: var(--dn-fg-faint); font-size: var(--dn-text-xs); margin: 0; }

  /* ---------- jump box ---------- */
  .search-wrap { width: 100%; }
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    padding: 0.7em 1em;
    transition: border-color 120ms;
  }
  .search-box:focus-within {
    border-color: var(--dn-accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dn-accent) 30%, transparent);
  }
  /* PS1 sits outside the input, so only the path part may shrink. */
  .prompt { flex: none; font-size: var(--dn-text-sm); }
  .search-box input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-sm);
    caret-color: var(--dn-accent);
  }
  .search-box input:focus { outline: none; }
  .search-box .prompt { color: var(--dn-fg-muted); font-size: var(--dn-text-md); }
  @media (max-width: 520px) {
    .search-box .prompt { display: none; }
  }
  .results {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0.3rem;
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
  }
  .results li button {
    display: flex;
    align-items: center;
    gap: 0.55em;
    width: 100%;
    text-align: left;
    font-family: var(--dn-font-prose);
    font-size: var(--dn-text-sm);
    color: var(--dn-fg);
    background: none;
    border: none;
    border-radius: 2px;
    padding: 0.45em 0.7em;
    cursor: pointer;
  }
  .results li button:hover { background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent); color: var(--dn-accent); }
  /* The source's hue as a dot: you see which corpus a hit belongs to before
     you read its title. */
  .results .dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--dn-src, var(--dn-accent));
    box-shadow: 0 0 8px var(--dn-src, var(--dn-accent));
  }
  .stub { font-size: var(--dn-text-xs); color: var(--dn-fg-faint); margin-left: auto; }
  .results .none { padding: 0.5em 0.7em; color: var(--dn-fg-faint); }

  /* ---------- CTAs: two actions, inline under the lede (directive 13) --- */
  .cta-row { display: flex; gap: var(--dn-space-2); flex-wrap: wrap; justify-content: flex-start; min-width: 0; }
  .cta {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--dn-space-1);
    min-width: 0;
    text-align: left;
    color: var(--dn-fg);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-left: 2px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, var(--dn-border));
    padding: 0.7rem 1.1rem;
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .cta:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, var(--dn-bg-raise));
    border-left-color: var(--dn-src, var(--dn-accent));
  }
  /* Directive 5: glyph keys are quiet ink; only the ⌁ synapse glyph carries
     the accent. No pink, no hot in the CTA row. */
  .cta-k { font-size: var(--dn-text-lg); color: var(--dn-fg-faint); }
  .cta-k.spark { color: var(--dn-accent); }
  .cta-t { font-family: var(--dn-font-mono); font-weight: 600; font-size: var(--dn-text-sm); letter-spacing: var(--dn-track-tight); }
  .cta-s { font-size: var(--dn-text-xs); color: var(--dn-fg-muted); }

  /* ---------- contents grid: an index of hairline rows (directive 14) -- */
  .chapters-grid { width: 100%; }
  .contents-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.8rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0;
  }
  /* Directive 14: a manual's contents should look like a contents page —
     an index of hairline rows, not 60 boxes. 60 borders + 60 fills become
     60 hairlines (a real paint win); the source hue rides the 2px left
     mark, full on hover. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--dn-space-1);
    text-align: left;
    font-family: var(--dn-font-prose);
    color: var(--dn-fg);
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--dn-hairline);
    border-left: 2px solid transparent;
    border-radius: 0;
    padding: 0.55rem 0.5rem 0.55rem 0.75rem;
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .card:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 5%, transparent);
    border-left-color: var(--dn-src, var(--dn-accent));
    border-bottom-color: var(--dn-border);
  }
  /* The ::before spine and ::after brow hairline are deleted (directive 8):
     the 2px left mark carries the hue; nothing grows, nothing lifts. */
  .show-all {
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--dn-accent);
    border-bottom-style: dashed;
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-tight);
  }
  .card-title { font-size: var(--dn-text-sm); }
  .card-deg { align-self: flex-end; font-size: var(--dn-text-2xs); color: var(--dn-fg-faint); letter-spacing: var(--dn-track-tight); }
  .card:hover .card-deg { color: var(--dn-accent); }

  .foot { width: 100%; text-align: left; font-size: var(--dn-text-xs); color: var(--dn-fg-faint); line-height: 1.9; letter-spacing: var(--dn-track-tight); }
  .foot .sym { color: var(--dn-accent-dim); }
  .foot .mach {
    color: var(--dn-fg-muted);
    text-decoration: none;
    border-bottom: 1px dotted var(--dn-border-strong);
    padding-bottom: 1px;
  }
  .foot .mach:hover { color: var(--dn-accent); border-bottom-style: solid; }

  /* ---------- the Corpus Plate is drawn by CorpusField.svelte ----------
     Desktop loops at rest, whole Home (directive 21): rail sweep
     (transform) + caret blink (opacity). Nothing else. */

  .rail {
    position: relative;
    width: min(24rem, 100%);
    height: 2px;
    margin: var(--dn-space-4) 0 0;
    /* Cyan filament (directive 5): the rail is chrome — no violet, no pink
       stops. One hue, one job. */
    background: linear-gradient(90deg,
      transparent,
      var(--dn-accent) 30%,
      color-mix(in srgb, var(--dn-accent) 40%, transparent) 100%);
    opacity: 0.85;
    overflow: hidden;
  }
  .rail::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 34%;
    background: linear-gradient(90deg, transparent, var(--dn-fg) 50%, transparent);
    transform: translateX(-120%);
    animation: dn-rail 3.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes dn-rail {
    0% { transform: translateX(-120%); opacity: 0; }
    12% { opacity: 1; }
    88% { opacity: 1; }
    100% { transform: translateX(410%); opacity: 0; }
  }
  :global([data-theme='light']) .rail { opacity: 0.7; }

  .bus {
    display: block;
    height: 3px;
    margin: -0.35rem -1.3rem 0.7rem;
    background: repeating-linear-gradient(90deg,
      color-mix(in srgb, var(--dn-accent) 55%, transparent) 0 14px,
      transparent 14px 26px,
      color-mix(in srgb, var(--dn-accent-2) 42%, transparent) 26px 31px,
      transparent 31px 48px);
    background-size: 48px 100%;
    /* PERF-MOBILE: the bus is a static strip now — the readout rides in on
       the count-up, not on a 1.7s repaint loop. */
    opacity: 0.55;
    border-radius: 2px;
  }
  :global([data-theme='light']) .bus { opacity: 0.4; }
  @media (max-width: 700px) {
    .bus { margin: -0.3rem -1rem 0.6rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    /* Everything that still loops parks on its resting frame (the global
       reduced-motion block in docneural-ui.css zeroes durations too). */
    .rail::before { animation: none; transform: translateX(-120%); }
    .feed-caret { animation: none; }
  }

  /* ---------- DS-COOLEST phone pass (≤700px): the static instrument -------
     Directives 22 + 23: the hero left-aligns and the Corpus Plate becomes a
     full-bleed band under the wordmark; one column everywhere, native
     scroll, zero loops, every control above 44px. */
@media (max-width: 700px) {
  .home {
    height: auto;
    overflow: visible;
    min-height: 0;
    padding: var(--dn-space-4) var(--dn-space-4) var(--dn-space-7);
    gap: var(--dn-space-5);
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: var(--dn-space-4) 0 0;
    gap: 0;
  }
  /* The seam is a desktop idea; on paper-thin phone width the identity
     column simply flows. */
  .id {
    border-right: 0;
    padding-right: 0;
    width: 100%;
  }
  .wordmark { font-size: clamp(2rem, 11vw, 2.75rem); }
  .lede { line-height: var(--dn-lh-loose); max-width: 100%; }
  .stats {
    padding: var(--dn-space-3) var(--dn-space-4);
    width: 100%;
  }
  .stats .dn-kv .num { font-size: var(--dn-text-xl); }
  .cta-row { display: grid; grid-template-columns: 1fr; gap: var(--dn-space-2); width: 100%; }

  /* Thumb law: every control clears 44px. */
  .resume, .mk { min-height: 44px; align-items: center; }
  .cta { min-height: 48px; }
  .src-card { min-height: 44px; }
  .card { min-height: 44px; }

  /* One column everywhere (directive 23). */
  .grid { grid-template-columns: 1fr; gap: 0; }
  .src-row { grid-template-columns: 1fr; }

  /* Zero loops on phone. Every animated child on Home is parked.
     F2: the rail shimmer keeps its park-transform — animation:none alone
     would leave the 34%-wide bar sitting visible inside the rail. */
  .rail::before { animation: none; transform: translateX(-120%); }
  .feed-caret,
  .card,
  .src-card { animation: none; }
}

/* Anchor landing under the sticky header (directive 23) — global, both
   viewports, zero cost. */
:global(html) {
  scroll-padding-top: calc(var(--dn-header-h) + 8px);
}

</style>
