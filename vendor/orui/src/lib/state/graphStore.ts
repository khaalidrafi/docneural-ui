// Graph store: normalized org-roam graph state as a framework-agnostic
// observable. Deliberately NOT a Svelte store so the same logic powers the
// main app and the <org-roam-graph> web component, and so it is trivially
// unit-testable without a DOM.
//
// Why a keyed map instead of arrays: Emacs sends the FULL graph on every save
// (see org-roam-lite-ui--send-graphdata), so we diff by id; and single-node updates
// (applyNodeUpdate) must not rebuild the world.

import type { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode } from '../api'
import type { GraphupdateMessage } from '../protocol/protocol'
import { EMPTY_FILTER, enterLocalScope, type FilterState } from './filters'
import type { FocusRequest } from './focus'

export type GraphState = {
  /** All nodes by id. Source of truth; `links` is derived from allLinks. */
  nodeMap: Map<string, OrgRoamNode>
  /** Only links whose BOTH endpoints currently exist. */
  links: OrgRoamLink[]
  /** Distinct tags across the vault (from the graphdata snapshot). */
  tags: string[]
  /** Org source text per node, filled in via setText (getText requests). */
  textById: Map<string, string>
  /**
   * UI filter (search query + excluded tags). Living in the store — not in
   * component state — is deliberate: GraphView re-syncs on every store
   * notification, so filter changes propagate through the same plain
   * observer path as data changes, with no cross-component Svelte
   * reactivity involved.
   */
  filter: FilterState
  /**
   * Latest viewport request from Emacs (follow/zoom/local). Like the filter, it
   * is UI state that reaches GraphView through this observable rather than
   * through a Svelte prop chain; unlike the structural fields, replacing it
   * must NOT re-seed the physics (see graphShapeChanged).
   */
  focus: FocusRequest | null
}

/**
 * Did anything the GRAPH looks like change — nodes, links, or the filter?
 * Every structural mutator rebuilds the field it touches (new Map / new
 * array / new filter object), while setText swaps only `textById`. So
 * reference identity answers this in O(1), and subscribers like GraphView
 * can skip re-seeding force-graph's physics on text-only notifications —
 * without a "remember to bump the counter" contract that new mutators can
 * forget.
 */
export function graphShapeChanged(prev: GraphState, next: GraphState): boolean {
  return (
    prev.nodeMap !== next.nodeMap || prev.links !== next.links || prev.filter !== next.filter
  )
}

/** Internal link list — may contain endpoints that don't exist yet. */
type MutableState = GraphState & { allLinks: OrgRoamLink[] }

export type GraphStore = {
  getState(): GraphState
  subscribe(fn: (state: GraphState) => void): () => void
  /** Replace the whole graph (the `graphdata` message). */
  applyGraphdata(response: OrgRoamGraphReponse): void
  /** Upsert a single node (future incremental protocol / reconnect fixes). */
  applyNodeUpdate(node: OrgRoamNode): void
  /** Remove a node and every link attached to it. */
  removeNode(id: string): void
  /** Cache the org text of a node (reply to a getText request). */
  setText(id: string, text: string): void
  /**
   * Apply an incremental change set (the `graphupdate` message): upsert
   * nodes, remove nodes (and everything attached to them), add links.
   * One state transition, one notification.
   */
  applyGraphupdate(update: GraphupdateMessage['data']): void
  /** Update the UI filter (search query / excluded tags). */
  setFilter(filter: FilterState): void
  /** Ask the graph view to look at a node (an Emacs command frame). */
  setFocus(focus: FocusRequest): void
}

/** True when the value is a real tag string (Emacs can send null entries). */
const isTag = (t: unknown): t is string => typeof t === 'string' && t.length > 0

/**
 * Normalize one node from the wire. Emacs's sql-to-alist emits
 * `tags: [null]` for untagged nodes (group-concat over an empty tag table);
 * a null tag would render as an empty checkbox and poison color seeding,
 * so it is stripped at the boundary, once, for every ingestion path.
 */
function normalizeNode(node: OrgRoamNode): OrgRoamNode {
  const tags = Array.isArray(node.tags) ? node.tags.filter(isTag) : []
  return tags.length === node.tags?.length ? node : { ...node, tags }
}

/** Build state from one graphdata snapshot. Dangling links are kept internally
 * but hidden until their endpoints exist (see tests). */
export function graphFromResponse(response: OrgRoamGraphReponse): MutableState {
  const nodeMap = new Map<string, OrgRoamNode>()
  for (const n of response.nodes) nodeMap.set(n.id, normalizeNode(n))
  return {
    nodeMap,
    allLinks: response.links ?? [],
    links: filterLiveLinks(response.links ?? [], nodeMap),
    tags: (response.tags ?? []).filter(isTag),
    textById: new Map(),
    filter: { ...EMPTY_FILTER },
    focus: null
  }
}

