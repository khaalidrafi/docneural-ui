// layout.ts — the graph layout the visitor last asked for, in localStorage.
//
// Cluster-vs-spread is a preference about how a person reads a corpus, not a
// question about a page: it should survive a reload and a visit tomorrow, the
// way `lastRead` and the saved marks do. One key, one of two words, no schema.

import type { LayoutMode } from './types'

const KEY = 'docneural:layout'

/** First-visit default: SMALL corpora open packed (the cluster silhouette
 *  shows how a small corpus hangs together); big ones open LATTICE — OP-56's
 *  owner-call ruling on the Owner's fixed-distance law: past a few hundred
 *  neurons the packed view is a solid blob of ink, and the lattice is the
 *  one overview that is never crowded (deterministic hex, zero physics).
 *  The visitor's own toggle always wins from here on. */
export function loadLayout(nodeCount = 0): LayoutMode {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'spread' || saved === 'cluster' || saved === 'lattice') return saved
  } catch {
    /* private mode: fall through to the size-based default */
  }
  return nodeCount > 300 ? 'lattice' : 'cluster'
}

export function writeLayout(mode: LayoutMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore: the in-memory choice still holds for this visit */
  }
}

/* ---------- spread spacing (Owner directive 2026-11-01) ----------
   "no need to limit spacing. User will increase as much as they wish."
   The old ceiling is gone: the range slider tops out where a mouse wheel is
   still precise (10), and the numeric input beside it keeps climbing to
   SPACING_MAX, so an owner who wants a 40× field types 40. The physics scales
   with the value (neuronEngine.applyLayout), so a huge spacing stays a sane —
   if vast — layout instead of a collapsed clump. */

export const SPACING_KEY = 'docneural:spacing'

/** The sensible floor: 1 = the authored spread layout, labels packed to the
 *  room exactly as designed. Nothing below it exists. */
export const MIN_SPACING = 1

/** Hard ceiling for the numeric input. The Owner removed the ~3.2 UI ceiling;
 *  this guard is not that — it only keeps a typo (1e9, -0, NaN) from freezing
 *  the simulation. 100 is a field ~46 px·100 wide per link: absurd by design,
 *  reachable, and still finite. */
export const MAX_SPACING = 100

/** Stored spread spacing, clamped into [MIN_SPACING, MAX_SPACING]. Anything
 *  unreadable falls back to 1 — the authored layout. */
export function loadSpacing(): number {
  try {
    const raw = localStorage.getItem(SPACING_KEY)
    const v = raw === null ? NaN : Number(raw)
    if (Number.isFinite(v)) return Math.min(MAX_SPACING, Math.max(MIN_SPACING, v))
  } catch {
    /* private mode: fall through to the authored default */
  }
  return MIN_SPACING
}

export function writeSpacing(v: number): void {
  try {
    localStorage.setItem(SPACING_KEY, String(v))
  } catch {
    /* ignore: the in-memory choice still holds for this visit */
  }
}

/* ---------- dock collapse (Owner directive 2026-11-01) ----------
   "The bottom part of the network, controls and doc preview should be
   hideable." Both panels collapse, and the collapsed state survives a reload:
   a visitor who reclaimed the viewport yesterday gets it back today. Same
   one-key-one-word shape as the layout pref above; `null` means "never
   answered" so the phone/desktop defaults can differ (controls boot closed on
   a phone, open on a laptop). */

const PREVIEW_KEY = 'docneural:preview'

/* ---------- form factor (board TODO-001) ----------
   One breakpoint for every phone branch of the fix package (preview sheet,
   controls sheet, per-form-factor prefs): <=700px is a phone. Node (tests,
   SSR-ish boots) has no matchMedia and is a desk. */
export function isPhoneLayout(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches
  } catch {
    return false
  }
}

export function loadPreviewOpen(): boolean {
  try {
    const saved = localStorage.getItem(PREVIEW_KEY)
    if (saved === 'open' || saved === 'closed') return saved === 'open'
  } catch {
    /* private mode: default below */
  }
  return true
}

export function writePreviewOpen(open: boolean): void {
  try {
    localStorage.setItem(PREVIEW_KEY, open ? 'open' : 'closed')
  } catch {
    /* ignore */
  }
}

/* The controls-open pref MOVED to core/controls.ts (S4, board TODO-001):
   one shared `docneural:controls` key leaked a desktop "open" answer into
   the phone boot. It now lives at dn.controls.open.desk|phone, split per
   form factor exactly like the lock pref — see loadControlsPref there. */
