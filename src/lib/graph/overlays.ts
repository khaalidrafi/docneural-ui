// overlays.ts — the PURE core of DocneuralGraph's viewport() measurement
// (board TODO-001 S1/S2/F2). The component measures DOM rects; this module
// answers the only interesting question about them: which dock/chrome rect
// took a whole SIDE of the canvas (an inset the layout and camera must
// honour) and which took a CORNER (a keep-out the physics routes around).
// Extracted so the classification math — the exact place a wrong comparator
// turns a bottom sheet into a top inset, or a panel into an unpadded
// corner — is unit-testable without a DOM.

/** A DOMRect-shaped box: everything the classifier needs, nothing else. */
export type Box = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type Inset = { top: number; right: number; bottom: number; left: number }

/** A corner keep-out, CANVAS-relative (the wrap's own coordinate space). */
export type CornerBox = { x: number; y: number; w: number; h: number }

export type OverlayPlan = {
  inset: Inset
  /** Corner chrome as canvas-relative rects (chips, the filter drawer, the
   *  empty-hint). The caller maps these to world-space blockers for the
   *  packing force and to screen-space keep-outs for the label painter. */
  corners: CornerBox[]
}

/**
 * Classify chrome rects against the canvas box.
 *
 * Three verdicts, exactly as viewport() has always ruled:
 *  - an overlay SPANNING the box on one axis took a whole SLICE — an inset:
 *    full-height → the nearer horizontal edge (left/right); full-width → the
 *    nearer vertical edge (top/bottom);
 *  - anything else is a CORNER keep-out;
 *  - a rect that does not intersect the box at all, or measures zero (a
 *    closed <details>, an absent selection), is ignored.
 *
 * The 2px tolerances are load-bearing: a panel that IS the box width/height
 * must not be off-by-a-hair into "corner" (which would un-inset the phone
 * sheet and let the field pack underneath it).
 */
export function planOverlays(box: Box, rects: Box[]): OverlayPlan {
  const inset: Inset = { top: 0, right: 0, bottom: 0, left: 0 }
  const corners: CornerBox[] = []
  for (const r of rects) {
    if (!r.width || !r.height) continue
    if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom)
      continue
    if (r.height >= box.height - 2) {
      // A full-height panel: it took the LEFT or the RIGHT of the room.
      if (r.left - box.left < box.right - r.right) inset.left = Math.max(inset.left, r.right - box.left)
      else inset.right = Math.max(inset.right, box.right - r.left)
    } else if (r.width >= box.width - 2) {
      // A full-width sheet: it took the TOP or the BOTTOM of the room.
      if (r.top - box.top < box.bottom - r.bottom) inset.top = Math.max(inset.top, r.bottom - box.top)
      else inset.bottom = Math.max(inset.bottom, box.bottom - r.top)
    } else {
      corners.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height })
    }
  }
  return { inset, corners }
}

/**
 * The world-space Blocker for one corner rect: the box the spread packing
 * force routes around, centred on the chrome and widened by `pad` — the
 * keep-out that used to reserve "node centers + 8px" only, which let hub
 * LABELS clip under the panel (S2). `pad` is the label reach (see the
 * caller: the measured max label extent of the live view).
 */
export function cornerBlocker(
  c: CornerBox,
  cx: number,
  cy: number,
  pad: number
): { x: number; y: number; l: number; r: number; t: number; b: number } {
  const half = Math.max(0, pad)
  return {
    x: c.x + c.w / 2 - cx,
    y: c.y + c.h / 2 - cy,
    l: c.w / 2 + half,
    r: c.w / 2 + half,
    t: c.h / 2 + half,
    b: c.h / 2 + half
  }
}
