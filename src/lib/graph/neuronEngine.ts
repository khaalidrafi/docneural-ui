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
// own --sy-fg/--sy-bg so text stays readable on both themes.
import { canvasTokens, nodeColor, type CanvasTokens } from 'orui/graph/colors'
import { LABEL_LINE, labelExtent, shortTitle, spreadStrength } from '../core/graph'
import {
  forceFitContainer,
  forceLabelBoxes,
  type Blocker
} from './spreadForces'
import type { LayoutMode } from '../core/types'

// The force-graph instance is a chainable kapsule; GraphView keeps its own
// structural type private, so we stay loose here on purpose. Exported because
// SynapsesGraph holds the instance to push layout changes into it.
export type Engine = any
type Ctx = CanvasRenderingContext2D

/** The fields of an engine node this module reads. GraphView copies them onto
 *  its own node objects at sync time; force-graph then adds x/y/velocity. */
type Painted = { title?: string; degree?: number }

export type NeuronFocus = {
  /** Element whose computed style carries the resolved --orui-* / --sy-* tokens. */
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
  engine.zoom(k, 420)
  // The visible rect is off-centre whenever an overlay eats one side, so the
  // world point to park at the CANVAS centre is off-centre by half the
  // difference — over the scale, because it is a screen distance.
  engine.centerAt(
    (bbox.x[0] + bbox.x[1]) / 2 + (inset.right - inset.left) / (2 * k),
    (bbox.y[0] + bbox.y[1]) / 2 + (inset.bottom - inset.top) / (2 * k),
    420
  )
  return { k, w: worldW, h: worldH }
}

function installNeuron(engine: Engine, focus: NeuronFocus): void {
  let tokens: CanvasTokens = canvasTokens(() => '')
  let ink = '#d7e2dc'
  let paper = '#10151a'
  let hotCol = '#ffd60a'
  let readAt = 0
  const tokensNow = (): CanvasTokens => {
    const t = performance.now()
    if (t - readAt > 500) {
      readAt = t
      const el = focus.tokenEl()
      if (el) {
        const get = (name: string) => getComputedStyle(el).getPropertyValue(name)
        tokens = canvasTokens(get)
        ink = get('--sy-fg').trim() || ink
        paper = get('--sy-bg').trim() || paper
        hotCol = get('--sy-hot').trim() || hotCol
      }
    }
    return tokens
  }

  const isHot = (id: string): boolean => {
    const sel = focus.selected()
    return sel != null && (id === sel || focus.neighbors().has(id))
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
    if (drawn >= frameNodes) {
      cells = new Map()
      drawn = 0
      frameNodes = engine.graphData().nodes.length || 1
    }
    drawn++
    const col = nodeColor(n, tokensNow())
    const r = somaRadius(n, focus.compact)
    const hot = isHot(n.id)
    // The selected node alone: it wears the targeting reticle, the 1-hop
    // neighbours only the brighter halo. Reticle on one node is a cheap way
    // to make selection unmistakable without a shadowBlur per neuron.
    const chosen = n.id === focus.selected()
    const x = n.x ?? 0
    const y = n.y ?? 0

    if (focus.compact) {
      // 'replace': we own the whole drawing — one small disc, ring when hot.
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = col
      ctx.fill()
      if (hot) {
        ctx.strokeStyle = col
        ctx.lineWidth = 1.2 / globalScale
        ctx.beginPath()
        ctx.arc(x, y, r * 2.1, 0, 2 * Math.PI)
        ctx.stroke()
      }
      return
    }

    // Dendritic tree: inner halo (always), outer haze. Cold nodes get a
    // BRIGHTER halo than before — at corpus zoom the old 0.14 alpha outer
    // ring was invisible, which is exactly what made neurons untrackable.
    ctx.save()
    ctx.strokeStyle = col
    ctx.lineWidth = (hot ? 1.6 : 1) / globalScale
    ctx.globalAlpha = hot ? 0.85 : 0.4
    ctx.beginPath()
    ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.globalAlpha = hot ? 0.5 : 0.22
    ctx.beginPath()
    ctx.arc(x, y, r * 2.4, 0, 2 * Math.PI)
    ctx.stroke()
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

    // Titles: hubs always (that is how you recognise the chapters), the hot
    // set always, everything else once the user zooms in — or once they ask
    // for the spread layout, whose entire point is a name per neuron.
    const spread = !!focus.spread?.()
    if (spread || globalScale > 1.15 || hot || (n.degree ?? 0) >= 60) {
      const label = shortTitle(n.title ?? '')
      if (!label) return
      const fontSize = 11 / globalScale
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
      // over any wire hairball.
      ctx.strokeStyle = paper
      ctx.globalAlpha = 0.8
      ctx.lineWidth = fontSize * 0.32
      ctx.strokeText(label, x, ly)
      ctx.globalAlpha = 1
      ctx.fillStyle = chosen ? hotCol : hot ? col : ink
      ctx.fillText(label, x, ly)
      ctx.restore()
    }
  }

  engine
    .nodeCanvasObjectMode(() => (focus.compact ? 'replace' : 'after'))
    .nodeCanvasObject(paintNode)

  if (!focus.compact) {
    const touches = (l: any): boolean => {
      const sel = focus.selected()
      return sel != null && (l.source?.id === sel || l.target?.id === sel)
    }
    engine
      // 0.25 was invisible on the light theme; axons should read as wires.
      .linkWidth((l: any) => (touches(l) ? 1.4 : 0.5))
      .linkDirectionalParticles((l: any) => (touches(l) ? 3 : 0))
      .linkDirectionalParticleWidth(1.8)      // After graphData() force-graph resolves endpoints to node objects.
      .linkDirectionalParticleColor((l: any) => nodeColor(l.source ?? {}, tokensNow()))
  }
}
