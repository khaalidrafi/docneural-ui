/* spreadForces — the two forces that make the spread layout READABLE.

   force-graph ships `forceCollide`, which keeps nodes a given RADIUS apart. A
   chapter title is not round: capped at 26 characters of 11px monospace it is
   about 180 × 13 px, and a circle wide enough to keep two of those apart
   shoulder to shoulder (r ≈ 90) reserves 25,000 px² for 2,300 px² of ink. Feed
   that to a 30-node ego graph and the field balloons past the viewport, the fit
   has to zoom OUT to ~0.6 to frame it, and the titles — which paint at a
   constant screen size — fall on top of each other anyway. The circle is not
   just wasteful, it is self-defeating.

   So there are two forces here, and they answer two different questions.

   `forceLabelBoxes` — WHERE a node may not be: pack the label rectangles, so a
   column of short names sits as tight as a row of long ones and no two names
   can touch. It projects positions, because a velocity nudge converges in
   proportion to alpha, and alpha is nearly zero by the time a layout settles.

   `forceFitContainer` — WHAT SHAPE the field takes. Symmetric gravity (d3's
   forceCenter, which is what ships) makes a ROUND blob, and a round blob of
   wide labels wastes the vertical room a reading window has: measured on the
   Agenda Views ego graph, 697 × 608 of field in a 552 × 768 window, so the fit
   had to zoom out to 0.79 and the labels — constant on screen, shrinking in
   world units — overlapped again. Pulling nodes into the viewport's own
   rectangle instead gives the packing the aspect it has to fill, which is what
   lets a small view land at 1:1.

   Cost: both are linear — a uniform grid rebuilt per sweep, and one multiply per
   node — which on a 4 GB Celeron is the difference between a relayout and a
   freeze. (d3's collide is a quadtree pass; this is a hash pass.) */

import type { Extent } from '../core/graph'

/** A d3 simulation node: the fields these two forces touch. */
type Body = { x: number; y: number; vx: number; vy: number }

/** A keep-out box that does not move: the same extents as a node's label,
 *  pinned to a world coordinate. The filter drawer and the HUD chips are these. */
export type Blocker = Extent & { x: number; y: number }

export type SpreadForce = {
  (alpha: number): void
  initialize(nodes: Body[]): void
}

/** How many Gauss-Seidel sweeps per tick. One leaves the pile half-resolved
    because a node pushed out of one box is pushed into the next; two means the
    second sweep sees the damage the first did. Three exists because the charge
    grew (network pass: 44 + 1.1×label): with the corner-chrome blocker in
    play, the node the blocker evicts lands inside a neighbour's box on the
    SAME sweep, and two sweeps left exactly that pair overlapping at settle —
    a real regression spreadForces.test.ts caught ('routes the field around
    corner chrome'). The third sweep is the one that sees the eviction's
    aftermath. Each sweep rebuilds the grid, so this is the only knob for
    cost-vs-tightness, and on a 1,500-node corpus three hash passes a tick is
    still linear. */
const PASSES = 3

/** Each node of a colliding pair takes half the correction, so the pair's
 *  centre of mass does not move — the field drifts by nothing but its own
 *  packing. */
const PUSH = 0.5

/**
 * Build the packing force. `extent` is read per node per tick — it depends on
 * the title, and titles do not change while the sim runs, but reading it keeps
 * this file free of knowledge about what a node is.
 *
 * `N` is the caller's view of a node (its `title`, its `degree`); this module
 * only ever touches the x/y that d3 adds to those same objects. So the fields
 * are split in the type and joined at `initialize`, where d3 hands back the
 * engine's own nodes — one object, both halves.
 */
