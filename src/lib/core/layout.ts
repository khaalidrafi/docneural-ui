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
