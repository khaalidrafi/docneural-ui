<script lang="ts">
  // DocneuralApp — shell: header (wordmark, mode switch, ⌘K, theme) then the
  // active surface. Docs-first: the site opens on Home (a real front door),
  // the reader shows a chapter, and the org-roam graph is the opt-in
  // "synapses" mode. One store drives all three so a selection survives
  // switching between them.
  //
  // LOOK: a HUD. Ink-black, neon edges, monospace uppercase chrome, corner
  // brackets, one live status readout. The header also carries --dn-src for
  // the ACTIVE source, so switching corpus re-tints the interface — the site
  // hosts docs from many projects and the chrome says which one you are in.
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import DocneuralGraph from './graph/DocneuralGraph.svelte'
  import FilterBar from './graph/FilterBar.svelte'
  import NotePreview from './reader/NotePreview.svelte'
  import DocReader from './reader/DocReader.svelte'
  import Home from './reader/Home.svelte'
  import CommandPalette from './ui/CommandPalette.svelte'
  import Library from './ui/Library.svelte'
  import AskPanel from './reader/AskPanel.svelte'
  import { DocneuralStore } from './core/store.svelte'
  import { sourceVars } from './core/source'

  let {
    base = '.',
    title = 'docneural-ui',
    lite = false
  }: {
    base?: string
    title?: string
    lite?: boolean
  } = $props()

  // Toggle state for graph/lite mode
  let forceLite = $state(false);

  // Lite resolution: only EXPLICIT asks — the `lite` prop, the FULL/FAST
  // toggle, or ?lite=1. There is deliberately NO deviceMemory auto-downgrade:
  // many Android phones report <= 2 GB, so the old "courtesy" detect silently
  // removed the SYNAPSES tab and the graph — the product's hero surface — on
  // exactly the devices that most wanted to see it. The graph ships on every
  // device; FAST remains a choice a visitor makes in the open, never a guess
  // made for them behind their back. (signal-design; the LOD painter in
  // neuronEngine.ts is what keeps the full canvas cheap enough to promise.)
  let liteOn = $derived(
    lite ||
      forceLite ||
      new URLSearchParams(location.search).get('lite') === '1'
  )

  const store = $derived(new DocneuralStore(base, liteOn))
  $effect(() => {
    void store.load()
  })

  let paletteOpen = $state(false)
  let helpOpen = $state(false)
  // The glyph mirrors the LIVE attribute: main.ts arms data-theme before this
  // component boots (explicit dark arm), so read it instead of assuming dark.
  let theme = $state<string>(
    typeof document !== 'undefined' ? (document.documentElement.dataset.theme ?? 'dark') : 'dark'
  )

  // The sliding segmented thumb: measured off the live .seg buttons (the two
  // labels differ in width, so a 50% split would lie). Re-measured on mode
  // flips and window resizes; the lite layout hides the second seg entirely.
  let thumb = $state({ x: 0, w: 0 })
  $effect(() => {
    const measure = () => {
      const el = document.querySelector('.seg.active') as HTMLElement | null
      if (el) thumb = { x: el.offsetLeft, w: el.offsetWidth }
    }
    store.mode
    store.lite
    measure()
    const raf = requestAnimationFrame(measure) // fonts settle widths late
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  })
  const morph = { y: 10, duration: 200, easing: cubicOut }

  // Graph mode's control panel starts collapsed on phones: a full-width
  // filter bar over the canvas left a sliver of neurons to look at. The
  // header itself carries the live wire count, so nothing is lost.
  const isPhone = $state(
    typeof matchMedia === 'function' && matchMedia('(max-width: 600px)').matches
  )

  function toggleTheme(): void {
    const cur = document.documentElement.dataset.theme
    theme = cur === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    // Persist the explicit choice so the next boot arms it before first
    // paint (main.ts reads docneural:theme back). Private mode: ignore.
    try {
      localStorage.setItem('docneural:theme', theme)
    } catch {
      /* private mode */
    }
  }

  function toggleLite(): void {
    // The FULL/FAST flip is fully reactive: forceLite ($state) -> liteOn
    // ($derived) -> a fresh DocneuralStore ($derived) -> the {#if store.lite}
    // branches swap the surfaces and the store effect re-fetches. The old
    // location.reload() did not merely waste the session — it UNDID the
    // click: forceLite is component state, so a reload dropped it and, with
    // no URL change, liteOn came back exactly as it was. A no-op with a
    // flash. (Audit dispatch #2.)
    // The toggle targets the EFFECTIVE state: when ?lite=1 drove lite mode,
    // flipping the flag would leave the URL in charge, so the param is
    // rewritten away (replaceState, no navigation) and the visitor's explicit
    // wish wins. A visitor who toggled from the canvas asked for a different
    // engine, not a different room — graph mode is re-entered on the fresh
    // full store; a lite store ignores it (setMode guards) and lands reader.
    const wasGraph = store.mode === 'graph' && !store.lite
    forceLite = !liteOn
    if (new URLSearchParams(location.search).get('lite') === '1') {
      const url = new URL(location.href)
      url.searchParams.delete('lite')
      history.replaceState(null, '', url)
    }
    if (wasGraph) store.setMode('graph')
  }

  function onNodeClick(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
  }

  // Global keyboard layer...
  onMount(() => {
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | 0 = 0
    function onKey(e: KeyboardEvent): void {
      const t = e.target as HTMLElement
      const typing =
        t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // ⌘⇧K / Ctrl-Shift-K opens the LIBRARY (SPEC §6.2); plain ⌘K stays
        // the jump palette. The library wins when both modifiers are down.
        if (e.shiftKey) {
          store.toggleLibrary()
        } else {
          paletteOpen = !paletteOpen
        }
        return
      }
      if (e.key === 'Escape') {
        paletteOpen = false
        helpOpen = false
        store.libraryOpen = false
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?') { helpOpen = !helpOpen; return }
      // `/` is the universal "search" key on docs sites (GitHub, Discourse).
      // It needs the same typing guard as the rest of the layer, so it is
      // handled here rather than in the palette.
      if (e.key === '/') {
        e.preventDefault()
        paletteOpen = true
        return
      }

      if (pendingG) {
        clearTimeout(gTimer)
        pendingG = false
        if (e.key === 'd') return store.setMode('reader')
        if (e.key === 's') return store.setMode('graph')
        if (e.key === 'h') return store.goHome()
        return
      }
      if (e.key === 'g') {
        pendingG = true
        gTimer = setTimeout(() => (pendingG = false), 700)
        return
      }

      if (e.key === '[') { const p = store.prevChapter(); if (p) store.goto(p, 'reader'); return }
      if (e.key === ']') { const n = store.nextChapter(); if (n) store.goto(n, 'reader'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(gTimer)
    }
  })

  // Status line: the corpus as an instrument reading. Only after the data
  // lands — a HUD that reports 0 nodes looks broken, not technical. Bridge
  // recoveries append their own honest suffix (+N recovered, SPEC §5).
  const status = $derived(
    store.ready
      ? `${store.data.nodes.length} NEURONS · ${store.data.links.length} SYNAPSES · ${store.manuals.length} SRC${store.bridgesLoaded ? ` · +${store.recovered} recovered` : ''}`
      : 'SYNAPSE LINK DOWN'
  )
</script>

<header class="shell" style={sourceVars(store.manual)}>
  <!-- CONSULT C: the electric bus lives under all header content; the
       bright rider traverses it (one transform-only desktop loop). -->
  <span class="bus-rail" aria-hidden="true"></span>
  <span class="bus-pads" aria-hidden="true"></span>
  <button class="brand dn-mono" onclick={() => store.goHome()} aria-label="{title} home">
    <span class="dn-neuron-mark" aria-hidden="true"></span><span class="wordmark">{title.toUpperCase()}</span>
  </button>
  <!-- CONSULT E §3: the modes nav occupies the middle bay of the grid; the
       rocker (below) replaces the bracket pair with an electric lead tick. -->

  <!-- The mode switch is the site's one big choice — read the text, or read
       the graph — so it never hides. On phones the words and brackets drop
       away and the two glyphs stay, sized for a thumb. -->
  <nav class="modes" aria-label="View mode">
    <!-- The thumb slides under the active segment — measured, not a fake
         50% split, because DOCS and SYNAPSES are different widths. -->
    <span
      class="seg-thumb electric"
      aria-hidden="true"
      style:transform="translateX({thumb.x}px)"
      style:width="{thumb.w}px"
    ></span>
    <!-- CONSULT E §3: the [ ] brackets die — the active cell carries a 3px
         electric lead tick at its left edge instead. -->
    <button class="seg" class:active={store.mode === 'reader'} aria-pressed={store.mode === 'reader'}
      onclick={() => store.setMode('reader')} title="Read the documentation">
      <span class="seg-ico" aria-hidden="true">▤</span><span class="seg-txt">DOCS</span>
    </button>
    {#if !store.lite}
      <button class="seg" class:active={store.mode === 'graph'} aria-pressed={store.mode === 'graph'}
        onclick={() => store.setMode('graph')} title="See the citations in the neural network">
        <span class="seg-ico spark" aria-hidden="true">⌁</span><span class="seg-txt">SYNAPSES</span>
      </button>
    {/if}
  </nav>

  <div class="tools">
    <!-- CONSULT E §3: the status plate. The 7px LED dot is dead — a 3-bar
         acid meter carries "live" (heights 4/7/10). DOWN: one bar remains,
         pink, square (non-colour cue kept; the text also names the state).
         During boot the plate honest-states BUS · ARMING (markup ternary on
         the existing store flags — no script edit). -->
    <span class="status dn-mono" class:down={store.failed || !store.ready}>
      <span class="meter" aria-hidden="true"><i></i><i></i><i></i></span>
      {store.failed ? 'SYNAPSE LINK DOWN' : !store.ready ? 'BUS · ARMING' : status}
    </span>
    <!-- CONSULT E §3: the keycap bank — four independent outlines become one
         40px strip with 1px dividers; cells 40x40. -->
    <div class="bank" role="group" aria-label="Instrument controls">
      <button class="tool kbd" onclick={() => (paletteOpen = true)} aria-label="Search (Ctrl-K)">
        ⌕ <span class="hintkey">⌘K</span>
      </button>
      <button class="tool keys" onclick={() => (helpOpen = true)} aria-label="Keyboard help">?</button>
      <button class="tool" onclick={toggleLite} aria-label="Toggle lite mode" title="neural network engine on/off">
        {store.lite ? 'FAST' : 'FULL'}
      </button>
      <button class="tool" onclick={toggleTheme} aria-label="Toggle theme" title="day / night">
        {theme === 'light' ? '☀' : '☾'}
      </button>
    </div>
  </div>
</header>

{#if store.failed}
  <!-- A failed fetch is a plain statement of fact: what did not load, the
       reason, one button. No fake shell prompt — the visitor is not in a
       terminal, they are on a website with a missing file. -->
  <div class="fatal">
    <div class="panel" role="alert">
      <span class="dn-neuron-mark" aria-hidden="true"></span>
      <p class="kicker" aria-hidden="true">// no route</p>
      <h2>This documentation neural network did not load</h2>
      <p class="why">{store.failed}</p>
      <p class="hint">The site builds its neural network from an exported corpus. If a
        local build is being served, run <code>make export &amp;&amp; make build</code>.</p>
      <button class="retry" onclick={() => location.reload()}>Reload</button>
    </div>
  </div>
{:else if !store.ready}
  <!-- Loading, not a boot log: the same three real steps (fetch, index, paint)
     stated once, with a live count as soon as the nodes are known. -->
  <div class="boot-wrap">
    <!-- CONSULT E §4: the boot is drawn ON THE BOARD (no card fill) - a
         framed instrument readout, not a dialog. Five rows of FACTS the boot
         actually knows, a charge line the scan crosses ONCE, and voltage bars
         that settle. One-shot timeline (<=900ms, compositor-only); no fake
         percentage; the panel unmounts the moment the graph is ready and the
         reveal is continuous with Home (same floor, same header). -->
    <div class="boot dn-hud" role="status" aria-live="polite">
      <p class="brand-row">
        <span class="dn-neuron-mark" aria-hidden="true"></span>
        <span class="boot-mark">{title.toUpperCase()}</span>
        <span class="count dn-mono">{store.data.nodes.length || '—'} ch</span>
      </p>
      <div class="charge" aria-hidden="true"><span class="scan"></span></div>
      <p class="row idx dn-mono">INDEXING CORPUS <b>{store.data.nodes.length || '—'}</b></p>
      <p class="row sub dn-mono">reading the neural network · {store.manuals.length} channels · {store.data.links.length || '—'} synapses</p>
      <div class="volts" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </div>
{:else if store.mode === 'graph' && !store.lite}
  <section class="synapse-mode" in:fly={morph}>
    <div class="canvas-wrap" class:trail-up={store.trailResolved.length >= 2}>
      <DocneuralGraph {store} {onNodeClick} />
      <!-- The scope chip: what the canvas is showing, and the one click that
           says otherwise. An ego graph that cannot be expanded is a hidden
           feature; a corpus hairball that cannot be narrowed is a broken one. -->
      {#if store.selected}
        <button
          class="scope dn-mono"
          onclick={() => store.toggleScope()}
          title={store.scope === 'ego'
            ? 'Show every chapter the filters pass'
            : 'Narrow back to the chapter being read'}
        >{store.scope === 'ego'
            ? `⌁ around ${store.selected.title} · ${store.visible.nodes.length} of ${store.data.nodes.length}`
            : `⌁ whole corpus · ${store.visible.nodes.length} — around this page`}</button>
      {/if}
      <!-- The layout chip. Three readings of the same corpus (OP-56): packed
           clusters show how citations knot; spread asks the physics for room
           per title; lattice pins every neuron to a fixed-distance hex cell —
           the whole-corpus overview with no crowding. Text is the state, the
           three dots are the position; the accessible name is the NEXT state. -->
      <button
        class="layout dn-mono"
        class:spread={store.layout === 'spread'}
        class:lattice={store.layout === 'lattice'}
        onclick={() => store.toggleLayout()}
        aria-label={store.layout === 'cluster'
          ? 'switch to spread — room per title'
          : store.layout === 'spread'
            ? 'switch to lattice — even fixed spacing'
            : 'switch to clusters — citation knots'}
        title={store.layout === 'cluster'
          ? 'switch to spread — room per title'
          : store.layout === 'spread'
            ? 'switch to lattice — even fixed spacing'
            : 'switch to clusters — citation knots'}
      >{store.layout === 'cluster'
          ? '⌗ clusters ●○○'
          : store.layout === 'spread'
            ? '▤ spread ○●○'
            : '▦ lattice ○○●'}</button>
    </div>
    <details class="controls" open={!isPhone}>
      <summary class="dn-mono">
        <span class="dn-neuron-mark" aria-hidden="true"></span>
        <span class="spark">⌁</span> SYNAPSES · {store.visible.links.length} SYNAPSES
        <span class="chev">+</span>
      </summary>
      <FilterBar {store} />
    </details>
    <NotePreview {store} />
  </section>
{:else if store.selected}
  <section class="reader-mode" in:fly={morph}>
    <DocReader {store} />
  </section>
{:else}
  <div class="home-morph" in:fly={morph}>
    <Home {store} {title} />
  </div>
{/if}

<CommandPalette bind:open={paletteOpen} {store} />
<Library {store} />
<AskPanel {store} />

{#if helpOpen}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) helpOpen = false }}
    onkeydown={(e) => { if (e.key === 'Escape') helpOpen = false }}
  >
    <div class="help dn-glass">
      <h3 class="dn-mono">{title.toUpperCase()} — KEYMAP</h3>
      <p class="blurb">
        A documentation reader <em>enhanced</em> with an org-roam neural network. The written
        word is the home page; <span class="spark">⌁ synapses</span> is the neural
        network between docs — named for Hebb's law, since every citation resolved
        strengthens the synapse. It aggregates <strong>any</strong> Org corpus: one
        channel per manual, each with its own hue.
        <span class="dn-mono" style="display:block; margin-top:0.5em">dashed amber wire = bridge · recovered from literal text references — not the source link graph.</span>
      </p>
      <dl>
        <dt>⌘K / Ctrl-K</dt><dd>command palette (jump anywhere)</dd>
        <dt>⌘⇧K / Ctrl-Shift-K</dt><dd>document library</dd>
        <dt>/</dt><dd>same, from an empty keyboard</dd>
        <dt>g then d</dt><dd>docs mode</dd>
        <dt>g then s</dt><dd>synapses mode</dd>
        <dt>g then h</dt><dd>home</dd>
        <dt>[  /  ]</dt><dd>previous / next chapter</dd>
        <dt>j  /  k</dt><dd>scroll down / up inside the chapter</dd>
        <dt>y</dt><dd>copy a link to exactly where you are reading</dd>
        <dt>b</dt><dd>mark this section — they wait on the front door</dd>
        <dt>v</dt><dd>distraction-free: hide the panels, esc brings them back</dd>
        <dt>click a heading</dt><dd>copy a link to that section</dd>
        <dt>?</dt><dd>this keymap</dd>
        <dt>esc</dt><dd>close overlays</dd>
      </dl>
      <button class="close dn-mono" onclick={() => (helpOpen = false)}>close</button>
    </div>
  </div>
{/if}

<style>
  .shell {
    /* CONSULT E §3: one bar, three BAYS — brand left, rocker in the middle
       bay, keycap bank hard right. Columns, not a flex scatter. */
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--dn-space-4);
    height: var(--dn-header-h);
    padding: 0 var(--dn-space-4);
    /* Solid translucent fill. backdrop-filter: blur(9px) saturate(1.3) is
       removed — on a 4GB machine a sticky backdrop-filter repaints the
       blur every scroll frame. A 92%-opaque fill over the board reads the
       same and costs one composite. */
    background: color-mix(in srgb, var(--dn-bg-raise) 92%, transparent);
    /* CONSULT C — the bottom edge is the ELECTRIC BUS: 2px neon blue, the
       chrome's power rail. A 1px hairline above it reads as the rail's
       mounting seam. */
    border-bottom: 2px solid var(--dn-electric);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--dn-electric) 30%, transparent);
    position: relative;
  }

  /* CONSULT C — the old cyan→magenta gradient hairline is deleted; the
     freed ::after is a thin electric scan-stripe sitting on the bus (1px,
     low-alpha, static): the bottom edge reads as a lit seam. */
  .shell::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg,
      transparent 0%,
      color-mix(in srgb, var(--dn-electric) 55%, transparent) 18%,
      color-mix(in srgb, var(--dn-electric) 70%, transparent) 50%,
      color-mix(in srgb, var(--dn-electric) 55%, transparent) 82%,
      transparent 100%);
    opacity: 0.6;
  }
  /* CONSULT E §3: static SOLDER PADS on the bus - the rail reads as wired,
     not painted. repeating-gradient masked to the bottom 2px, zero loops. */
  .bus-rail,
  .shell > .bus-rail { overflow: hidden; }
  .bus-pads {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 2px;
    pointer-events: none;
    z-index: 0;
    background: repeating-linear-gradient(90deg,
      transparent 0 46px,
      color-mix(in srgb, var(--dn-electric-dim) 70%, transparent) 46px 48px);
  }

  /* CONSULT C — the electric rider: a bright pulse traversing the bus.
     One new desktop loop, transform-only, parked on phone + reduced-motion. */
  /* The content lift: header children sit above the two decorative bus
     spans (z 0). The lift must NOT catch those spans themselves — catching
     .bus-pads turned it into a grid item, which pushed the tools onto a
     second grid row that hung BELOW the 3.25rem bar and OVER the page
     content (the reader-header collision the real-browser sweep caught at
     390px, 2026-10-31). Both spans restore their own absolute positioning
     right below; :not() keeps this rule from ever competing with them. */
  .shell > :not(.bus-rail):not(.bus-pads) { position: relative; z-index: 1; }
  .bus-rail {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;            /* rides ON the 2px bus line */
    height: 2px;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .bus-rail::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 18%;
    height: 100%;
    background: linear-gradient(90deg,
      transparent,
      color-mix(in srgb, var(--dn-electric) 72%, white 28%) 50%,
      transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--dn-electric) 90%, transparent);
    transform: translateX(-18%);
    animation: dn-bus 2.6s ease-in-out infinite alternate;
  }
  @keyframes dn-bus {
    from { transform: translateX(-18%); }
    to   { transform: translateX(560%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .bus-rail::before { animation: none; opacity: 0; }
  }

  .brand {
    font-family: var(--dn-font-display);
    font-size: var(--dn-text-md);
    font-weight: 400;
    letter-spacing: var(--dn-track-tight);
    text-transform: uppercase;
    /* CONSULT E §3: no plate — the brand is mark 20px + wordmark 15px/600
       with a 1px electric CHROMATIC FRINGE (static text-shadow). Hover/focus
       lights the full split: pink left, electric right. Electricity is a
       STATE, not wallpaper. */
    font-size: 0.9375rem;
    font-weight: 600;
    border: none;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
  }
  .brand .wordmark {
    text-shadow: 1px 0 0 color-mix(in srgb, var(--dn-electric) 45%, transparent);
  }
  .brand:hover .wordmark,
  .brand:focus-visible .wordmark {
    text-shadow:
      -2px 0 0 color-mix(in srgb, var(--dn-accent-2) 55%, transparent),
      2px 0 0 color-mix(in srgb, var(--dn-electric) 65%, transparent);
  }
  /* The wordmark: the white->electric filament ramp (consult E §1) +
     the 1px fringe above. background-clip keeps it text. */
  .brand .wordmark {
    background: var(--dn-wordmark);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  :global([data-theme='light']) .brand .wordmark {
    background: none;
    color: var(--dn-fg);
    -webkit-text-fill-color: var(--dn-fg);
    /* Paper arm: 2px electric under-rule 4px below the baseline. */
    box-shadow: 0 6px 0 -4px var(--dn-electric);
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme])) .brand .wordmark {
      background: none;
      color: var(--dn-fg);
      -webkit-text-fill-color: var(--dn-fg);
      box-shadow: 0 6px 0 -4px var(--dn-electric);
    }
    /* CONSULT D (F3): the fixed hintkey stops flip on OS-light too. */
    :global(:root:not([data-theme])) .tool.kbd .hintkey { color: #1a4fb3; }
  }


  /* CONSULT E §3: LEFT CAP RAIL — a 2px x 100% electric spine at x:0 with a
     10px x 6px dim notch at vertical centre. The bar has a physical left
     edge now; static, non-text (electric on raise = 4.1:1, floor 3:1). */
  .shell::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 2px;
    width: 2px;
    background: var(--dn-electric);
    pointer-events: none;
  }
  .shell::before {
    background:
      linear-gradient(var(--dn-electric-dim), var(--dn-electric-dim)) center / 10px 6px no-repeat,
      var(--dn-electric);
  }

  /* Segmented control: square cells, brackets around the label so an active
     mode reads as a selected switch rather than a painted pill. */
  .modes {
    display: flex;
    gap: 0.15rem;
    font-family: var(--dn-font-mono);
    font-size: 0.72rem;
    letter-spacing: var(--dn-track);
    margin-left: 0.4rem;
  }
  .seg {
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.3em 0.7em;
    cursor: pointer;
    transition: color 120ms, border-color 120ms, box-shadow 120ms;
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }

