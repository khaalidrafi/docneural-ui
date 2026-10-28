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
    <!-- IGNITION pass, trimmed by PERF-MOBILE: the front door is a printed
       instrument. The constellation is a real (static, decorative) slice
       of the corpus graph — a printed network whose somas glow, rendered once
       and never repainted (zero loops on the phone) —
       so the hero reads as SIGNAL ON before a single word is read. It is
       aria-hidden garnish; the words carry the meaning. -->
    <svg
      class="constellation"
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <!-- wires: the corpus graph, dimmed -->
      <g class="wires">
        <line class="w" x1="38" y1="62" x2="120" y2="32" />
        <line class="w" x1="120" y1="32" x2="210" y2="74" />
        <line class="w" x1="210" y1="74" x2="300" y2="40" />
        <line class="w" x1="300" y1="40" x2="320" y2="88" />
        <line class="w" x1="320" y1="88" x2="470" y2="102" />
        <line class="w" x1="470" y1="102" x2="520" y2="54" />
        <line class="w" x1="520" y1="54" x2="610" y2="118" />
        <line class="w" x1="210" y1="74" x2="320" y2="88" />
        <line class="w" x1="38" y1="62" x2="40" y2="152" />
        <line class="w" x1="40" y1="152" x2="60" y2="242" />
        <line class="w" x1="60" y1="242" x2="140" y2="300" />
        <line class="w" x1="140" y1="300" x2="240" y2="312" />
        <line class="w" x1="240" y1="312" x2="320" y2="332" />
        <line class="w" x1="320" y1="332" x2="480" y2="308" />
        <line class="w" x1="480" y1="308" x2="560" y2="248" />
        <line class="w" x1="560" y1="248" x2="610" y2="318" />
        <line class="w" x1="560" y1="248" x2="470" y2="102" />
        <line class="w" x1="120" y1="32" x2="40" y2="152" />
      </g>
      <!-- pulses: action potentials travelling the wires -->
      <g class="pulses">
        <line class="p p1" x1="38" y1="62" x2="120" y2="32" />
        <line class="p p2" x1="120" y1="32" x2="210" y2="74" />
        <line class="p p3" x1="300" y1="40" x2="320" y2="88" />
        <line class="p p1" x1="320" y1="88" x2="470" y2="102" />
        <line class="p p2" x1="470" y1="102" x2="520" y2="54" />
        <line class="p p1" x1="520" y1="54" x2="610" y2="118" />
        <line class="p p3" x1="210" y1="74" x2="320" y2="88" />
        <line class="p p2" x1="40" y1="152" x2="60" y2="242" />
        <line class="p p1" x1="60" y1="242" x2="140" y2="300" />
        <line class="p p3" x1="240" y1="312" x2="320" y2="332" />
        <line class="p p2" x1="480" y1="308" x2="560" y2="248" />
        <line class="p p1" x1="560" y1="248" x2="470" y2="102" />
      </g>
      <!-- nodes: somas, breathing -->
      <g class="nodes">
        <circle class="nc" cx="38" cy="62" r="3" />
        <circle class="nv" cx="120" cy="32" r="2.2" />
        <circle class="nk" cx="210" cy="74" r="2.6" />
        <circle class="nc" cx="300" cy="40" r="2.2" />
        <circle class="nc" cx="320" cy="88" r="3.6" />
        <circle class="nc" cx="470" cy="102" r="2.4" />
        <circle class="nk" cx="520" cy="54" r="2.8" />
        <circle class="nc" cx="610" cy="118" r="2.4" />
        <circle class="nv" cx="40" cy="152" r="2.2" />
        <circle class="nk" cx="60" cy="242" r="2.4" />
        <circle class="nc" cx="140" cy="300" r="2.8" />
        <circle class="nk" cx="240" cy="312" r="2.2" />
        <circle class="nc" cx="320" cy="332" r="2.2" />
        <circle class="nk" cx="480" cy="308" r="2.6" />
        <circle class="nv" cx="560" cy="248" r="2.8" />
        <circle class="nc" cx="610" cy="318" r="2.4" />
      </g>
    </svg>
    <p class="kicker dn-label">// knowledge uplink · online</p>
    <div class="wordmark dn-mono dn-glitch" data-text={title.toUpperCase()}>
      <span class="dn-neuron-mark mark" aria-hidden="true"></span>{title.toUpperCase()}
    </div>
    <!-- The power rail: the wordmark's neon-sign power feed, with a bright
       segment forever running the loop (transform-only, cheap). -->
    <div class="rail" aria-hidden="true"></div>
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
    padding: var(--dn-space-7) var(--dn-space-5) var(--dn-space-8);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--dn-space-6);
  }


  /* ---------- hero ---------- */
  /* Framed by .dn-hud corner brackets in the source's hue: the front door is
     a target on the board, and its colour changes with the corpus you are in.
     The ::before is a wide, low halo so the wordmark sits in a field of
     signal rather than on empty page. */
  .hero {
    position: relative;
    /* Hero composition: a single centered column, max 62ch, with a
       deliberate vertical rhythm. The ::before halo is gone (see below). */
    max-width: 62ch;
    width: 100%;
    text-align: center;
    isolation: isolate;
    padding: var(--dn-space-5) var(--dn-space-4) var(--dn-space-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--dn-space-3);
  }

