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

  // Lite resolution mirrors org-roam-lite-ui: explicit ?lite=1 or the
  // `lite` prop, plus a courtesy auto-detect — a potato with deviceMemory
  // <= 2 GB should never pay for a force-graph simulation it can't run.
  let liteOn = $derived(
    lite ||
      forceLite ||
      new URLSearchParams(location.search).get('lite') === '1' ||
      ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 2
  )

  const store = $derived(new DocneuralStore(base, liteOn))
  $effect(() => {
    void store.load()
  })

  let paletteOpen = $state(false)
  let helpOpen = $state(false)
  let theme = $state<string | null>(null)

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
    forceLite = !forceLite;
    location.reload();
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
  <button class="brand dn-mono" onclick={() => store.goHome()} aria-label="{title} home">
    <span class="dn-neuron-mark" aria-hidden="true"></span>{title.toUpperCase()}
  </button>

  <!-- The mode switch is the site's one big choice — read the text, or read
       the graph — so it never hides. On phones the words and brackets drop
       away and the two glyphs stay, sized for a thumb. -->
  <nav class="modes" aria-label="View mode">
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
    <span class="status dn-mono" class:down={store.failed || !store.ready}>
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
    <div class="panel boot" role="status" aria-live="polite">
      <span class="dn-neuron-mark" aria-hidden="true"></span>
      <h2>{title}</h2>
      <p class="step">reading the graph<span class="dots">…</span></p>
      <p class="step dim">{store.data.nodes.length || '—'} chapters indexed</p>
    </div>
  </div>
{:else if store.mode === 'graph' && !store.lite}
  <section class="synapse-mode">
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
        aria-pressed={store.layout === 'spread'}
        onclick={() => store.toggleLayout()}
        title={store.layout === 'spread'
          ? 'Pack the neurons back into their citation clusters'
          : 'Space every neuron out until its title reads cleanly'}
      >{store.layout === 'spread' ? '▚ titles: spread' : '▦ titles: packed'}</button>
    </div>
    <details class="controls" open={!isPhone}>
      <summary class="dn-mono">
        <span class="dn-neuron-mark" aria-hidden="true"></span>
        <span class="spark">⌁</span> SYNAPSES · {store.visible.links.length} WIRES
        <span class="chev">▾</span>
      </summary>
      <FilterBar {store} />
    </details>
    <NotePreview {store} />
  </section>
{:else if store.selected}
  <section class="reader-mode">
    <DocReader {store} />
  </section>
{:else}
  <Home {store} {title} />
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
    <div class="help dn-hud dn-glass">
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
        <dt>r</dt><dd>read this section aloud (the OS voice; r again stops)</dd>
        <dt>p</dt><dd>build a context pack from the chapters you ticked</dd>
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
    gap: 1rem;
    height: var(--dn-header-h);
    padding: 0 1rem;
    /* A solid ink rail with a lit top edge, not frosted glass: the scanline
       overlay above it does the atmospheric work, and skipping
       backdrop-filter here is a real win on a 4 GB machine. */
    background: color-mix(in srgb, var(--dn-bg-sunken) 92%, transparent);
    border-bottom: 1px solid var(--dn-border-strong);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-src, var(--dn-accent)) 40%, transparent),
      0 1px 0 color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent);
  }
  .brand {
    font-family: var(--dn-font-display);
    font-size: 0.95rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dn-fg);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
  }
  .brand:hover { color: var(--dn-accent); text-shadow: var(--dn-glow); }
  .brand:hover .dn-neuron-mark { box-shadow: 0 0 16px color-mix(in srgb, var(--dn-accent) 70%, transparent); }

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
  .seg .bracket { color: var(--dn-border-strong); }
  .seg:hover { color: var(--dn-fg); border-color: var(--dn-accent-dim); }
  .seg.active {
    color: var(--dn-src, var(--dn-accent));
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 65%, transparent);
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 10%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 22%, transparent);
  }
  .seg.active .bracket { color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 55%, transparent); }
  .spark { color: var(--dn-accent); animation: dn-pulse 2.6s ease-in-out infinite; }
  .seg.active .spark { color: var(--dn-hot); }

  .tools { display: flex; gap: 0.35rem; margin-left: auto; align-items: center; }
  /* The live readout: how much corpus is behind this interface. */
  .status {
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--dn-fg-faint);
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    margin-right: 0.5rem;
    white-space: nowrap;
  }
  .status .led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dn-accent);
    box-shadow: 0 0 8px var(--dn-accent);
    animation: dn-pulse 2.6s ease-in-out infinite;
  }
  .status.down .led { background: var(--dn-amber); box-shadow: 0 0 8px var(--dn-amber); }
  .status.down { color: var(--dn-amber); }
  .tool {
    font-family: var(--dn-font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.3em 0.6em;
    cursor: pointer;
    transition: all 120ms;
  }
  .tool:hover {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 55%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--dn-accent) 18%, transparent);
  }
  .tool .hintkey { color: var(--dn-fg-faint); font-size: 0.68rem; margin-left: 0.3em; }

  @media (max-width: 900px) {
    /* The instrument reading is the first thing to go; the buttons stay. */
    .status { display: none; }
  }
  @media (max-width: 600px) {
    /* Phone. The mode switch stays — hiding it left no way at all to reach
       the graph view — but it becomes two icon buttons sized for a thumb.
       What goes instead are the keyboard affordances, since a phone has no
       keyboard: ⌘K and the shortcut sheet. */
    .seg {
      padding: 0;
      width: 44px;
      height: 44px;
      justify-content: center;
    }
    .seg .bracket, .seg .seg-txt { display: none; }
    .seg .seg-ico { font-size: 1.2rem; }
    .tool.kbd, .tool.keys { display: none; }
    .shell { padding: 0 0.5rem; gap: 0.5rem; }
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
    color: var(--dn-fg-muted);
    background: color-mix(in srgb, var(--dn-bg) 82%, black);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.3em 0.7em;
    cursor: pointer;
    max-width: min(30rem, calc(100vw - 2rem));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scope:hover {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 45%, transparent);
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
    color: var(--dn-fg-muted);
    background: color-mix(in srgb, var(--dn-bg) 82%, black);
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.3em 0.7em;
    cursor: pointer;
  }
  .scope ~ .layout { bottom: 2.9rem; }
  .layout:hover {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 45%, transparent);
  }
  /* On means the visitor asked for it, so it wears the accent like an active
     filter chip does. */
  .layout.spread {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 45%, transparent);
    background: color-mix(in srgb, var(--dn-accent) 12%, var(--dn-bg) 82%, black);
  }
  /* Controls panel: desktop floats over the canvas top-left; the summary
     doubles as the live wire-count badge. Notched corner + brackets = it
     reads as a module clamped onto the board. */
  .controls {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    width: 250px;
    z-index: 2;
    padding: 0.7rem;
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    background: color-mix(in srgb, var(--dn-bg-raise) 94%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 14%, transparent),
      0 10px 30px color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
  }
  .controls > summary {
    display: none; /* desktop: always open, no header needed */
  }
  @media (max-width: 600px) {
    .controls {
      left: 0.5rem;
      right: 0.5rem;
      width: auto;
      padding: 0.5rem 0.7rem;
    }
    .controls > summary {
      display: flex;
      align-items: center;
      gap: 0.5em;
      font-size: 0.7rem;
      letter-spacing: 0.12em;
      color: var(--dn-fg-muted);
      cursor: pointer;
      list-style: none;
    }
    .controls > summary::-webkit-details-marker { display: none; }
    .controls > summary .dn-neuron-mark { width: 0.7em; height: 0.7em; }
    .controls > summary .chev { margin-left: auto; color: var(--dn-fg-faint); }
    .controls[open] > summary .chev { transform: rotate(180deg); }
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
     lives in the type and the corners, not in a pretend tty. */
  .panel {
    width: min(38rem, 100%);
    display: grid;
    gap: 0.7rem;
    justify-items: start;
    padding: 1.6rem 1.8rem;
    border: 1px solid var(--dn-border-strong);
    border-radius: 4px;
    background: var(--dn-bg-raise);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
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
    letter-spacing: 0.04em;
    color: var(--dn-bg);
    background: var(--dn-accent);
    border: none;
    border-radius: 3px;
    padding: 0.6em 1.4em;
    cursor: pointer;
  }
  .retry:hover { background: var(--dn-hot); }

  .boot-wrap {
    display: grid;
    place-items: center;
    padding: 3rem 1rem;
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
    font-size: 0.78rem;
    letter-spacing: var(--dn-track);
    color: var(--dn-accent);
    text-shadow: var(--dn-glow);
  }
  .blurb { color: var(--dn-fg-muted); font-size: 0.9rem; line-height: 1.6; margin: 0 0 1rem; }
  .blurb em, .blurb strong { color: var(--dn-fg); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0; }
  dt { font-family: var(--dn-font-mono); font-size: 0.8rem; color: var(--dn-hot); }
  dd { margin: 0; font-size: 0.85rem; color: var(--dn-fg-muted); }
  .close {
    margin-top: 1.2rem;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dn-bg);
    background: var(--dn-accent);
    border: none;
    border-radius: 2px;
    padding: 0.4em 1.2em;
    cursor: pointer;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
  }
  .close:hover { background: var(--dn-hot); }
  @keyframes dn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
