// Viewport requests coming from Emacs (`command` frames: follow / zoom / local).
//
// Pure types + defaults so both sides of the boundary — OrgRoamGraph, which
// turns a command frame into a request, and GraphView, which drives the force
// engine — agree on the shape without importing each other. The request lives
// in the graph store (like the filter): Svelte cannot chain a derived closure
// from parent to child (see AGENTS.md), and the store's plain observer path is
// already what moves UI state into GraphView.

export type FocusRequest = {
  /** Node to look at. */
  id: string
  /**
   * Tween length in ms. Elisp's `org-roam-lite-ui-node-zoom` can carry one;
   * when it does not, FOCUS_SPEED_MS applies. Upstream org-roam-ui defaults to
   * 2000 ms, which on this machine means two seconds of full-canvas repaints
   * per Emacs cursor move — the lite UI moves faster instead.
   */
  speed?: number
  /** px of breathing room kept around the fitted node set (zoom/local only). */
  padding?: number
  /**
   * Ids to fit into the viewport — the node plus its neighbours. When absent,
   * the request is a plain pan: keep the current zoom, center on the node.
   */
  fit?: Set<string>
}

export const FOCUS_SPEED_MS = 400
export const FOCUS_PADDING_PX = 200