/* Phone tap-target: 44px is already set inside the ≤600px block, but
   the padding default for a mid-size viewport leaves the segment at
   ~34px. Land a floor of 40px at every width so no chrome is
   thumb-hostile on a tablet-in-portrait / 599px viewport. */
.seg {
  min-height: 40px;
  min-width: 40px;
}
  .seg:hover { color: var(--dn-fg); border-color: var(--dn-accent-dim); }
  .seg.active {
    /* CONSULT E §3: active label takes the TEXT-SAFE accent (6.2:1) — the
       fill tier never carries text. */
    color: var(--dn-accent);
    font-weight: 600;
    border-color: transparent;
    /* The lead tick: a 3px electric mark on the cell's left edge — the
       bracket pair's replacement, positioned by the same measured thumb. */
    box-shadow: inset 3px 0 0 var(--dn-electric);
  }
  /* The sliding thumb paints the fill: one lit block gliding between the
     segments (measured, so unequal labels are honest), a spring on it.
     DS-COOLEST directive 20: the halo is gone — the thumb is already a lit
     keycap by shape; fill + border carry it. */
  .modes { position: relative; }
  .seg-thumb {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 2px;
    /* CONSULT E §3: the keycap — 16% electric fill, 72% edge, and the
       inset white highlight that makes it read as a physical cap. The
       outer glow is dead (directive 20). */
    background: color-mix(in srgb, var(--dn-electric) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-electric) 72%, transparent);
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent);
    transition: transform 220ms cubic-bezier(0.3, 1.3, 0.35, 1),
      width 220ms cubic-bezier(0.3, 1.3, 0.35, 1);
    pointer-events: none;
  }
  /* Press feedback everywhere: 1px sink + a brightness kick. */
  .seg:active, .tool:active, .brand:active {
    transform: translateY(1px);
    filter: brightness(1.25);
  }
  /* CONSULT E §2: the spark pulse RETIRES — a static lit glyph. One loop
     dead by name (loop ledger: desktop budget down to 2 steady states). */
  .spark { color: var(--dn-accent); }
  .seg.active .spark { color: var(--dn-electric); }

  /* CONSULT C (E4) + CONSULT D (F3 fix): search is the electric action —
     the ⌕ ⌘K affordance wears the chrome rail's hue; the hintkey uses
     fixed AA-safe electric stops (#4d94ff = 4.62:1 dark, #1a4fb3 = 5.71:1
     paper) after the color-mix recipe failed the text bar. */
  .tool.kbd { color: var(--dn-electric-dim); }
  .tool.kbd .hintkey { color: #4d94ff; }
  .tool.kbd:hover { color: var(--dn-electric); border-color: color-mix(in srgb, var(--dn-electric) 65%, transparent); }

  .tools { display: flex; align-items: center; }
  /* CONSULT E §3: the KEYCAP BANK — four independent outlines become one
     40px-tall bordered strip; 1px dividers; cells 40x40. Hover = cell fill
     10% electric + glyph to the text-safe accent. */
  .bank {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--dn-hairline);
    border-radius: 2px;
    height: 40px;
  }
  .bank .tool {
    border: none;
    border-radius: 0;
    min-width: 40px;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .bank .tool + .tool { border-left: 1px solid color-mix(in srgb, var(--dn-fg) 12%, transparent); }
  .bank .tool:hover { background: color-mix(in srgb, var(--dn-electric) 10%, transparent); color: var(--dn-accent); }
  /* The live readout: how much corpus is behind this interface.
     FULL-RIGHTS OP-52 + CONSULT C — the framing reticle arms flip to
     electric blue (the header is now the electric instrument); the LED
     itself STAYS acid (live = acid contract). DOWN still flips everything
     to the broken-wire pink. */
  .status {
    /* CONSULT E §3: the status PLATE — 1px electric 30% frame, 2px acid left
       cap (live = acid contract), tabular figures. */
    --dn-src: var(--dn-electric);
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-tight);
    color: var(--dn-fg-faint);
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    margin-right: 0.5rem;
    white-space: nowrap;
    padding: 0 0.65em 0 0.55em;
    min-height: 28px;
    font-variant-numeric: tabular-nums;
    border: 1px solid color-mix(in srgb, var(--dn-electric) 30%, transparent);
    border-left: 2px solid var(--dn-acid);
  }
  .status.down { --dn-src: var(--dn-accent-2); border-left-color: var(--dn-accent-2); }
  /* The 3-bar meter: live reads as a rising signal (4/7/10px, acid). The
     7px LED dot is retired. Bars are decorative — the text names the state. */
  .status .meter {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
  }
  .status .meter i {
    width: 2px;
    background: var(--dn-acid);
  }
  .status .meter i:nth-child(1) { height: 4px; }
  .status .meter i:nth-child(2) { height: 7px; }
  .status .meter i:nth-child(3) { height: 10px; }
  /* DOWN: one bar remains, pink, square — the non-colour cue. */
  .status.down .meter i:nth-child(2),
  .status.down .meter i:nth-child(3) { display: none; }
  .status.down .meter i:nth-child(1) {
    height: 10px;
    width: 6px;
    background: var(--dn-accent-2);
    outline: 1px solid var(--dn-amber);
    outline-offset: 1px;
  }
