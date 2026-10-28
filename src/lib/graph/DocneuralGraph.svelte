<script lang="ts">
  // DocneuralGraph — the "synapses" hero view, driven by the REAL
  // org-roam-lite-ui graph engine (Layer 2 of the embed playbook): we mount
  // orui's own GraphView against orui's own observable store, and feed that
  // store from docneural-ui's static graph.json instead of Emacs's WebSocket.
  //
  // Why the genuine component instead of docneural-ui's port: upstream keeps
  // improving the canvas (theme-token repaints, focus tweens, warmup
  // tuning); aliasing `orui/*` (see vite.config) means we inherit every
  // fix with zero port work.
  //
  // Bridge rules, in order of consequence:
  //  - PAINTING: GraphView accepts no custom-painter prop — the neuron look
  //    (glow rings, node titles, firing-synapse particles) is injected via
  //    the loadEngine seam. See neuronEngine.ts.
  //  - FILTERS: docneural-ui's tag chips are INCLUSIVE ("show docs carrying one of
  //    these tags"), orui's store filter only excludes. So instead of
  //    mapping the filter across, we swap whole snapshots: the effect reads
  //    `store.visible` (filteredGraph over query+tags) and re-applies.
  //    GraphView reuses its engine-side node objects BY ID across syncs, so
  //    the physics (positions, velocities) survive every keystroke — only
  //    hidden nodes leave the canvas.
  //  - SELECTION: forwarded through the store's focus-request channel, the
  //    same one Emacs `follow` uses. A plain pan (no `fit`), because the
  //    user never wants a click to also yank the zoom level.
  import GraphView from 'orui/graph/GraphView.svelte'
  import { createGraphStore } from 'orui/state/graphStore'
  import type { OrgRoamNode } from 'orui/api'
  import { toRoam } from './roamBridge'
  import { applyLayout, fitReadable, makeNeuronLoader } from './neuronEngine'
  import type { Blocker } from './spreadForces'
  import type { Engine as NeuronEngine } from './neuronEngine'
  import { neighborIds } from '../core/graph'
  import type { LayoutMode } from '../core/types'
  import type { DocneuralStore } from '../core/store.svelte'

  let {
    store,
    onNodeClick
  }: {
    store: DocneuralStore
    onNodeClick: (id: string) => void
  } = $props()

  const roam = createGraphStore()

  // Data, query or tags moved -> swap the snapshot the canvas sees.
  $effect(() => {
    roam.applyGraphdata(toRoam(store.visible))
  })

  // A selection made anywhere (rail, palette, reader) pans the camera.
  // Fresh request object per run is the contract: GraphView acts on focus
  // IDENTITY and ignores repeats, so old selections do not re-tween.
  // The same effect updates the plain vars the neuron painter reads per
  // frame — hot set = selection + its 1-hop neighbours.
  let selId: string | null = null
  let selNb: Set<string> = new Set()
  $effect(() => {
    const sel = store.selected
    if (sel) {
      roam.setFocus({ id: sel.id })
      selId = sel.id
      selNb = neighborIds(store.data, sel.id)
    } else {
      selId = null
      selNb = new Set()
    }
  })

  // The wrap element carries the resolved --orui-* / --dn-* tokens the
  // painter samples (same source GraphView polls for its own repaints).
  let wrapEl: HTMLDivElement | undefined = $state()

  // The skeleton that stands in for the canvas while it warms.
  // The engine is a lazy 174 kB chunk and GraphView creates the <canvas> only
  // after it resolves, so on a phone the visitor otherwise stares at a black
  // box for a second or two and reads it as broken. We watch for the element
  // rather than guessing a duration: the skeleton leaves the frame the canvas
  // enters it, on any machine, with no timer to get wrong.
  let painted = $state(false)
  let mo: MutationObserver | undefined = undefined
  $effect(() => {
    const wrap = wrapEl
    if (!wrap || painted) return
    const check = () => {
      if (wrap.querySelector('canvas')) {
        painted = true
        mo?.disconnect()
        mo = undefined
      }
    }
    check()
    if (!painted) {
      mo = new MutationObserver(check)
      mo.observe(wrap, { childList: true, subtree: true })
    }
    return () => {
      mo?.disconnect()
      mo = undefined
    }
  })

  // Layout is the one thing the visitor can ask the canvas for that is not a
  // filter: how far apart the neurons sit. Pushing it means reaching the
  // engine, which GraphView keeps private — so the construction seam hands it
  // back through `onEngine`. That hand-back lands AFTER this component's first
  // effect run (the chunk is a lazy 174 kB download), so the reference must be
  // a $state.raw: the REASSIGNMENT is what has to wake the layout effect below.
  // raw, not $state, because the engine is a live physics object — proxying it
  // deep would tax every tick and could break force-graph's identity checks.
  // (Audit dispatch #2: with a plain `let` here the effect fired at nothing
  // once and never re-ran — the boot layout/park never armed.)
  let engine: NeuronEngine = $state.raw(null)
  let lastMode: LayoutMode | null = null
  let stopArmed = false
  let fitNextStop = false

  // Air kept between the packed field and the canvas edge, in screen px. Small
  // on purpose: `forceFitContainer` already keeps every LABEL inside the rect,
  // so this is breathing room, not clipping protection.
  const PAD = 24

  /** Extra keep-out around a piece of corner chrome, so a name never sits on the
   *  filter drawer's border. */
  const CHROME = 8

  /** The part of this canvas a visitor can actually read, and the room it lost.
   *
   *  Four overlays float over the canvas — the note preview (a side panel on a
   *  laptop, a bottom sheet on a phone), the filter drawer, and the two HUD
   *  chips — and whatever they cover is not canvas anybody can read. Two
   *  different losses, two different answers:
   *
   *  An overlay that SPANS the canvas on one axis has taken a whole slice of it
   *  — a side panel is unreadable from edge to edge — so the room shrinks: an
   *  `inset`, which both the layout and the camera honour.
   *
   *  A chip or drawer takes a CORNER, which is not an edge of the room at all.
   *  Insetting it would shave a full band off the top or bottom of the rect for
   *  38 px of chrome, and the packing wants that band: a citation star packs
   *  portrait, and a landscape room is what drops the fit below 1:1. So it
   *  becomes a `Blocker` — a keep-out box the physics routes around — and the
   *  room stays the big rect the layout wants.
   *
   *  Blockers are WORLD coordinates, and the layout is authored at 1:1 in a room
   *  centred on the origin (d3's `forceCenter` holds the mean there, and
   *  `forceFitContainer` measures its edges from it), so a screen offset IS a
   *  world offset. Measured on the Agenda Views ego graph: inset chrome gave
   *  0.883 with names touching; the same graph with blockers lands at 1:1.
   */
  function viewport(): {
    w: number
    h: number
    inset: { top: number; right: number; bottom: number; left: number }
    blockers: Blocker[]
  } | null {
    const box = wrapEl?.getBoundingClientRect()
    if (!box || !wrapEl) return null
    const inset = { top: 0, right: 0, bottom: 0, left: 0 }
    const corners: DOMRect[] = []
    const root = wrapEl.closest('section') ?? document
    for (const el of root.querySelectorAll('.note-preview, .controls, .scope, .layout')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue // closed <details>, or no selection
      if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom) continue
      if (r.height >= box.height - 2) {
        // A full-height panel: it took the LEFT or the RIGHT of the room.
        if (r.left - box.left < box.right - r.right) inset.left = Math.max(inset.left, r.right - box.left)
        else inset.right = Math.max(inset.right, box.right - r.left)
      } else if (r.width >= box.width - 2) {
        if (r.top - box.top < box.bottom - r.bottom) inset.top = Math.max(inset.top, r.bottom - box.top)
        else inset.bottom = Math.max(inset.bottom, box.bottom - r.top)
      } else {
        corners.push(r)
      }
    }
    // Second pass: the corners are off-centre by whatever the insets did, so
    // they can only be mapped once the visible rect is known.
    const cx = (inset.left + (box.width - inset.right)) / 2
    const cy = (inset.top + (box.height - inset.bottom)) / 2
    const blockers = corners.map((r): Blocker => ({
      x: r.left + r.width / 2 - box.left - cx,
      y: r.top + r.height / 2 - box.top - cy,
      l: r.width / 2 + CHROME,
      r: r.width / 2 + CHROME,
      t: r.height / 2 + CHROME,
      b: r.height / 2 + CHROME
    }))
    return { w: box.width, h: box.height, inset, blockers }
  }

  /** The rect the spread field is packed to fill: the visible canvas, less the
   *  padding the camera keeps — plus the corner chrome it has to route around. */
  function packRect(vp: NonNullable<ReturnType<typeof viewport>>): { w: number; h: number; blockers: Blocker[] } {
    return {
      w: vp.w - vp.inset.left - vp.inset.right - PAD * 2,
      h: vp.h - vp.inset.top - vp.inset.bottom - PAD * 2,
      blockers: vp.blockers
    }
  }

  $effect(() => {
    const mode = store.layout
    const eng = engine
    if (!eng) return
    const boot = lastMode === null
    const changed = mode !== lastMode
    lastMode = mode
    if (!changed) return
    // A first run into the shipped layout must neither reheat nor re-frame:
    // that is already what the canvas looks like. Honouring a stored `spread`
    // is another matter — that one is the visitor's own request, replayed.
    if (boot && mode === 'cluster') return
    // Hand the spread layout the rect it is being packed to fill; cluster is a
    // shape view and takes no container.
    const vp = viewport()
    applyLayout(eng, mode, vp && mode === 'spread' ? packRect(vp) : undefined)
    fitNextStop = true
    if (!stopArmed) {
      stopArmed = true
      // Frame it when the physics FINISH, not on click: the fit reads the
      // current positions, so framing mid-relayout frames the old cluster. One
      // shot because this event also fires after every filter keystroke, and a
      // camera that lurches on each letter is unusable.
      eng.onEngineStop(() => {
        if (!fitNextStop) return
        fitNextStop = false
        const vp = viewport()
        if (!vp || !wrapEl) {
          eng.zoomToFit(420, PAD) // no box yet (detached): take force-graph's word for it
          return
        }
        const { k, w, h } = fitReadable(eng, { w: vp.w, h: vp.h }, {
          pad: PAD,
          inset: vp.inset,
          // 1:1 is the spread layout's authored scale, so never zoom IN past it;
          // cluster is a shape view and takes whatever fit it whole needs.
          maxScale: store.layout === 'spread' ? 1 : Infinity
        })
        wrapEl.dataset.fit = k.toFixed(3)
        // The other half of the evidence: `fit: 0.6` alone cannot tell a camera
        // bug from a layout that packed loose, and both look the same on screen.
        wrapEl.dataset.field = `${Math.round(w)}x${Math.round(h)}`
      })
    }
  })

  const neuronLoad = makeNeuronLoader({
    tokenEl: () => wrapEl,
    selected: () => selId,
    neighbors: () => selNb,
    spread: () => store.layout === 'spread',
    onEngine: (e) => { engine = e }
  })

  function click(node: OrgRoamNode): void {
    onNodeClick(node.id)
  }
