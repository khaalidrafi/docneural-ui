// Network controls — the pure math behind the canvas chrome (network pass
// 2026-10-31, SPEC §3). Deliberately free of Svelte/DOM/engine so the clamps,
// the arrow LOD predicate and the persistence keys are unit-testable: these
// are the exact places a wrong constant shows up as a wedged camera or a
// 30,000-arrowhead paint, long after the code review that let it through.
//
// Every number here comes from the spec verbatim:
//   zoom        0.4×–2.5×, step ×1.2
//   spacing k   0.6–2.0, step 0.2 (spread only; one-shot reheat)
//   arrows      zoom-LOD tiers, 1500-synapse paint budget, 24-nearest cap
//   arrowhead   clamp(5, 7/√zoom, 11) screen px
//   persistence dn.lock.<layout> · dn.spacing.spread · dn.toc.open.<manual>
//               · dn.library.recents

import type { LayoutMode } from './types'

/* ---------- zoom ---------- */

export const ZOOM_MIN = 0.4
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 1.2

/** Clamp a camera scale into the control stack's range. The engine's own
 *  scaleExtent stays wider (pinch/wheel are untouched); these bounds are what
 *  the buttons promise. */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/** One button press: ×1.2 in, ×1/1.2 out, clamped. */
export function nextZoom(z: number, dir: 1 | -1): number {
  return clampZoom(z * Math.pow(ZOOM_STEP, dir))
}

/* ---------- spacing (spread layout) ---------- */

export const SPACING_MIN = 0.6
export const SPACING_MAX = 2.0
export const SPACING_STEP = 0.2

/** Snap a multiplier to the 0.2 step lattice inside 0.6–2.0. A value arriving
 *  from storage with any drift (1.30000000004 from float math) lands back on
 *  the lattice, so the disable-ends logic and the pill readout stay exact. */
export function clampSpacing(k: number): number {
  if (!Number.isFinite(k)) return 1
  const snapped = Math.round(k / SPACING_STEP) * SPACING_STEP
  const clamped = Math.min(SPACING_MAX, Math.max(SPACING_MIN, snapped))
  // Kill the float dust the snap can leave (0.6000000000001).
  return Math.round(clamped * 100) / 100
}

export function nextSpacing(k: number, dir: 1 | -1): number {
  return clampSpacing(k + dir * SPACING_STEP)
}

/* ---------- arrows (zoom-LOD) ---------- */

/** At zoom ≥ 0.75 a selection-free field may arrow EVERY visible synapse —
 *  but only while the paint budget holds. */
export const ARROW_ZOOM_MIN = 0.75
export const ARROW_BUDGET = 1500
/** The selected neuron's incident set is capped at its 24 nearest (by the
 *  graph's own link order — deterministic, no distance sort needed). */
export const ARROW_SEL_CAP = 24

export type ArrowInput = {
  /** Current camera scale (the painter's globalScale). */
  zoom: number
  /** This wire is the one under the pointer — always arrowed, any zoom. */
  hovered: boolean
  /** This wire touches the selected neuron AND survived the 24-nearest cap. */
  inSelectedSet: boolean
  /** How many synapses the current view shows (the budget check). */
  visibleCount: number
}

/**
 * The arrow visibility predicate. Tiers, quietest first:
 *  - hovered / selected-incident: ALWAYS arrowed (the interaction cue must
 *    survive every zoom and every budget).
 *  - no selection, zoom < 0.75: no arrows at all — the zoomed-out corpus
 *    never turns into 30k wedges.
 *  - zoom ≥ 0.75: all visible synapses, only while visibleCount ≤ 1500;
 *    past the budget the view falls back to the selection/hover tier (and
 *    the component prints the honest status line).
 */
export function arrowVisible(i: ArrowInput): boolean {
  if (i.hovered || i.inSelectedSet) return true
  if (i.zoom < ARROW_ZOOM_MIN) return false
  return i.visibleCount <= ARROW_BUDGET
}

/** Arrowhead size in SCREEN px, per the spec's clamp — legible at the zoom
 *  threshold, never a large dark wedge near the camera. */
export function arrowHeadPx(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 7
  return Math.min(11, Math.max(5, 7 / Math.sqrt(zoom)))
}

/** The selected set as link keys ("a>b"), first `cap` links in graph order —
 *  the deterministic "nearest 24" (the corpus link list is export order). */
export function capSelectedLinks(
  links: ReadonlyArray<{ source: string; target: string }>,
  selId: string | null,
  cap: number = ARROW_SEL_CAP
): Set<string> {
  const out = new Set<string>()
  if (!selId) return out
  for (const l of links) {
    if (l.source !== selId && l.target !== selId) continue
    out.add(`${l.source}>${l.target}`)
    if (out.size >= cap) break
  }
  return out
}

/* ---------- persistence ---------- */

export const SPACING_KEY = 'dn.spacing.spread'
export const RECENTS_KEY = 'dn.library.recents'
export const TOC_OPEN_PREFIX = 'dn.toc.open.'
export const LOCK_PREFIX = 'dn.lock.'

/** Per-layout lock key: each layout remembers its own freeze state. */
export function lockKey(layout: LayoutMode): string {
  return `${LOCK_PREFIX}${layout}`
}

/** Per-manual TOC open-state key ('' manual = the whole-corpus TOC). */
export function tocOpenKey(manual: string): string {
  return `${TOC_OPEN_PREFIX}${manual || 'all'}`
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // private mode: defaults rule
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* session-only */
  }
}

/**
 * Lock state for a layout. Stored value wins; the DEFAULT is the phone's
 * 0-animation-loop law (locked) vs desktop's live field (unlocked). Anything
 * but the exact '0'/'1' is ignored, so old or foreign keys fall back cleanly.
 */
export function loadLock(layout: LayoutMode, phone: boolean): boolean {
  const v = readStored(lockKey(layout))
  if (v === '1') return true
  if (v === '0') return false
  return phone
}

export function saveLock(layout: LayoutMode, locked: boolean): void {
  writeStored(lockKey(layout), locked ? '1' : '0')
}

/** Spread spacing multiplier; junk or out-of-range storage reads as 1. */
export function loadSpacing(): number {
  const v = readStored(SPACING_KEY)
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? clampSpacing(n) : 1
}

export function saveSpacing(k: number): void {
  writeStored(SPACING_KEY, String(clampSpacing(k)))
}

/** The TOC's explicit open/closed overrides, per manual. */
export function loadTocOpen(manual: string): Record<string, boolean> {
  const raw = readStored(tocOpenKey(manual))
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, b] of Object.entries(v)) if (typeof b === 'boolean') out[k] = b
    return out
  } catch {
    return {}
  }
}

export function saveTocOpen(manual: string, state: Record<string, boolean>): void {
  writeStored(tocOpenKey(manual), JSON.stringify(state))
}

/** Library recents: doc slugs, max 8, newest last (trail order). */
export const RECENTS_MAX = 8

export function loadRecents(): string[] {
  const raw = readStored(RECENTS_KEY)
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((s): s is string => typeof s === 'string').slice(-RECENTS_MAX)
  } catch {
    return []
  }
}

export function saveRecents(slugs: string[]): void {
  writeStored(RECENTS_KEY, JSON.stringify(slugs.filter(Boolean).slice(-RECENTS_MAX)))
}
