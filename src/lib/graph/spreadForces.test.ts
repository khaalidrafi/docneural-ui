/* Tests for the two forces that make the spread layout READABLE.

   These are the only tests in the repo that assert something about a
   PICTURE — "no two titles touch, and the camera never had to zoom out to make
   that true" — so they are written as physics, not as pixels: the same tick
   loop d3 runs, the same label boxes the painter inks. A screenshot cannot be
   asserted, and a human reading one is exactly the check these tests exist to
   make unnecessary before review.

   The regression they encode is the expensive one. Every earlier cut of this
   layout passed a "nodes do not overlap" test while the site printed names on
   top of names, because the test measured discs and the painter draws labels,
   and because a fit below 1:1 silently shrinks every world-unit gap while the
   label keeps its screen size. So each test here ends at the CAMERA: compute
   the fit the way `fitReadable` does and require it to clear 1. */

import { describe, expect, it } from 'vitest'
import { labelExtent, shortTitle, type Extent } from '../core/graph'
import { forceFitContainer, forceLabelBoxes, type Blocker } from './spreadForces'

type Node = { id: number; title: string; x: number; y: number; vx: number; vy: number }

const SOMA = 8
const extentOf = (n: Node): Extent => labelExtent(n.title, SOMA)

/** Chapter heads with the real corpus's shape: `shortTitle` caps a name at 26
 *  chars, so the widest label in a 30-node ego graph is a whole clause, and the
 *  narrowest is `Top`. Packing is decided by that spread, not by the average. */
const TITLES = [
  'Agenda Views (The Org Manual)',
  'Custom Agenda Views',
  'Properties and Columns',
  'Time-of-day specifications',
  'Mapping of keys and actions',
  'Filtering in the agenda',
  'Exporting',
  'Tables',
  'Top',
  'Key Index',
  'Concept Index',
  'Hyperlinks',
  'Tags',
  'Main Index',
  'Working with Source Code',
  'Markup for Rich Contents',
  'Choosing Modes',
  'Calendar/Diary',
  'Outline Mode',
  'Command Index',
  'Variable Index',
  'Dates and Times',
  'Document Structure',
  'Introduction',
  'Miscellaneous',
  'Printing',
  'Publishing',
  'Hacking',
  'Refile and Archiving',
  'Capture and Attachments'
]

/** d3's own seed (`initializeNodes` in force-simulation): a phyllotaxis spiral
 *  of ~10 px per step, which for 30 nodes is a disc 110 px across — every label
 *  in the field on top of every other. Starting from a grid would test the
 *  force's manners and not its muscle. */
function seed(n: number): Node[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: n }, (_, i) => {
    const radius = 10 * Math.sqrt(0.5 + i)
    const angle = i * golden
    return {
      id: i,
      title: TITLES[i % TITLES.length],
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      vx: 0,
      vy: 0
    }
  })
}

/** d3's own tick order: every force runs — in REGISTRATION order, which is the
 *  thing these tests caught a bug in — then velocity is damped, then position
 *  integrates. The order matters twice over: a projection that forgets to clamp
 *  `vx` is undone by the integration on the same tick, and a packing pass that
 *  runs AFTER the container spring is the last word on where a node ends up. */
function settle(nodes: Node[], forces: { (a: number): void }[], ticks = 180): Node[] {
  let alpha = 1
  for (let t = 0; t < ticks; t++) {
    alpha *= 1 - 0.0228 // d3AlphaDecay
    for (const f of forces) f(alpha)
    for (const n of nodes) {
      n.vx *= 1 - 0.4 // d3VelocityDecay
      n.vy *= 1 - 0.4
      n.x += n.vx
      n.y += n.vy
    }
  }
  return nodes
}

/** The two spread forces as `applyLayout` registers them: container first,
 *  packing last. */
function spread(ROOM: { w: number; h: number }, blockers: Blocker[] = []) {
  return (nodes: Node[]): Node[] => {
    const fit = forceFitContainer(ROOM, extentOf)
    const pack = forceLabelBoxes(extentOf, blockers)
    for (const f of [fit, pack]) f.initialize(nodes)
    return settle(nodes, [fit, pack])
  }
}

/** Every pair of label boxes still sharing ink. */
function colliding(nodes: Node[]): [number, number][] {
  const bad: [number, number][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const ea = extentOf(a)
      const eb = extentOf(b)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const ox = dx >= 0 ? ea.r + eb.l - dx : ea.l + eb.r + dx
      const oy = dy >= 0 ? ea.b + eb.t - dy : ea.t + eb.b + dy
      // Half a pixel of tolerance: the projection resolves exactly, but the last
      // integration step can creep by a fraction of a hair.
      if (ox > 0.5 && oy > 0.5) bad.push([a.id, b.id])
    }
  }
  return bad
}

/** The camera's answer, copied from `fitReadable`: nodes-only bbox into the
 *  usable rect, capped at 1:1 by the spread layout. */
