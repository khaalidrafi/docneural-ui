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

  /* The terminal status line: a slow typewriter cycling REAL corpus facts.
     It types only after the data is live (a boot line that lies is worse
     than none), it is aria-hidden (the same facts are in the stats block
     below it), and reduced-motion visitors get a static line, no loop. */
  const feedLines = $derived([
    `// ${sources.length} corpora indexed · ${pageCount} pages live`,
    `// ${synCount} synapses primed — ego lens armed`,
    `// drop into ⌁ SYNAPSES to watch the wires fire`
  ])
  let feedText = $state('')
  let feedTimer: ReturnType<typeof setTimeout> | 0 = 0
  $effect(() => {
    if (!store.ready) return
    const lines = feedLines
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      feedText = lines[1] ?? ''
      return
    }
    let li = 0
    let ci = 0
    let cancelled = false
    const step = (): void => {
      if (cancelled) return
      const line = lines[li % lines.length]
      if (ci <= line.length) {
        feedText = line.slice(0, ci)
        ci++
        feedTimer = setTimeout(step, 24)
      } else {
        feedTimer = setTimeout(() => {
          li++
          ci = 0
          step()
        }, 3200)
      }
    }
    step()
    return () => {
      cancelled = true
      clearTimeout(feedTimer)
    }
  })

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
  <header class="hero dn-hud" style={sourceVars(store.manual)}>
    <p class="kicker dn-label">// knowledge uplink · online</p>
    <div class="wordmark dn-mono dn-glitch" data-text={title.toUpperCase()}>
      <span class="dn-neuron-mark mark" aria-hidden="true"></span>{title.toUpperCase()}
    </div>
    <p class="tagline dn-mono">docs are neurons · citations are axons · fire together, wire stronger</p>
    <p class="feed dn-mono" aria-hidden="true">{feedText}<span class="feed-caret">▌</span></p>
    <p class="lede">
      One reader for documentation from <strong>anywhere</strong> — every manual
      split per section, exported from Org by Emacs, and wired into an org-roam
      graph of <strong>{synCount} firing synapses</strong>. Read it top to bottom,
      jump anywhere with ⌘K, or drop into the graph and follow the citations.
      Every page also ships as raw Org and as
      <span class="dn-mono">llms.txt</span> — machine-readable on purpose.
    </p>

    <!-- The corpus readout, stated plainly. The size of the site IS the pitch,
         so the numbers get a panel of their own — but as a panel, not as a
         pretend shell session: no prompt, no window buttons, no "[ ok ]". -->
    <div class="stats dn-hud" role="status" aria-live="polite">
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
          <span class="r-go" aria-hidden="true">↷</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- The marks you made with `b`, straight off the front door. This is the
       whole point of a bookmark list on a reference site: you return, and the
       five sections that matter to today's task are already in one place. -->
  {#if marks.length}
    <section class="saved">
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

  <section class="sources">
    <h2 class="dn-label">// sources <span class="hint">each corpus wears its graph hue</span></h2>
    <div class="src-row">
      {#each sources as s, si (s.name)}
        <button class="src-card dn-hud" style="--i: {si}; {sourceVars(s.name)}" onclick={() => openManual(s.name)}>
          <span class="src-name dn-mono">{DocneuralStore.manualTitle(s.name)}</span>
          <span class="src-meta dn-mono">{s.pages} pages · {s.links} wires</span>
          <span class="src-open">read ↗</span>
        </button>
      {:else}
        <p class="none dn-mono">one corpus, no tags — everything is one source</p>
      {/each}
    </div>
  </section>

  <!-- The jump box. Monospace and left-labelled, which is enough: the field
       searches, it does not pretend to be a shell. -->
  <div class="search-wrap">
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
  </div>

  <div class="cta-row">
    {#each sources as s, si (s.name)}
      <button class="cta dn-notch" style={sourceVars(s.name)} onclick={() => openManual(s.name)}>
        <span class="cta-k">▤</span>
        <span class="cta-t">{DocneuralStore.manualTitle(s.name)}</span>
        <span class="cta-s">read from the top</span>
      </button>
    {:else}
      {#if first}
        <button class="cta dn-notch" onclick={() => store.goto(first)}>
          <span class="cta-k">▤</span>
          <span class="cta-t">Start reading</span>
          <span class="cta-s">{first.title}</span>
        </button>
      {/if}
    {/each}
    {#if !store.lite}
      <button class="cta graph dn-notch" onclick={() => store.setMode('graph')}>
        <span class="cta-k spark">⌁</span>
        <span class="cta-t">Explore synapses</span>
        <span class="cta-s">the whole graph, live</span>
      </button>
    {/if}
  </div>

  <section class="chapters-grid">
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
    padding: 2.6rem 1.5rem 4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2.2rem;
  }

  /* ---------- hero ---------- */
  /* Framed by .dn-hud corner brackets in the source's hue: the front door is
     a target on the board, and its colour changes with the corpus you are in.
     The ::before is a wide, low halo so the wordmark sits in a field of
     signal rather than on empty page. */
  .hero {
    position: relative;
    max-width: 68ch;
    text-align: center;
    isolation: isolate;
    padding: 1.6rem 1.4rem 0.4rem;
  }
  .kicker {
    /* Acid: this line is the site's "online" lamp — // knowledge uplink ·
       online — so it wears the live signal, with a matching glow. */
    color: var(--dn-acid);
    letter-spacing: 0.2em;
    margin: 0 0 0.9rem;
    text-shadow: 0 0 12px color-mix(in srgb, var(--dn-acid) 45%, transparent);
  }
  .wordmark {
    font-family: var(--dn-font-display);
    /* SIGNAL pass: bigger, tighter — the front door announces itself. */
    font-size: clamp(2.7rem, 9vw, 5.2rem);
    /* Electrolize is single-weight; asking for 700 here only gets the
       browser's fake bold, which is ugly at display size. */
    font-weight: 400;
    /* Display face, tight tracking, uppercase: the brand mark. The letters
       are the glitch's real text — the ::before/::after ghosts in .dn-glitch
       carry the same string from data-text. R2: the fill is the neon-sign
       decay gradient with the chromatic fringe under it. */
    letter-spacing: 0.02em;
    /* R3: the fill is the neon-sign decay gradient (cyan -> violet -> hot
       pink) with the chromatic fringe under it — the SIGNAL split-glow,
       extended into a full gradient. background-clip keeps the letters
       selectable and the accessible name intact. */
    background: var(--dn-wordmark);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow:
      -2px 0 color-mix(in srgb, var(--dn-accent-2) 50%, transparent),
      2px 0 color-mix(in srgb, var(--dn-accent) 40%, transparent),
      0 0 34px color-mix(in srgb, var(--dn-accent) 28%, transparent);
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
  }
  .wordmark .mark { width: 0.55em; height: 0.55em; flex: none; }
  .tagline {
    color: var(--dn-accent);
    letter-spacing: 0.14em;
    font-size: 0.75rem;
    text-transform: lowercase;
    margin: 0.5rem 0 0.35rem;
  }
  /* The terminal status line: types real corpus facts, caret blinking.
     aria-hidden in the markup; its facts are duplicated in the stats. */
  .feed {
    min-height: 1.3em;
    margin: 0 0 1.1rem;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--dn-accent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--dn-accent) 35%, transparent);
  }
  .feed-caret {
    color: var(--dn-hot);
    text-shadow: 0 0 9px color-mix(in srgb, var(--dn-hot) 70%, transparent);
    animation: dn-blink 1.1s steps(1, end) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .feed-caret { animation: none; }
  }
  .lede { color: var(--dn-fg-muted); font-size: 1rem; line-height: 1.65; margin: 0; }
  .lede strong { color: var(--dn-fg); }
  .lede .dn-mono { font-size: 0.9em; color: var(--dn-accent-2-text); }
  /* The hero readout: a bordered panel of real numbers, left-aligned inside a
     centered hero and wide enough that the columns never wrap on a laptop.
     SIGNAL pass: darker glass, accent edge — and the numbers are the hero's
     second voice: big mono digits with a neon keyline, not a data table. */
  .stats {
    width: min(46rem, 100%);
    margin-top: 1.4rem;
    text-align: left;
    display: grid;
    gap: 0.55rem;
    padding: 1.1rem 1.3rem 1.2rem;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--dn-accent) 4%, transparent), transparent 46%),
      color-mix(in srgb, var(--dn-bg-raise) 94%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 42%, var(--dn-border-strong));
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    border-radius: 3px;
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 14%, transparent),
      0 14px 40px color-mix(in srgb, var(--dn-bg-sunken) 75%, transparent);
  }
  /* The glow behind the wordmark: three radial blooms in the signal hues
     (cyan left, hot pink right, violet top), blurred — the night-city
     ambience. Sits under the hero (z-index -1) and never repaints. */
  .hero::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: -30% -12% -20%;
    background:
      radial-gradient(45% 55% at 30% 40%, color-mix(in srgb, var(--dn-accent) 13%, transparent), transparent 70%),
      radial-gradient(40% 50% at 70% 60%, color-mix(in srgb, var(--dn-accent-2) 10%, transparent), transparent 70%),
      radial-gradient(30% 40% at 55% 20%, color-mix(in srgb, var(--dn-violet) 8%, transparent), transparent 70%);
    filter: blur(8px);
    pointer-events: none;
  }
  .stats-hd {
    display: flex;
    align-items: center;
    gap: 0.5em;
    color: var(--dn-fg-muted);
  }
  .stats-hd .dn-neuron-mark { width: 0.7em; height: 0.7em; }
  .stats .note { margin: 0; font-size: 0.78rem; color: var(--dn-fg-muted); }
  /* The readout is monospace: digits that do not shift width between builds are
     the difference between a machine's count and a sentence about a count. */
  .stats .dn-kv {
    font-family: var(--dn-font-mono);
    font-size: 0.84rem;
    align-items: baseline;
    row-gap: 0.35rem;
  }
  .stats .dn-kv > span:nth-child(odd) {
    text-transform: uppercase;
    letter-spacing: var(--dn-track);
    font-size: 0.66rem;
    padding-top: 0.45em;
  }
  /* Big neon count-up numbers: the corpus size IS the pitch. */
  .stats .dn-kv .num {
    font-size: 1.6rem;
    line-height: 1.05;
    color: var(--dn-fg);
    text-shadow: 0 0 16px color-mix(in srgb, var(--dn-accent) 26%, transparent);
  }
  .stats .dn-kv .num b {
    font-weight: 600;
    color: var(--dn-hot);
    text-shadow: 0 0 16px color-mix(in srgb, var(--dn-hot) 42%, transparent);
  }
  .stats .dn-kv .num em {
    font-style: normal;
    font-size: 0.66rem;
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    text-shadow: none;
  }
  .stats .dn-kv .files { font-size: 0.84rem; }
  /* Resume: a labelled row, not a command line. The label says what it does,
     the value says where it goes. */
  .resume {
    display: flex;
    align-items: baseline;
    gap: 0.7em;
    font-family: var(--dn-font-mono);
    font-size: 0.82rem;
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
    font-size: 0.68rem;
    color: var(--dn-accent);
  }
  .resume .r-to { color: var(--dn-fg); overflow-wrap: anywhere; }
  .resume:hover .r-to { text-decoration: underline; }
  .resume .r-go { margin-left: auto; }
  @media (max-width: 700px) {
    .stats { padding: 0.9rem 1rem; }
  }

  /* ---------- sources strip: the aggregator, shown not told ---------- */
  .sources { width: min(68rem, 100%); }

  /* ---------- marked sections ---------- */
  .saved { width: min(68rem, 100%); margin-top: 1.2rem; }
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
  .hint { color: var(--dn-fg-faint); text-transform: none; letter-spacing: 0.04em; font-size: 0.68rem; }
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
    gap: 0.25em;
    text-align: left;
    color: var(--dn-fg);
    background: color-mix(in srgb, var(--dn-bg-raise) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 32%, transparent);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    border-radius: 2px;
    padding: 0.7em 0.8em;
    cursor: pointer;
    transition: border-color 120ms, box-shadow 120ms, background 120ms, transform 120ms;
  }
  .src-card:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 10%, transparent);
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 70%, transparent);
    box-shadow:
      0 0 22px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 26%, transparent),
      0 6px 18px color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
    transform: translateY(-2px);
  }
  .src-name { font-size: 0.85rem; font-weight: 600; color: var(--dn-accent); letter-spacing: 0.03em; }
  .src-meta { font-size: 0.68rem; color: var(--dn-fg-faint); letter-spacing: 0.06em; }
  .src-open {
    position: absolute;
    right: 0.7em;
    top: 0.7em;
    font-size: 0.68rem;
    font-family: var(--dn-font-mono);
    color: var(--dn-accent);
    opacity: 0;
    transition: opacity 120ms;
  }
  .src-card:hover .src-open { opacity: 1; }
  .none { color: var(--dn-fg-faint); font-size: 0.78rem; margin: 0; }

  /* ---------- jump box ---------- */
  .search-wrap { width: min(46rem, 100%); }
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    padding: 0.7em 1em;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .search-box:focus-within {
    border-color: var(--dn-accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dn-accent) 30%, transparent),
      0 0 22px color-mix(in srgb, var(--dn-accent) 20%, transparent);
  }
  /* PS1 sits outside the input, so only the path part may shrink. */
  .prompt { flex: none; font-size: 0.8rem; }
  .search-box input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: var(--dn-fg);
    font-family: var(--dn-font-mono);
    font-size: 0.9rem;
    caret-color: var(--dn-accent);
  }
  .search-box input:focus { outline: none; }
  .search-box .prompt { color: var(--dn-fg-muted); font-size: 1rem; }
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
    font-size: 0.88rem;
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
  .stub { font-size: 0.72rem; color: var(--dn-fg-faint); margin-left: auto; }
  .results .none { padding: 0.5em 0.7em; color: var(--dn-fg-faint); }

  /* ---------- CTAs ---------- */
  .cta-row { display: flex; gap: 0.8rem; flex-wrap: wrap; justify-content: center; }
  .cta {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2em;
    min-width: 15rem;
    text-align: left;
    color: var(--dn-fg);
    background:
      linear-gradient(180deg,
        color-mix(in srgb, var(--dn-src, var(--dn-accent)) 11%, transparent),
        transparent 55%),
      var(--dn-bg-raise);
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 42%, transparent);
    padding: 0.9em 1.1em;
    cursor: pointer;
    overflow: hidden;
    transition: transform 120ms, box-shadow 120ms, border-color 120ms;
  }
  /* Sheen: a hard-edged light sweep, clipped to the notched shape — the
     "charge" before you follow the link. Transform-only, so it stays cheap. */
  .cta::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg,
      transparent 38%,
      color-mix(in srgb, var(--dn-src, var(--dn-accent)) 22%, transparent) 50%,
      transparent 62%);
    transform: translateX(-130%);
    transition: transform 500ms ease;
    pointer-events: none;
  }
  .cta:hover::after { transform: translateX(130%); }
  .cta:hover {
    transform: translateY(-2px);
    border-color: var(--dn-src, var(--dn-accent));
    box-shadow:
      0 0 26px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 26%, transparent),
      0 8px 22px color-mix(in srgb, var(--dn-bg-sunken) 75%, transparent);
  }
  .cta-k { font-size: 1.1rem; color: var(--dn-accent-2-text); }
  .cta-k.spark { color: var(--dn-hot); }
  .cta-t { font-family: var(--dn-font-mono); font-weight: 600; font-size: 0.9rem; letter-spacing: 0.02em; }
  .cta-s { font-size: 0.75rem; color: var(--dn-fg-muted); }
  .cta.graph {
    /* The synapses CTA is the door to the canvas: gradient border, not a
       dashed outline — it should read as the highest-voltage control here. */
    border: 1px solid transparent;
    background:
      linear-gradient(180deg,
        color-mix(in srgb, var(--dn-accent) 10%, transparent), transparent 55%),
      var(--dn-bg-raise) padding-box,
      linear-gradient(135deg, var(--dn-accent), var(--dn-violet), var(--dn-accent-2)) border-box;
  }
  .cta.graph:hover {
    box-shadow: 0 0 26px color-mix(in srgb, var(--dn-violet) 35%, transparent);
  }

  /* ---------- contents grid ---------- */
  .chapters-grid { width: min(68rem, 100%); }
  .contents-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.8rem;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.5rem; }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.4em;
    text-align: left;
    font-family: var(--dn-font-prose);
    color: var(--dn-fg);
    background: color-mix(in srgb, var(--dn-bg-raise) 72%, transparent);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.75em 0.85em 0.75em 1em;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 120ms, background 120ms, box-shadow 120ms, transform 120ms;
  }
  /* The lit edge: a hairline bar grows out of the card's left edge on hover,
     in that chapter's source hue — the DOM echo of an axon leaving a soma. */
  .card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 2px;
    height: 0;
    background: var(--dn-src, var(--dn-accent));
    box-shadow: 0 0 8px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 65%, transparent);
    transform: translateY(-50%);
    transition: height 160ms ease;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, transparent);
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, transparent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--dn-bg-sunken) 65%, transparent);
    transform: translateY(-2px);
  }
  .card:hover::before { height: 72%; }
  .show-all {
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--dn-accent);
    border-style: dashed;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
  }
  .card-title { font-size: 0.88rem; }
  .card-deg { align-self: flex-end; font-size: 0.66rem; color: var(--dn-fg-faint); letter-spacing: 0.06em; }
  .card:hover .card-deg { color: var(--dn-accent); }

  .foot { max-width: 60ch; text-align: center; font-size: 0.7rem; color: var(--dn-fg-faint); line-height: 1.9; letter-spacing: 0.04em; }
  .foot .sym { color: var(--dn-accent-dim); }
  .foot .mach {
    color: var(--dn-accent-2-text);
    text-decoration: none;
    border-bottom: 1px dotted color-mix(in srgb, var(--dn-accent-2) 45%, transparent);
    padding-bottom: 1px;
  }
  .foot .mach:hover { color: var(--dn-hot); border-bottom-style: solid; }
  @keyframes dn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
