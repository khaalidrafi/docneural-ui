// layout.ts — the graph layout the visitor last asked for, in localStorage.
//
// Cluster-vs-spread is a preference about how a person reads a corpus, not a
// question about a page: it should survive a reload and a visit tomorrow, the
// way `lastRead` and the saved marks do. One key, one of two words, no schema.

import type { LayoutMode } from './types'

const KEY = 'docneural:layout'

/** First-visit default: SMALL corpora open packed (the cluster silhouette
 *  shows how a small corpus hangs together); big ones open spread — past a
 *  few hundred neurons the packed view is a solid blob of ink, and the
 *  spread layout is the one overview you can actually read. The visitor's
 *  own toggle always wins from here on. */
export function loadLayout(nodeCount = 0): LayoutMode {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'spread' || saved === 'cluster' || saved === 'lattice') return saved
  } catch {
    /* private mode: fall through to the size-based default */
  }
  return nodeCount > 300 ? 'spread' : 'cluster'
}

export function writeLayout(mode: LayoutMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore: the in-memory choice still holds for this visit */
  }
}
