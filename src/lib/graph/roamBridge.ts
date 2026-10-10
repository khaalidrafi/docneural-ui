// The one conversion both graph mounts need: graph.json's DocNode/DocLink
// shape (see core/types.ts) -> the org-roam-lite-ui `graphdata` wire shape
// their store and GraphView consume. Kept out of the components so SynapsesGraph
// (hero mode) and the reader's SynapseRail mini-map share one mapping.
//
// Only id/title/tags survive the trip: GraphView, nodeColor and the filters
// read nothing else, while the roam bookkeeping fields (file/level/pos/olp)
// must still be present for the wire type — they ride along inert.
import type { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode } from 'orui/api'
import type { GraphData } from '../core/types'

export function toRoam(g: GraphData): OrgRoamGraphReponse {
  const nodes: OrgRoamNode[] = g.nodes.map((n) => ({
    id: n.id,
    file: n.slug,
    title: n.title,
    level: 1,
    pos: 0,
    olp: null,
    properties: {
      'custom-id': n.id
    },
    tags: n.tags
  }))
  // `type: 'id'` = the id: citations the exporter resolved. Duplicate pairs
  // collapse engine-side (linkKey dedup in GraphView's sync), so no dedup
  // pass is needed here.
  const links: OrgRoamLink[] = g.links.map((l) => ({
    source: l.source,
    target: l.target,
    type: 'id'
  }))
  return { nodes, links, tags: [] }
}