export function forceLabelBoxes<N>(
  extent: (n: N) => Extent,
  blockers: Blocker[] = []
): SpreadForce {
  let nodes: (N & Body)[] = []

  function initialize(next: Body[]): void {
    nodes = next as (N & Body)[]
  }

  function force(_alpha: number): void {
    const n = nodes.length
    if (n < 2) return

    for (let pass = 0; pass < PASSES; pass++) {
      // Cell = the widest name in the field, so two overlapping boxes are always
      // in the same cell or in neighbours of it. Rebuilt every sweep because the
      // sweep itself moves the nodes, and a stale grid silently misses pairs.
      let span = 1
      for (let i = 0; i < n; i++) {
        const e = extent(nodes[i])
        if (e.l + e.r > span) span = e.l + e.r
      }
      const cell = span
      const grid = new Map<number, number[]>()
      const key = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768)
      for (let i = 0; i < n; i++) {
        const p = nodes[i]
        const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell))
        const list = grid.get(k)
        if (list) list.push(i)
        else grid.set(k, [i])
      }

      for (let i = 0; i < n; i++) {
        const a = nodes[i]
        const ea = extent(a)
        const cx = Math.floor(a.x / cell)
        const cy = Math.floor(a.y / cell)
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const list = grid.get(key(gx, gy))
            if (!list) continue
            for (let li = 0; li < list.length; li++) {
              const j = list[li]
              if (j <= i) continue // every pair once
              const b = nodes[j]
              const eb = extent(b)
              const dx = b.x - a.x
              const dy = b.y - a.y
              // Separating axes: how far the boxes still have to travel on x
              // (resp. y) to stop touching. ≤ 0 on either axis means there is a
              // gap and the pair is done.
              const overlapX = dx >= 0 ? ea.r + eb.l - dx : ea.l + eb.r + dx
              const overlapY = dy >= 0 ? ea.b + eb.t - dy : ea.t + eb.b + dy
              if (overlapX <= 0 || overlapY <= 0) continue
              // Move the POSITIONS, not the velocities. A velocity nudge is a
              // gradient step: it converges in proportion to `alpha`, which
              // d3 has already decayed to 0.017 by the last tick of a 180-tick
              // layout, so a pile that starts collapsed — which is exactly how
              // force-graph seeds nodes — never gets out of itself. This is a
              // projection, and it finishes the job on the tick it finds the
              // overlap, which is what "no two titles may overlap" promises.
              //
              // Resolve on the cheaper axis: the shortest move out of a pile is
              // the one a reader sees as names sliding apart rather than as an
              // explosion.
              if (overlapX < overlapY) {
                const d = (dx >= 0 ? 1 : -1) * overlapX * PUSH
                a.x -= d
                b.x += d
                // And kill the velocity that would undo it. d3 integrates
                // `x += vx` AFTER every force has run, so a projection alone
                // leaves the last word to whoever pushed hardest — with the
                // container spring on a 0.99 fit, that is a whole label width of
                // re-overlap on the final tick. This is the no-penetration
                // condition of a contact constraint: a node may keep moving
                // along the gap, never into it.
                if (d > 0) {
                  a.vx = Math.min(a.vx, 0)
                  b.vx = Math.max(b.vx, 0)
                } else {
                  a.vx = Math.max(a.vx, 0)
                  b.vx = Math.min(b.vx, 0)
                }
              } else {
                const d = (dy >= 0 ? 1 : -1) * overlapY * PUSH
                a.y -= d
                b.y += d
                if (d > 0) {
                  a.vy = Math.min(a.vy, 0)
                  b.vy = Math.max(b.vy, 0)
                } else {
                  a.vy = Math.max(a.vy, 0)
                  b.vy = Math.min(b.vy, 0)
                }
              }
            }
          }
        }
      }

      // Corner chrome the room cannot express as an inset — the filter drawer,
      // the HUD chips — is an immovable box: the node gives all of the
      // separation, and there is no twin to share the push with. Its own pass,
      // after the pairs, so a node shoved out of a blocker is still straightened
      // out of the pile by the next sweep.
      for (let i = 0; i < n; i++) {
        const a = nodes[i]
        const ea = extent(a)
        for (const o of blockers) {
          const dx = o.x - a.x
          const dy = o.y - a.y
          const overlapX = dx >= 0 ? ea.r + o.l - dx : ea.l + o.r + dx
          const overlapY = dy >= 0 ? ea.b + o.t - dy : ea.t + o.b + dy
          if (overlapX <= 0 || overlapY <= 0) continue
          if (overlapX < overlapY) {
            const d = (dx >= 0 ? -1 : 1) * overlapX
            a.x += d
            a.vx = d > 0 ? Math.max(a.vx, 0) : Math.min(a.vx, 0)
          } else {
            const d = (dy >= 0 ? -1 : 1) * overlapY
            a.y += d
            a.vy = d > 0 ? Math.max(a.vy, 0) : Math.min(a.vy, 0)
          }
        }
      }
    }
  }

  force.initialize = initialize
  return force as SpreadForce
}

