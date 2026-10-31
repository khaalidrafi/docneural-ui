// Neuron-style canvas painting, injected through orui's supported
// `loadEngine` seam. GraphView's props are only store/onNodeClick/loadEngine,
// so a `nodeCanvasObject` prop on it is silently dropped — custom painting
// happens by WRAPPING the engine factory instead: we configure the force-graph
// instance at construction, then GraphView's own accessor chain runs on top
// and keeps owning node colours, sizes, tooltips and theme polling.
//
// What we add (hero mode):
//  - 'after' node paint: the themed default disc stays the soma; we draw the
//    dendritic tree (two halo rings + a hot inner core) and an always-legible
//    title over it;
//  - firing synapses: directional particles and a thicker wire on every link
//    touching the selected node;
//  - the layout knobs (applyLayout): GraphView exposes no physics control, so
//    the same seam that paints also owns the forces behind cluster/spread.
// Compact mode (the reader's 210px mini-map and the phone layout) uses
// 'replace' paint: a small clean soma with a visible ring when hot — labels
// were unreadable blobs at that size, so hot-ness is carried by the ring
// instead of text.
//
// Colour source: the same computed-style tokens GraphView polls (--orui-*),
// read through `tokenEl` at most twice a second — a getComputedStyle per node
// per frame would freeze this machine. Label ink/paper come from the site's
// own --dn-fg/--dn-bg so text stays readable on both themes.
import { canvasTokens, nodeColor, dimColor, type CanvasTokens } from 'orui/graph/colors'
import {
  LABEL_LINE,
  labelExtent,
  latticePitch,
  latticePlace,
  shortTitle,
  spreadStrength
} from '../core/graph'
import {
  forceFitContainer,
  forceLabelBoxes,
  type Blocker
} from './spreadForces'
import type { LayoutMode } from '../core/types'

// The force-graph instance is a chainable kapsule; GraphView keeps its own
// structural type private, so we stay loose here on purpose. Exported because
// DocneuralGraph holds the instance to push layout changes into it.
export type Engine = any
type Ctx = CanvasRenderingContext2D

/** The fields of an engine node this module reads. GraphView copies them onto
 *  its own node objects at sync time; force-graph then adds x/y/velocity. */
type Painted = { title?: string; degree?: number }

export type NeuronFocus = {
  /** Element whose computed style carries the resolved --orui-* / --dn-* tokens. */
  tokenEl: () => HTMLElement | undefined
  /** Live selection, read per paint: closures keep the painter current without
   *  re-syncing graph data (which would disturb the physics). */
  selected: () => string | null
  neighbors: () => Set<string>
  /** Mini-map: replace-mode small soma, no labels or particles. */
  compact?: boolean
  /** True when the visitor asked for the spread layout. Read per paint, like
   *  `selected`, so turning it on never rebuilds the graph data. */
  spread?: () => boolean
  /** OP-56 lattice radiusScale: somas shrink with the hex pitch so a tight
   *  field (p≈24 at corpus scale) can never overlap. Read per paint; 1 = no
   *  scaling (cluster/spread keep their authored radii). */
  somaScale?: () => number
  /** True while the lattice layout owns the field. The overview labels ride
   *  ABSOLUTE zoom, not the cluster/spread LOD bands: the lattice boots fit
   *  at k≈0.93, which is band 2 on the packed scales — the band gate waved
   *  every one of 1,386 titles through and the overview drowned in ink
   *  (the deploy bug of 2026-10-31). Lattice rule: hub names at fit, hot +
   *  chapter hubs past 0.85, everything past 1.6 — a starfield that fills
   *  in as you zoom, never a wall of text. */
  lattice?: () => boolean
  /** Mini-map headings (Owner law 2026-10-28: "Local graph should show node
   *  headings!"). True = the compact painter labels every neuron it can
   *  without overprinting; the claim grid drops whichever names would land
   *  on one already drawn, so a busy hub keeps its own name and its
   *  first-drawn neighbours instead of an ink pile. */
  miniLabels?: () => boolean
  /** OP-56 mini-heading cap: how many names the 210px frame may ink besides
   *  the centre (4 desktop / 6 phone; a hub over 24 neighbours drops to
   *  centre + 2). Read per paint. */
  miniCap?: () => number
  /** Handed the live engine once it exists, so the component can push layout
   *  changes into it. GraphView keeps the instance private and exposes no
   *  physics knob, so the construction seam is the only door. */
  onEngine?: (engine: Engine) => void
}

/** Wrap force-graph's module loader. GraphView does `create()(container)`,
 *  so we return a module-shaped object whose default builds a neuron-configured
 *  instance. */
