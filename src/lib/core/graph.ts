// Graph computations for static doc data. Kept free of Svelte so the
// export pipeline's output can be unit-tested against these functions.

import type { DocLink, DocNode, GraphData } from './types'

/** node id -> [node, degree], precomputed for canvas painting. */
export type NodeView = DocNode & { degree: number }

export function degreesOf(links: DocLink[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const l of links) {
    d.set(l.source, (d.get(l.source) ?? 0) + 1)
    d.set(l.target, (d.get(l.target) ?? 0) + 1)
  }
  return d
}

export function nodeViews(data: GraphData): Map<string, NodeView> {
  const deg = degreesOf(data.links)
  const m = new Map<string, NodeView>()
  for (const n of data.nodes) m.set(n.id, { ...n, degree: deg.get(n.id) ?? 0 })
  return m
}

/** Directly connected node ids of `id` (both link directions). */
export function neighborIds(data: GraphData, id: string): Set<string> {
  const out = new Set<string>()
  for (const l of data.links) {
    if (l.source === id) out.add(l.target)
    if (l.target === id) out.add(l.source)
  }
  return out
}

/**
 * Local graph centered on one doc — org-roam-lite-ui's core interaction.
 * Includes center + 1-hop neighbors, and only links whose BOTH endpoints are
 * in that set (so the panel never renders dangling edges).
 */
export function localGraph(data: GraphData, centerId: string): GraphData {
  const keep = neighborIds(data, centerId)
  keep.add(centerId)
  return {
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target))
  }
}

/** Backlinks: links pointing AT docId, newest-most-connected source first. */
export function backlinks(data: GraphData, docId: string): DocLink[] {
  return data.links.filter((l) => l.target === docId)
}

/** Outgoing links: links FROM docId. */
export function outlinks(data: GraphData, docId: string): DocLink[] {
  return data.links.filter((l) => l.source === docId)
}

/** Filter for the graph mode (ported from org-roam-lite-ui filters.ts):
 *  a node is visible when its title matches the query (empty = all) and,
 *  if any tag filter is active, it carries at least one of those tags. */
export function nodeMatches(
  n: DocNode,
  query: string,
  tags: string[]
): boolean {
  if (query && !n.title.toLowerCase().includes(query.toLowerCase())) return false
  if (tags.length > 0 && !tags.some((t) => n.tags.includes(t))) return false
  return true
}

/** Subgraph limited to visible nodes (both endpoints must pass). */
export function filteredGraph(
  data: GraphData,
  query: string,
  tags: string[]
): GraphData {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const visible = (id: string) => {
    const n = byId.get(id)
    return n ? nodeMatches(n, query, tags) : false
  }
  return {
    nodes: data.nodes.filter((n) => nodeMatches(n, query, tags)),
    links: data.links.filter((l) => visible(l.source) && visible(l.target))
  }
}

/** All tags that appear on >= 2 nodes — the tag chips worth offering. */
export function commonTags(data: GraphData, min = 2): string[] {
  const count = new Map<string, number>()
  for (const n of data.nodes)
    for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
}