/* Light material for the shell: the solid translucent fill on paper
   picks up the raised surface cleanly, and the signal rail drops to a
   darker ink line so it does not wash out. */
:global([data-theme='light']) .shell {
  background: color-mix(in srgb, var(--dn-bg-raise) 96%, transparent);
  border-bottom-color: var(--dn-electric);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dn-electric) 22%, transparent);
}
:global([data-theme='light']) .shell::after {
  background: linear-gradient(90deg,
    transparent 0%,
    color-mix(in srgb, var(--dn-electric) 45%, transparent) 18%,
    color-mix(in srgb, var(--dn-electric) 60%, transparent) 50%,
    color-mix(in srgb, var(--dn-electric) 45%, transparent) 82%,
    transparent 100%);
  opacity: 0.7;
}
:global([data-theme='light']) .seg-thumb {
  background: color-mix(in srgb, var(--dn-electric) 10%, transparent);
  border-color: color-mix(in srgb, var(--dn-electric) 60%, transparent);
  box-shadow: none;
}
:global([data-theme='light']) .tool.kbd .hintkey { color: #1a4fb3; }
  .status.down { color: var(--dn-amber); }
  .tool {
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-sm);
    letter-spacing: var(--dn-track-tight);
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.3em 0.6em;
    cursor: pointer;
    transition: all 120ms;
  }

