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
  import { untrack } from 'svelte'
  import { toRoam } from './roamBridge'
  import { applyLayout, fitReadable, makeNeuronLoader } from './neuronEngine'
  import type { Blocker } from './spreadForces'
  import type { Engine as NeuronEngine } from './neuronEngine'
  import { neighborIds, latticePitch } from '../core/graph'
  import type { DocNode, DocLink, LayoutMode } from '../core/types'
  import { DocneuralStore } from '../core/store.svelte'
  import { trailText, synapseCitation } from '../core/trail'
  import { isBoilerplateCtx } from '../core/vocab'
  import { copyText } from '../core/clipboard'
  import {
    ARROW_BUDGET,
    ARROW_ZOOM_MIN,
    SPACING_MAX,
    SPACING_MIN,
    ZOOM_MAX,
    ZOOM_MIN,
    capSelectedLinks,
    clampSpacing,
    loadLock,
    loadSpacing,
    nextSpacing,
    nextZoom,
    saveLock,
    saveSpacing
  } from '../core/controls'

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
    // Lattice bookkeeping: a filter sync brings nodes the parked simulation
    // will never place (the lattice IS the placement), so the deterministic
    // pass re-runs over the new snapshot — same sort, same rules, one frame
    // of cost. Before the engine hand-back this is a no-op.
    const eng = engine
    if (eng && store.layout === 'lattice') {
      const vp = viewport()
      if (vp) {
        const room = packRect(vp)
        const p = latticePitch(eng.graphData().nodes.length || 1, room.w, room.h)
        latticeK = Math.min(1, (0.36 * p) / 18.33)
        latticeP = p
        if (wrapEl) wrapEl.dataset.pitch = p.toFixed(1)
        applyLayout(eng, 'lattice', room)
        fitNow(eng, vp)
      }
    }
  })

  // A selection made anywhere (rail, palette, reader) pans the camera.
  // Fresh request object per run is the contract: GraphView acts on focus
  // IDENTITY and ignores repeats, so old selections do not re-tween.
  // The same effect updates the plain vars the neuron painter reads per
  // frame — hot set = selection + its 1-hop neighbours — and the capped
  // incident-link set the ARROW tier reads (24 nearest, controls.ts).
  let selId: string | null = null
  let selNb: Set<string> = new Set()
  let selLinks: Set<string> = new Set()
  $effect(() => {
    const sel = store.selected
    if (sel) {
      roam.setFocus({ id: sel.id })
      selId = sel.id
      selNb = neighborIds(store.data, sel.id)
      selLinks = capSelectedLinks(store.data.links, sel.id)
    } else {
      selId = null
      selNb = new Set()
      selLinks = new Set()
    }
  })

  // TRAIL (designer spec 2026-10-31): the painter's inputs, refreshed by one
  // effect — the ordered stops as ENGINE node ids, and the hop keys the
  // honesty rule strokes solid vs dashed from. Plain vars, not $state: the
  // painter reads them every frame and must not pay for a proxy, and they
  // only change when the trail or the corpus does. A hop between consecutive
  // stops rides a REAL wire when store.wire finds one in either direction
  // (a citation read backwards is still a synapse).
  let trailStopIds: string[] = []
  let trailHopKeys: Set<string> = new Set()
  $effect(() => {
    trailStopIds = store.trailResolved.map((n) => n.id)
    const hops = new Set<string>()
    for (let i = 0; i < trailStopIds.length - 1; i++) {
      const a = trailStopIds[i]
      const b = trailStopIds[i + 1]
      if (store.wire(a, b)) {
        hops.add(`${a}>${b}`)
        hops.add(`${b}>${a}`)
      }
    }
    trailHopKeys = hops
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
  // OP-56 lattice radiusScale — somas shrink with the hex pitch (0.36·p/18.33,
  // capped at 1) so a corpus-scale field (p≈24) can never overlap. Recomputed
  // each time the lattice is (re)placed; read per paint via the focus.
  let latticeK = 1
  // The same pitch, world px, read per paint by the neuron painter's label
  // pass: labels render only when pitch·zoom >= 18px on screen (the phone
  // lattice fix — desktop fit ≈31px is unchanged, a phone fit ≈17px stays a
  // clean dot starfield). Kept beside latticeK because it is computed from
  // the very same latticePitch call in both lattice (re)placement paths.
  let latticeP = 0

  // WebGL is the canvas's one hard dependency (force-graph paints GL, not 2D).
  // On a machine with hardware acceleration off — and they exist, or the
  // owner would not have reported "no graphs showing up" — context creation
  // returns null and the dish would sit blank forever, reading as a broken
  // site. One capability probe at mount: fail HONESTLY, in copy, and keep
  // the whole reader usable.
  const webglOk = (() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return false
    }
  })()

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
    for (const el of root.querySelectorAll('.note-preview, .controls, .scope, .layout, .net-controls')) {
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

  /** Frame the current field: the fitReadable call plus the two data-*
   *  evidence attributes. Shared by the engine-stop path (cluster/spread,
   *  which must wait for the physics to finish) and the lattice path (whose
   *  placement is final the moment applyLayout returns — a 0-tick simulation
   *  owes nobody an onEngineStop). */
  function fitNow(eng: NeuronEngine, vp: NonNullable<ReturnType<typeof viewport>>): void {
    const { k, w, h } = fitReadable(eng, { w: vp.w, h: vp.h }, {
      pad: PAD,
      inset: vp.inset,
      // 1:1 is the authored scale of BOTH readable layouts — spread packs the
      // label field to the rect, the lattice authors the hex field to the
      // room — so neither may zoom IN past it at fit time; cluster is a shape
      // view and takes whatever fit it whole needs.
      maxScale: store.layout === 'cluster' ? Infinity : 1,
      // The lattice camera rides a 260ms tween, not an instant set — NOT for
      // looks: force-graph auto-fits the zoom to `4/∛n` whenever a data
      // update lands while the camera sits at its default (k===lastSetZoom,
      // and lastSetZoom ships as 1). A k=1.000 instant fit is INDISTINGUISHABLE
      // from "never fitted", so the engine's first data update stomped it back
      // to 0.36 and the field painted at a third of the canvas (the 2026-10-31
      // "no graphs showing up" bug). A tween never passes through the default
      // value, so the auto-fit's guard `k === lastSetZoom` is false at the
      // moment its check runs, and the fit sticks.
      duration: store.layout === 'lattice' ? 260 : undefined
    })
    if (!wrapEl) return
    wrapEl.dataset.fit = k.toFixed(3)
    wrapEl.dataset.field = `${Math.round(w)}x${Math.round(h)}`
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
    if (mode === 'lattice') {
      // Fixed-distance grid: place + pin, then frame immediately — there is
      // no simulation run to wait for.
      applyLayout(eng, mode, vp ? packRect(vp) : undefined)
      if (vp) {
        const room = packRect(vp)
        const p = latticePitch(eng.graphData().nodes.length || 1, room.w, room.h)
        latticeK = Math.min(1, (0.36 * p) / 18.33)
        latticeP = p
        if (wrapEl) wrapEl.dataset.pitch = p.toFixed(1)
        fitNow(eng, vp)
      }
      return
    }
    // Left the lattice: drop the pitch so the painter's label gate goes inert
    // (pitch <= 0 reads as "unknown" there). A stale phone pitch (~17px) would
    // otherwise keep gating CLUSTER/SPREAD labels at fit zoom after the visitor
    // toggled away — those layouts police their own collisions.
    latticeP = 0
    applyLayout(eng, mode, vp && mode === 'spread' ? packRect(vp) : undefined,
      mode === 'spread' ? { spacingK } : undefined)
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
          // Same 1:1 ceiling as the boot fit above: spread and lattice are
          // authored to the room, cluster is a shape view.
          maxScale: store.layout === 'cluster' ? Infinity : 1
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
    // TRAIL: the reading route (see the effect above). The painter guards
    // everything (compact, <2 stops, unplaced nodes) — these two closures
    // only hand over the current values.
    trail: () => trailStopIds,
    trailHops: () => trailHopKeys,
    // SYNAPSE CLICK (network pass): hover tier + arrow LOD inputs. Plain
    // vars behind closures — the painter/accessors read them every frame.
    hoverLink: () => hoverKey,
    arrowSel: () => selLinks,
    linkCount: () => store.visible.links.length,
    // Label eligibility rides with the layout: spread AND lattice are the two
    // "read the names" views, so both make every neuron's title eligible.
    spread: () => store.layout !== 'cluster',
    // OP-56: lattice somas scale with the hex pitch; cluster/spread keep 1.
    somaScale: () => (store.layout === 'lattice' ? latticeK : 1),
    // Lattice labels ride absolute zoom (see NeuronFocus.lattice): at fit the
    // field shows hub names only, and zooming fills the rest in — but only
    // while the pitch leaves 18px of screen room per name (NeuronFocus
    // .latticePitchPx): on a phone the fit pitch is smaller than the type,
    // and the honest state there is the clean starfield.
    lattice: () => store.layout === 'lattice',
    latticePitchPx: () => latticeP,
    onEngine: (e) => { engine = e }
  })

  function click(node: OrgRoamNode): void {
    onNodeClick(node.id)
  }

  /* ---------- NETWORK CONTROLS (canvas chrome, network pass 2026-10-31) ----------
     One vertical stack, bottom-right: LOCK · SPACING −/+ · ZOOM +/− · FIT.
     Every button is 44×44 with an 8px gap; the stack is DOM chrome over the
     canvas, zero new animation loops — the readout pills fade through a CSS
     transition, the reheat is a bounded force cooldown, and LOCK stops the
     engine's own frame loop entirely (the phone default, so a phone in
     synapses mode runs ZERO rAF loops until the visitor unlocks). */
  const isPhone =
    typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches
  // Boot-time snapshot ON PURPOSE (untrack states that): the lock preference
  // is read once for the layout the canvas mounts with. Layout toggles own
  // their own persistence from there — re-reading store.layout here would
  // not re-read the lock either.
  let locked = $state(loadLock(untrack(() => store.layout), isPhone))
  let spacingK = $state(loadSpacing())
  let zoomNow = $state(1)
  let zoomPillText = $state('')
  let zoomPillShow = $state(false)
  let spacingPillText = $state('')
  let spacingPillShow = $state(false)
  let pillTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let pokeTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let zoomArmed = false

  // Per-layout lock memory (SPEC §3.1): every layout remembers its own
  // freeze state; switching layouts restores it.
  $effect(() => {
    locked = loadLock(store.layout, isPhone)
  })

  // LOCK = force-graph's pauseAnimation: the frame loop STOPS (verified in
  // force-graph 1.51 — it exposes pause/resumeAnimation), which is both the
  // freeze the acceptance checks (2 frames identical) and the phone's
  // 0-loop law. Pan/zoom INPUT still works while locked: the transient poke
  // below resumes for the length of one gesture/settle and re-pauses — the
  // loop is never left running. Selection pans never reheat the physics.
  $effect(() => {
    const eng = engine
    if (!eng) return
    if (locked) {
      clearTimeout(pokeTimer)
      eng.pauseAnimation?.()
    } else {
      eng.resumeAnimation?.()
      // Unlock settle: a bounded reheat (~60 ticks ≈ alpha 0.3, then stop) —
      // never an unbounded full reheat.
      eng.cooldownTicks?.(60)
      eng.cooldownTime?.(800)
    }
  })

  /** While locked: resume just long enough for one camera move/gesture to
   *  paint, then re-pause. The resume is DEFERRED to a macrotask on purpose:
   *  onZoom fires from inside force-graph's `_animationCycle` body (a zoom
   *  tween emits zoom every frame), and a synchronous `resumeAnimation` there
   *  re-enters `_animationCycle` while `animationFrameRequestId` is still null
   *  — nested cycles recursing on every tweened frame until the stack dies
   *  (the phone lock made this fire on boot, 2026-10-31). Deferring also
   *  coalesces: a running tween keeps resetting this timer, so the engine
   *  resumes once, AFTER the gesture settles. Two bounded timers — not loops. */
  function pokeWhileLocked(): void {
    const eng = engine
    if (!eng || !locked) return
    clearTimeout(pokeTimer)
    pokeTimer = setTimeout(() => {
      if (!locked || !engine) return
      engine.resumeAnimation?.()
      pokeTimer = setTimeout(() => {
        if (locked) engine?.pauseAnimation?.()
      }, 600)
    }, 0)
  }

  // The camera scale, reported to the chrome: disabled ends, the readout
  // pill, and the arrow-budget status line all read this.
  $effect(() => {
    const eng = engine
    if (!eng || zoomArmed) return
    zoomArmed = true
    eng.onZoom?.((t: { k?: number }) => {
      if (typeof t?.k === 'number' && t.k !== zoomNow) {
        zoomNow = t.k
        showZoomPill(t.k)
      }
      // Any pan/zoom gesture on a locked canvas gets its paint window.
      if (locked) pokeWhileLocked()
    })
    zoomNow = typeof eng.zoom === 'function' ? eng.zoom() : 1
  })

  function showZoomPill(k: number): void {
    zoomPillText = `${k.toFixed(1)}×`
    zoomPillShow = true
    clearTimeout(pillTimer)
    pillTimer = setTimeout(() => { zoomPillShow = false }, 1200)
  }

  function showSpacingPill(k: number): void {
    spacingPillText = `${k.toFixed(1)}×`
    spacingPillShow = true
    clearTimeout(pillTimer)
    pillTimer = setTimeout(() => { spacingPillShow = false }, 1200)
  }

  function toggleLock(): void {
    locked = !locked
    saveLock(store.layout, locked)
  }

  function zoomBy(dir: 1 | -1): void {
    const eng = engine
    if (!eng) return
    pokeWhileLocked()
    eng.zoom(nextZoom(zoomNow, dir), 240)
  }

  function fitAction(): void {
    const eng = engine
    if (!eng) return
    const vp = viewport()
    if (!vp) return
    pokeWhileLocked()
    fitNow(eng, vp)
    showZoomPill(typeof eng.zoom === 'function' ? eng.zoom() : zoomNow)
  }

  /** SPACING (spread only, SPEC §3.3): k 0.6–2.0 step 0.2, persisted in
   *  `dn.spacing.spread`; applying it is ONE bounded reheat (60 ticks), then
   *  the existing onEngineStop refit reframes the field. Other layouts keep
   *  their own spacing — the multiplier is stored and waits for spread. */
  function nudgeSpacing(dir: 1 | -1): void {
    spacingK = nextSpacing(spacingK, dir)
    saveSpacing(spacingK)
    showSpacingPill(spacingK)
    const eng = engine
    if (!eng || store.layout !== 'spread') return
    pokeWhileLocked()
    const vp = viewport()
    applyLayout(eng, 'spread', vp ? packRect(vp) : undefined, { spacingK, quick: true })
    fitNextStop = true
  }

  const arrowOverBudget = $derived(
    zoomNow >= ARROW_ZOOM_MIN && store.visible.links.length > ARROW_BUDGET
  )

  /* ---------- SYNAPSE CLICK (edge interrogation, network pass 2026-10-31) ----------
     The wire is a first-class target: hover lights it (3px + chip), click
     opens the detail card (ctx line, endpoint jumps, trail-light, citation).
     The card and the trail sheet share the canvas's overlay layer and yield
     to each other — one at a time, no collision. */
  let hoverKey: string | null = null // engine closure input — plain var
  let hoverWire = $state<{ a: string; b: string } | null>(null)
  let hoverPos = $state({ x: 0, y: 0 })
  let card = $state<{ link: DocLink; a: string; b: string } | null>(null)
  let litDone = $state(false)
  let citedDone = $state(false)
  let litTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let citedTimer: ReturnType<typeof setTimeout> | undefined = undefined

  const engineLinkKey = (l: any): string =>
    `${typeof l.source === 'object' ? l.source?.id : l.source}>${typeof l.target === 'object' ? l.target?.id : l.target}`

  function edgeHover(l: any | null): void {
    if (!l) {
      hoverKey = null
      hoverWire = null
      return
    }
    const [a, b] = engineLinkKey(l).split('>')
    hoverKey = `${a}>${b}`
    hoverWire = { a, b }
    // The chip's citing line rides the existing ctx cache: one fetch per
    // source per session, then every hover answers from memory.
    if (a) store.loadContext(a)
  }

  function edgeClick(l: any): void {
    const [a, b] = engineLinkKey(l).split('>')
    const link = store.wire(a, b)
    if (!link) return
    store.loadContext(a)
    card = { link, a, b }
    // Shared overlay layer: the card yields the trail sheet its space.
    trailOpen = false
    hoverWire = null
    hoverKey = null
  }

  function closeCard(): void {
    card = null
  }

  function gotoEndpoint(id: string): void {
    const n = store.byId(id)
    if (n) store.goto(n)
    closeCard()
  }

  function lightTrail(): void {
    if (!card) return
    store.extendTrailThrough(card.a, card.b)
    litDone = true
    clearTimeout(litTimer)
    litTimer = setTimeout(() => { litDone = false }, 1600)
  }

  async function copyCitation(): Promise<void> {
    if (!card) return
    const a = store.byId(card.a)
    const b = store.byId(card.b)
    if (!a || !b) return
    // A nav-header "citing line" is chrome, not a sentence: the copy omits
    // the quote and ships the bare wire (SPEC F3).
    const ctx = store.ctxFor(card.link)
    const ok = await copyText(synapseCitation(a, b, ctx && !isBoilerplateCtx(ctx) ? ctx : undefined))
    if (!ok) return
    citedDone = true
    clearTimeout(citedTimer)
    citedTimer = setTimeout(() => { citedDone = false }, 1600)
  }

  // Hover chip follows the pointer over the canvas (a passive DOM listener,
  // attached only while a wire is hovered — never a loop).
  $effect(() => {
    const wrap = wrapEl
    if (!wrap || !hoverWire) return
    const onMove = (e: PointerEvent): void => {
      const box = wrap.getBoundingClientRect()
      hoverPos = { x: e.clientX - box.left, y: e.clientY - box.top }
    }
    wrap.addEventListener('pointermove', onMove, { passive: true })
    return () => wrap.removeEventListener('pointermove', onMove)
  })

  /** The chip's citing line: the store's ctx cache (lazy file → inline
   *  fallback), truncated to the spec's 60 chars. A nav header is chrome, not
   *  a sentence — the chip quotes the honesty string instead (SPEC F3). */
  const hoverCtx = $derived.by(() => {
    if (!hoverWire) return ''
    const l = store.wire(hoverWire.a, hoverWire.b)
    const c = l ? store.ctxFor(l) : undefined
    if (!c) return ''
    if (isBoilerplateCtx(c)) return 'navigation header — no prose citation'
    return c.length > 60 ? c.slice(0, 60) + '…' : c
  })

  /** The card's citing lines, boilerplate-filtered: a recovered bridge
   *  carries every recovered line in its provenance array; an exported wire
   *  answers from the ctx cache. Lines that are really GNU Info nav headers
   *  are dropped; when that leaves nothing, the card says so instead of
   *  quoting navigation chrome (SPEC F3). */
  const cardCite = $derived.by(() => {
    if (!card) return { lines: [] as string[], navHeader: false }
    const raw = card.link.provenance?.length
      ? card.link.provenance
      : [store.ctxFor(card.link)].filter((s): s is string => !!s)
    const lines = raw.filter((l) => !isBoilerplateCtx(l))
    return { lines, navHeader: raw.length > 0 && lines.length === 0 }
  })

  /* ---------- TRAIL chrome (designer spec 2026-10-31) ----------
     The chip pins the route's existence and count; the panel is the route
     itself — rows, copy, clear. Chrome exists only when the trail is EARNED
     (two or more surviving stops): no prompt, no spinner, no empty state. */
  const trailStops = $derived(store.trailResolved)
  const trailCount = $derived(trailStops.length)
  const trailEarned = $derived(trailCount >= 2)
  let trailOpen = $state(false)
  let chipEl: HTMLButtonElement | undefined = $state()
  let copyFailed = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined = undefined

  function toggleTrail(): void {
    // Shared overlay layer (SPEC §4.2): the trail sheet and the synapse
    // card never show together — opening one closes the other.
    if (card) card = null
    trailOpen = !trailOpen
  }

  function goStop(stop: DocNode): void {
    store.goto(stop)
    trailOpen = false
  }

  async function copyTrail(): Promise<void> {
    const ok = await copyText(trailText(trailStops))
    if (ok) return // the clipboard itself is the success feedback
    copyFailed = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copyFailed = false }, 1600)
  }

  function clearTheTrail(): void {
    store.clearTrail()
    trailOpen = false
  }

  function trailEsc(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    // Shared overlay layer, one Escape at a time: the synapse card yields
    // first, then the trail panel. Selection persists through both.
    if (card) {
      closeCard()
      return
    }
    if (trailOpen) {
      trailOpen = false
      chipEl?.focus()
    }
  }
