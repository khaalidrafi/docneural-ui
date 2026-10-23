// layout.ts — the graph layout the visitor last asked for, in localStorage.
//
// Cluster-vs-spread is a preference about how a person reads a corpus, not a
// question about a page: it should survive a reload and a visit tomorrow, the
// way `lastRead` and the saved marks do. One key, one of two words, no schema.

import type { LayoutMode } from './types'

const KEY = 'docneural:layout'

export function loadLayout(): LayoutMode {
  try {
    return localStorage.getItem(KEY) === 'spread' ? 'spread' : 'cluster'
  } catch {
    return 'cluster' // private mode: the shipped default
  }
}

export function writeLayout(mode: LayoutMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore: the in-memory choice still holds for this visit */
  }
}

/* ---------- the phone question ----------
   The reader's own stylesheets draw the phone line at 700 px (every component
   here drops its side panels under that width), so the canvas asks the SAME
   question instead of a second breakpoint. Centralised because "am I a phone"
   now gates three different costs: the node cap (core/graph.ts#capForPhone),
   pausing the render loop between interactions, and the verify gate's phone
   assertions — and a breakpoint that disagrees with the CSS would cap the
   graph on a laptop that the stylesheets still split into three columns. */

export const PHONE_QUERY = '(max-width: 700px)'

/** True when the current viewport is phone-sized. Safe under node (tests)
 *  and under browsers without matchMedia: both degrade to "not a phone". */
export function isPhoneViewport(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches
  } catch {
    return false
  }
}