/* Light hero: the constellation is a printed network — bump its opacity
   and darken wires so the metaphor survives daylight. The stats panel
   gets a real hairline on paper; the old single-pixel border vanished
   into the sunken wash. */
:global([data-theme='light']) .hero {
  border-color: var(--dn-border-strong);
}
:global([data-theme='light']) .stats {
  border-color: var(--dn-border);
  border-left-color: var(--dn-src, var(--dn-accent));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 8%, transparent);
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
    /* Hero display: one step above the page title, clamped so phones get
       a legible size and desktops get presence. */
    font-size: clamp(2.4rem, 8vw, 4.4rem);
    font-weight: 400;
    letter-spacing: 0.02em;
    line-height: var(--dn-lh-tight);
    background: var(--dn-wordmark);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    /* Chromatic fringe only — the 34px halo is gone (it was a paint cost
       with no legibility gain). */
    text-shadow:
      -1px 0 color-mix(in srgb, var(--dn-accent-2) 45%, transparent),
      1px 0 color-mix(in srgb, var(--dn-accent) 35%, transparent);
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    margin: 0;
  }

  .wordmark .mark { width: 0.55em; height: 0.55em; flex: none; }
  .tagline {
    color: var(--dn-accent-dim);
    letter-spacing: 0.12em;
    font-size: var(--dn-text-xs);
    text-transform: lowercase;
    margin: 0;
    text-shadow: none;
  }

  /* The terminal status line: types real corpus facts, caret blinking.
     aria-hidden in the markup; its facts are duplicated in the stats. */
  .feed {
    min-height: 1.2em;
    margin: 0;
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
    margin: 0;
    max-width: 54ch;
  }

/* Vertical rhythm, hero-specific (the review flagged light desktop as
   tighter than dark). This is a structural gap, not a theme tint — same
   gap in both themes so the composition is honest; the light material
   pass does not need to fake air with different spacing. */