/* Same 40px floor for header tools at all widths. On phones they get
   hidden or bumped to 44px in their own block; here is the middle of
   the ramp. */
.tool {
  min-height: 40px;
  min-width: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
  .tool:hover {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 65%, transparent);
    /* DS-COOLEST directive 20: no halo — the border + color carry hover. */
  }
  .tool .hintkey { color: var(--dn-fg-faint); font-size: var(--dn-text-2xs); margin-left: 0.3em; }

  @media (max-width: 900px) {
    /* The instrument reading is the first thing to go; the buttons stay. */
    .status { display: none; }
  }
@media (max-width: 600px) {
  /* Every header control is a 44px square, sized for a thumb. Icons only
     (labels are still present for screen readers via aria-label). */
  .seg {
    padding: 0;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }
  .seg .seg-txt { display: none; }
  .seg .seg-ico { font-size: 1.2rem; }

  .tool {
    min-width: 44px;
    min-height: 44px;
    padding: 0.3em 0.5em;
  }

  /* The keyboard shortcut and keymap buttons are useless on touch; park
     them. The brand, the two mode segments, and the theme/lite toggles
     fit comfortably at 390px with these sizes. */
  .tool.kbd, .tool.keys { display: none; }

  .shell {
    padding: env(safe-area-inset-top, 0px)
             max(0.5rem, env(safe-area-inset-right, 0px))
             0
             max(0.5rem, env(safe-area-inset-left, 0px));
    gap: 0.5rem;
  }

  /* The status hint chip would collide with the mode segments and the
     theme toggle at 390px. Its information is duplicated on the home page
     panel; hide it here. */
  .status { display: none; }

  /* Fit the logo + segments + 2 tools within 390px: the brand shortens
     to the mark plus 3-letter prefix, which is what the design language
     already suggests (a node in cross-section IS the mark). */
  .brand { font-size: var(--dn-text-sm); letter-spacing: var(--dn-track-tight); }

  /* Controls panel (only shown in graph mode) still fits. */
  .controls {
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
    padding: 0.5rem 0.7rem;
    top: max(0.5rem, env(safe-area-inset-top, 0px));
  }
  .controls > summary {
    display: flex;
    align-items: center;
    gap: 0.5em;
    min-height: 44px;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--dn-fg);
    cursor: pointer;
    list-style: none;
  }
  .controls > summary::-webkit-details-marker { display: none; }
  .controls > summary .dn-neuron-mark { width: 0.7em; height: 0.7em; }
  .controls > summary .chev { margin-left: auto; color: var(--dn-fg-muted); }
  .controls[open] > summary .chev { transform: rotate(180deg); }
  .scope, .layout {
    font-size: 0.72rem;
    padding: 0.5em 0.85em;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
  }
  .scope ~ .layout { bottom: calc(2.9rem + env(safe-area-inset-bottom, 0px)); }
}


  .synapse-mode {
    position: relative;
    height: calc(100dvh - var(--dn-header-h));
    min-height: 0;
  }
  .canvas-wrap { position: absolute; inset: 0; }
  /* The scope chip lives bottom-left over the canvas: that is the corner the
     eye returns to after reading a count, and it is where orui puts its own
     `⤢ Fit` — same pocket, same meaning ("what you are looking at, and how to
     change it"). */
  .scope {
    position: absolute;
    left: 0.9rem;
    bottom: 0.9rem;
    z-index: 5;
    font: inherit;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg);
    /* Solid fill, no backdrop-filter — the chip floats over the canvas
       and a blur there is the worst place for one. */
    background: color-mix(in srgb, var(--dn-bg) 90%, transparent);
    border: 1px solid var(--dn-border-strong);
    border-radius: 0;
    padding: 0.35em 0.75em;
    cursor: pointer;
    max-width: min(30rem, calc(100vw - 2rem));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scope:hover {
    color: var(--dn-accent);
    border-color: var(--dn-accent);
  }

  /* Layout chip: the same HUD pill, and when the scope chip is out it stacks
     ABOVE it rather than sharing a corner with a variable-length label — the
     scope chip can run to nearly the viewport width, so side by side would
     collide on a phone. */
  .layout {
    position: absolute;
    left: 0.9rem;
    bottom: 0.9rem;
    z-index: 5;
    font: inherit;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg);
    background: color-mix(in srgb, var(--dn-bg) 90%, transparent);
    border: 1px solid var(--dn-border-strong);
    border-radius: 0;
    padding: 0.35em 0.75em;
    cursor: pointer;
  }
  .scope ~ .layout { bottom: 2.9rem; }
  .layout:hover {
    color: var(--dn-accent);
    border-color: var(--dn-accent);
  }
  .layout.spread {
    color: var(--dn-accent);
    border-color: var(--dn-accent);
    background: color-mix(in srgb, var(--dn-accent) 12%, var(--dn-bg));
  }