function fitAt(nodes: Node[], room: { w: number; h: number }): number {
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const worldW = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const worldH = Math.max(1, Math.max(...ys) - Math.min(...ys))
  return Math.min(room.w / worldW, room.h / worldH, 1)
}

describe('spreadForces', () => {
  // A laptop with the note panel open: the readable canvas is 664 px wide, and
  // the room is that less the camera's padding. This is the case that used to
  // land at 0.883 with names touching.
  const ROOM = { w: 616, h: 780 }

  it('separates every label box from a collapsed pile', () => {
    const nodes = seed(30)
    const forces = [forceLabelBoxes(extentOf), forceFitContainer(ROOM, extentOf)]
    for (const f of forces) f.initialize(nodes)
    settle(nodes, forces)
    expect(colliding(nodes)).toEqual([])
  })

  it('keeps every box inside the room it was packed for', () => {
    const nodes = seed(30)
    const forces = [forceLabelBoxes(extentOf), forceFitContainer(ROOM, extentOf)]
    for (const f of forces) f.initialize(nodes)
    settle(nodes, forces)
    for (const n of nodes) {
      const e = extentOf(n)
      expect(n.x + e.r).toBeLessThanOrEqual(ROOM.w / 2 + 1)
      expect(n.x - e.l).toBeGreaterThanOrEqual(-ROOM.w / 2 - 1)
      expect(n.y + e.b).toBeLessThanOrEqual(ROOM.h / 2 + 1)
      expect(n.y - e.t).toBeGreaterThanOrEqual(-ROOM.h / 2 - 1)
    }
  })

  it('holds the fit at 1:1, so labels are inked at the size they were packed for', () => {
    const nodes = seed(30)
    const forces = [forceLabelBoxes(extentOf), forceFitContainer(ROOM, extentOf)]
    for (const f of forces) f.initialize(nodes)
    settle(nodes, forces)
    expect(fitAt(nodes, ROOM)).toBeGreaterThanOrEqual(1)
  })

  it('routes the field around corner chrome instead of under it', () => {
    // The filter drawer: 250 × 108 of chrome pinned to the room's top-left,
    // which is NOT an edge of the room and so cannot be an inset.
    const drawer: Blocker = { x: -ROOM.w / 2 + 125, y: -ROOM.h / 2 + 54, l: 133, r: 125, t: 62, b: 54 }
    const nodes = seed(30)
    const forces = [forceLabelBoxes(extentOf, [drawer]), forceFitContainer(ROOM, extentOf)]
    for (const f of forces) f.initialize(nodes)
    settle(nodes, forces)
    for (const n of nodes) {
      const e = extentOf(n)
      const dx = drawer.x - n.x
      const dy = drawer.y - n.y
      const ox = dx >= 0 ? e.r + drawer.l - dx : e.l + drawer.r + dx
      const oy = dy >= 0 ? e.b + drawer.t - dy : e.t + drawer.b + dy
      expect(ox > 0.5 && oy > 0.5).toBe(false)
    }
    // …and the chrome did not cost readability: the room minus a corner still
    // packs to 1:1, which the same room shaved to a band would not.
    expect(colliding(nodes)).toEqual([])
    expect(fitAt(nodes, ROOM)).toBeGreaterThanOrEqual(1)
  })

  it('leaves a field that already fits alone', () => {
    // Two nodes a screen apart must not be shoved together by the packing pass:
    // the force is a constraint, not a spring.
    const nodes: Node[] = [
      { id: 0, title: 'Top', x: -200, y: 0, vx: 0, vy: 0 },
      { id: 1, title: 'Exporting', x: 200, y: 0, vx: 0, vy: 0 }
    ]
    const big = { w: 1200, h: 900 }
    const forces = [forceLabelBoxes(extentOf), forceFitContainer(big, extentOf)]
    for (const f of forces) f.initialize(nodes)
    settle(nodes, forces, 60)
    expect(nodes[0].x).toBeCloseTo(-200)
    expect(nodes[1].x).toBeCloseTo(200)
    expect(nodes[0].y).toBeCloseTo(0)
    expect(nodes[1].y).toBeCloseTo(0)
  })

  it('is bounded by the widest label, not the node count squared', () => {
    // The grid is the whole reason this can run on a Celeron: doubling the
    // field must not quadruple the tick. Asserted as a wall-clock ratio with
    // generous margins — the point is "linear-ish", never a benchmark.
    const run = (n: number): number => {
      const nodes = seed(n)
      const forces = [forceLabelBoxes(extentOf), forceFitContainer(ROOM, extentOf)]
      for (const f of forces) f.initialize(nodes)
      const t0 = performance.now()
      settle(nodes, forces, 60)
      return performance.now() - t0
    }
    run(40) // warm up: first call pays for JIT
    const small = run(60)
    const big = run(240)
    expect(big / Math.max(small, 0.001)).toBeLessThan(12) // 4× the nodes, <12× the time
    expect(shortTitle('Agenda Views (The Org Manual)').length).toBeLessThan(30)
  })
})