.hero > .kicker { margin-bottom: var(--dn-space-2); }
.hero > .wordmark { margin-bottom: var(--dn-space-1); }
.hero > .tagline { margin-bottom: var(--dn-space-1); }
.hero > .feed { margin-bottom: var(--dn-space-2); }
.hero > .lede { margin-bottom: var(--dn-space-3); }
.hero > .stats { margin-top: var(--dn-space-5); }

  .lede strong { color: var(--dn-fg); }
  .lede .dn-mono { font-size: 0.9em; color: var(--dn-accent-2-text); }
  /* The hero readout: a bordered panel of real numbers, left-aligned inside a
     centered hero and wide enough that the columns never wrap on a laptop.
     SIGNAL pass: darker glass, accent edge — and the numbers are the hero's
     second voice: big mono digits with a neon keyline, not a data table. */
  .stats {
    width: min(44rem, 100%);
    margin-top: var(--dn-space-4);
    text-align: left;
    display: grid;
    gap: var(--dn-space-3);
    padding: var(--dn-space-4) var(--dn-space-5) var(--dn-space-5);
    /* Layered flat: raise surface + one hairline border + one inset
       keyline. No gradient overlay, no 40px drop shadow. */
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    border-radius: 0;
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 12%, transparent);
  }

  /* The glow behind the wordmark: three radial blooms in the signal hues
     (cyan left, hot pink right, violet top), blurred — the night-city
     ambience. Sits under the hero (z-index -1) and never repaints. */
  .hero::before {
    /* Hero halo removed. It was three radial gradients + filter: blur(8px)
       on a viewport-sized layer — the single most expensive paint on Home.
       The constellation SVG already carries the "signal on" read. */
    content: none;
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
  /* Big neon count-up numbers: the corpus size IS the pitch. IGNITION: the
     digits wear a white-hot -> signal-cyan decay; the fringe shadow paints
     the glyph silhouette so the neon reads even mid-gradient. */
  .stats .dn-kv .num {
    font-size: 1.6rem;
    line-height: 1.05;
    background: linear-gradient(180deg, var(--dn-fg) 18%, var(--dn-accent-dim) 96%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: 0 0 16px color-mix(in srgb, var(--dn-accent) 26%, transparent);
  }
  .stats .dn-kv .num b {
    font-weight: 600;
    color: var(--dn-hot);
    background: none;
    -webkit-background-clip: border-box;
    background-clip: border-box;
    text-shadow: 0 0 16px color-mix(in srgb, var(--dn-hot) 42%, transparent);
  }
  .stats .dn-kv .num em {
    font-style: normal;
    font-size: 0.66rem;
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    background: none;
    -webkit-background-clip: border-box;
    background-clip: border-box;
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
    gap: var(--dn-space-1);
    text-align: left;
    color: var(--dn-fg);
    /* Flat card: solid fill + hairline border + source-hue left rail.
       The 280%-wide sheen background layer is gone. */
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    border-radius: 0;
    padding: var(--dn-space-3) var(--dn-space-4);
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .src-card:hover {
    background-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, var(--dn-bg-raise));
    border-color: var(--dn-src, var(--dn-accent));
  }

  .src-card:hover {
    background-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 10%, transparent);
    background-position: -135% 0;
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
    gap: var(--dn-space-1);
    min-width: 15rem;
    text-align: left;
    color: var(--dn-fg);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    padding: var(--dn-space-3) var(--dn-space-4);
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .cta:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, var(--dn-bg-raise));
    border-color: var(--dn-src, var(--dn-accent));
  }
  /* The ::after sheen and the translateY(-2px) lift are gone. */

  .cta-k { font-size: 1.1rem; color: var(--dn-accent-2-text); }
  .cta-k.spark { color: var(--dn-hot); }
  .cta-t { font-family: var(--dn-font-mono); font-weight: 600; font-size: 0.9rem; letter-spacing: 0.02em; }
  .cta-s { font-size: 0.75rem; color: var(--dn-fg-muted); }
  /* DS-DESIGN review fix (glm-5v-turbo): the conic voltage border read as
     leftover eye candy. The synapses CTA now wears the same flat language
     as every card: raise fill, hairline border, source-hue left rail - the
     glyph keeps the hot accent so it still reads first. */
  .cta.graph {
    border: 1px solid var(--dn-border-strong);
    border-left: 3px solid var(--dn-src, var(--dn-accent));
    background: var(--dn-bg-raise);
  }
  .cta.graph .cta-k { color: var(--dn-hot); }

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
    gap: var(--dn-space-1);
    text-align: left;
    font-family: var(--dn-font-prose);
    color: var(--dn-fg);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border);
    border-radius: 0;
    padding: var(--dn-space-3) var(--dn-space-4);
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }

/* Paper cards: the hairline border was near-invisible on white (1.9:1
   against the raised surface). Darker edge + a subtle inset keyline
   give cards a floor in both themes. Also the light review fix: the
   "active" left rail must be a full 4px in light so colour is not the
   only cue — this rule lowers reliance on the hue itself for anyone
   with reduced colour perception. */