/* F1: light scope/layout chips (relocated from the home patch — these
   classes live in the shell over the graph canvas). The black-glass fill
   is the wrong material on paper: opaque raised surface, neutral hairline. */
:global([data-theme='light']) .scope,
:global([data-theme='light']) .layout {
  background: var(--dn-bg-raise);
  border-color: var(--dn-border-strong);
  color: var(--dn-fg);
}
:global([data-theme='light']) .layout.spread {
  background: color-mix(in srgb, var(--dn-accent) 8%, var(--dn-bg-raise));
  border-color: var(--dn-accent);
  color: var(--dn-accent);
}

/* TRAIL (2026-10-31 spec): the trail chip owns the bottom-left pocket at
   left:12px / bottom:12px+safe — the pocket the scope/layout chips lived
   in. When a trail is on the field they climb rather than collide: the
   trail's position is the spec's, the other two keep their stack shape
   above it (trail top + 8px breath, then one chip-height step). Desktop
   chips are ~28px tall, phone chips 44px — hence the two offsets. */
.trail-up .scope { bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
.trail-up .layout { bottom: calc(92px + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 700px) {
  .trail-up .scope { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  .trail-up .layout { bottom: calc(116px + env(safe-area-inset-bottom, 0px)); }
}
/* Screenshot review r2: with the trail sheet OPEN, the climbed chips share
   its exact pocket (scope bottom:60px == panel bottom) and the scope chip's
   tail poked out beside the sheet's CLEAR action — a garbled floating
   fragment. While the sheet is open the two chips give way. The rule lives
   in the GLOBAL sheet (styles/docneural-ui.css): Svelte prunes a scoped
   selector it cannot prove used, and :has([data-trail-open]) points at the
   graph component's root, invisible to the scoped analyzer. */

  /* Controls panel: desktop floats over the canvas top-left; the summary
     doubles as the live wire-count badge. Notched corner + brackets = it
     reads as a module clamped onto the board. SIGNAL pass: neon edge + a
     slightly deeper fill, so the module reads as glass over the field. */
  .controls {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    width: 250px;
    z-index: 2;
    padding: 0.7rem;
    border: 1px solid color-mix(in srgb, var(--dn-accent) 30%, var(--dn-border-strong));
    border-radius: 2px;
    background: color-mix(in srgb, var(--dn-bg-raise) 92%, color-mix(in srgb, var(--dn-bg-sunken) 65%, transparent));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 18%, transparent),
      0 12px 34px color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
  }
  .controls > summary {
    display: none; /* desktop: always open, no header needed */
  }

  .reader-mode {
    height: calc(100dvh - var(--dn-header-h));
    min-height: 0;
  }

  .fatal {
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
  }
  /* OP-56: the failure panel is the one place pink leads — a 2px left cap
     on an electric frame. Colour never carries the meaning alone: the
     heading names the failure and .why is accent-2 text in both themes. */
  .fatal .panel { border-left: 2px solid var(--dn-accent-2); }
  .panel .kicker {
    margin: 0;
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track-wide);
    color: var(--dn-accent-dim);
  }
  /* One panel for both states a visitor can be stuck on: loading, and failed.
     Real borders, real contrast, no fake window chrome — the terminal feel
     lives in the type and the corners, not in a pretend tty. SIGNAL pass:
     neon edge, deeper floor, sharper notch. */
  .panel {
    width: min(38rem, 100%);
    display: grid;
    gap: 0.7rem;
    justify-items: start;
    padding: 1.6rem 1.8rem;
    border: 1px solid color-mix(in srgb, var(--dn-electric) 45%, var(--dn-border-strong));
    border-radius: 4px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--dn-accent) 5%, transparent), transparent 42%),
      var(--dn-bg-raise);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 16%, transparent),
      0 16px 44px color-mix(in srgb, var(--dn-bg-sunken) 85%, transparent);
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  }