</script>

<div class="roam-wrap dn-dish" data-layout={store.layout} bind:this={wrapEl}>
  <!-- loadEngine comes from neuronEngine so the force-graph import resolves
       from SYNAPT's node_modules (Vite resolves bare specifiers relative to
       the importing file, and GraphView.svelte lives in the sibling orui
       checkout) — and so the neuron painting rides in at construction. -->
  <GraphView store={roam} onNodeClick={click} loadEngine={neuronLoad} />
  {#if !painted}
    <!-- Shape, not a spinner: the promise of what is coming (a field of
         neurons) in the pixels it will occupy. Compositor-only (one
         translateX sweep), aria-hidden, and deliberately the LAST child —
         the checks that read the engine's live node count sample
         `.roam-wrap`'s firstElementChild, which must stay GraphView's root. -->
    <div class="skel" aria-hidden="true">
      <span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
      <span class="orb o4"></span><span class="orb o5"></span>
      <span class="sweep"></span>
      <p class="skel-line dn-mono">// laying out {store.data.links.length} connections</p>
    </div>
  {/if}
</div>

<style>
  /* ---------- The pre-canvas skeleton ----------
     Only opacity/transform animate (a Celeron composites those for free), the
     whole thing is ~1 kB of markup, and it leaves the moment a <canvas>
     appears. */
  .skel {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .skel .orb {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dn-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--dn-accent) 70%, transparent);
    opacity: 0.28;
    animation: sk-pulse 1.8s ease-in-out infinite;
  }

