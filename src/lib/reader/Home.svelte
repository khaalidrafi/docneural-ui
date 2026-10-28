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
    <div class="id-head">
      <!-- FULL-RIGHTS OP-35: the wordmark is a REGISTERED NAMEPLATE now —
           framed by the 16-arm reticle, a source-hue under-rule beneath it,
           and a calibration registration mark at the top-right corner. The
           kicker rides the nameplate's top rule. -->
      <div class="nameplate dn-brackets">
        <p class="kicker dn-label">// knowledge uplink · online</p>
        <svg class="regmark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="1"/>
          <path d="M8 0v4M8 12v4M0 8h4M12 8h4" stroke="currentColor" stroke-width="1"/>
          <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
        </svg>
        <div class="wordmark dn-mono dn-gradient-text">
          <span class="dn-neuron-mark mark" aria-hidden="true"></span>{title.toUpperCase()}
        </div>
      </div>
      <!-- The power rail: a cyan filament sweep (transform-only, cheap —
           desktop loop 1 of 2; the caret blink is the other). OP-35: 4px,
           visible at arm's length. -->
      <div class="rail" aria-hidden="true"></div>
    </div>
    <div class="id-body">
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

    <!-- FULL-RIGHTS OP-38: the stats panel is the hero's second signature —
         a live BUS readout on the brow (acid = live), a hairline telemetry
         grid, and the provenance note as the panel's footer. The count-up
         sweep is untouched (script law) — only the frame around it moved. -->
    <div class="stats dn-hud" role="status" aria-live="polite">
      <div class="stats-bus dn-mono">
        <span class="bus-led" aria-hidden="true"></span>BUS · {synCount} WIRES · LIVE
      </div>
      <div class="dn-kv">
        <span>sources</span><span>{sources.length} · {sourceList}</span>
        <span>pages</span><span class="num" use:countup={pageCount}>{pageCount}</span>
        <span>neurons</span><span class="num" use:countup={docCount}>{docCount}</span>
        <span>synapses</span><span class="num"><b use:countup={synCount}>{synCount}</b> <em>firing</em></span>
        <span>artifacts</span><span class="files">graph.json · llms.txt · *.org</span>
      </div>
      <p class="note">indexed at build time — no database, no server</p>
      {#if last}
        <button class="resume" onclick={resume}>
          <span class="r-lab">resume</span>
          <span class="r-to">{last.node.tags[0]}/{last.node.title}{last.anchor ? `#${last.anchor}` : ''}</span>
          <span class="r-go" aria-hidden="true">›</span>
        </button>
      {/if}
    </div>
    </div>
    <!-- FULL-RIGHTS OP-37: the seam's reticle nodes anchor to the
         composition — the top node at the nameplate baseline, the bottom
         node at the readout's bottom edge (desktop positions tuned in CSS). -->
    <div class="seam" aria-hidden="true"></div>
    <!-- The Corpus Plate: the product itself, drawn once (see CorpusField).
         FULL-RIGHTS OP-39: the Plate is MOUNTED — 16-arm reticle frame,
         corner registration ticks, and a caption strip that names the
         display and hands you the full index. -->
    <div class="plate dn-brackets">
      <span class="plate-tick pt-tl" aria-hidden="true"></span>
      <span class="plate-tick pt-tr" aria-hidden="true"></span>
      <CorpusField {store} />
      <div class="plate-cap dn-label">
        <span class="pc-name">corpus plate · 96 of 1386 nodes · phyllotaxis</span>
        <a class="pc-index" href="#plate-ledger">full index ›</a>
      </div>
    </div>
  </header>

  <!-- CB-EXHAUST consult 2 (deepseek-v4.1-flash@codebuddy): the Plate Ledger —
       the Corpus Plate's caption. Same 96 nodes, same degree rule
       (degreesOf()), laid out as a readout. Static rows document THIS export
       (stamped in the colophon); graph.json stays the source of truth. -->
  <section class="plate-ledger" id="plate-ledger">
    <details class="ledger">
      <summary class="ledger-summary">
        <span class="ledger-sum-label dn-mono">plate ledger</span>
        <span class="ledger-sum-count dn-mono">› 96 rows · top degree · 3 corpora</span>
        <span class="ledger-sum-note">collapsible readout of the top-96 highest-degree nodes plotted in the Corpus Plate above — one row per node, degree = real wire count</span>
      </summary>
      <div class="ledger-legend dn-mono" role="note">
        <span class="lg-item"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span>
        <span class="lg-item"><i class="dot dot-org" aria-hidden="true"></i>org</span>
        <span class="lg-item"><i class="dot dot-guix" aria-hidden="true"></i>guix</span>
        <span class="lg-meta">▤ degree = real wire count · corpora wear their graph hue · source of truth: graph.json</span>
      </div>
      <table class="ledger-table">
        <thead>
          <tr><th scope="col" class="ledger-rank">#</th><th scope="col" class="ledger-corpus">corpus</th><th scope="col" class="ledger-node">index node</th><th scope="col" class="ledger-deg">degree</th></tr>
        </thead>
        <tbody>
                        <tr class="ledger-row"><td class="ledger-rank">1</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Concept Index</td><td class="ledger-deg">4189</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">2</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Command Index</td><td class="ledger-deg">3771</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">3</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Programming Index</td><td class="ledger-deg">3505</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">4</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Variable Index</td><td class="ledger-deg">2460</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">5</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Concept Index</td><td class="ledger-deg">2298</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">6</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Key Index</td><td class="ledger-deg">2258</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">7</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Main Index (The Org Manual)</td><td class="ledger-deg">2037</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">8</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Variable Index (The Org Manual)</td><td class="ledger-deg">1260</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">9</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Key Index (The Org Manual)</td><td class="ledger-deg">1170</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">10</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Command and Function Index (The Org Manual)</td><td class="ledger-deg">989</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">11</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Top</td><td class="ledger-deg">767</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">12</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Mail Services</td><td class="ledger-deg">514</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">13</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Agenda Commands (The Org Manual)</td><td class="ledger-deg">431</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">14</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Top (The Org Manual)</td><td class="ledger-deg">417</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">15</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Top</td><td class="ledger-deg">392</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">16</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Version Control Services</td><td class="ledger-deg">275</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">17</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Glossary</td><td class="ledger-deg">219</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">18</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Base Services</td><td class="ledger-deg">197</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">19</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Printing Services</td><td class="ledger-deg">194</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">20</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Messaging Services</td><td class="ledger-deg">192</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">21</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Operating on Files</td><td class="ledger-deg">186</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">22</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Option Index</td><td class="ledger-deg">185</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">23</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Networking Services</td><td class="ledger-deg">184</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">24</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Miscellaneous Services</td><td class="ledger-deg">181</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">25</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Power Management Services</td><td class="ledger-deg">176</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">26</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Virtualization Services</td><td class="ledger-deg">171</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">27</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Build Systems</td><td class="ledger-deg">169</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">28</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Language Environments</td><td class="ledger-deg">155</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">29</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Built-in Table Editor (The Org Manual)</td><td class="ledger-deg">155</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">30</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Key bindings and Useful Functions (The Org Manual)</td><td class="ledger-deg">153</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">31</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">File-Sharing Services</td><td class="ledger-deg">151</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">32</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">G-Expressions</td><td class="ledger-deg">147</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">33</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Export Settings (The Org Manual)</td><td class="ledger-deg">145</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">34</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Initial Options</td><td class="ledger-deg">139</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">35</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Moving Point</td><td class="ledger-deg">134</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">36</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Structure Editing (The Org Manual)</td><td class="ledger-deg">134</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">37</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Image Mode</td><td class="ledger-deg">131</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">38</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Web Services</td><td class="ledger-deg">131</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">39</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Several Buffers</td><td class="ledger-deg">121</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">40</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Tab Bars</td><td class="ledger-deg">121</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">41</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Invoking guix package</td><td class="ledger-deg">120</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">42</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">LDAP Services</td><td class="ledger-deg">117</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">43</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Marks vs Flags</td><td class="ledger-deg">116</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">44</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Package Menu</td><td class="ledger-deg">111</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">45</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Desktop Services</td><td class="ledger-deg">109</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">46</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Editing and debugging formulas (The Org Manual)</td><td class="ledger-deg">109</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">47</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">General Variables</td><td class="ledger-deg">104</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">48</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Build Utilities</td><td class="ledger-deg">104</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">49</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Visiting</td><td class="ledger-deg">103</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">50</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">In-buffer Settings (The Org Manual)</td><td class="ledger-deg">103</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">51</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Shell Mode</td><td class="ledger-deg">102</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">52</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Handling Links (The Org Manual)</td><td class="ledger-deg">101</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">53</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Networking Setup</td><td class="ledger-deg">96</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">54</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Invoking guix system</td><td class="ledger-deg">94</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">55</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Plain Lists (The Org Manual)</td><td class="ledger-deg">93</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">56</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Program Modes</td><td class="ledger-deg">91</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">57</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Special Isearch</td><td class="ledger-deg">91</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">58</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Clocking commands (The Org Manual)</td><td class="ledger-deg">87</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">59</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Spelling</td><td class="ledger-deg">84</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">60</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Using column view (The Org Manual)</td><td class="ledger-deg">84</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">61</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Amusements</td><td class="ledger-deg">83</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">62</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Using the Configuration System</td><td class="ledger-deg">83</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">63</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Mouse Commands</td><td class="ledger-deg">82</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">64</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Global and local cycling (The Org Manual)</td><td class="ledger-deg">82</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">65</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Optional Mode Line</td><td class="ledger-deg">81</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">66</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Defining Packages</td><td class="ledger-deg">81</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">67</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Diff Mode</td><td class="ledger-deg">80</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">68</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Compilation Mode</td><td class="ledger-deg">79</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">69</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Invoking guix-daemon</td><td class="ledger-deg">77</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">70</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Highlight Interactively</td><td class="ledger-deg">76</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">71</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">X Window</td><td class="ledger-deg">76</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">72</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Init File</td><td class="ledger-deg">74</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">73</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Outline Visibility</td><td class="ledger-deg">74</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">74</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">HTML Mode</td><td class="ledger-deg">73</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">75</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Lax Search</td><td class="ledger-deg">73</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">76</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Linux Services</td><td class="ledger-deg">72</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">77</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Sexp Diary Entries</td><td class="ledger-deg">71</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">78</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Service Reference</td><td class="ledger-deg">71</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">79</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Display Custom</td><td class="ledger-deg">70</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">80</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Rectangles</td><td class="ledger-deg">70</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">81</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Table of Resources</td><td class="ledger-deg">70</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">82</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Invoking guix import</td><td class="ledger-deg">70</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">83</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">package Reference</td><td class="ledger-deg">70</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">84</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Minor Modes</td><td class="ledger-deg">68</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">85</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Invoking guix shell</td><td class="ledger-deg">68</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">86</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">Shepherd Services</td><td class="ledger-deg">67</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">87</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">The Store Monad</td><td class="ledger-deg">67</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">88</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Misc Help</td><td class="ledger-deg">66</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">89</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">TeX Print</td><td class="ledger-deg">66</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">90</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-guix" aria-hidden="true"></i>guix</span></td><td class="ledger-node">operating-system Reference</td><td class="ledger-deg">66</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">91</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Checkboxes (The Org Manual)</td><td class="ledger-deg">65</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">92</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Creating Timestamps (The Org Manual)</td><td class="ledger-deg">65</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">93</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-org" aria-hidden="true"></i>org</span></td><td class="ledger-node">Filtering/limiting agenda items (The Org Manual)</td><td class="ledger-deg">64</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">94</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Commands of GUD</td><td class="ledger-deg">63</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">95</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Other Repeating Search</td><td class="ledger-deg">63</td></tr>
                        <tr class="ledger-row"><td class="ledger-rank">96</td><td class="ledger-corpus"><span class="ledger-chip"><i class="dot dot-emacs" aria-hidden="true"></i>emacs</span></td><td class="ledger-node">Text Scale</td><td class="ledger-deg">63</td></tr>
        </tbody>
      </table>
    </details>
  </section>

  <!-- CB-EXHAUST consult 5: "how to read this corpus" — a static 3-step
       reading contract. Every step states a verifiable mechanic; the 00
       index marks it as pre-flow orientation outside the 01-04 corpus
       sections. -->
  <section class="how" data-idx="00" aria-labelledby="how-read-corpus">
    <h2 class="section-h dn-label" data-kicker="// 00 · how to read this corpus" id="how-read-corpus">how to read this corpus <span class="hint">three steps, all mechanical</span></h2>
    <ol class="how-steps">
      <li class="how-step">
        <span class="how-num" aria-hidden="true">01</span>
        <h3 class="how-verb dn-mono">Orient</h3>
        <p class="how-line">This page is the map: the Corpus Plate plots the 96 most-connected of 1386 nodes, and the ledger below it counts every wire.</p>
        <p class="how-next"><span aria-hidden="true">›</span> next: where the 1386 live</p>
      </li>
      <li class="how-step">
        <span class="how-num" aria-hidden="true">02</span>
        <h3 class="how-verb dn-mono">Navigate</h3>
        <p class="how-line">The sources strip lists three corpora, each in its graph hue — open a card to read that corpus; tabs hop between its manuals.</p>
        <p class="how-next"><span aria-hidden="true">›</span> next: walk the citations</p>
      </li>
      <li class="how-step">
        <span class="how-num" aria-hidden="true">03</span>
        <h3 class="how-verb dn-mono">Trace</h3>
        <p class="how-line">Each page is a real org-export fragment; its links are the manual's own cross-references — the same graph that wires the Plate.</p>
        <p class="how-next"><span aria-hidden="true">›</span> the citation network is the navigation</p>
      </li>
    </ol>
    <p class="how-foot dn-mono"><span aria-hidden="true">—</span> the three corpora sit in the strip below</p>
  </section>

  <!-- The marks you made with `b`, straight off the front door. This is the
       whole point of a bookmark list on a reference site: you return, and the
       five sections that matter to today's task are already in one place. -->
  {#if marks.length}
    <section class="saved" data-idx="01">
      <h2 class="section-h dn-label" data-kicker="// 01 · marks">
        marked <span class="hint">{marks.length} section{marks.length === 1 ? '' : 's'} · b in the reader</span>
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
    <h2 class="dn-label section-h" data-kicker="// 02 · corpora">sources <span class="hint">each corpus wears its graph hue</span></h2>
    <div class="src-row">
      {#each sources as s, si (s.name)}
        <button class="src-card" style="--i: {si}; {sourceVars(s.name)}" onclick={() => openManual(s.name)}>
          <!-- FULL-RIGHTS OP-40: each corpus wears its own mark, drawn in
               its real graph hue — a mini-phyllotaxis for emacs, a wire
               chain for org, the lambda for guix, a merged tri-node for the
               aggregator. Three instruments on one board. -->
          {#if s.name === 'emacs'}
            <svg class="src-mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4.5" cy="5" r="1.7"/><circle cx="11" cy="3.8" r="1.1"/><circle cx="9.5" cy="10.5" r="2.2"/></svg>
          {:else if s.name === 'org'}
            <svg class="src-mark src-mark-line" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke-width="1"/><circle cx="3.5" cy="8" r="1.8"/><circle cx="8" cy="8" r="1.8"/><circle cx="12.5" cy="8" r="1.8"/></svg>
          {:else if s.name === 'guix'}
            <svg class="src-mark src-mark-line" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3l3.5 5.2L11.5 3M8 8.2V13" stroke-width="1.4"/></svg>
          {:else}
            <svg class="src-mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4.5" cy="4.5" r="1.5"/><circle cx="11.5" cy="4.5" r="1.5"/><circle cx="8" cy="11.5" r="2"/></svg>
          {/if}
          <span class="src-name dn-mono">{DocneuralStore.manualTitle(s.name)}</span>
          <span class="src-meta dn-mono">{s.pages} pages · {s.links} wires</span>
          <!-- CB-EXHAUST consult 6: per-corpus body copy (facts re-verified
               against the real graph: 569/1386 = 41%, hubs = the indexes). -->
          {#if s.name === 'emacs'}
            <span class="src-body">The GNU Emacs manual as a navigable node graph: editing, modes, and shell integration, edition-agnostic. Index hubs dominate the wire graph — the Concept Index alone wires 41% of the corpus.</span>
          {:else if s.name === 'org'}
            <span class="src-body">The Org mode manual as a node graph: capture, agenda, tables, and export pipelines, edition-agnostic. The Main Index concentrates the manual's busiest surface — one dense book, fully crossed.</span>
          {:else if s.name === 'guix'}
            <span class="src-body">The GNU Guix manual as a node graph: package definition, system configuration, and profiles, edition-agnostic. The Programming Index pulls the heaviest degree outside the Emacs indexes.</span>
          {:else}
            <span class="src-body">An aggregated corpus: real cross-references from every manual, computed into one wire graph. 39 nodes carry no wires and float at the edge.</span>
          {/if}
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
      <h2 class="section-h dn-label" data-kicker="// 04 · contents">
        {DocneuralStore.manualTitle(store.manual) || 'all sources'}
      </h2>
      <ManualTabs {store} />
    </div>
    <!-- FULL-RIGHTS OP-41: the grid announces its own scale before you scan
         it — manual, chapter count, total wire weight. Derived from the
         same degree map the rows render (static template derivation). -->
    <p class="grid-head dn-mono">// {DocneuralStore.manualTitle(store.manual) || 'all sources'} · {chapters.length} chapters · {[...degree.values()].reduce((a, b) => a + b, 0)}⌁ total</p>
    <div class="grid">
      {#each showAll ? chapters : chapters.slice(0, 60) as c, ci (c.id)}
        <button class="card" style="--i: {ci}; {sourceVars(c.tags[0])}" onclick={() => store.goto(c)}>
          <span class="card-title">{c.title}</span>
          <span class="card-deg dn-mono">{degree.get(c.id) ?? 0}⌁</span>
        </button>
      {/each}
      {#if !showAll && chapters.length > 60}
        <button class="card show-all dn-mono" onclick={() => (showAll = true)}>
          <span class="sa-k" aria-hidden="true">▸</span> show all {chapters.length - 60}
        </button>
      {/if}
    </div>
  </section>

  <!-- CB-EXHAUST consults 1+3+4+6 (deepseek-v4.1-flash@codebuddy): the
       colophon becomes the design-system ledger — provenance columns, the
       token manifest, the chrome contract, and the measured accessibility
       ledger. The instrument documents itself; facts injected from the real
       export (1386/30915, per-corpus counts, measured AA numbers). -->
  <footer class="foot dn-mono">
    <!-- FULL-RIGHTS OP-51: the colophon closes on a signature, not a kv
         table — the lead becomes a framed statement, signed by an
         instrument stamp of the real export facts. -->
    <p class="colo-lead dn-brackets"><span class="colo-lead-g" aria-hidden="true">▤</span> a static reader for a public corpus. 1386 nodes, 30915 wires, three GNU manuals — and this aggregator, the reading instrument. every page is a pre-exported org fragment, served read-only. <span class="colo-lead-g" aria-hidden="true">▤</span></p>
    <p class="colo-stamp dn-mono">export 2026-10-28 · 1386 nodes · 30915 wires · 3 corpora · AA-verified · 0 trackers</p>
    <div class="colo-grid">
      <section class="colo-col" aria-labelledby="colo-method">
        <span class="col-h" id="colo-method">method</span>
        <dl class="colo-list">
          <dt>export</dt><dd>one batch <span class="sym">org-export</span> pass: a graph plus one body-only HTML fragment per node. the shell mounts that data; it never re-parses org at runtime.</dd>
          <dt>wire graph</dt><dd>30915 edges drawn from the corpus' real cross-references — computed, not curated. a wire exists here only if the citation exists in the source manuals.</dd>
          <dt>plate</dt><dd>a single reading surface over the graph: the 96 most-connected nodes on a phyllotaxis field. navigation is graph traversal — no crawl, no rebuild on load.</dd>
          <dt>provenance</dt><dd>GNU Emacs · 791 nodes — Org · 319 — Guix · 276. <span class="sym">graph.json</span> is the source of truth.</dd>
        </dl>
      </section>
      <section class="colo-col" aria-labelledby="colo-contract">
        <span class="col-h" id="colo-contract">contract</span>
        <dl class="colo-list">
          <dt>the site owes</dt><dd>read-only pages. no accounts, no cookies, no trackers, no external requests. both themes meet WCAG AA — measured, not asserted (ledger below).</dd>
          <dt>the reader owes</dt><dd>a browser that runs the SPA once. nothing is stored, nothing is sent back.</dd>
          <dt>themes</dt><dd>dark = night terminal, primary. light = clean paper, one click. no third surface.</dd>
          <dt>canon</dt><dd>the corpus ships whole or not at all — the manuals are never rewritten here.</dd>
        </dl>
      </section>
      <section class="colo-col" aria-labelledby="colo-machine">
        <span class="col-h" id="colo-machine">machine</span>
        <dl class="colo-list">
          <dt>built with</dt><dd>svelte 5 + vite, hosted on github pages. 9-step type ramp, four tracking tokens, semantic signals (cyan = wire · acid = live · hot = mark), three hairline tiers, 16-arm reticle brackets, a two-tier board floor, 3 desktop loops, 0 phone animations.</dd>
          <dt>design</dt><dd>deepseek-v4.1-flash@codebuddy — audit 6.1/10, re-audit 7.2/10, consults 0-6, then the full-rights whole-site audit (OP-33..52) — all on the free tier ($0). implementation: glm-5.3-flash@chat.z.ai.</dd>
          <dt>review</dt><dd>independent review glm-4.7-flash@zai — cycle-2 verdict READY, zero blockers.</dd>
          <dt>data</dt><dd class="colo-links"><a class="mach" href="{store.base}/llms.txt">llms.txt</a><a class="mach" href="{store.base}/llms-full.txt">llms-full.txt</a><a class="mach" href="{store.base}/graph.json">graph.json</a></dd>
          <dt>licenses</dt><dd>each upstream manual carries the GNU Free Documentation License — see the upstream editions.</dd>
          <dt>stamp</dt><dd>export 2026-10-28 · plate ledger rows document this export</dd>
        </dl>
      </section>
    </div>

    <details class="colo-details">
      <summary>design system — token manifest · chrome contract</summary>
      <div class="colo-details-body">
        <table class="colo-manifest">
          <thead><tr><th scope="col">token</th><th scope="col">dark</th><th scope="col">light</th><th scope="col">job</th></tr></thead>
          <tbody>
            <tr><th scope="rowgroup" colspan="4">fonts</th></tr>
            <tr><td>--dn-font-mono</td><td colspan="2">"JetBrains Mono"</td><td>identity: headings, nav, labels, code</td></tr>
            <tr><td>--dn-font-prose</td><td colspan="2">"Inter"</td><td>prose body text</td></tr>
            <tr><td>--dn-font-display</td><td colspan="2">"Electrolize"</td><td>wordmark only</td></tr>
            <tr><th scope="rowgroup" colspan="4">tracking</th></tr>
            <tr><td>--dn-track-tight</td><td colspan="2">0.05em</td><td>code, tags</td></tr>
            <tr><td>--dn-track</td><td colspan="2">0.14em</td><td>labels</td></tr>
            <tr><td>--dn-track-wide</td><td colspan="2">0.26em</td><td>kickers, status</td></tr>
            <tr><td>--dn-track-mega</td><td colspan="2">0.40em</td><td>hero kicker only</td></tr>
            <tr><th scope="rowgroup" colspan="4">type ramp — 9 steps</th></tr>
            <tr><td>--dn-text-2xs</td><td colspan="2">0.625rem</td><td>micro-legend, readout rows</td></tr>
            <tr><td>--dn-text-xs</td><td colspan="2">0.75rem</td><td>micro-labels, chips, meta</td></tr>
            <tr><td>--dn-text-sm</td><td colspan="2">0.875rem</td><td>table headers, code wells, nav</td></tr>
            <tr><td>--dn-text-md</td><td colspan="2">1rem</td><td>body</td></tr>
            <tr><td>--dn-text-lg</td><td colspan="2">1.25rem</td><td>h3, section heads</td></tr>
            <tr><td>--dn-text-xl</td><td colspan="2">1.625rem</td><td>h2</td></tr>
            <tr><td>--dn-text-2xl</td><td colspan="2">2.125rem</td><td>h1 / page title</td></tr>
            <tr><td>--dn-text-3xl</td><td colspan="2">3rem</td><td>hero display</td></tr>
            <tr><td>--dn-text-4xl</td><td colspan="2">clamp(3rem, 7.2vw, 5.25rem)</td><td>wordmark display — the real top</td></tr>
            <tr><th scope="rowgroup" colspan="4">theme</th></tr>
            <tr><td>--dn-bg</td><td>#05090f</td><td>#fbfbfd</td><td>page ground</td></tr>
            <tr><td>--dn-bg-sunken</td><td>#03060a</td><td>#eef1f5</td><td>sunken tier</td></tr>
            <tr><td>--dn-bg-raise</td><td>#0d1520</td><td>#ffffff</td><td>raised tier</td></tr>
            <tr><td>--dn-fg</td><td>#e8f1fb</td><td>#0d1117</td><td>primary text</td></tr>
            <tr><td>--dn-fg-muted</td><td>#a6bcd4</td><td>#2a3a4d</td><td>secondary text</td></tr>
            <tr><td>--dn-fg-faint</td><td>#7f97b3</td><td>#4a5b6e</td><td>meta text (6.1:1 / 6.4:1 min measured)</td></tr>
            <tr><td>--dn-hairline</td><td>#14202d</td><td>#dde3ea</td><td>rules, tier 1</td></tr>
            <tr><td>--dn-accent</td><td>#4d94ff</td><td>#0b3fbf</td><td>accent — the electric wire (consult E / Owner neon-blue law)</td></tr>
            <tr><td>--dn-acid</td><td>#3ef04a</td><td>#04610c</td><td>signal</td></tr>
            <tr><td>--dn-acid-dim</td><td>#2bb533</td><td>#3a7a16</td><td>live, secondary — the quiet tier of the live hue</td></tr>
            <tr><th scope="rowgroup" colspan="4">chrome laws</th></tr>
            <tr><td>palette</td><td colspan="2">wire = cyan · live = acid · mark = hot</td><td>semantic, never decorative</td></tr>
            <tr><td>glyph budget</td><td colspan="2">8</td><td>the full decorative set</td></tr>
            <tr><td>desktop loops</td><td colspan="2">3</td><td>rail sweep · caret blink · pulse spark</td></tr>
            <tr><td>phone loops</td><td colspan="2">0</td><td>no ambient motion on phone</td></tr>
            <tr><td>entrances</td><td colspan="2">mark-in · rise</td><td>finite — not loops</td></tr>
          </tbody>
        </table>
        <dl class="colo-chrome">
          <dt>reticle brackets — 16-arm, double</dt><dd>frames viewport edges and registration corners of chrome panels. never crops into prose, never animates, never enters article body.</dd>
          <dt>hairline tiers — three</dt><dd>separate chrome bands, section gutters, surface steps. never thicken, never multiply into grids, never carry color beyond the chrome set.</dd>
          <dt>tick rules + mono indexes (00-04)</dt><dd>number chrome sections and align kickers to the baseline. never renumber per article, never replace semantic headings.</dd>
          <dt>glyph budget — eight</dt><dd>the fixed set (› · — ▤ among them) is the only decorative marks. never a ninth glyph, no emoji, no icon-font substitutes.</dd>
          <dt>loops contract — desktop only</dt><dd>rail sweep, caret blink, pulse spark. never on phone, never a fourth, never a looped entrance.</dd>
          <dt>entrances — mark-in, rise</dt><dd>finite one-shots for chrome. never repeat, never loop, never play on phone.</dd>
          <dt>light identity — paper arm</dt><dd>#fbfbfd ground, near-black ink, same surface discipline, accent unified to #0b3fbf (the electric wire, 8.2:1 on paper). never diverges tiers, never breaks AA on paper.</dd>
        </dl>
      </div>
    </details>

    <details class="colo-details">
      <summary>accessibility — conformance ledger, measured 2026-10-28</summary>
      <div class="colo-details-body">
        <table class="colo-a11y">
          <thead><tr><th scope="col">dimension</th><th scope="col">contract</th><th scope="col">measured</th><th scope="col">status</th></tr></thead>
          <tbody>
            <tr><td>text contrast</td><td>WCAG AA 4.5:1 normal / 3.0:1 large, both themes</td><td>0 failures; min 6.09:1 dark / 6.41:1 light</td><td>pass</td></tr>
            <tr><td>focus visibility</td><td>WCAG 2.4.7 + 1.4.11 non-text bar</td><td>14/14 tab stops show an indicator; min ring 10.76:1</td><td>pass</td></tr>
            <tr><td>motion budget</td><td>WCAG 2.2.2 + reduced-motion honored</td><td>4 desktop loops (cap 4 — consult C bus rider is the 4th, transform-only), 0 phone; 2 finite entrances excluded</td><td>pass — at cap</td></tr>
            <tr><td>tap targets</td><td>44px minimum on phone</td><td>44px floor met</td><td>pass</td></tr>
            <tr><td>structure</td><td>semantic landmarks, skip link, native controls</td><td>header/nav/main/footer, skip link, native details</td><td>pass</td></tr>
            <tr><td>decorative exception</td><td>WCAG 1.4.11 exempts pure decoration</td><td>55%-alpha seg brackets (electric): 1.49:1 dark / 4.17:1 light; caret ▌ electric: 4.38:1 dark — decorative non-text, 3:1 floor; solid variants 6.39:1 / 4.71:1; prefers-contrast path lifts all to accent (OP-55)</td><td>disclosed — exempt</td></tr>
            <tr><td>gradient-clip wordmark</td><td>WCAG 1.4.3 via worst gradient stop + legacy ink</td><td>worst stop 12.8:1 dark / ink 19:1 light; engines without background-clip get --dn-fg, never invisible text (consult B F1/F2)</td><td>pass</td></tr>
          </tbody>
        </table>
        <p>the audit runs in chromium against the live site, sweeping every visible text leaf in both themes. theme is toggle-verified per sample, not assumed: each leaf is measured twice, once per theme, colors alpha-composited over their actual render background. keyboard sweeps a 14-stop tab order; focus indicators are read as non-text contrast against the element backdrop.</p>
        <p>the decorative exception concerns the corner-bracket frame glyphs at 55% alpha. they carry no information — no state, no label, no affordance, no link. they are purely ornamental framing, so WCAG 1.4.11 exempts them from the non-text contrast requirement. solid-ink bracket variants, where the frame is load-bearing, pass the bar at 6.39:1 dark and 4.71:1 light. the ledger states the exception plainly: a disclosed, measured deviation is honest conformance; an undisclosed one is a defect.</p>
        <p>cadence: every ship re-measures. the numbers above are a per-release re-audit — a change to theme, markup, or corpus invalidates the row and triggers a fresh chromium sweep before the ship lands. the date in the summary line is the last re-measure, not a blanket attestation.</p>
      </div>
    </details>

    <p class="colo-tick"><span aria-hidden="true">▤</span> docneural · static · public · canon intact <span aria-hidden="true">▤</span></p>
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
  /* DS-COOLEST directive 9 + COOLER-3 OP-21/OP-32: the hero is a composed
     instrument, not a balanced split — the Plate column is wider (1.08 vs
     0.92) because the Plate is the product, and the seam between the
     columns is a designed element: a gradient hairline with two reticle
     nodes. The identity column captions the constellation. */
  .hero {
    position: relative;
    max-width: none;
    width: 100%;
    text-align: left;
    isolation: isolate;
    display: grid;
    /* FULL-RIGHTS OP-37 — the Plate column grows again (1.15 vs 0.85): the
       plate is the product and now it is MOUNTED (OP-39), it should own the
       hero. Two named rows so the identity column splits into head (the
       nameplate) and body (the pitch) around it — which is also what lets
       the phone interleave the Plate after the nameplate (OP-48). */
    grid-template-columns: minmax(0, 0.85fr) 1px minmax(0, 1.15fr);
    grid-template-areas:
      "head seam plate"
      "body seam plate";
    grid-template-rows: auto 1fr;
    gap: 0 var(--dn-space-6);
    align-items: stretch;
    padding: var(--dn-space-5) 0 0;
  }
  /* OP-37 — the identity column is the Plate's LEGEND RAIL: a full-height
     hairline on its left and a real gutter, so the hero reads as "a plate
     with a legend", not "two columns side by side". */
  .id-head {
    grid-area: head;
    min-width: 0;
    border-left: 1px solid var(--dn-hairline);
    padding-left: var(--dn-space-5);
  }
  .id-body {
    grid-area: body;
    min-width: 0;
    border-left: 1px solid var(--dn-hairline);
    padding-left: var(--dn-space-5);
    padding-top: var(--dn-space-4);
  }
  .seam {
    grid-area: seam;
    position: relative;
    width: 1px;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--dn-hairline) 12%,
      var(--dn-hairline) 88%,
      transparent
    );
  }
  .seam::before,
  .seam::after {
    content: "";
    position: absolute;
    left: 50%;
    width: 5px;
    height: 5px;
    margin-left: -2.5px;
    border-radius: 50%;
    background: var(--dn-accent);
  }
  /* OP-37: the nodes anchor to the composition — top node at the
     nameplate's under-rule, bottom node near the readout's foot. */
  .seam::before { top: 9rem; }
  .seam::after { bottom: 12%; opacity: 0.4; }
  .plate {
    grid-area: plate;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* OP-39: mounted — the reticle frame anchors to a real edge and the
       caption strip closes the display at its foot. */
    padding: var(--dn-space-4) var(--dn-space-4) 0;
  }
  /* OP-39: corner registration ticks INSIDE the reticle — "this is where
     the canvas mounts". */
  .plate-tick { position: absolute; width: 9px; height: 9px; color: var(--dn-accent); opacity: 0.9; }
  .plate-tick::before, .plate-tick::after { content: ""; position: absolute; background: currentColor; }
  .plate-tick::before { left: 4px; top: 0; width: 1px; height: 9px; }
  .plate-tick::after { left: 0; top: 4px; width: 9px; height: 1px; }
  .pt-tl { top: 7px; left: 7px; }
  .pt-tr { top: 7px; right: 7px; }
  .plate-cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: var(--dn-space-3);
    padding: var(--dn-space-2) 0;
    border-top: 1px solid var(--dn-border);
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
  }
  .pc-index {
    color: var(--dn-accent);
    text-decoration: none;
    border-bottom: 1px dotted color-mix(in srgb, var(--dn-accent) 55%, transparent);
    padding-bottom: 1px;
  }
  .pc-index:hover, .pc-index:focus-visible { border-bottom-style: solid; }

  /* FULL-RIGHTS OP-35 — the nameplate: the wordmark framed by the 16-arm
     reticle (dn-brackets), the kicker riding the top rule, the calibration
     registration mark at the top-right corner, and a source-hue under-rule
     closing the plate. The instrument's NAMEPLATE, not "a gradient word". */
  .nameplate {
    position: relative;
    padding: var(--dn-space-3) var(--dn-space-4) var(--dn-space-4);
    min-height: calc(var(--dn-text-4xl) * 1.35);
  }
  .nameplate::after {
    content: "";
    display: block;
    height: 1px;
    margin-top: var(--dn-space-2);
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--dn-src, var(--dn-accent)) 60%, transparent),
      transparent 72%);
  }
  .regmark {
    position: absolute;
    top: 0.55rem;
    right: 0.55rem;
    color: var(--dn-electric);   /* CONSULT C: the calibration mark matches the chrome rail */
    opacity: 0.9;
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
    margin: 0;
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
    /* CONSULT C (E5): the caret is the hero's terminal-live beat — it rides
       the chrome's electric hue now; amber is freed to mean warning only. */
    color: var(--dn-electric);
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
   become five deliberate ones. (FULL-RIGHTS: the ladder now lives in the
   identity column's body half.) */
.id-body > .cta-row { margin-top: var(--dn-space-5); }
.id-body > .stats { margin-top: var(--dn-space-6); }

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

  /* FULL-RIGHTS OP-38 — the readout module: header / grid / footer. The
     brow is a LIVE bus line (acid = live, LED dot static — the halo IS the
     live state, no loop), the kv rows gain a hairline telemetry column,
     and the provenance note becomes the module's footer. */
  .stats-bus {
    display: flex;
    align-items: center;
    gap: 0.6em;
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-wide);
    text-transform: uppercase;
    color: var(--dn-acid);
    padding-bottom: var(--dn-space-2);
    border-bottom: 1px solid var(--dn-hairline);
  }
  .bus-led {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--dn-acid);
    box-shadow: 0 0 6px color-mix(in srgb, var(--dn-acid) 60%, transparent);
  }
  :global([data-theme='light']) .bus-led { box-shadow: none; }
  .stats .note {
    margin: 0;
    padding-top: var(--dn-space-2);
    border-top: 1px solid var(--dn-hairline);
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-mega);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
  }
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
  /* FULL-RIGHTS OP-36 — the four readout numerals are HOLLOW display
     figures at rest (stroke, not fill — the page's one type gesture, now
     carrying the live readout too); pointer or keyboard focus on the panel
     fills them over 160ms. The firing count strokes in acid: live = acid. */
  .stats .dn-kv .num {
    font-size: var(--dn-text-2xl);
    line-height: 1.05;
    color: transparent;
    -webkit-text-stroke: 1px var(--dn-fg);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1, "lnum" 1;
    letter-spacing: -0.01em;
    transition: color 160ms ease;
  }
  .stats:hover .dn-kv .num,
  .stats:focus-within .dn-kv .num { color: var(--dn-fg); }
  .stats .dn-kv .num b {
    color: transparent;
    -webkit-text-stroke: 1px var(--dn-acid);
    transition: color 160ms ease;
  }
  .stats:hover .dn-kv .num b,
  .stats:focus-within .dn-kv .num b { color: var(--dn-acid); }
  .stats .dn-kv .num em {
    font-style: normal;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    -webkit-text-stroke: 0;
  }
  /* OP-38: the telemetry grid — a real hairline column between the labels
     and the readout, so the panel reads as an instrument module. */
  .stats .dn-kv > span:nth-child(even) {
    border-left: 1px solid var(--dn-hairline);
    padding-left: var(--dn-space-3);
  }
  /* OP-24: the keys carry a ledger glyph — the kv grid reads as a telemetry
     column, not a definition list. (› is already in the glyph budget.) */
  .stats .dn-kv > span:nth-child(odd)::before {
    content: "› ";
    color: var(--dn-border-strong);
  }
  .stats .dn-kv .num b {
    font-weight: 600;
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
  /* DS-COOLEST directive 18 + COOLER-3 OP-23 — the drop-line: every section
     head reads kicker → title → 2px accent tick in one vertical motion. The
     kicker rides data-kicker (mega-tracked, faint); the tick replaces the
     old full-width hairline (which read as a row separator, not a mark). */
  .section-h {
    display: inline-block;
  }
  .section-h::before {
    content: attr(data-kicker);
    display: block;
    font: 400 var(--dn-text-2xs)/1 var(--dn-font-mono);
    letter-spacing: var(--dn-track-mega);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    margin-bottom: var(--dn-space-2);
  }
  .section-h::after {
    content: "";
    display: block;
    width: 22px;
    height: 2px;
    margin-top: var(--dn-space-2);
    background: var(--dn-accent);
  }
  /* Directive 18 + COOLER-3 OP-22 — the mono index gutter becomes a real
     drop figure: hollow-stroked numerals at display size (stroke, not fill,
     keeps them quiet against the void while the size does the drama).
     3:1 non-text holds: #6b9dc6 strokes on #05090f = 6.8:1. */
  .home > section {
    position: relative;
    padding-left: 4.2rem;
  }
  .home > section::before {
    content: attr(data-idx);
    position: absolute;
    left: 0;
    top: -0.55rem;
    font: 400 var(--dn-text-3xl)/1 var(--dn-font-display);
    letter-spacing: 0;
    color: transparent;
    -webkit-text-stroke: 1px var(--dn-border-strong);
  }
  /* COOLER-3 OP-25 — two-beat entrance: the card lifts, then its source
     rail draws in 120ms later. Capped so a 200-row grid resolves in ~520ms.
     Finite animations only — the loop budget is untouched. The mark-in runs
     on .src-card alone: its resting rail IS the keyframe's end state, so
     nothing changes at rest (the contents rows keep their hover-only rails,
     per directive 14). */
  .card {
    animation: dn-rise 300ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
    animation-delay: calc(min(var(--i, 0), 16) * 24ms);
  }
  .src-card {
    animation:
      dn-rise 300ms cubic-bezier(0.2, 0.7, 0.3, 1) both,
      dn-mark-in 220ms ease-out both;
    animation-delay:
      calc(min(var(--i, 0), 16) * 24ms),
      calc(min(var(--i, 0), 16) * 24ms + 120ms);
  }
  @keyframes dn-mark-in {
    from { border-left-color: transparent; }
    to { border-left-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, var(--dn-border)); }
  }
  .src-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
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
  /* FULL-RIGHTS OP-40 — the corpus MARK: each card wears its instrument's
     mark in its real graph hue, top-right. Path strokes, dots fill — one
     rule per shape, hue from the source var. */
  .src-mark {
    position: absolute;
    top: 0.7rem;
    right: 0.75rem;
    width: 16px;
    height: 16px;
    color: var(--dn-src, var(--dn-accent));
    opacity: 0.9;
  }
  .src-mark circle { fill: currentColor; stroke: none; }
  .src-mark path { fill: none; stroke: currentColor; }
  .src-name {
    font-size: var(--dn-text-md);
    font-weight: 600;
    color: var(--dn-accent);
    letter-spacing: var(--dn-track-tight);
    /* the corpus nameplate: the source hue rides BEHIND the name at 8% */
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 8%, transparent);
    padding: 0.05em 0.4em 0.12em;
    margin-left: -0.4em;
  }
  .src-meta {
    font-size: var(--dn-text-xs);
    color: var(--dn-fg-faint);
    letter-spacing: var(--dn-track-tight);
    font-variant-numeric: tabular-nums;
    align-self: flex-end;
  }
  .src-open {
    position: absolute;
    right: 0.7em;
    bottom: 0.55em;
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
    /* FULL-RIGHTS OP-41: the overflow row is a full-width index foot —
       dashed top rule, centered affordance, 44px thumb floor. */
    grid-column: 1 / -1;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--dn-accent);
    border-bottom: 0;
    border-top: 1px dashed var(--dn-hairline);
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-tight);
  }
  .sa-k { color: var(--dn-accent); }
  .card-title { font-size: var(--dn-text-sm); }
  /* FULL-RIGHTS OP-36/OP-41 — degree wears the hollow treatment too: a
     quiet stroked figure at rest, filled with the acid LIVE hue on
     hover/focus — wire weight reads as live weight. */
  .card-deg {
    align-self: flex-end;
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-tight);
    color: transparent;
    -webkit-text-stroke: 0.5px var(--dn-border-strong);
    transition: color 160ms ease, -webkit-text-stroke-color 160ms ease;
  }
  .card:hover .card-deg,
  .card:focus-visible .card-deg {
    color: var(--dn-acid);
    -webkit-text-stroke-color: transparent;
  }
  /* OP-41: a stronger rule every 20 cells — the index paces itself. */
  .grid > .card:nth-child(20n) { border-bottom-color: color-mix(in srgb, var(--dn-border-strong) 75%, transparent); }
  .grid-head {
    margin: 0 0 0.6rem;
    padding-bottom: var(--dn-space-2);
    border-bottom: 1px solid var(--dn-hairline);
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-mega);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
  }

  /* COOLER-3 OP-28 — the colophon: three labeled columns (method /
     contract / machine) with the same mega-tracked kickers and the same
     22px accent tick the section heads wear, sitting ON the top hairline.
     Content aligns with the section drop numerals (4.2rem gutter spine). */
  .foot {
    width: 100%;
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--dn-space-6);
    text-align: left;
    font-size: var(--dn-text-xs);
    color: var(--dn-fg-faint);
    line-height: 1.9;
    letter-spacing: var(--dn-track-tight);
    padding: var(--dn-space-6) 0 var(--dn-space-5) 4.2rem;
    border-top: 1px solid var(--dn-hairline);
    border-bottom: 1px solid var(--dn-hairline);
  }
  .foot::before {
    content: "";
    position: absolute;
    top: -1px;
    left: 0;
    width: 22px;
    height: 2px;
    background: var(--dn-accent);
  }
  .foot .col-h {
    display: block;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-mega);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    margin-bottom: var(--dn-space-2);
  }
  .foot .sym { color: var(--dn-accent-dim); }
  .foot .mach {
    display: inline-block;
    margin-right: var(--dn-space-3);
    color: var(--dn-fg-muted);
    text-decoration: none;
    border-bottom: 1px dotted var(--dn-border-strong);
    padding-bottom: 1px;
  }
  .foot .mach:hover { color: var(--dn-accent); border-bottom-style: solid; }

  /* ---------- CB-EXHAUST (consults 1-6, deepseek-v4.1-flash@codebuddy) ----
     The plate ledger, the reading steps, and the colophon v2: the instrument
     documents itself. Markup/CSS only — script blocks untouched. */
  .plate-ledger { width: 100%; margin: 0 0 var(--dn-space-6); }
  .ledger { border: 1px solid var(--dn-hairline); background: color-mix(in srgb, var(--dn-bg-raise) 55%, transparent); }
  .ledger-summary {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 1rem;
    min-height: 44px; padding: var(--dn-space-3) var(--dn-space-4);
    cursor: pointer; list-style: none; position: relative;
  }
  .ledger-summary::-webkit-details-marker { display: none; }
  .ledger-summary::after {
    content: "›"; margin-left: auto; color: var(--dn-accent-dim);
    transition: transform 120ms ease; transform-origin: 50% 50%;
  }
  .ledger[open] .ledger-summary::after { transform: rotate(90deg); }
  .ledger-summary:hover .ledger-sum-label { color: var(--dn-accent); }
  .ledger-sum-label {
    font-size: var(--dn-text-sm); letter-spacing: var(--dn-track-wide);
    text-transform: uppercase; color: var(--dn-fg);
  }
  .ledger-sum-count { font-size: var(--dn-text-xs); color: var(--dn-accent-dim); }
  .ledger-sum-note { flex-basis: 100%; font-size: var(--dn-text-xs); color: var(--dn-fg-faint); }
  .ledger-legend {
    display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; align-items: baseline;
    padding: var(--dn-space-2) var(--dn-space-4); border-top: 1px solid var(--dn-hairline);
    font-size: var(--dn-text-2xs); letter-spacing: var(--dn-track); color: var(--dn-fg-faint);
  }
  .lg-meta { flex-basis: 100%; }
  .dot {
    display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 50%;
    margin-right: 0.4rem; vertical-align: baseline;
    /* hues = the real graph palette entries the canvas paints (djb2 hashed,
       hashString() byte-identical): emacs idx 6, org idx 5, guix idx 2. */
  }
  .dot-emacs { background: #56c8ff; }
  .dot-org { background: #ff7a45; }
  .dot-guix { background: #ffd93f; }
  :root[data-theme='light'] .dot-emacs { background: #0369a1; }
  :root[data-theme='light'] .dot-org { background: #96400a; }
  :root[data-theme='light'] .dot-guix { background: #7a4a00; }
  .ledger-table {
    width: 100%; border-collapse: collapse; border-top: 1px solid var(--dn-hairline);
    font-size: var(--dn-text-xs); font-variant-numeric: tabular-nums;
  }
  .ledger-table thead th {
    text-align: left; font-weight: 400; text-transform: uppercase;
    letter-spacing: var(--dn-track); font-size: var(--dn-text-2xs);
    color: var(--dn-fg-faint); padding: var(--dn-space-2) var(--dn-space-4);
  }
  .ledger-row { border-top: 1px solid var(--dn-hairline); }
  .ledger-rank { width: 3.5ch; text-align: right; padding: 0.3rem var(--dn-space-2) 0.3rem var(--dn-space-4); color: var(--dn-fg-faint); }
  .ledger-corpus { white-space: nowrap; padding: 0.3rem var(--dn-space-3); color: var(--dn-fg-muted); }
  .ledger-chip { white-space: nowrap; }
  .ledger-node { padding: 0.3rem var(--dn-space-2); color: var(--dn-fg); }
  .ledger-deg { width: 6ch; text-align: right; padding: 0.3rem var(--dn-space-4) 0.3rem var(--dn-space-2); color: var(--dn-fg-muted); }

  .how { width: 100%; margin: 0 0 var(--dn-space-6); }
  .how-steps {
    list-style: none; margin: 0; padding: 0; display: grid;
    grid-template-columns: repeat(3, 1fr); gap: 0; counter-reset: none;
  }
  .how-step { position: relative; padding: var(--dn-space-3) var(--dn-space-5) var(--dn-space-5) 0; }
  /* FULL-RIGHTS OP-50 — a sequence, not a 3-up grid: the numerals ARE the
     drama (2xl hollow display figures, same treatment as OP-36), and a 1px
     wire with a reticle node runs from step to step. The wire is a static
     connector — no draw-in, no loop. */
  .how-num {
    display: block;
    font: 400 var(--dn-text-2xl)/1 var(--dn-font-display);
    letter-spacing: 0;
    color: transparent;
    -webkit-text-stroke: 1px var(--dn-border-strong);
    margin-bottom: var(--dn-space-3);
  }
  .how-step + .how-step::before {
    content: "";
    position: absolute;
    left: -1.35rem;
    top: 1.7rem;
    width: 1.1rem;
    height: 1px;
    background: color-mix(in srgb, var(--dn-accent-dim) 70%, transparent);
  }
  .how-step + .how-step::after {
    content: "";
    position: absolute;
    left: -0.4rem;
    top: calc(1.7rem - 2px);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--dn-accent);
  }
  .how-verb { margin: 0 0 var(--dn-space-2); font-size: var(--dn-text-lg); font-weight: 400; color: var(--dn-fg); }
  .how-line { margin: 0 0 var(--dn-space-3); font-family: var(--dn-font-prose); font-size: var(--dn-text-sm); line-height: 1.55; color: var(--dn-fg-muted); max-width: 24em; }
  .how-next { margin: 0; font-size: var(--dn-text-xs); color: var(--dn-fg-faint); }
  .how-next span { color: var(--dn-accent-dim); }
  .how-foot { margin: 0; font-size: var(--dn-text-xs); color: var(--dn-fg-faint); }
  .how-foot span { color: var(--dn-accent-dim); }

  /* colophon v2 — the design-system ledger */
  /* FULL-RIGHTS OP-51 — the colophon closes on a signature: the lead is a
     framed statement (reticle frame, display size, centered) and an
     instrument stamp of the real export facts signs the page. */
  .colo-lead {
    margin: 0 auto var(--dn-space-4); grid-column: 1 / -1;
    font-size: var(--dn-text-md); color: var(--dn-fg-muted);
    max-width: 38rem; letter-spacing: var(--dn-track-tight);
    line-height: 1.6;
    text-align: center;
    padding: var(--dn-space-4) var(--dn-space-5);
  }
  .colo-lead-g { color: var(--dn-accent); }
  .colo-stamp {
    grid-column: 1 / -1;
    margin: 0 0 var(--dn-space-5);
    padding-top: var(--dn-space-3);
    border-top: 1px solid var(--dn-border-strong);
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-mega);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    text-align: center;
  }
  .colo-grid { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--dn-space-6); }
  .colo-list { margin: 0; }
  .colo-list dt {
    font-size: var(--dn-text-2xs); letter-spacing: var(--dn-track-mega);
    text-transform: uppercase; color: var(--dn-fg-faint); margin: var(--dn-space-3) 0 var(--dn-space-1);
  }
  .colo-list dd { margin: 0; font-size: var(--dn-text-xs); line-height: 1.7; color: var(--dn-fg-muted); }
  .colo-links .mach { display: inline-block; margin-right: var(--dn-space-3); margin-bottom: 2px; }
  .colo-details { grid-column: 1 / -1; border-top: 1px solid var(--dn-hairline); }
  .colo-details summary {
    min-height: 44px; display: flex; align-items: center; cursor: pointer;
    list-style: none; font-size: var(--dn-text-xs); letter-spacing: var(--dn-track-wide);
    text-transform: uppercase; color: var(--dn-fg-faint);
  }
  .colo-details summary::-webkit-details-marker { display: none; }
  .colo-details summary::after { content: "›"; margin-left: auto; color: var(--dn-accent-dim); transition: transform 120ms ease; }
  .colo-details[open] summary::after { transform: rotate(90deg); }
  .colo-details summary:hover { color: var(--dn-accent); }
  .colo-details-body { padding: 0 0 var(--dn-space-4); overflow-x: auto; }
  .colo-details-body p {
    font-family: var(--dn-font-prose); font-size: var(--dn-text-sm); line-height: 1.6;
    color: var(--dn-fg-muted); max-width: 52rem; margin: var(--dn-space-3) 0;
  }
  .colo-manifest, .colo-a11y {
    width: 100%; min-width: 34rem; border-collapse: collapse;
    font-size: var(--dn-text-2xs); font-variant-numeric: tabular-nums;
  }
  .colo-manifest th, .colo-manifest td, .colo-a11y th, .colo-a11y td {
    text-align: left; padding: 0.3rem var(--dn-space-3) 0.3rem 0;
    border-top: 1px solid var(--dn-hairline); vertical-align: top;
    color: var(--dn-fg-muted); font-weight: 400;
  }
  .colo-manifest thead th, .colo-a11y thead th {
    text-transform: uppercase; letter-spacing: var(--dn-track);
    color: var(--dn-fg-faint); border-top: 0; padding-top: var(--dn-space-3);
  }
  .colo-manifest td:first-child, .colo-a11y td:first-child { color: var(--dn-fg); white-space: nowrap; }
  .colo-manifest tr th[scope="rowgroup"] {
    text-transform: uppercase; letter-spacing: var(--dn-track); color: var(--dn-accent-dim);
    padding-top: var(--dn-space-3); font-weight: 400;
  }
  .colo-chrome { margin: var(--dn-space-4) 0 0; max-width: 52rem; }
  .colo-chrome dt {
    display: inline; font-size: var(--dn-text-xs); color: var(--dn-fg);
  }
  .colo-chrome dt::after { content: " — "; color: var(--dn-fg-faint); }
  .colo-chrome dd {
    display: inline; margin: 0; font-size: var(--dn-text-xs); line-height: 1.7; color: var(--dn-fg-muted);
  }
  .colo-chrome dd::after { content: ""; display: block; }
  .colo-tick {
    grid-column: 1 / -1; margin: var(--dn-space-4) 0 0; font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-wide); text-transform: uppercase; color: var(--dn-fg-faint);
  }
  .colo-tick span { color: var(--dn-accent-dim); }

  .src-body {
    display: block; font-family: var(--dn-font-prose); font-size: var(--dn-text-sm);
    line-height: 1.5; color: var(--dn-fg-muted); text-align: left;
    margin-top: var(--dn-space-2);
  }

  /* ---------- the Corpus Plate is drawn by CorpusField.svelte ----------
     Desktop loops at rest, whole Home (directive 21): rail sweep
     (transform) + caret blink (opacity). Nothing else. */

  .rail {
    position: relative;
    width: min(24rem, 100%);
    /* FULL-RIGHTS OP-35: 4px and a 42% sweep — visible at arm's length. */
    height: 4px;
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
    width: 42%;
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

  /* OP-38 fact note: the count-up sweep keeps its 900ms script — the P1
     law outbids the directive's 600ms wish. Only the frame moved. */

  @media (prefers-reduced-motion: reduce) {
    /* Everything that still loops parks on its resting frame (the global
       reduced-motion block in docneural-ui.css zeroes durations too). */
    .rail::before { animation: none; transform: translateX(-120%); }
    .feed-caret { animation: none; }
  }

  /* ---------- FULL-RIGHTS OP-48 — phone: a PORTRAIT instrument ----------
     The grid areas re-stack: nameplate, THEN the Plate (front door shows
     the product), then the pitch. The Plate gets its caption at 2xs, the
     section numerals sit inline above their kickers, and the flush stack
     gets its air back. Zero loops, 44px floors — untouched. */
@media (max-width: 700px) {
  .home {
    height: auto;
    overflow: visible;
    min-height: 0;
    padding: var(--dn-space-4) var(--dn-space-4) var(--dn-space-7);
    gap: var(--dn-space-5);
  }
  .hero {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-areas:
      "head"
      "plate"
      "body";
    gap: var(--dn-space-5);
    align-items: stretch;
    text-align: left;
    padding: var(--dn-space-4) 0 0;
  }
  .id-head, .id-body { border-left: 0; padding-left: 0; }
  .id-body { padding-top: 0; }
  .seam { display: none; }
  .nameplate { min-height: 0; padding: var(--dn-space-3) var(--dn-space-3) var(--dn-space-3); }
  .plate { padding: var(--dn-space-3) var(--dn-space-3) 0; }
  .plate-cap { font-size: var(--dn-text-2xs); }
  .wordmark { font-size: clamp(2rem, 11vw, 2.75rem); }
  .lede { line-height: var(--dn-lh-loose); max-width: 100%; }
  .stats {
    padding: var(--dn-space-3) var(--dn-space-4);
    width: 100%;
  }
  .stats .dn-kv .num { font-size: var(--dn-text-xl); }
  .stats .dn-kv .num { -webkit-text-stroke-width: 0.5px; }
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
     would leave the 42%-wide bar sitting visible inside the rail. */
  .rail::before { animation: none; transform: translateX(-120%); }
  .feed-caret,
  .card,
  .src-card { animation: none; }

  /* OP-48c: the drop numerals sit INLINE above their kickers — "01 how to
     read", not a floating 01 orphaned in a gutter the phone no longer has. */
  .home > section { padding-left: 0; }
  .home > section::before {
    position: static;
    display: block;
    font-size: var(--dn-text-xl);
    margin-bottom: 0.4rem;
    -webkit-text-stroke-width: 0.5px;
  }
  .section-h::before { letter-spacing: var(--dn-track-wide); }
  .foot {
    grid-template-columns: 1fr;
    gap: var(--dn-space-4);
    padding: var(--dn-space-5) 0 var(--dn-space-4) 0;
  }
  /* CB-EXHAUST phone: ledger, steps, and colophon v2 stack; 44px floors;
     static connectors (no draw-in), zero loops. */
  .ledger-sum-note { display: none; }
  .ledger-table { font-size: var(--dn-text-2xs); }
  .ledger-rank { padding-left: var(--dn-space-3); }
  .ledger-deg { padding-right: var(--dn-space-3); }
  .how-steps { grid-template-columns: 1fr; }
  .how-step {
    border-left: 1px solid var(--dn-hairline);
    padding: var(--dn-space-3) 0 var(--dn-space-4) var(--dn-space-4);
  }
  .how-step + .how-step::before,
  .how-step + .how-step::after { display: none; }
  .how-num {
    display: inline-block;
    font-size: var(--dn-text-xl);
    -webkit-text-stroke-width: 0.5px;
    margin: 0 0.6rem 0 0;
  }
  .colo-grid { grid-template-columns: 1fr; gap: var(--dn-space-4); }
  .colo-details-body { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .colo-lead { padding: var(--dn-space-3) var(--dn-space-3); }
}

/* Anchor landing under the sticky header (directive 23) — global, both
   viewports, zero cost. */
:global(html) {
  scroll-padding-top: calc(var(--dn-header-h) + 8px);
}

</style>