</script>

<svelte:window onkeydown={trailEsc} />

<div class="roam-wrap dn-dish" data-layout={store.layout} bind:this={wrapEl} data-webgl={webglOk ? 'ok' : 'none'} data-trail-open={trailOpen ? '1' : undefined}>
  <!-- loadEngine comes from neuronEngine so the force-graph import resolves
       from SYNAPT's node_modules (Vite resolves bare specifiers relative to
       the importing file, and GraphView.svelte lives in the sibling orui
       checkout) — and so the neuron painting rides in at construction. -->
  {#if webglOk}
    <GraphView
      store={roam}
      onNodeClick={click}
      loadEngine={neuronLoad}
      linkHoverPrecision={6}
      onLinkClick={edgeClick}
      onLinkHover={edgeHover}
    />
  {:else}
    <!-- No WebGL, no canvas: say so, in the dish, where the graph would be.
         The reader and every other surface keep working. -->
    <div class="no-webgl" role="status">
      <p class="nw-h dn-mono">⌁ synapses unavailable</p>
      <p class="nw-line">The neuron canvas needs WebGL, and this browser
        has it off (hardware acceleration disabled, or a remote desktop
        without a GPU). Everything else works: open</p>
      <p><button class="nw-go dn-mono" onclick={() => store.setMode('reader')}>▤ DOCS</button></p>
    </div>
  {/if}
  {#if webglOk && !painted}
    <!-- Shape, not a spinner: the promise of what is coming (a field of
         neurons) in the pixels it will occupy. Compositor-only (one
         translateX sweep), aria-hidden, and deliberately the LAST child —
         the checks that read the engine's live node count sample
         `.roam-wrap`'s firstElementChild, which must stay GraphView's root. -->
    <div class="skel" aria-hidden="true">
      <span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
      <span class="orb o4"></span><span class="orb o5"></span>
      <span class="sweep"></span>
      <p class="skel-line dn-mono">// laying out {store.data.links.length} synapses</p>
    </div>
  {/if}

  {#if webglOk}
    <!-- Hover chip (SPEC §4.1): the pointer tier's floating readout — the
         first 60 chars of the citing line, one ctx fetch, cached. DOM over
         the canvas; it never steals the pointer (pointer-events: none). -->
    {#if hoverWire}
      <div
        class="edge-chip dn-mono"
        aria-hidden="true"
        style:left="{Math.min(hoverPos.x + 14, 9999)}px"
        style:top="{Math.max(hoverPos.y - 34, 4)}px"
      >{hoverCtx || '⌁ synapse'}</div>
    {/if}

    <!-- NETWORK CONTROLS (SPEC §3): one vertical stack, bottom-right —
         LOCK · SPACING −/+ · ZOOM −/+ · FIT. 44×44 buttons, 8px gap,
         chrome tokens, zero new animation loops. -->
    <div class="net-controls" role="group" aria-label="Network controls">
      <button
        class="nc-btn"
        class:active={locked}
        onclick={toggleLock}
        aria-pressed={locked}
        aria-label={locked ? 'Unlock network positions' : 'Lock network positions'}
        title={locked ? 'Unlock network positions' : 'Lock network positions'}
      >
        {#if locked}
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v.6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7.2" y="9" width="1.6" height="2.4" fill="currentColor"/></svg>
        {:else}
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="7.2" y="9" width="1.6" height="2.4" fill="currentColor"/></svg>
        {/if}
      </button>
      <div class="nc-pair">
        <button
          class="nc-btn dn-mono"
          onclick={() => nudgeSpacing(-1)}
          disabled={spacingK <= SPACING_MIN}
          aria-disabled={spacingK <= SPACING_MIN}
          aria-label="Decrease synapse spacing"
          title="Decrease synapse spacing"
        >−</button>
        <button
          class="nc-btn dn-mono"
          onclick={() => nudgeSpacing(1)}
          disabled={spacingK >= SPACING_MAX}
          aria-disabled={spacingK >= SPACING_MAX}
          aria-label="Increase synapse spacing"
          title="Increase synapse spacing"
        >+</button>
      </div>
      <!-- Both pairs read [− +] left-to-right (final polish, SPEC F6): the
           zoom pair shipped as [+ −] with the disabled bounds riding the
           glyphs. Handlers and bounds travel WITH the button, so the fix is
           the DOM order — never a CSS reversal that would unpair them. -->
      <div class="nc-pair">
        <button
          class="nc-btn dn-mono"
          onclick={() => zoomBy(-1)}
          disabled={zoomNow <= ZOOM_MIN}
          aria-disabled={zoomNow <= ZOOM_MIN}
          aria-label="Zoom out"
          title="Zoom out"
        >−</button>
        <button
          class="nc-btn dn-mono"
          onclick={() => zoomBy(1)}
          disabled={zoomNow >= ZOOM_MAX}
          aria-disabled={zoomNow >= ZOOM_MAX}
          aria-label="Zoom in"
          title="Zoom in"
        >+</button>
      </div>
      <button
        class="nc-btn"
        onclick={fitAction}
        aria-label="Fit the neural network to the frame"
        title="Fit the neural network to the frame"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>
      </button>
      <!-- Readout pills (SPEC §3.2): they fade after 1.2s through a CSS
           TRANSITION — opacity only, no keyframes, no loop. -->
      <span class="nc-pill dn-mono" class:show={spacingPillShow} aria-hidden="true">{spacingPillText}</span>
      <span class="nc-pill zoom dn-mono" class:show={zoomPillShow} aria-hidden="true">{zoomPillText}</span>
    </div>
    {#if arrowOverBudget}
      <!-- The honest status line (SPEC §3.4): the field is over the arrow
           paint budget, so arrows ride the selection/hover tier only. Phone
           says the tier alone (F7): the desktop line is ~440px of 10px type
           and the 180px corner cannot hold it. The swap is CSS-only, so the
           live region never re-registers and desktop copy is unchanged. -->
      <p class="nc-status dn-mono" role="status">
        <span class="ns-desktop">arrows on selection · {store.visible.links.length} synapses exceeds paint budget</span>
        <span class="ns-phone">arrows: selection only</span>
      </p>
    {/if}
  {/if}

  {#if card}
    <!-- SYNAPSE CLICK card (SPEC §4): 360px right card on a desktop, a
         60vh bottom sheet on a phone. Backdrop click and Escape close;
         selection persists. The trail sheet already yielded at open. -->
    <div class="card-backdrop" onclick={closeCard} aria-hidden="true"></div>
    <div class="synapse-card" role="dialog" aria-label="Synapse detail">
      <header class="sc-head">
        <span class="sc-k dn-mono">⌁ SYNAPSE</span>
        {#if card.link.kind === 'bridge'}
          <span class="sc-badge dn-mono">bridge · recovered</span>
        {/if}
        <button class="sc-close dn-mono" onclick={closeCard} aria-label="Close synapse detail">×</button>
      </header>
      {#if card.link.kind === 'bridge'}
        <p class="sc-note dn-mono">Recovered from text reference — not in the source link graph</p>
      {/if}
      <!-- APG scrollable-region pattern: a scrollable area that keyboard
           users can reach is a tab stop (tabindex 0) — the lint rule is
           narrower than the pattern, so this is an explicit, cited opt-out. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="sc-ctx" tabindex="0">
        {#if cardCite.lines.length}
          {#each cardCite.lines as line, i (i)}<p class="sc-line">{line}</p>{/each}
        {:else if cardCite.navHeader}
          <p class="sc-line empty dn-mono">navigation header — no prose citation recorded</p>
        {:else}
          <p class="sc-line empty dn-mono">No citing line recorded</p>
        {/if}
      </div>
      <div class="sc-ends">
        {#each [card.a, card.b] as endId, i (endId)}
          {@const n = store.byId(endId)}
          {@const other = store.byId(i === 0 ? card.b : card.a)}
          <div class="sc-end">
            <span class="sc-dir dn-mono" aria-hidden="true">{i === 0 ? 'source' : 'target'}</span>
            <span class="sc-end-t">{n?.title ?? endId}</span>
            <span class="sc-end-m dn-mono">{i === 0 ? '→' : '←'} {other ? DocneuralStore.manualTitle(other.tags[0] ?? '') : ''}</span>
            <button class="sc-open dn-mono" onclick={() => gotoEndpoint(endId)} aria-label="Open {n?.title ?? endId}">Open ›</button>
          </div>
        {/each}
      </div>
      <footer class="sc-foot">
        <button class="sc-act dn-mono" class:done={litDone} onclick={lightTrail}>
          {litDone ? '◈ trail lit' : 'Light trail through this synapse'}
        </button>
        <button class="sc-act dn-mono" class:done={citedDone} onclick={copyCitation}>
          {citedDone ? 'copied ✓' : 'Copy citation'}
        </button>
      </footer>
    </div>
  {/if}
  {#if trailEarned}
    <!-- TRAIL chrome (designer spec 2026-10-31). Present whenever two or
         more stops survive the live index — WebGL or not: the chip and the
         panel are DOM, the painter is the only part that degrades. The
         panel opens and closes by a display toggle, nothing animates. -->
    <div
      id="trail-panel"
      class="trail-panel"
      class:open={trailOpen}
      role="region"
      aria-label="reading trail"
    >
      <div class="trail-rows">
        {#each trailStops as stop, i (stop.id)}
          <button
            class="trail-row"
            class:current={stop.id === store.selected?.id}
            aria-current={stop.id === store.selected?.id ? 'true' : undefined}
            onclick={() => goStop(stop)}
          >
            <span class="tr-idx dn-mono" aria-hidden="true">{i + 1}</span>
            <span class="tr-title">{stop.title}</span>
          </button>
        {/each}
      </div>
      <div class="trail-foot">
        <button class="trail-act dn-mono" onclick={copyTrail}>
          {copyFailed ? 'copy failed' : 'copy path'}
        </button>
        <button class="trail-act dn-mono" onclick={clearTheTrail}>clear</button>
      </div>
    </div>
    <button
      class="trail-chip dn-mono"
      bind:this={chipEl}
      aria-expanded={trailOpen}
      aria-controls="trail-panel"
      aria-label={`reading trail — ${trailCount} stops`}
      onclick={toggleTrail}
    >◈ TRAIL {trailCount}<span class="tr-chev" aria-hidden="true">▾</span></button>
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

/* ---------- WebGL fallback: the honest empty dish ---------- */
.no-webgl {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 2rem;
  text-align: center;
}
.no-webgl .nw-h {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: var(--dn-track);
  color: var(--dn-accent, var(--dn-fg));
}
.no-webgl .nw-line {
  margin: 0;
  max-width: 34rem;
  color: var(--dn-fg-muted);
  font-size: 0.86rem;
  line-height: 1.55;
}
.no-webgl .nw-go {
  border: 1px solid var(--dn-border-strong);
  background: var(--dn-bg-raise, transparent);
  color: var(--dn-fg);
  padding: 0.55rem 1.1rem;
  min-height: 40px;
  cursor: pointer;
  letter-spacing: var(--dn-track);
}
.no-webgl .nw-go:hover {
  border-color: var(--dn-accent, var(--dn-fg));
}

/* ---------- TRAIL chrome (designer spec 2026-10-31) ----------
   Chip pinned to the canvas's bottom-left pocket (12px, above the safe
   area); panel opens upward from it by display toggle. Token pairs are the
   spec's AA-measured values — see styles/docneural-ui.css. */
.trail-chip {
  position: absolute;
  left: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--dn-trail) 45%, transparent);
  background: color-mix(in srgb, var(--dn-bg-raise) 82%, transparent);
  border-radius: var(--dn-radius);
  font-size: 11px;
  letter-spacing: var(--dn-track);
  text-transform: uppercase;
  color: var(--dn-trail);
  cursor: pointer;
}
.trail-chip .tr-chev { color: var(--dn-trail); }
.trail-chip:hover {
  border-color: var(--dn-trail);
  background: color-mix(in srgb, var(--dn-trail-wash) 60%, var(--dn-bg-raise));
}

.trail-panel {
  position: absolute;
  left: 12px;
  /* Chip top (12 + 40) + one 8px breath. */
  bottom: calc(60px + env(safe-area-inset-bottom, 0px));
  z-index: 6;
  width: clamp(220px, 24vw, 272px);
  max-height: 46dvh;
  overflow: auto;
  padding: 10px 0 6px;
  border: 1px solid var(--dn-border-strong);
  background: var(--dn-bg-raise);
  /* Panels are 0 (house law): sharp, like every other HUD module. */
  border-radius: 0;
  display: none;
}
.trail-panel.open { display: block; }

.trail-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  font: inherit;
  text-align: left;
  color: var(--dn-fg);
  cursor: pointer;
}
.trail-row:hover { background: var(--dn-trail-wash); }
.trail-row.current { border-left-color: var(--dn-trail); }
.tr-idx {
  flex: 0 0 auto;
  min-width: 1.6em;
  font-size: 10px;
  color: var(--dn-fg-faint);
  font-variant-numeric: tabular-nums;
}
.tr-title {
  font-size: 13px;
  line-height: 1.35;
  color: var(--dn-fg);
  overflow-wrap: anywhere;
}

.trail-foot {
  display: flex;
  margin-top: 6px;
  border-top: 1px solid var(--dn-hairline);
}
.trail-act {
  flex: 1;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  font-size: 11px;
  letter-spacing: var(--dn-track);
  text-transform: uppercase;
  color: var(--dn-fg-muted);
  cursor: pointer;
}
.trail-act:hover { color: var(--dn-trail); background: var(--dn-trail-wash); }

/* Focus is a trail-coloured ring, spec'd over the site-wide accent ring for
   this chrome so the route owns its own colour end to end. */
.trail-chip:focus-visible,
.trail-row:focus-visible,
.trail-act:focus-visible {
  outline: 2px solid var(--dn-trail);
  outline-offset: 2px;
}

@media (max-width: 700px) {
  .trail-chip { height: 44px; }
  .trail-panel {
    left: 12px;
    right: 12px;
    width: auto;
    /* Phone chip is 44px tall: 12 + 44 + 8. */
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
}

/* ---------- NETWORK CONTROLS (network pass 2026-10-31) ----------
   Bottom-right stack, chrome tokens only, 44×44 taps, 8px gaps. The stack
   is a corner keep-out (viewport() routes the spread field around it). */
.net-controls {
  position: absolute;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--dn-border);
  background: color-mix(in srgb, var(--dn-chrome-bg) 92%, transparent);
  border-radius: 0;
}
.nc-pair {
  display: flex;
  gap: 8px;
}
.nc-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dn-border);
  background: transparent;
  color: var(--dn-chrome-ink);
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color 120ms, border-color 120ms, background 120ms;
}
.nc-btn svg { width: 18px; height: 18px; }
.nc-btn:hover:not(:disabled) {
  border-color: var(--dn-synapse-lit);
  color: var(--dn-chrome-ink);
}
/* Pressed/active fill = the lit synapse (SPEC §3); the icon inverts to the
   chrome bg for AA contrast on the lit fill in both arms. */
.nc-btn.active {
  background: var(--dn-synapse-lit);
  border-color: var(--dn-synapse-lit);
  color: var(--dn-chrome-bg);
}
.nc-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.nc-btn:focus-visible,
.nc-pill:focus-visible {
  outline: 2px solid var(--dn-synapse-lit);
  outline-offset: 2px;
}
/* Readout pills: CSS-transition fade only (no keyframes, no loop). */
.nc-pill {
  position: absolute;
  right: calc(100% - 8px);
  min-width: 44px;
  padding: 3px 8px;
  text-align: center;
  font-size: 11px;
  letter-spacing: var(--dn-track);
  color: var(--dn-chrome-ink);
  background: color-mix(in srgb, var(--dn-chrome-bg) 92%, transparent);
  border: 1px solid var(--dn-border);
  opacity: 0;
  transition: opacity 400ms ease;
  pointer-events: none;
}
.nc-pill.zoom { bottom: 8px; }
.nc-pill:not(.zoom) { bottom: 112px; }
.nc-pill.show { opacity: 1; }
.nc-status {
  position: absolute;
  right: 12px;
  bottom: calc(232px + env(safe-area-inset-bottom, 0px));
  z-index: 6;
  max-width: 250px;
  margin: 0;
  padding: 4px 8px;
  text-align: right;
  font-size: 10px;
  letter-spacing: var(--dn-track);
  color: var(--dn-panel-ink-dim);
  background: color-mix(in srgb, var(--dn-chrome-bg) 92%, transparent);
  border: 1px solid var(--dn-border);
}
/* F7: one nc-status, two copies — the phone swap is a display toggle. */
.ns-phone { display: none; }

/* ---------- SYNAPSE CLICK chrome (SPEC §4) ---------- */
.edge-chip {
  position: absolute;
  z-index: 7;
  max-width: min(300px, 70%);
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dn-panel-ink);
  background: color-mix(in srgb, var(--dn-panel-bg) 94%, transparent);
  border: 1px solid var(--dn-synapse-hover);
  pointer-events: none;
}
.card-backdrop {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: color-mix(in srgb, var(--dn-bg-sunken) 35%, transparent);
  cursor: default;
}
.synapse-card {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 9;
  width: 360px;
  max-width: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dn-border-strong);
  background: var(--dn-panel-bg);
  color: var(--dn-panel-ink);
  overflow: hidden;
}
.sc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dn-hairline);
}
.sc-k { font-size: 11px; letter-spacing: var(--dn-track); color: var(--dn-panel-ink-dim); }
.sc-badge {
  font-size: 10px;
  letter-spacing: var(--dn-track);
  color: var(--dn-synapse-mined);
  border: 1px dashed color-mix(in srgb, var(--dn-synapse-mined) 60%, transparent);
  padding: 2px 6px;
}
.sc-close {
  margin-left: auto;
  width: 40px;
  height: 40px;
  border: 0;
  background: none;
  color: var(--dn-panel-ink-dim);
  font-size: 1.2rem;
  cursor: pointer;
}
.sc-close:hover { color: var(--dn-panel-ink); }
.sc-note {
  margin: 0;
  padding: 8px 12px;
  font-size: 10px;
  letter-spacing: var(--dn-track);
  color: var(--dn-synapse-mined);
  border-bottom: 1px solid var(--dn-hairline);
}
.sc-ctx {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px;
  border-bottom: 1px solid var(--dn-hairline);
}
.sc-line {
  margin: 0 0 0.5em;
  font-family: var(--dn-font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dn-panel-ink);
}
.sc-line.empty { color: var(--dn-panel-ink-dim); }
.sc-ends { flex: 0 0 auto; }
.sc-end {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--dn-hairline);
}
.sc-dir {
  flex: 0 0 auto;
  width: 44px;
  font-size: 9px;
  letter-spacing: var(--dn-track);
  text-transform: uppercase;
  color: var(--dn-panel-ink-dim);
}
.sc-end-t {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.sc-end-m {
  flex: 0 0 auto;
  font-size: 9.5px;
  letter-spacing: var(--dn-track);
  text-transform: uppercase;
  color: var(--dn-panel-ink-dim);
}
.sc-open {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0 8px;
  border: 1px solid var(--dn-border);
  background: none;
  color: var(--dn-panel-ink);
  font-size: 10px;
  letter-spacing: var(--dn-track);
  cursor: pointer;
}
.sc-open:hover { border-color: var(--dn-synapse-lit); color: var(--dn-synapse-lit); }
.sc-foot {
  flex: 0 0 auto;
  display: flex;
  border-top: 1px solid var(--dn-hairline);
}
.sc-act {
  flex: 1;
  min-height: 44px;
  border: 0;
  background: none;
  color: var(--dn-panel-ink-dim);
  font-size: 10.5px;
  letter-spacing: var(--dn-track);
  text-transform: uppercase;
  cursor: pointer;
}
.sc-act:hover, .sc-act.done { color: var(--dn-synapse-lit); }
.sc-act + .sc-act { border-left: 1px solid var(--dn-hairline); }
.sc-close:focus-visible,
.sc-open:focus-visible,
.sc-act:focus-visible,
.sc-ctx:focus-visible {
  outline: 2px solid var(--dn-synapse-lit);
  outline-offset: -2px;
}

/* Phone: the card becomes a 60vh bottom sheet (SPEC §4.2). */
@media (max-width: 700px) {
  .synapse-card {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-width: none;
    height: 60dvh;
    max-height: 60dvh;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
  }
  .nc-status {
    max-width: 180px;
    /* F7: 4px side air (desktop keeps 8px) — the phone line must hold ONE
       row at 180px, and "arrows: selection only" at 10px/0.14em measures
       162.8px; 8px padding left it a sub-pixel short and it wrapped. */
    padding-inline: 4px;
  }
  .ns-desktop { display: none; }
  .ns-phone { display: inline; }
}


</style>