/* Light panels: the linear-gradient overlay on the failure/boot panel
   is invisible on white and the deep box-shadow reads as a grey halo.
   Flatten to a paper card. */
:global([data-theme='light']) .panel {
  background: var(--dn-bg-raise);
  border-color: var(--dn-border-strong);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--dn-border) 60%, transparent);
}
:global([data-theme='light']) .controls {
  background: var(--dn-bg-raise);
  border-color: var(--dn-border-strong);
  box-shadow: none;
}
  .panel .dn-neuron-mark { width: 1rem; height: 1rem; }
  .panel h2 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg);
  }
  .panel .why {
    margin: 0;
    font-size: 0.92rem;
    color: var(--dn-accent-2);
  }
  .panel .hint {
    margin: 0;
    font-size: 0.92rem;
    color: var(--dn-fg);
  }
  .panel .hint { line-height: 1.55; }
  .panel .hint code {
    font-family: var(--dn-font-mono);
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border);
  }
  .retry {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #ffffff;
    /* OP-56: electric fill, white ink — violet retires from the UI. */
    background: var(--dn-electric);
    border: none;
    border-radius: 3px;
    padding: 0.6em 1.4em;
    cursor: pointer;
    box-shadow: 0 0 18px color-mix(in srgb, var(--dn-electric) 40%, transparent);
  }
  .retry:hover { box-shadow: var(--dn-glow); filter: brightness(1.15); }

  .boot-wrap {
    display: grid;
    place-items: center;
    padding: 3rem 1rem;
  }
  /* CONSULT E §4: the boot — board floor, 1px electric 28% frame, .dn-hud
     brackets. Timeline is ONE-SHOT (<=900ms): 90ms fade-in, the scan bar
     crosses the charge line once at t=120ms, rows rise staggered from
     t=240ms, bars settle at t=600ms. NO infinite loop at all (the ruling
     permitted one; the one-shot scan carries the energy without it). */
  .boot {
    width: min(38rem, 100%);
    padding: 1.6rem 1.8rem;
    display: grid;
    gap: 0.55rem;
    background: var(--dn-bg);
    border: 1px solid color-mix(in srgb, var(--dn-electric) 28%, transparent);
    animation: boot-in 90ms ease-out both;
  }
  @keyframes boot-in { from { opacity: 0; } }
  .boot .brand-row {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5em;
    animation: boot-rise 180ms steps(3) 60ms both;
  }
  .boot .boot-mark {
    font-family: var(--dn-font-display);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: var(--dn-track-tight);
    background: var(--dn-wordmark);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  :global([data-theme='light']) .boot .boot-mark {
    background: none;
    color: var(--dn-fg);
    -webkit-text-fill-color: var(--dn-fg);
  }
  .boot .count { margin-left: auto; color: var(--dn-fg-faint); font-size: var(--dn-text-2xs); }
  .boot .charge {
    position: relative;
    height: 2px;
    background: color-mix(in srgb, var(--dn-electric) 30%, transparent);
    overflow: hidden;
  }
  .boot .charge .scan {
    position: absolute;
    top: 0;
    left: 0;
    width: 22%;
    height: 100%;
    background: linear-gradient(90deg, transparent,
      color-mix(in srgb, var(--dn-electric) 95%, white 5%) 50%, transparent);
    animation: boot-scan 520ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms 1 both;
  }
  @keyframes boot-scan {
    from { transform: translateX(-110%); }
    to { transform: translateX(460%); }
  }
  .boot .row { margin: 0; }
  .boot .idx {
    color: var(--dn-fg);
    letter-spacing: var(--dn-track);
    font-size: var(--dn-text-sm);
    animation: boot-rise 200ms ease-out 240ms both;
  }
  .boot .idx b { color: var(--dn-accent); font-weight: 600; }
  .boot .sub {
    color: var(--dn-fg-muted);
    font-size: var(--dn-text-sm);
    animation: boot-rise 200ms ease-out 320ms both;
  }
  .boot .volts {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 22px;
    margin-top: 0.2rem;
  }
  .boot .volts i {
    width: 6px;
    background: var(--dn-electric);
    animation: boot-volt 300ms cubic-bezier(0.2, 0.8, 0.2, 1) 600ms both;
  }
  .boot .volts i:nth-child(1) { height: 6px; }
  .boot .volts i:nth-child(2) { height: 10px; }
  .boot .volts i:nth-child(3) { height: 14px; }
  .boot .volts i:nth-child(4) { height: 18px; }
  .boot .volts i:nth-child(5) { height: 22px; background: var(--dn-acid); }
  @keyframes boot-volt { from { height: 2px; } }
  @keyframes boot-rise {
    from { opacity: 0; transform: translateY(6px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .boot, .boot .scan, .boot .brand-row, .boot .row, .boot .volts i { animation: none; }
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: color-mix(in srgb, var(--dn-bg-sunken) 72%, transparent);
  }
  .help {
    width: min(34rem, 100%);
    border-radius: 2px;
    padding: 1.4rem 1.6rem;
  }
  .help h3 {
    margin: 0 0 0.6rem;
    font-size: var(--dn-text-xs);
    letter-spacing: var(--dn-track);
    color: var(--dn-electric);
    /* OP-56: an acid live-dot leads the keymap title; no glow (directive 20). */
  }
  .help h3::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 0.5em;
    background: var(--dn-acid);
    vertical-align: 1px;
  }
  .blurb { color: var(--dn-fg-muted); font-size: var(--dn-text-sm); line-height: 1.6; margin: 0 0 1rem; }
  .blurb em, .blurb strong { color: var(--dn-fg); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; }
  dt {
    font-family: var(--dn-font-mono);
    font-size: var(--dn-text-sm);
    color: var(--dn-accent);
    border: 1px solid var(--dn-border);
    border-bottom: 2px solid var(--dn-accent);
    padding: 0.05em 0.45em;
    background: color-mix(in srgb, var(--dn-bg-raise) 80%, transparent);
    justify-self: start;
  }
  dd { margin: 0; font-size: var(--dn-text-sm); color: var(--dn-fg-muted); }
  .close {
    margin-top: 1.2rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #ffffff;
    background: var(--dn-electric);
    border: none;
    border-radius: 2px;
    padding: 0.4em 1.2em;
    cursor: pointer;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
  }

/* Light "help" dialog: the accent-on-sunken fill (cyan-ink text on the
   pale sunken floor) lands at 5.1:1 — pass. But the danger is the
   inverse case, so light mode gives the close button a full ink icon
   plus a border, so it does not rely solely on the filled background. */
:global([data-theme='light']) .close {
  background: var(--dn-electric);
  border: 1px solid var(--dn-accent-dim);
  color: #ffffff;
}
:global([data-theme='light']) .retry {
  color: #ffffff;
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--dn-electric) 60%, #000000);
}
  .close:hover { background: var(--dn-hot); }
  @keyframes dn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* PERF-MOBILE (≤700px): the phone gets the static board. The home page
     scrolls the DOCUMENT natively (no more nested 100dvh scroller inside a
     100dvh shell — that is what made the phone feel like a shrunken desktop:
     trapped scroll, URL-bar fights, clipped content), so the header sticks
     like a real mobile nav. DocReader's section keeps its own established
     phone scroller. Last in the cascade so the parks outrank the base loops.
     Desktop is untouched. */
@media (max-width: 700px) {
  .reader-mode { overflow-y: auto; }

  /* Sticky header: solid translucent fill, no backdrop-filter. z 40 sits
     under the scanline overlay (60), over page content. */
  .shell {
    position: sticky;
    top: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--dn-bg-raise) 96%, transparent);
  }
  .shell::after { animation: none; }
  .bus-rail::before { animation: none; opacity: 0; }
  .spark { animation: none; }
  .boot, .boot .scan, .boot .brand-row, .boot .row, .boot .volts i { animation: none; }

  /* The controls panel's clip-path notch relies on a fixed pixel clip; at
     narrow widths the corner should shrink so it does not eat the summary
     text. */
  .controls { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%); }
}

</style>