export function makeNeuronLoader(focus: NeuronFocus): () => Promise<unknown> {
  return async () => {
    // The engine is a lazy 174 kB chunk behind first paint, so it is DYNAMIC: a
    // static `import` would hoist it into the critical index chunk and charge
    // every reader-mode page for a canvas it never opens. Our own label-packing
    // force is ~2 kB and bundles with this module, so it can be a plain import.
    const mod = (await import('force-graph')) as { default?: unknown }
    const create = (mod.default ?? mod) as () => (el: HTMLElement) => Engine
    return {
      default: () => (el: HTMLElement) => {
        const engine: Engine = create()(el)
        installNeuron(engine, focus)
        focus.onEngine?.(engine)
        return engine
      }
    }
  }
}

// GraphView's nodeVal is 1 + min(degree, 20) and force-graph's default radius
// is sqrt(val) * nodeRelSize (4). Mirror that so halos and labels sit on the
// disc the engine actually drew. Compact bumps the disc up (a 210px mini-map
// made hubs unreadable blobs at 1.6).
function somaRadius(n: { degree?: number }, compact: boolean | undefined): number {
  const val = 1 + Math.min(n.degree ?? 0, 20)
  return Math.sqrt(val) * (compact ? 2.6 : 4)
}

/* force-graph's own defaults (canvas-force-graph.js seeds charge at -30 and
   d3's forceLink at distance 30). Restored verbatim when the visitor switches
   back, because a half-reset leaves the corpus permanently dented. */
const CLUSTER_CHARGE = -30
const CLUSTER_LINK_DISTANCE = 30

/**
 * Push a layout into the running simulation.
 *
 * `cluster` is left exactly as force-graph ships it. `spread` is two forces
 * doing two different jobs:
 *
 *  - a per-node REPULSION proportional to the node's own title width. Sibling
 *    chapters cite each other constantly, which is what knots a corpus into
 *    per-doc blobs, and one flat charge cannot undo that without blasting the
 *    short-titled nodes off to useless distances too;
 *  - a hard-body SEPARATION between the rectangles the labels actually occupy
 *    (`./labelCollide`). This is the part that makes the promise literal. Charge
 *    alone cannot: it decays with distance, so a chain of long names can still
 *    pile into itself while the neighbours it does not touch push it back. And a
 *    circle is wrong-shaped for a line of text — see `labelExtent`.
 *
 * `distanceMax` bounds the Barnes-Hut reach so a 1,559-node corpus stays a
 * quadtree pass rather than a global shoving match, which on this machine is
 * the difference between a relayout and a freeze.
 */