/* Light skeleton: the orbs were calibrated for a dark dish; on white
   they read as holes rather than lights. Bump border + shadow so the
   loading state still implies a lit graph on paper. */
:global([data-theme='light']) .skel .orb {
  border: 1px solid color-mix(in srgb, var(--dn-accent) 55%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--dn-accent) 45%, transparent);
}
:global([data-theme='light']) .skel .skel-line {
  color: var(--dn-fg-muted);
}
  /* SIGNAL pass: the skeleton is the graph's promise — so it wears the same
     neon duo the canvas will paint, not a single flat cyan. */
  .skel .o2, .skel .o4 { background: var(--dn-accent-2); box-shadow: 0 0 10px color-mix(in srgb, var(--dn-accent-2) 70%, transparent); }
  .skel .o1 { top: 30%; left: 22%; }
  .skel .o2 { top: 58%; left: 46%; width: 16px; height: 16px; animation-delay: 0.25s; }
  .skel .o3 { top: 26%; left: 68%; animation-delay: 0.5s; }
  .skel .o4 { top: 70%; left: 76%; width: 8px; height: 8px; animation-delay: 0.75s; }
  .skel .o5 { top: 74%; left: 15%; width: 7px; height: 7px; animation-delay: 1s; }
  .skel .sweep {
    /* The sweep is gone: a full-bleed animated gradient on the loading
       state is exactly when the phone can least afford it. The orbs
       resting on their lit frame are the whole skeleton. */
    display: none;
  }

  .skel .skel-line {
    position: absolute;
    left: 0.9rem;
    bottom: 3.1rem;
    margin: 0;
    color: var(--dn-fg-faint);
    font-size: 0.66rem;
    letter-spacing: var(--dn-track);
  }
  @keyframes sk-pulse {
    50% { opacity: 0.42; transform: scale(1.25); }
  }
  @keyframes sk-sweep {
    from { transform: translateX(-40%); }
    to { transform: translateX(40%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .skel .orb, .skel .sweep { animation: none; }
  }
  /* PERF-MOBILE (≤700px): the skeleton rests on its lit frame — a phone
     loading the graph is exactly when it can least afford decorative loops. */
@media (max-width: 700px) {
  /* Zero loops on phone. The skeleton is a printed cluster of lit orbs;
     the reference frame is the whole promise. */
  .skel .orb,
  .skel .sweep { animation: none; }
  .skel .skel-line {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    bottom: 2.6rem;
  }
}

  .roam-wrap {
    position: absolute;
    inset: 0;
    /* Map the site theme onto orui's canvas tokens. GraphView polls the
       container's COMPUTED style twice a second, so these resolved literal
       values (canvas fillStyle cannot parse var()/color-mix(), which is why
       the site carries them as --dn-* tokens per theme in docneural-ui.css)
       repaint the nodes AND wires when the site's theme toggle flips. */
    --orui-link-color: var(--dn-graph-link);
    --orui-node-palette: var(--dn-graph-palette);
    /* The agar dish (dots + vignette) lives in .dn-dish (docneural-ui.css §2b) —
       same treatment, per-theme dot colors, in hero mode and the rail
       mini-map. The canvas paints transparent, so this DOM background IS
       what the neurons sit in. */
  }

/* Light paper for the canvas well: the agar dish grid is now a fine
   grey grid under a warm-white floor, so the neon somas paint with
   contrast. The theme values come from --dn-* tokens (see below). */
:global([data-theme='light']) .roam-wrap {
  background-color: var(--dn-graph-bg);
}
</style>
