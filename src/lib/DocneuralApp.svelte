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
  let theme = $state<string | null>(null)

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
        paletteOpen = !paletteOpen
        return
      }
      if (e.key === 'Escape') {
        paletteOpen = false
        helpOpen = false
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
  // lands — a HUD that reports 0 nodes looks broken, not technical.
  const status = $derived(
    store.ready
      ? `${store.data.nodes.length} NODES · ${store.data.links.length} WIRES · ${store.manuals.length} SRC`
      : 'LINK DOWN'
  )
</script>

<header class="shell" style={sourceVars(store.manual)}>
  <!-- CONSULT C: the electric bus lives under all header content; the
       bright rider traverses it (one transform-only desktop loop). -->
  <span class="bus-rail" aria-hidden="true"></span>
  <button class="brand dn-mono" onclick={() => store.goHome()} aria-label="{title} home">
    <span class="dn-neuron-mark" aria-hidden="true"></span><span class="wordmark">{title.toUpperCase()}</span>
  </button>

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
    <button class="seg" class:active={store.mode === 'reader'} aria-pressed={store.mode === 'reader'}
      onclick={() => store.setMode('reader')} title="Read the documentation">
      <span class="bracket">[</span><span class="seg-ico" aria-hidden="true">▤</span><span class="seg-txt">DOCS</span><span class="bracket">]</span>
    </button>
    {#if !store.lite}
      <button class="seg" class:active={store.mode === 'graph'} aria-pressed={store.mode === 'graph'}
        onclick={() => store.setMode('graph')} title="See the citations as a graph">
        <span class="bracket">[</span><span class="seg-ico spark" aria-hidden="true">⌁</span><span class="seg-txt">SYNAPSES</span><span class="bracket">]</span>
      </button>
    {/if}
  </nav>

  <div class="tools">
    <!-- FULL-RIGHTS OP-52: the status line is the instrument's READOUT —
         framed by the 16-arm reticle with acid arms (acid = live), the LED
         inside it, tabular figures. On failure the arms flip pink: a real
         state change you can see at arm's length. -->
    <span class="status dn-mono dn-brackets" class:down={store.failed || !store.ready}>
      <span class="led" aria-hidden="true"></span>{status}
    </span>
    <button class="tool kbd" onclick={() => (paletteOpen = true)} aria-label="Search (Ctrl-K)">
      ⌕ <span class="hintkey">⌘K</span>
    </button>
    <button class="tool keys" onclick={() => (helpOpen = true)} aria-label="Keyboard help">?</button>
    <button class="tool" onclick={toggleLite} aria-label="Toggle lite mode" title="graph engine on/off">
      {store.lite ? 'FAST' : 'FULL'}
    </button>
    <button class="tool" onclick={toggleTheme} aria-label="Toggle theme" title="day / night">
      {theme === 'light' ? '☀' : '☾'}
    </button>
  </div>
</header>

{#if store.failed}
  <!-- A failed fetch is a plain statement of fact: what did not load, the
       reason, one button. No fake shell prompt — the visitor is not in a
       terminal, they are on a website with a missing file. -->
  <div class="fatal">
    <div class="panel" role="alert">
      <span class="dn-neuron-mark" aria-hidden="true"></span>
      <h2>This documentation graph did not load</h2>
      <p class="why">{store.failed}</p>
      <p class="hint">The site builds its graph from an exported corpus. If a
        local build is being served, run <code>make export &amp;&amp; make build</code>.</p>
      <button class="retry" onclick={() => location.reload()}>Reload</button>
    </div>
  </div>
{:else if !store.ready}
  <!-- Loading, not a boot log: the same three real steps (fetch, index, paint)
     stated once, with a live count as soon as the nodes are known. -->
  <div class="boot-wrap">
    <!-- The boot screen, redesigned (Owner law 2026-10-28: the initial loader
         looked dull). Same honest three facts, now staged like the instrument
         waking: a 16-arm reticle ring, the wordmark, the fetch step, an
         electric bus whose rider sweeps while the corpus lands, and the live
         indexed count. Both loops are TRANSIENT - the panel unmounts the
         moment the graph is ready, so steady-state loop budget is untouched;
         phones and reduced-motion get the static board (parks below). -->
    <div class="panel boot" role="status" aria-live="polite">
      <div class="boot-reticle" aria-hidden="true"><span class="core"></span></div>
      <h2>{title}</h2>
      <p class="step">reading the graph<span class="dots">…</span></p>
      <div class="boot-bus" aria-hidden="true"><span class="rider"></span></div>
      <p class="step dim">{store.data.nodes.length || '—'} chapters indexed</p>
    </div>
  </div>
{:else if store.mode === 'graph' && !store.lite}
  <section class="synapse-mode" in:fly={morph}>
    <div class="canvas-wrap">
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
      <!-- The layout chip. Clustered is force-graph's own default, and a
           citation graph naturally knots each doc into a blob — which shows how
           the corpus hangs together but says nothing about what is in it. This
           asks the physics for room per title instead: the other half of the
           overview question, and a preference worth remembering. -->
      <button
        class="layout dn-mono"
        class:spread={store.layout === 'spread'}
        class:lattice={store.layout === 'lattice'}
        onclick={() => store.toggleLayout()}
        title={store.layout === 'spread'
          ? 'Pin every neuron to a fixed-distance grid'
          : store.layout === 'lattice'
            ? 'Pack the neurons back into their citation clusters'
            : 'Space every neuron out until its title reads cleanly'}
      >{store.layout === 'spread'
          ? 'spread · titles'
          : store.layout === 'lattice'
            ? 'grid · fixed'
            : 'packed · titles'}</button>
    </div>
    <details class="controls" open={!isPhone}>
      <summary class="dn-mono">
        <span class="dn-neuron-mark" aria-hidden="true"></span>
        <span class="spark">⌁</span> SYNAPSES · {store.visible.links.length} WIRES
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
        A documentation reader <em>enhanced</em> with an org-roam graph. The written
        word is the home page; <span class="spark">⌁ synapses</span> is the connection
        graph between docs — named for Hebb's law, since every citation resolved
        strengthens the link. It aggregates <strong>any</strong> Org corpus: one
        channel per manual, each with its own hue.
      </p>
      <dl>
        <dt>⌘K / Ctrl-K</dt><dd>command palette (jump anywhere)</dd>
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
    display: flex;
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

  /* CONSULT C — the electric rider: a bright pulse traversing the bus.
     One new desktop loop, transform-only, parked on phone + reduced-motion. */
  .shell > * { position: relative; z-index: 1; }
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
    animation: dn-bus 2.8s ease-in-out infinite alternate;
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
    /* HEADER V2 (Owner: "the header looks dull"): the wordmark sits on a
       nameplate - a hairline-bordered instrument badge with a notched corner,
       so the brand reads as a plate wired to the bus, not bare text. */
    border: 1px solid var(--dn-hairline);
    padding: 0.3em 0.75em 0.3em 0.6em;
    clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%);
    background-color: color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
  }
  /* The wordmark itself is a filament (DS-COOLEST directive 7): the
     white->electric value ramp from --dn-wordmark, no chromatic fringe, no
     hover glow. The nameplate carries the border; the text carries the ramp. */
  .brand .wordmark {
    background: var(--dn-wordmark);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  :global([data-theme='light']) .brand {
    background-color: transparent;
    border-color: var(--dn-hairline);
  }
  :global([data-theme='light']) .brand .wordmark {
    background: none;
    color: var(--dn-fg);
    -webkit-text-fill-color: var(--dn-fg);
  }
  @media (prefers-color-scheme: light) {
    :global(:root:not([data-theme])) .brand .wordmark {
      background: none;
      color: var(--dn-fg);
      -webkit-text-fill-color: var(--dn-fg);
    }
    /* CONSULT D (F3): the fixed hintkey stops flip on OS-light too. */
    :global(:root:not([data-theme])) .tool.kbd .hintkey { color: #1a4fb3; }
  }
  .brand:hover { border-color: color-mix(in srgb, var(--dn-electric) 60%, transparent); }
  .brand:hover .wordmark { color: var(--dn-electric); -webkit-text-fill-color: var(--dn-electric); background: none; }

  /* HEADER V2: corner brackets at the bar's ends - the HUD frame vocabulary,
     electric, static. The bar now reads as a framed instrument, not a strip. */
  .shell::before {
    content: "";
    position: absolute;
    inset: 6px 10px auto 10px;
    height: 8px;
    pointer-events: none;
    background:
      linear-gradient(var(--dn-electric), var(--dn-electric)) left top / 10px 1px,
      linear-gradient(var(--dn-electric), var(--dn-electric)) left top / 1px 8px,
      linear-gradient(var(--dn-electric), var(--dn-electric)) right top / 10px 1px,
      linear-gradient(var(--dn-electric), var(--dn-electric)) right top / 1px 8px;
    background-repeat: no-repeat;
    opacity: 0.85;
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
  .seg .bracket { color: var(--dn-border-strong); }
  .seg:hover { color: var(--dn-fg); border-color: var(--dn-accent-dim); }
  .seg.active {
    color: var(--dn-electric);
    font-weight: 600;
    border-color: color-mix(in srgb, var(--dn-electric) 80%, transparent);
    /* DS-COOLEST directive 20: states come from fill and weight, not halo —
       the sliding thumb owns the fill (below). */
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
    /* CONSULT C — electric blue fill + edge: the active mode's lit keycap. */
    background: color-mix(in srgb, var(--dn-electric) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-electric) 72%, transparent);
    box-shadow: var(--dn-glow-electric);
    transition: transform 220ms cubic-bezier(0.3, 1.3, 0.35, 1),
      width 220ms cubic-bezier(0.3, 1.3, 0.35, 1);
    pointer-events: none;
  }
  /* Press feedback everywhere: 1px sink + a brightness kick. */
  .seg:active, .tool:active, .brand:active {
    transform: translateY(1px);
    filter: brightness(1.25);
  }
  .seg.active .bracket { color: color-mix(in srgb, var(--dn-electric) 55%, transparent); }
  .spark { color: var(--dn-accent); animation: dn-pulse 2.6s ease-in-out infinite; }
  .seg.active .spark { color: var(--dn-electric); }

  /* CONSULT C (E4) + CONSULT D (F3 fix): search is the electric action —
     the ⌕ ⌘K affordance wears the chrome rail's hue; the hintkey uses
     fixed AA-safe electric stops (#4d94ff = 4.62:1 dark, #1a4fb3 = 5.71:1
     paper) after the color-mix recipe failed the text bar. */
  .tool.kbd { color: var(--dn-electric-dim); }
  .tool.kbd .hintkey { color: #4d94ff; }
  .tool.kbd:hover { color: var(--dn-electric); border-color: color-mix(in srgb, var(--dn-electric) 65%, transparent); }

  .tools { display: flex; gap: 0.35rem; margin-left: auto; align-items: center; }
  /* HEADER V2: every tool is a keycap on the electric rail - hover lights the
     same neon edge the bus carries, so the whole bar speaks one language. */
  .tool { transition: color 120ms, border-color 120ms; }
  .tool:hover { color: var(--dn-electric-dim); border-color: color-mix(in srgb, var(--dn-electric) 60%, transparent); }
  /* The live readout: how much corpus is behind this interface.
     FULL-RIGHTS OP-52 + CONSULT C — the framing reticle arms flip to
     electric blue (the header is now the electric instrument); the LED
     itself STAYS acid (live = acid contract). DOWN still flips everything
     to the broken-wire pink. */
  .status {
    --dn-src: var(--dn-electric);   /* was var(--dn-acid) */
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-tight);
    color: var(--dn-fg-faint);
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    margin-right: 0.5rem;
    white-space: nowrap;
    padding: 0.2em 0.65em;
    font-variant-numeric: tabular-nums;
  }
  .status.down { --dn-src: var(--dn-accent-2); }
  .status .led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    /* Acid: the LIVE color (r3). The corpus readout is the one place the site
       says "online", so the LED wears the acid signal, not the accent. The
       perpetual heartbeat is gone (cool-pass OP-15): a lamp that always
       pulses reads as wallpaper — the halo-ring glow IS the live state, and
       dropping the loop frees a desktop motion slot (cap 4 -> 3). */
    background: var(--dn-acid);
    box-shadow:
      0 0 9px var(--dn-acid),
      0 0 20px color-mix(in srgb, var(--dn-acid) 55%, transparent);
  }
  .status.down .led { background: var(--dn-accent-2); box-shadow: 0 0 9px var(--dn-accent-2), 0 0 20px color-mix(in srgb, var(--dn-accent-2) 55%, transparent); }

/* Status LED is never colour-only: the strip text already names the
   state ("connected" / "offline" / "…"), so the LED is decorative. But
   the DOWN state should still read without colour: the LED gets a
   distinct shape (a square outline) so it is not the accent-only cue. */
.status.down .led {
  border-radius: 2px;
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
  .seg .bracket, .seg .seg-txt { display: none; }
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
    border: 1px solid color-mix(in srgb, var(--dn-accent) 34%, var(--dn-border-strong));
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
  .panel .hint, .panel .step {
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
  .panel .dim { color: var(--dn-fg-muted); }
  .panel .dots { color: var(--dn-hot); animation: dn-pulse 1.2s ease-in-out infinite; }
  .panel .step { animation: dn-rise 260ms ease-out both; }
  .panel .step.dim { animation-delay: 0.16s; }
  .retry {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--dn-bg-sunken);
    /* The one saturated CTA on the failure panel: the cyberpunk gradient. */
    background: linear-gradient(135deg, var(--dn-accent), var(--dn-violet));
    border: none;
    border-radius: 3px;
    padding: 0.6em 1.4em;
    cursor: pointer;
    box-shadow: 0 0 18px color-mix(in srgb, var(--dn-accent) 40%, transparent);
  }
  .retry:hover { box-shadow: var(--dn-glow); filter: brightness(1.15); }

  .boot-wrap {
    display: grid;
    place-items: center;
    padding: 3rem 1rem;
  }
  /* BOOT RETICLE: the instrument's iris. A ring of 16 arms (repeating-conic
     gradient, static) around a neon-blue core that breathes ONCE family with
     the dots - both transient (unmount on ready). Static art, zero cost. */
  .panel.boot { text-align: left; }
  .boot-reticle {
    position: relative;
    width: 64px;
    height: 64px;
    margin-bottom: 0.9rem;
    border-radius: 50%;
    background:
      repeating-conic-gradient(
        from 0deg,
        color-mix(in srgb, var(--dn-electric) 75%, transparent) 0deg 3deg,
        transparent 3deg 22.5deg);
    -webkit-mask: radial-gradient(circle, transparent 55%, #000 56%, #000 100%);
    mask: radial-gradient(circle, transparent 55%, #000 56%, #000 100%);
  }
  .boot-reticle .core {
    position: absolute;
    inset: 38%;
    border-radius: 50%;
    background: var(--dn-electric);
    box-shadow: 0 0 14px color-mix(in srgb, var(--dn-electric) 80%, transparent),
      0 0 30px color-mix(in srgb, var(--dn-electric) 35%, transparent);
    animation: dn-pulse 1.2s ease-in-out infinite;
  }
  /* BOOT BUS: the header's electric rail, previewed here - a 2px neon-blue
     bus with one bright rider sweeping while the corpus lands. The visitor
     watches the same wire they are about to scroll under. */
  .boot-bus {
    position: relative;
    width: 100%;
    height: 2px;
    margin: 0.8rem 0 0.9rem;
    background: color-mix(in srgb, var(--dn-electric) 38%, transparent);
    overflow: hidden;
  }
  .boot-bus .rider {
    position: absolute;
    top: 0;
    left: 0;
    width: 22%;
    height: 100%;
    background: linear-gradient(90deg, transparent,
      color-mix(in srgb, var(--dn-electric) 95%, white 5%) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--dn-electric) 70%, transparent);
    animation: dn-bus 2.6s ease-in-out infinite alternate;
  }
  @media (prefers-reduced-motion: reduce) {
    .boot-reticle .core, .boot-bus .rider { animation: none; }
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
    color: var(--dn-accent);
    /* DS-COOLEST directive 20: no glow — the accent color is the state. */
  }
  .blurb { color: var(--dn-fg-muted); font-size: var(--dn-text-sm); line-height: 1.6; margin: 0 0 1rem; }
  .blurb em, .blurb strong { color: var(--dn-fg); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; }
  dt { font-family: var(--dn-font-mono); font-size: var(--dn-text-sm); color: var(--dn-fg); }
  dd { margin: 0; font-size: var(--dn-text-sm); color: var(--dn-fg-muted); }
  .close {
    margin-top: 1.2rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dn-bg-sunken);
    background: var(--dn-accent);
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
  background: var(--dn-accent);
  border: 1px solid var(--dn-accent-dim);
  color: #ffffff;
}
:global([data-theme='light']) .retry {
  color: #ffffff;
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--dn-accent) 60%, #000000);
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
  .status .led { animation: none; }
  .panel .dots { animation: none; }
  .boot-reticle .core { animation: none; }
  .boot-bus .rider { animation: none; opacity: 0; }

  /* The controls panel's clip-path notch relies on a fixed pixel clip; at
     narrow widths the corner should shrink so it does not eat the summary
     text. */
  .controls { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%); }
}

</style>