/**
 * Keep every label box inside the window's own rectangle.
 *
 * `box` is the USABLE rect at 1:1 — the same numbers `fitReadable` frames with,
 * panel inset and padding already removed — so the layout is authored at the
 * scale it will be read at rather than resized afterwards. A box that pokes past
 * an edge gets a spring back off that edge (STIFFNESS of the overshoot per tick,
 * damped by d3's own velocityDecay); a box inside is left alone, which is what
 * leaves the packing force free to arrange names into columns. Corner chrome the
 * rect cannot express — the filter drawer, the HUD chips — arrives as an
 * obstacle instead, so the room stays the big rectangle the layout wants.
 *
 * Why the room has to be the whole rect: `getGraphBbox` — what the camera fits —
 * is the nodes' extent, which is smaller than their labels, so a field of boxes
 * inside the room has a bbox strictly inside it, the fit computes >= 1, the 1:1
 * cap binds, and the titles land at exactly the size they were packed for. Pack
 * against a smaller rect and the camera must zoom out; zoom out and a label's
 * world footprint (`labelWidth / k`) outgrows the reserve (`labelWidth`) it was
 * packed with — which is the whole overlap bug in one sentence. Measured: with
 * the drawer and chips taken out of the rect as a top and bottom inset, the
 * room went landscape (616 × 574) while a citation star packs PORTRAIT (columns
 * of wide names, 488 × 650), and the fit landed at 0.883 with names touching.
 * Same graph, obstacles for the corner chrome: 1:1.
 *
 * Not alpha-scaled, on purpose: the shape has to still be true on the last tick,
 * and alpha is 0.017 by then.
 */
export function forceFitContainer<N>(
  box: { w: number; h: number },
  extent: (n: N) => Extent
): SpreadForce {
  let nodes: (N & Body)[] = []
  // Half the overshoot removed per tick. Below ~0.3 the packing pressure wins
  // and the view settles under 1:1, which re-overlaps the titles; above ~0.6
  // the spring beats the packing on a crowded field and rings the boundary with
  // nodes that are still overlapping.
  const STIFFNESS = 0.5

  function initialize(next: Body[]): void {
    nodes = next as (N & Body)[]
  }

  function force(): void {
    const hx = Math.max(1, box.w / 2)
    const hy = Math.max(1, box.h / 2)
    for (const n of nodes) {
      const e = extent(n)
      // One spring per edge. A box wider than the room overshoots both at once
      // and is tugged to the centre, which is the honest answer: it does not fit.
      const right = n.x + e.r - hx
      if (right > 0) n.vx -= right * STIFFNESS
      const left = e.l - hx - n.x
      if (left > 0) n.vx += left * STIFFNESS
      const down = n.y + e.b - hy
      if (down > 0) n.vy -= down * STIFFNESS
      const up = e.t - hy - n.y
      if (up > 0) n.vy += up * STIFFNESS
    }
  }

  force.initialize = initialize
  return force as SpreadForce
}