.card,
.src-card,
.cta {
  border-left-width: 4px;
  border-left-style: solid;
}
:global([data-theme='light']) .card,
:global([data-theme='light']) .src-card,
:global([data-theme='light']) .cta {
  border-color: var(--dn-border);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dn-border) 55%, transparent);
}
  .card:hover {
    border-color: var(--dn-src, var(--dn-accent));
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, var(--dn-bg-raise));
  }
  /* The ::before spine and ::after brow hairline are removed — the left
     rail on the base state carries the source hue at rest. */

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
  /* IGNITION: a lit hairline along the card's brow — the row announces its
     source hue across the top edge before the spine even grows. */
  .card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg,
      transparent,
      color-mix(in srgb, var(--dn-src, var(--dn-accent)) 80%, transparent) 38%,
      var(--dn-fg) 50%,
      color-mix(in srgb, var(--dn-src, var(--dn-accent)) 80%, transparent) 62%,
      transparent);
    opacity: 0;
    transition: opacity 160ms ease;
    pointer-events: none;
  }
  .card:hover::after { opacity: 0.9; }
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

  /* ---------- IGNITION pass, trimmed by the PERF-MOBILE pass ---------------
     Designer: glm-5v-turbo (design-forge crown, FINAL 9.0/9). Owner law:
     performance beats eye candy, and the phone gets a STATIC page. The scan
     beam died outright (it read as a loading bar); the constellation is a
     printed graph now (static wires + glow, 28 loops gone); the data bus is
     a static strip; the conic ring holds still. What still runs on desktop
     is transform/opacity on tiny layers: the power rail sweep, the caret
     blink — and on phones none of it runs at all. */

  .constellation {
    position: absolute;
    inset: -4% -2%;
    z-index: -1;
    pointer-events: none;
    /* glm-5v-turbo vet round-1 flagged the wires as visual noise behind the
       wordmark — tuned down a step so the graph reads as ambience, not
       interference. */
    opacity: 0.75;
  }
  .constellation .w {
    stroke: color-mix(in srgb, var(--dn-accent) 26%, transparent);
    stroke-width: 1;
    fill: none;
  }
  /* Static constellation (PERF-MOBILE): the printed graph. One dash segment
     per wire reads as a packet mid-flight, frozen; the somas keep their glow
     at full weight. 28 of the page's 105 running animations were these. */
  .constellation .p {
    fill: none;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-dasharray: 12 150;
  }
  .constellation .p.p1 { stroke: var(--dn-accent); }
  .constellation .p.p2 { stroke: var(--dn-accent-2); }
  .constellation .p.p3 { stroke: var(--dn-violet); }
  .constellation circle {
    filter: drop-shadow(0 0 4px currentColor);
  }
  .constellation .nc { fill: var(--dn-accent); color: var(--dn-accent); }
  .constellation .nk { fill: var(--dn-accent-2); color: var(--dn-accent-2); }
  .constellation .nv { fill: var(--dn-violet); color: var(--dn-violet); }
  :global([data-theme='light']) .constellation {
    /* Ink-jet constellation: same network, printed fainter — and fainter
       still than dark, so the subtitle line keeps its clean paper read. */
    opacity: 0.4;
  }
  :global([data-theme='light']) .stats .dn-kv .num b {
    /* glm-5v-turbo round-1: the gold halo is heavy on white. Printed halo. */
    text-shadow: 0 0 10px color-mix(in srgb, var(--dn-hot) 25%, transparent);
  }

  .rail {
    position: relative;
    width: min(24rem, 76%);
    height: 2px;
    margin: 0.7rem auto 0;
    background: linear-gradient(90deg,
      transparent,
      color-mix(in srgb, var(--dn-accent) 65%, transparent) 22%,
      var(--dn-violet) 50%,
      color-mix(in srgb, var(--dn-accent-2) 65%, transparent) 78%,
      transparent);
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

  /* ---------- PERF-MOBILE pass (≤700px): the static phone -----------------
     Designer: glm-5v-turbo (design-forge crown, FINAL 9.0/9). Owner law:
     "performance should always be prioritized over eye candy", phones get
     "performance, responsiveness, lightweight and simplicity". So on a
     phone: ZERO running loops — every effect rests on its composed frame —
     and the page scrolls natively with the document instead of nesting a
     100dvh scroller inside the shell (the nested scroller is what made the
     phone feel like a shrunken desktop: trapped scroll, URL-bar fights,
     clipped content). */
@media (max-width: 700px) {
  .home {
    height: auto;
    overflow: visible;
    min-height: 0;
    padding: var(--dn-space-5) var(--dn-space-4) var(--dn-space-7);
    gap: var(--dn-space-5);
  }
  .hero {
    padding: var(--dn-space-4) var(--dn-space-3) var(--dn-space-2);
    gap: var(--dn-space-3);
    max-width: 100%;
  }
  /* Vertical rhythm for phones: one step tighter than desktop but still
     airier than the shrunken gutter the review flagged. */
  .hero > .kicker { margin-bottom: var(--dn-space-1); }
  .hero > .lede { margin-bottom: var(--dn-space-4); }
  .hero > .stats { margin-top: var(--dn-space-4); }
  .wordmark { font-size: clamp(2.2rem, 9vw, 3.4rem); }
  .lede { line-height: var(--dn-lh-loose); max-width: 100%; }
  .stats {
    padding: var(--dn-space-3) var(--dn-space-4);
    width: 100%;
  }
  .stats .dn-kv .num { font-size: 1.3rem; }

  /* Thumb law: every control clears 44px. */
  .resume, .mk { min-height: 44px; align-items: center; }
  .cta { min-height: 48px; }
  .src-card { min-height: 44px; }
  .card { min-height: 44px; }

  /* Zero loops on phone. Every animated child on Home is parked.
     F2: the rail shimmer keeps its park-transform — animation:none alone
     would leave the 34%-wide bar sitting visible inside the rail. */
  .rail::before { animation: none; transform: translateX(-120%); }
  .constellation .p,
  .constellation .w,
  .constellation .nodes circle,
  .feed-caret,
  .card,
  .src-card { animation: none; }
  .rail, .bus { animation: none; }

  /* The constellation on phone: too dense behind the wordmark at 390px.
     Fade to solitude (still present, still printed, just backgrounded). */
  .constellation { opacity: 0.32; inset: -6% -4%; }
  :global([data-theme='light']) .constellation { opacity: 0.28; }
}

</style>