export function applyLayout(
  engine: Engine,
  mode: LayoutMode,
  /** The usable rect at 1:1 (panel inset and padding already removed) plus the
   *  immovable boxes inside it, which is what the spread field is packed to
   *  fill. Omitted = no container, just the packing — what you want before the
   *  canvas has a measured size. */
  room?: { w: number; h: number; blockers?: Blocker[] }
): void {
  const charge = engine.d3Force('charge')
  const link = engine.d3Force('link')
  if (!charge || !link) return // no physics (jsdom, or a canvas-less fallback)
  if (mode === 'lattice') {
    // THE FIXED-DISTANCE OVERVIEW (Owner law 2026-10-28). Deterministic and
    // simulation-free: every neuron is PINNED (fx/fy) to its serpentine
    // lattice cell, so the physics has nothing to settle — cooldown 0 parks
    // the engine and a pinned field cannot re-knot into citation blobs. The
    // one cost is the placement itself: one sort + one write per node, once
    // per sync. Charge goes to 0 so nothing (a stray drag reheat, a filter
    // sync) ever fights the pins between placements.
    charge.strength(0).distanceMax(Infinity)
    engine.d3Force('collide', null)
    engine.d3Force('fit', null)
    const bodies = engine.graphData().nodes as import('../core/graph').LatticeBody[]
    const box = room ?? { w: 1000, h: 800 }
    const p = latticePitch(bodies.length, box.w, box.h)
    latticePlace(bodies, p, box.w, box.h)
    // Shrink the BASE discs, not just the overpaint. force-graph derives the
    // painted radius per frame as sqrt(nodeVal)·nodeRelSize, and GraphView
    // owns nodeVal but never touches nodeRelSize — so this is the one lever
    // that scales the soma itself. The 18.33 here is the biggest soma at
    // relSize 4 (sqrt(21)·4); 0.36·p is the largest disc the pitch can hold
    // with a visible gap on every side. Without this the base disc painted
    // at full size and the field fused into walls of colour (the 2026-10-31
    // deploy bug).
    const k = Math.min(1, (0.36 * p) / 18.33)
    engine.nodeRelSize?.(4 * k)
    engine.cooldownTicks(0).cooldownTime(0)
    engine.d3ReheatSimulation()
    return
  }
  // Leaving the lattice restores the authored soma scale (relSize 4) before
  // the physics unpins — the packed views own their full-size discs.
  engine.nodeRelSize?.(4)
  const unpinned = engine.graphData().nodes as { fx?: number | null; fy?: number | null }[]
  for (const n of unpinned) {
    n.fx = null
    n.fy = null
  }
  // Bound the relayout. force-graph cools on WALL CLOCK (cooldownTicks is
  // Infinity and cooldownTime 15,000 ms out of the box), so a layout switch
  // meant 15 seconds of Barnes-Hut per toggle on this machine — and, worse, the
  // `onEngineStop` that re-frames the camera only fires when that countdown
  // ends, so the view stayed on the old framing for a quarter of a minute.
  // Ticking is what settles a picture, not the clock: 180 passes of a corpus
  // this size is a finished layout and roughly three seconds of a Celeron.
  engine.cooldownTicks(180).cooldownTime(3500)
  if (mode === 'spread') {
    // d3 takes a per-node strength function, and the node objects it hands
    // back are ours (GraphView copies title/degree onto them when syncing), so
    // each chapter repels in proportion to the width of its own name.
    charge.strength((n: Painted) => spreadStrength(n.title)).distanceMax(1400)
    link.distance(140)
    // The two readable-overview forces, under the slots force-graph leaves us:
    // 'collide' packs the label boxes apart, 'fit' keeps them inside the window.
    // Both read the SAME extent — one name's size, measured once, so the promise
    // "no two titles touch, none clipped" cannot be broken by a disagreement.
    // Non-compact radii: spread layout is only ever the full canvas.
    const extentOf = (n: Painted) => labelExtent(n.title, somaRadius(n, false))
    // REGISTERED LAST, because d3 iterates its forces in insertion order and
    // integrates `x += vx` after all of them: whatever runs last owns the
    // position. The container spring pulls inward, so a packing pass that ran
    // after it would be undone — and the packing pass is the one that clamps
    // the velocity pointing into a gap. Swapping these two lines reproduces the
    // overlap bug at ~5 % of a field (measured by `spreadForces.test.ts`).
    if (room) engine.d3Force('fit', forceFitContainer(room, extentOf))
    else engine.d3Force('fit', null)
    engine.d3Force('collide', forceLabelBoxes(extentOf, room?.blockers ?? []))
  } else {
    charge.strength(CLUSTER_CHARGE).distanceMax(Infinity)
    link.distance(CLUSTER_LINK_DISTANCE)
    // d3 drops a force when handed null — both of these are spread-only, and
    // leaving the container on would squash the corpus clusters into a slab.
    engine.d3Force('collide', null)
    engine.d3Force('fit', null)
  }
  // Changing a force does not wake a cooled simulation: onEngineTick stopped
  // firing long ago, so without this the new physics would never run.
  engine.d3ReheatSimulation()
}

/**
 * Frame the field inside the part of the canvas the visitor can actually see.
 *
 * Two things make this more than `zoomToFit`:
 *
 *  - THE PANEL. In graph mode the note preview is an `position:absolute`
 *    overlay: 55% of the width on a laptop, the bottom 45% on a phone. Fitting
 *    to the wrap's box puts half the corpus UNDER the panel — which is exactly
 *    how a readable view becomes an unreadable one — so the visible rect is the
 *    box, and the field is centred inside it (which means the world point sent
 *    to the canvas centre is offset by half the inset, over the scale).
 *  - THE CAP. Titles paint at `11 / globalScale`, so a name keeps its screen
 *    size while the soma it labels grows. Fit a 12-node ego graph the way
 *    force-graph likes and the discs come out the size of their own labels: a
 *    fine abstract, a poor diagram. The spread layout is authored at 1:1 — that
 *    is the scale where `labelExtent`'s keep-out boxes mean what they say — so
 *    1:1 is the most this view will ever zoom IN.
 *
 * Refusing to fit a field WIDER than the box would be a lie about an overview,
 * so a big field still fits whole and the painter's label grid does its job: ink
 * only the names with room. Crowding at fit-all is set by the box and by how
 * many nodes are in the view (roughly `box / √N` pixels apiece), not by how hard
 * the physics pushed — scaling a layout up shrinks the fit by exactly as much as
 * it widened the gaps. That invariance is why the readable overview is `Titles`
 * + `Ego`: few enough nodes that `box / √N` clears a title, all of them legible.
 *
 * The returned scale is what the component records on its wrap as `data-fit`:
 * the gate asserts the cap there rather than trusting a screenshot. Alongside it
 * comes the world size of the field, so `data-field` can say WHY a fit is what
 * it is — a fit under 1:1 with a field no wider than the panel is a bug in the
 * camera, and one with a field twice as wide is a layout that packed loose.
 */
