// The snapshot-fed graph store — the shim's copy of orui's state/graphStore
// SUBSET. docneural-ui feeds it whole snapshots (never single-node deltas) and
// only ever calls two methods:
//
//   applyGraphdata(gd)  — swap the visible snapshot (called per keystroke in
//                         graph mode; whole-snapshot swaps are how the theme
//                         avoids orui's EXCLUSIVE filter semantics, which mean
//                         the opposite of the theme's INCLUSIVE tag chips).
//   setFocus({id})      — a camera pan request, the channel Emacs `follow`
//                         uses. A plain pan, never a zoom-to-fit: the reader
//                         never wants a click to yank the zoom level.
//
// Reactivity: the real store is a Svelte 5 runes store. This shim keeps the
// file plain TS (so the extensionless `orui/state/graphStore` import resolves
// under every tool) and exposes two monotonic sequence numbers that GraphView
// keys its effects off. Semantics are identical for these two callers.
//
// Deliberately NOT implemented (nothing in docneural-ui calls them): filter
// state (filterMode/filters/setFilter), live-transport wiring, backlink
// processors, follow-mode bookkeeping. Add them here ONLY if a consumer
// starts calling them.
import type { OrgRoamGraphReponse } from '../api'

export type FocusRequest = { id: string | null }

export class GraphStore {
  graphdata: OrgRoamGraphReponse = { nodes: [], links: [], tags: [] }
  focus: FocusRequest = { id: null }
  /** Bumped on every applyGraphdata; GraphView syncs on this identity. */
  dataSeq = 0
  /** Bumped on every setFocus; GraphView pans on this identity. */
  focusSeq = 0

  applyGraphdata(gd: OrgRoamGraphReponse): void {
    this.graphdata = gd
    this.dataSeq++
  }

  setFocus(req: FocusRequest): void {
    this.focus = { id: req?.id ?? null }
    this.focusSeq++
  }
}

export function createGraphStore(): GraphStore {
  return new GraphStore()
}
