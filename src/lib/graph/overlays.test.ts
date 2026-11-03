// overlays.test.ts — the pure half of DocneuralGraph's viewport() (board
// TODO-001 S1/S2): which chrome rect is an INSET (a slice of the room the
// layout must keep) and which is a CORNER (a keep-out the physics routes
// around). The component measures the DOM; these tests own the verdicts.
import { describe, expect, it } from 'vitest'
import { cornerBlocker, planOverlays, type Box } from './overlays'

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
})

// A 390x844 phone dish and a 1280x800 desk dish.
const PHONE = box(0, 0, 390, 700)
const DESK = box(0, 0, 1280, 730)

describe('planOverlays: side panels become horizontal insets', () => {
  it('a right side panel (desktop note preview) insets the RIGHT edge', () => {
    const panel = box(704, 0, 576, 730) // min(46rem, 55vw) at 1280
    const plan = planOverlays(DESK, [panel])
    expect(plan.inset.right).toBe(576)
    expect(plan.inset.left).toBe(0)
    expect(plan.inset.top).toBe(0)
    expect(plan.inset.bottom).toBe(0)
    expect(plan.corners).toHaveLength(0)
  })

  it('a LEFT panel insets the left edge', () => {
    const panel = box(0, 0, 300, 730)
    const plan = planOverlays(DESK, [panel])
    expect(plan.inset.left).toBe(300)
    expect(plan.inset.right).toBe(0)
  })

  it('the nearer edge wins when a panel is off-centre', () => {
    // 200px of box on its left, 880 on its right: it owns the left side.
    const panel = box(0, 0, 200, 730)
    expect(planOverlays(DESK, [panel]).inset.left).toBe(200)
    // Mirror: 200px free on the right -> it owns the right side.
    const mirror = box(1080, 0, 200, 730)
    expect(planOverlays(DESK, [mirror]).inset.right).toBe(200)
  })

  it('keeps a panel that is 1px short of full height a SLICE, not a corner', () => {
    // The 2px tolerance is what stops a hairline gap from un-insetting a panel.
    const panel = box(704, 0, 576, 728)
    const plan = planOverlays(DESK, [panel])
    expect(plan.inset.right).toBe(576)
    expect(plan.corners).toHaveLength(0)
  })
})

describe('planOverlays: full-width sheets become vertical insets', () => {
  it('a phone bottom sheet insets the BOTTOM edge (F3 path)', () => {
    const sheet = box(0, 380, 390, 320) // max-height 46dvh at 700 tall
    const plan = planOverlays(PHONE, [sheet])
    expect(plan.inset.bottom).toBe(320)
    expect(plan.inset.top).toBe(0)
    expect(plan.inset.right).toBe(0)
    expect(plan.corners).toHaveLength(0)
  })

  it('a phone TOP sheet insets the TOP edge (F4 path)', () => {
    const sheet = box(0, 0, 390, 420)
    const plan = planOverlays(PHONE, [sheet])
    expect(plan.inset.top).toBe(420)
    expect(plan.inset.bottom).toBe(0)
  })

  it('a sheet hugging the bottom edge insets bottom, not top', () => {
    // r.top - box.top (380) < box.bottom - r.bottom (0)? No: 380 < 0 is
    // false, so the sheet must take the BOTTOM (the nearer edge).
    const sheet = box(0, 380, 390, 320)
    const plan = planOverlays(PHONE, [sheet])
    expect(plan.inset.bottom).toBe(320)
    expect(plan.inset.top).toBe(0)
  })
})

describe('planOverlays: corner chrome becomes keep-outs', () => {
  it('a small chip is a canvas-relative corner rect', () => {
    const chip = box(12, 560, 180, 44) // scope chip, bottom-left
    const plan = planOverlays(PHONE, [chip])
    expect(plan.inset.top + plan.inset.right + plan.inset.bottom + plan.inset.left).toBe(0)
    expect(plan.corners).toEqual([{ x: 12, y: 560, w: 180, h: 44 }])
  })

  it('the desktop filter drawer is a corner, not an inset', () => {
    const drawer = box(14, 14, 250, 320)
    const plan = planOverlays(DESK, [drawer])
    expect(plan.corners).toEqual([{ x: 14, y: 14, w: 250, h: 320 }])
  })

  it('rects off the dish and zero-sized rects are ignored', () => {
    const plan = planOverlays(PHONE, [
      box(400, 0, 100, 100), // right of the dish
      box(0, 800, 100, 100), // below the dish
      box(12, 12, 0, 44) // collapsed <details>: zero size
    ])
    expect(plan.corners).toHaveLength(0)
    expect(plan.inset.top + plan.inset.right + plan.inset.bottom + plan.inset.left).toBe(0)
  })

  it('mixed chrome splits into an inset AND corners in one pass', () => {
    const plan = planOverlays(PHONE, [
      box(0, 380, 390, 320), // note sheet -> bottom inset
      box(12, 560, 180, 44), // scope chip -> corner
      box(12, 510, 120, 40) // layout chip -> corner
    ])
    expect(plan.inset.bottom).toBe(320)
    expect(plan.corners).toHaveLength(2)
  })
})

describe('cornerBlocker: the world-space keep-out (S2 pad)', () => {
  it('centres the blocker on the chrome, offset by the visible-rect centre', () => {
    const b = cornerBlocker({ x: 12, y: 560, w: 180, h: 44 }, 195, 340, 0)
    expect(b.x).toBeCloseTo(102 - 195) // chip centre x - visible centre x
    expect(b.y).toBeCloseTo(582 - 340)
    expect(b.l).toBe(90)
    expect(b.r).toBe(90)
    expect(b.t).toBe(22)
    expect(b.b).toBe(22)
  })

  it('pads every side by the label reach, so node LABELS keep out too', () => {
    const b = cornerBlocker({ x: 0, y: 0, w: 100, h: 40 }, 0, 0, 46)
    expect(b.l).toBe(50 + 46)
    expect(b.r).toBe(50 + 46)
    expect(b.t).toBe(20 + 46)
    expect(b.b).toBe(20 + 46)
  })

  it('a negative pad is clamped to zero, never a negative keep-out', () => {
    const b = cornerBlocker({ x: 0, y: 0, w: 100, h: 40 }, 0, 0, -5)
    expect(b.l).toBe(50)
    expect(b.t).toBe(20)
  })
})