export function fitReadable(
  engine: Engine,
  box: { w: number; h: number },
  opts: {
    pad: number
    inset?: { top: number; right: number; bottom: number; left: number }
    maxScale?: number
    /** Camera tween length. The lattice passes 260: its field is authored to
     *  the room, but the tween is load-bearing — force-graph's data-update
     *  auto-fit (4/∛n) stomps any zoom that equals its default (k===1), and
     *  only a tween dodges that guard. See DocneuralGraph fitNow. */
    duration?: number
  }
): { k: number; w: number; h: number } {
  const bbox = engine.getGraphBbox()
  if (!bbox) return { k: 0, w: 0, h: 0 }
  const inset = opts.inset ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const worldW = Math.max(1, bbox.x[1] - bbox.x[0])
  const worldH = Math.max(1, bbox.y[1] - bbox.y[0])
  // `pad` on top of the visible rect, so a field packed to the rect keeps its
  // breathing room instead of pressing its labels against the panel's border.
  const fit = Math.min(
    (box.w - inset.left - inset.right - opts.pad * 2) / worldW,
    (box.h - inset.top - inset.bottom - opts.pad * 2) / worldH
  )
  const k = Math.min(opts.maxScale ?? Infinity, Math.max(1e-3, fit))
  const dur = opts.duration ?? 420
  engine.zoom(k, dur)
  // The visible rect is off-centre whenever an overlay eats one side, so the
  // world point to park at the CANVAS centre is off-centre by half the
  // difference — over the scale, because it is a screen distance.
  engine.centerAt(
    (bbox.x[0] + bbox.x[1]) / 2 + (inset.right - inset.left) / (2 * k),
    (bbox.y[0] + bbox.y[1]) / 2 + (inset.bottom - inset.top) / (2 * k),
    dur
  )
  return { k, w: worldW, h: worldH }
}