const filterLiveLinks = (
  allLinks: OrgRoamLink[],
  nodeMap: Map<string, OrgRoamNode>
): OrgRoamLink[] => allLinks.filter((l) => nodeMap.has(l.source) && nodeMap.has(l.target))

/** Dedup key for links. Shared with GraphView's engine-side map. */
export const linkKey = (l: OrgRoamLink): string => `${l.source}\u0000${l.target}\u0000${l.type}`

export function createGraphStore(): GraphStore {
  // Empty snapshot through the same construction path as real data, so the
  // initial shape can never drift from graphFromResponse's.
  let state: MutableState = graphFromResponse({ nodes: [], links: [], tags: [] })
  const subscribers = new Set<(s: GraphState) => void>()

  const emit = () => {
    // Expose the state without the internal allLinks field.
    const publicState: GraphState = state
    for (const fn of subscribers) fn(publicState)
  }

  const set = (next: Partial<MutableState>) => {
    let merged = { ...state, ...next } as MutableState
    // `LocalScope.visible` is a cache derived from (centers, live links), so
    // whatever rebuilds the link list has to re-derive it. Otherwise a scope
    // computed against a stale link set freezes — most visibly when Emacs's
    // `local` command frame lands before the graphdata snapshot (empty store:
    // the scope holds only the centre) or when a save links a new note into a
    // centre. `centers` survives, only the cache is rebuilt.
    if (merged.filter.local && next.links) {
      const centers = merged.filter.local.centers
      merged = {
        ...merged,
        filter: { ...merged.filter, local: enterLocalScope(next.links, centers) }
      }
    }
    state = merged
    emit()
  }

  return {
    getState: () => state,

    subscribe(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },

    applyGraphdata(response) {
      // Full snapshot: rebuild everything. This is the hot path on connect
      // and on every org-roam save. The user's filter survives snapshots —
      // toggling a tag just before an Emacs save must not reset the view —
      // and so does the pending viewport request, or a save would snap the
      // camera back after Emacs moved it. (A local scope inside that filter is
      // re-derived from the new links; see set().)
      const next = graphFromResponse(response)
      set({ ...next, filter: state.filter, focus: state.focus })
    },

    applyNodeUpdate(node) {
      const nodeMap = new Map(state.nodeMap)
      nodeMap.set(node.id, normalizeNode(node))
      set({
        nodeMap,
        links: filterLiveLinks(state.allLinks, nodeMap)
      })
    },

    removeNode(id) {
      const nodeMap = new Map(state.nodeMap)
      nodeMap.delete(id)
      const allLinks = state.allLinks.filter((l) => l.source !== id && l.target !== id)
      set({ nodeMap, allLinks, links: filterLiveLinks(allLinks, nodeMap) })
    },

    setText(id, text) {
      const textById = new Map(state.textById)
      textById.set(id, text)
      // Notify (the preview needs it) but touch only textById: nodeMap/links/
      // filter keep their identity, so graphShapeChanged() lets GraphView skip.
      set({ textById })
    },

    applyGraphupdate(update) {
      const nodeMap = new Map(state.nodeMap)
      // Upserts first (a removal+upsert of the same id in one diff means
      // "replace"), then removals.
      for (const n of update.upserts) nodeMap.set(n.id, normalizeNode(n))
      for (const id of update.removals) nodeMap.delete(id)

      // Links: keyed set so dedup is by (source,target,type). New links for
      // removed nodes are dropped here already; dangling ones are kept
      // internally and filtered out of `links` like everywhere else.
      const allLinks = new Map<string, OrgRoamLink>()
      for (const l of state.allLinks) allLinks.set(linkKey(l), l)
      const removed = new Set(update.removals)
      for (const l of update.links) {
        if (removed.has(l.source) || removed.has(l.target)) continue
        allLinks.set(linkKey(l), l)
      }
      const nextAllLinks = [...allLinks.values()]

      // Cached org text of removed nodes is dead weight.
      let textById = state.textById
      if (update.removals.length) {
        textById = new Map(state.textById)
        for (const id of update.removals) textById.delete(id)
      }

      set({
        nodeMap,
        allLinks: nextAllLinks,
        links: filterLiveLinks(nextAllLinks, nodeMap),
        textById
      })
    },

    setFilter(filter) {
      set({ filter })
    },

    setFocus(focus) {
      // Only the identity changes here, which is exactly the point: GraphView
      // acts when it sees a NEW request object and ignores repeats, so the
      // caller must pass a freshly built FocusRequest (OrgRoamGraph does).
      set({ focus })
    }
  }
}

/**
 * Given a preferred order of node ids, return the ones whose org text we
 * haven't fetched yet. Used by the preview to batch getText requests.
 */
export function nodesMissingText(state: GraphState, ids: string[]): string[] {
  return ids.filter((id) => state.nodeMap.has(id) && !state.textById.has(id))
}
