// Pure filtering logic for the graph UI (step 7). Framework-free so it is
// trivially unit-testable and reusable by the web component; the component
// layer (Controls.svelte / OrgRoamGraph.svelte) just binds inputs to these.

import type { GraphStore, GraphState } from './graphStore'
import type { OrgRoamLink, OrgRoamNode } from '../api'

export interface FilterState {
  /** Case-insensitive substring match on the node title; '' matches all. */
  query: string
  /** Nodes carrying ANY of these tags are hidden. */
  excludedTags: string[]
  /**
   * Maximum heading level to display. 0 = file nodes only (default).
   * null = show all levels.
   */
  maxLevel?: number | null
  /**
   * Local graph mode (the `local` / `change-local-graph` command frames from
   * Emacs): a WHITELIST. When present, only these ids can be visible — the
   * centre nodes the user added plus their direct neighbours.
   */
  local?: LocalScope | null
  /**
   * Overview (connections-only) mode: hides all UI chrome (controls, preview,
   * local chip) and shows only the graph canvas with nodes and links. Useful
   * for getting a birds-eye view of document clusters on mobile or in embeds.
   */
  overview?: boolean
}

/**
 * The visible set is cached, not derived per node: `nodeMatchesFilters` runs
 * once per node per sync, and re-walking every link there (10k+ in a real
 * vault) to answer one id would be absurd. It is recomputed when the scope
 * changes and whenever the store rebuilds its link list (see `set` in
 * graphStore.ts) — saves and Emacs commands, never per-node draws.
 */
export interface LocalScope {
  /** The centres Emacs explicitly put in the local graph, in insertion order. */
  centers: string[]
  /** `centers` plus every node linked to any of them (one degree each). */
  visible: Set<string>
}

export const EMPTY_FILTER: FilterState = { query: '', excludedTags: [], maxLevel: 0 }

/** Normalize a UI query: trim + lowercase; '' when it has no content. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** True when the node passes the local scope, the query and the tag exclusion. */
export function nodeMatchesFilters(
  node: OrgRoamNode,
  filter?: FilterState
): boolean {
  const f = filter ?? EMPTY_FILTER
  // Checked first: a Set lookup, and in local mode it rejects most of the
  // vault, so the title work below never runs for those nodes.
  if (f.local && !f.local.visible.has(node.id)) return false
  if (f.maxLevel != null && node.level > f.maxLevel) return false
  const q = normalizeQuery(f.query)
  if (q && !node.title.toLowerCase().includes(q)) return false
  return !node.tags.some((t) => f.excludedTags.includes(t))
}

/** All unique tags in the graph, alphabetically sorted (for the tag panel). */
export function collectTags(state: GraphState): string[] {
  const tags = new Set<string>()
  for (const node of state.nodeMap.values()) {
    for (const t of node.tags) tags.add(t)
  }
  return [...tags].sort()
}

/** All unique heading levels above zero in the graph, sorted numerically (for level toggles). */
export function collectLevels(state: GraphState): number[] {
  const levels = new Set<number>()
  for (const node of state.nodeMap.values()) {
    if (node.level > 0) levels.add(node.level)
  }
  return [...levels].sort((a, b) => a - b)
}

/** Convenience: tags for the panel straight from the store. */
export function collectTagsFrom(store: GraphStore): string[] {
  return collectTags(store.getState())
}

/**
 * The node itself plus every node directly linked to it. One degree only, on
 * purpose: a hub node with 500 backlinks must not drag the whole vault into the
 * viewport when Emacs asks us to look at one note (`zoom`/`local` commands).
 */
export function neighborhoodIds(links: OrgRoamLink[], id: string): Set<string> {
  const ids = new Set<string>([id])
  for (const l of links) {
    if (l.source === id) ids.add(l.target)
    else if (l.target === id) ids.add(l.source)
  }
  return ids
}

/** Union of the centres' neighbourhoods. The one place `visible` is computed. */
const scopeOf = (links: OrgRoamLink[], centers: string[]): LocalScope => {
  const visible = new Set<string>()
  for (const c of centers) for (const id of neighborhoodIds(links, c)) visible.add(id)
  return { centers, visible }
}

/**
 * Enter local mode around these nodes (the `local` frame, and the first `add`
 * when there is no local mode yet — the elisp commands document exactly that).
 */
export function enterLocalScope(links: OrgRoamLink[], ids: string[]): LocalScope {
  return scopeOf(links, [...new Set(ids)])
}

/** org-roam-lite-ui-add-to-local-graph: the node joins, and with it everything
 * one link away from it. */
export function extendLocalScope(
  scope: LocalScope,
  links: OrgRoamLink[],
  id: string
): LocalScope {
  return scopeOf(links, [...new Set([...scope.centers, id])])
}

/**
 * org-roam-lite-ui-remove-from-local-graph: drop one centre and rebuild the
 * visible set from the ones that remain — a node linked to two centres stays
 * visible when only one of them leaves.
 *
 * Returns null when the last centre goes. That is not "an empty local graph"
 * but "no local mode any more", and the caller clears the filter accordingly.
 */
export function shrinkLocalScope(
  scope: LocalScope,
  links: OrgRoamLink[],
  id: string
): LocalScope | null {
  const centers = scope.centers.filter((c) => c !== id)
  return centers.length ? scopeOf(links, centers) : null
}