function installNeuron(engine: Engine, focus: NeuronFocus): void {
  let tokens: CanvasTokens = canvasTokens(() => '')
  let ink = '#d7e2dc'
  let paper = '#10151a'
  let hotCol = '#ffd60a'
  let readAt = 0
  // Phones get +1.5px of label: at fit ~0.15 the 11px screen size the desktop
  // overview uses sits at the edge of legibility on a 390px viewport (designer
  // review r3: "increase node label font-size ... labels are sub-9px and bleed").
  // Read once per token poll — innerWidth does not change mid-frame usefully.
  let labelPx = 11
  const tokensNow = (): CanvasTokens => {
    const t = performance.now()
    if (t - readAt > 500) {
      readAt = t
      const el = focus.tokenEl()
      if (el) {
        const get = (name: string) => getComputedStyle(el).getPropertyValue(name)
        tokens = canvasTokens(get)
        ink = get('--dn-fg').trim() || ink
        paper = get('--dn-bg').trim() || paper
        hotCol = get('--dn-hot').trim() || hotCol
        labelPx = (typeof window !== 'undefined' && window.innerWidth < 700) ? 12.5 : 11
      }
    }
    return tokens
  }

  const isHot = (id: string): boolean => {
    const sel = focus.selected()
    return sel != null && (id === sel || focus.neighbors().has(id))
  }

  /* Sprite-baked soma glow, one offscreen canvas per hue. A radial gradient
     drawn per node per frame is what froze the 1,500-neuron spread layout;
     a drawImage of a cached sprite is free. Keyed by color string — the
     palette is 8 hues plus fallbacks, so the cache is bounded. */
  const spriteCache = new Map<string, HTMLCanvasElement>()
  const glowSprite = (col: string): HTMLCanvasElement => {
    let sp = spriteCache.get(col)
    if (sp) return sp
    const S = 64
    sp = document.createElement('canvas')
    sp.width = sp.height = S
    const c = sp.getContext('2d')!
    const g = c.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2)
    g.addColorStop(0, col)
    g.addColorStop(0.42, col)
    g.addColorStop(0.55, col) // hard-ish edge: the soma reads as a body
    g.addColorStop(1, 'transparent')
    c.globalAlpha = 1
    c.fillStyle = g
    c.fillRect(0, 0, S, S)
    spriteCache.set(col, sp)
    return sp
  }

  /* Deterministic per-link curvature from endpoint ids, so a wire bends the
     same way on every relayout and the two directions of a pair separate
     instead of overprinting. Hash by character pairs — no dependency. */
  const curvature = (l: any): number => {
    const a = String(l.source?.id ?? '')
    const b = String(l.target?.id ?? '')
    let h = 0
    for (let i = 0; i < a.length + b.length; i++) {
      h = (h * 31 + (a.charCodeAt(i % a.length) + b.charCodeAt(i % b.length))) | 0
    }
    return ((Math.abs(h) % 100) / 100) * 0.16 + 0.04
  }
  const traffic = (l: any): number =>
    (l.source?.degree ?? 0) + (l.target?.degree ?? 0)

  /** Fade a color toward the paper: 8-digit hex when the color is hex (the
   *  palette always is), untouched otherwise (hsl fallbacks stay full-strength).
   *  SIGNAL pass: 4d (30%) -> 34 (20%) — with somas dimmed harder too, a
   *  non-neighbor wire must recede AT LEAST as far as its endpoints or the
   *  ego view reads as fog instead of focus. */
  const fade = (col: string): string =>
    /^#[0-9a-fA-F]{6}$/.test(col) ? col + '34' : col

  /* ---------- LEVEL OF DETAIL (designer round-3 spec §3) ----------
     The corpus view used to paint all ~31k wires at token alpha plus halo
     rings per node, every zoom, every frame: additive overlap burned the
     whole field into one cyan mass — unreadable on a laptop and WORSE on a
     phone (390px of canvas under 31k wires). The fix is three zoom bands,
     re-evaluated per frame from the globalScale paintNode already receives:

       band 0 "corpus"  (gs < 0.45)  structure only: cold wires HIDDEN, halo
                                     rings off, hub labels only (deg >= 60)
       band 1 "backbone" (0.45..0.85) hub-to-hub wires only (either end
                                     degree >= 5) at 55% link alpha, one
                                     halo ring, hub + hot labels (deg >= 20)
       band 2 "detail"   (gs > 0.85)  everything, full alpha — the full web

     The selected node's own wires are hot and NEVER cull: selection must
     read identically at every zoom. Ego dimming (fade, below) still applies
     WITHIN every band — the two systems compose: LOD culls the far field,
     the ego fade recesses what remains around a selection.

     Mechanics that make this legal: force-graph re-reads linkVisibility/
     linkColor/linkWidth accessors on EVERY frame (paintLinks() builds fresh
     accessorFn wrappers per paint), so plain closures over `band` update the
     wires with zero accessor re-registration. The one accessor GraphView
     OWNS is linkColor (it sets it at construction and re-asserts it on theme
     token changes, clobbering ours) — so applyLinkLod() re-asserts our LOD
     chain on the first painted frame (after GraphView's construction chain)
     and again whenever the band changes. GraphView's clobber path (a theme
     flip) only restores the static color until the next band crossing or
     token-set, and a cocite dash needs preserving, so applyLinkLod carries
     the same dashed/dim cocite semantics GraphView paints (l.type). */
  let band = 2
  // Lattice overview, refreshed per paint: while the lattice owns the field
  // below zoom 1.1 (its fit scale), the corpus's 30k wires and 1.5r halo
  // rings bury the very grid the layout exists to show — the 2026-10-31
  // screenshot read as fur over the dots. So the overview ghosts the wires
  // down to the arteries (traffic ≥ 60), skips the halos, and labels hubs
  // only; past 1.1 the packed-view band rules take over. The link accessors
  // read this flag live per frame (same mechanism as `band`), so no
  // re-registration is needed when the visitor crosses the boundary.
  let latFit = false
  const touchesSel = (l: any): boolean => {
    const sel = focus.selected()
    return sel != null && (l.source?.id === sel || l.target?.id === sel)
  }
  const COCITE_DASH = [4, 4]
  /** A link whose endpoints are still unresolved (force-graph swaps the id
   *  strings for node objects during the data pipeline) has no color, no
   *  traffic and no business being painted. The paint pipeline evaluates the
   *  accessors for EVERY link while bucketing them — so these guards keep a
   *  mid-sync frame from throwing `node.tags[0]` on a bare string (the
   *  layout-toggle crash, 2026-10-31 audit). */
  const endpointsResolved = (l: any): boolean =>
    l.source != null && typeof l.source === 'object' && l.target != null && typeof l.target === 'object'
  const applyLinkLod = (): void => {
    engine
      .linkVisibility((l: any) =>
        endpointsResolved(l) &&
        (touchesSel(l) ||
        (latFit
          ? traffic(l) >= 60
          : (band === 2) ||
            (band === 1 && (traffic(l) >= 10 || (l.source?.degree ?? 0) >= 5 || (l.target?.degree ?? 0) >= 5))))
      )
      .linkColor((l: any) => {
        // Compose the four color systems, quietest wins at distance:
        //   hot (selection)  >  SIGNAL ego fade  >  lattice overview ghost  >  LOD band dim.
        if (touchesSel(l)) return hotCol
        if (!endpointsResolved(l)) return '#808080' // bucketed, never painted
        const base = fade(nodeColor(l.source, tokensNow()))
        if (latFit) return dimColor(base, 0.22)
        return band === 2 ? base : dimColor(base, band === 1 ? 0.55 : 0.4)
      })
      .linkLineDash((l: any) => (l.type === 'cocite' ? COCITE_DASH : null))
      .linkWidth((l: any) =>
        touchesSel(l)
          ? 2.0
          : latFit
            ? Math.min(1.1, 0.2 + 0.03 * Math.sqrt(traffic(l)))
            : band === 2
              ? Math.min(1.45, 0.4 + 0.07 * Math.sqrt(traffic(l)))
              : 0.35)
      .linkCurvature(curvature)
  }


  /* Label boxes claimed this frame. force-graph has no per-frame hook — only
     onEngineTick, which STOPS firing once the simulation cools while the
     canvas keeps repainting on every pan and zoom. So the reset is counted
     instead: the engine paints each node exactly once per frame, so when the
     draw count reaches the node count a new frame has begun.
     The boxes live in a coarse grid, not one flat list. A spread corpus is
     ~1,500 labels wide and a linear scan per label is 2.2M box tests a frame —
     a stutter at the exact moment the visitor is trying to read. A box is
     filed into every cell it spans (a 26-char title covers two cells at this
     size), so a test walks those cells instead of every label drawn before it. */
  type Box = { x: number; y: number; w: number; h: number }
  const CELL = 96
  let cells: Map<number, Box[]> = new Map()
  let drawn = 0
  let frameNodes = 0
  let miniLabelCount = 0
  const cellKey = (cx: number, cy: number): number => (cx + 65536) * 131072 + (cy + 65536)
  const eachCell = (b: Box, fn: (cx: number, cy: number) => void): void => {
    const x0 = Math.floor(b.x / CELL)
    const x1 = Math.floor((b.x + b.w) / CELL)
    const y0 = Math.floor(b.y / CELL)
    const y1 = Math.floor((b.y + b.h) / CELL)
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) fn(cx, cy)
  }
  const overlaps = (b: Box): boolean => {
    let hit = false
    eachCell(b, (cx, cy) => {
      if (hit) return
      const list = cells.get(cellKey(cx, cy))
      if (!list) return
      for (const o of list) {
        if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) {
          hit = true
          return
        }
      }
    })
    return hit
  }
  const claim = (b: Box): void => {
    eachCell(b, (cx, cy) => {
      const k = cellKey(cx, cy)
      const list = cells.get(k)
      if (list) list.push(b)
      else cells.set(k, [b])
    })
  }

  const paintNode = (n: any, ctx: Ctx, globalScale: number): void => {
    // Per-frame LOD bookkeeping: the node painter is the one hook that sees
    // globalScale, so it is also what keeps the link accessors honest. A band
    // crossing re-asserts the LOD link chain (see the block above for why the
    // re-assert, not a set-once, is required).
    const nextBand = globalScale < 0.45 ? 0 : globalScale < 0.85 ? 1 : 2
    const lat = !focus.compact && !!focus.lattice?.()
    latFit = lat && globalScale < 1.1
    if (nextBand !== band || !linkLodArmed) {
      band = nextBand
      linkLodArmed = true
      if (!focus.compact) applyLinkLod()
    }
    if (drawn >= frameNodes) {
      cells = new Map()
      drawn = 0
      miniLabelCount = 0
      frameNodes = engine.graphData().nodes.length || 1
    }
    drawn++
    const col = nodeColor(n, tokensNow())
    const r = somaRadius(n, focus.compact) * (focus.compact ? 1 : focus.somaScale?.() ?? 1)
    const hot = isHot(n.id)
    // The selected node alone: it wears the targeting reticle, the 1-hop
    // neighbours only the brighter halo. Reticle on one node is a cheap way
    // to make selection unmistakable without a shadowBlur per neuron.
    const chosen = n.id === focus.selected()
    const x = n.x ?? 0
    const y = n.y ?? 0
    // Ego dimming: when a neuron is selected, everything outside its 1-hop
    // recedes HARD toward the paper — ~15% visibility — so the synapses under
    // inspection read first. This is the SIGNAL pass's main depth cue: the
    // old 0.42 wash left non-neighbors at 58%, which competed with the hot
    // set at corpus scale. The base disc was already painted by force-graph
    // ('after' mode), so receding = a paper wash over it; hue-parity gates
    // sample ALPHA and the wash keeps every pixel's color channel the node's
    // own hue.
    const dim = !hot && focus.selected() != null
    if (dim && !focus.compact) {
      ctx.save()
      ctx.globalAlpha = 0.85
      ctx.fillStyle = paper
      ctx.beginPath()
      ctx.arc(x, y, r * 1.08, 0, 2 * Math.PI)
      ctx.fill()
      ctx.restore()
    }

    if (focus.compact) {
      // 'replace': we own the whole drawing — one small disc, ring when hot.
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = col
      ctx.fill()
      if (hot) {
        ctx.strokeStyle = col
        ctx.lineWidth = 1.6 / globalScale
        ctx.beginPath()
        ctx.arc(x, y, r * 2.3, 0, 2 * Math.PI)
        ctx.stroke()
      }
      // MINI HEADINGS (Owner law 2026-10-28). Same recipe as the full-mode
      // label below — claim grid, paper-coloured stroke behind the glyphs,
      // hot set never loses its name — at mini-map scale: 9px screen size,
      // under the soma, ink = --dn-fg (AA on --dn-graph-bg in both themes;
      // the halo stroke carries it over wires). OP-56 caps: 18-char truncation
      // (104px at 9px mono), at most miniCap() names besides the centre, and
      // a hub over 24 neighbours drops to centre + 2 — the centre (always hot
      // while a doc is open) keeps its name no matter what.
      if (focus.miniLabels?.()) {
        const cap = (frameNodes > 24 ? 2 : focus.miniCap?.() ?? 4) + 1
        const label = shortTitle(n.title ?? '', 18)
        if (label && (hot || miniLabelCount < cap)) {
          const fontSize = Math.max(8, 9 / globalScale)
          ctx.save()
          ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const ly = y + r + 2 / globalScale
          const lw = ctx.measureText(label).width
          const box = { x: x - lw / 2, y: ly, w: lw, h: fontSize * 1.2 }
          if (!hot && overlaps(box)) {
            ctx.restore()
            return
          }
          claim(box)
          miniLabelCount++
          ctx.strokeStyle = paper
          ctx.globalAlpha = 0.85
          ctx.lineWidth = fontSize * 0.32
          ctx.strokeText(label, x, ly)
          ctx.globalAlpha = 1
          ctx.fillStyle = chosen ? hotCol : hot ? col : ink
          ctx.fillText(label, x, ly)
          ctx.restore()
        }
      }
      return
    }

    // Dendritic tree, per LOD band composed with the SIGNAL ego-dim factor:
    // at corpus zoom the rings are what turned 1,400 neurons into one glow,
    // so band 0 drops them entirely (hot nodes keep a single inner ring — the
    // selection must still read at fit-all); band 1 keeps the inner ring
    // only; band 2 is the full two-ring tree at SIGNAL brightness. `dim`
    // multiplies whatever the band allows, so a selected neuron's
    // non-neighbors recede at every zoom.
    ctx.save()
    // The sprite glow under hot neurons: a real radial bloom instead of a
    // flat disc, at drawImage cost. Cold neurons keep the stroke rings.
    if (hot) {
      const sp = glowSprite(col)
      const gs = r * 5.2
      ctx.globalAlpha = chosen ? 0.62 : 0.42
      ctx.drawImage(sp, x - gs / 2, y - gs / 2, gs, gs)
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = col
    const halo = dim ? 0.35 : 1
    if ((band === 2 && !latFit) || hot) {
      ctx.lineWidth = (hot ? 1.7 : 1) / globalScale
      ctx.globalAlpha = halo * (hot ? 1 : band === 2 ? 0.55 : 0.7)
      ctx.beginPath()
      ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI)
      ctx.stroke()
    }
    if (band === 2 && !latFit) {
      ctx.globalAlpha = halo * (hot ? 0.6 : 0.3)
      ctx.beginPath()
      ctx.arc(x, y, r * 2.4, 0, 2 * Math.PI)
      ctx.stroke()
    }
    if (chosen) {
      // Four corner ticks + a bloom on the soma: the HUD "locked on" mark.
      ctx.globalAlpha = 1
      ctx.strokeStyle = hotCol
      ctx.lineWidth = 1.4 / globalScale
      ctx.shadowColor = hotCol
      ctx.shadowBlur = 10
      const g = r * 3.4
      const t = r * 1.1
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.beginPath()
        ctx.moveTo(x + sx * g, y + sy * g - sy * t)
        ctx.lineTo(x + sx * g, y + sy * g)
        ctx.lineTo(x + sx * g - sx * t, y + sy * g)
        ctx.stroke()
      }
    }
    ctx.restore()

    // Titles, per LOD band (designer spec §3, adapted for a DOCS corpus:
    // hub names are how the overview reads, so band 0 keeps the top hubs
    // rather than going fully blank):
    //   spread: every neuron is eligible — the layout's whole point — but at
    //           corpus zoom only the hubs (deg >= 60); the claim grid below
    //           still drops whichever names would overprint.
    //   band 0: hubs only (deg >= 60). A dozen names on a starfield.
    //   band 1: hot set + chapter hubs (deg >= 20).
    //   band 2: everything once the user zooms in (gs > 1.15), hubs, hot.
    const spread = !!focus.spread?.()
    const deg = n.degree ?? 0
    const labelOk = lat
      ? latFit
        ? deg >= 60
        : globalScale > 1.6 ? true : hot || deg >= 40
      : spread
        ? band === 0 ? deg >= 60 : true
        : band === 0 ? deg >= 60
        : band === 1 ? (hot || deg >= 20)
        : (globalScale > 1.15 || hot || deg >= 60)
    if (labelOk) {
      const label = shortTitle(n.title ?? '')
      if (!label) return
      const fontSize = labelPx / globalScale
      ctx.save()
      ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      // LABEL_LINE, not the outer halo ring: see core/graph.ts#labelExtent.
      const ly = y + r * LABEL_LINE + 1 / globalScale
      // LEVEL OF DETAIL, the cheap kind: a label that would land on one
      // already drawn is dropped rather than overprinted. In the ego view a
      // hub chapter has a dozen neighbours at the same radius, and without
      // this the ring of names is unreadable — exactly where legibility
      // matters most. The hot set (selection + its 1-hop) never loses its
      // label; only the background names do. In spread layout every node is
      // ELIGIBLE, so this is what keeps 1,500 titles from becoming ink.
      const w = ctx.measureText(label).width
      const box = { x: x - w / 2, y: ly, w, h: fontSize * 1.2 }
      if (!hot && overlaps(box)) {
        ctx.restore()
        return
      }
      claim(box)
      // Paper-coloured stroke behind the glyphs: readable on either theme and
      // over any wire hairball. Dimmed neurons' labels dim WITH them — a
      // full-brightness name over a 15% soma was the one place the old ego
      // view lied about what was connected.
      ctx.strokeStyle = paper
      ctx.globalAlpha = dim ? 0.4 : 0.8
      ctx.lineWidth = fontSize * 0.32
      ctx.strokeText(label, x, ly)
      ctx.globalAlpha = dim ? 0.3 : 1
      ctx.fillStyle = chosen ? hotCol : hot ? col : ink
      ctx.fillText(label, x, ly)
      ctx.restore()
    }
  }

  let linkLodArmed = false
  engine
    .nodeCanvasObjectMode(() => (focus.compact ? 'replace' : 'after'))
    .nodeCanvasObject(paintNode)

  if (!focus.compact) {
    engine
      // Initial wire state; the LOD chain (applyLinkLod) re-asserts
      // visibility/color/width/dash/curvature on the first painted frame and
      // at every zoom-band crossing, composing these SIGNAL recipes with the
      // band gates. Axons read as wires: width swollen by the traffic the two
      // ends carry (sqrt keeps hubs from eating the picture), 2.0 on the
      // selected neuron's synapses.
      .linkWidth((l: any) =>
        touchesSel(l)
          ? 2.0
          : Math.min(1.45, 0.4 + 0.07 * Math.sqrt(traffic(l))))
      // Wires bend apart so reciprocal pairs read as two roads, not one.
      .linkCurvature(curvature)
      // Firing traffic: the selected synapses get the full particle stream,
      // high-traffic axons fire a single ambient pulse so the corpus is
      // alive even before you pick anything. SIGNAL pass: the ambient
      // threshold dropped (64, was 80 — more of the corpus visibly fires)
      // and the stream itself got fatter and faster (width/speed below).
      .linkDirectionalParticles((l: any) =>
        touchesSel(l) ? 4 : traffic(l) >= 64 ? 1 : 0)
      .linkDirectionalParticleWidth((l: any) => (touchesSel(l) ? 2.6 : 2))
      .linkDirectionalParticleSpeed(0.0055)
      // After graphData() force-graph resolves endpoints to node objects.
      .linkDirectionalParticleColor((l: any) => nodeColor(l.source ?? {}, tokensNow()))
      // Untouched wires recede with the nodes when an ego view is up.
      .linkColor((l: any) =>
        touchesSel(l)
          ? nodeColor(l.source ?? {}, tokensNow())
          : fade(nodeColor(l.source ?? {}, tokensNow())))
  }
}
