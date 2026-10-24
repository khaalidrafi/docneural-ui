// The one conversion both graph mounts need: graph.json's DocNode/DocLink
// shape (see core/types.ts) -> the org-roam-lite-ui `graphdata` wire shape
// their store and GraphView consume. Kept out of the components so DocneuralGraph
// (hero mode) and the reader's SynapseRail mini-map share one mapping.
//
// Only id/title/tags survive the trip on nodes, plus everything a link needs:
// the co-cite marker (`kind`, set at synthesis in store.cociteInto) must reach
// GraphView's engine links or the canvas cannot tell a co-citation from a real
// wire. GraphView copies each store link verbatim (`{ ...l }`) at sync time,
// so any field present here rides through to the painter.
import type { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode } from 'orui/api'
import type { GraphData } from '../core/types'

/** orui's wire link plus the docneural edge category. `kind` is docneural's
 *  extension: orui only ever reads link.type (for its dedup key), so the
 *  extra field rides along inert through its store. */
type RoamLink = OrgRoamLink & { kind?: 'cocite' }

export function toRoam(g: GraphData): OrgRoamGraphReponse {
  const nodes: OrgRoamNode[] = g.nodes.map((n) => ({
    id: n.id,
    file: n.slug,
    title: n.title,
    // level 0 = FILE node in roam's wire shape, and orui's default filter
    // (maxLevel 0) shows file nodes only. Every docneural-ui doc IS one .org file,
    // so this is both the truth and the only value that survives the filter
    // (level 1 here silently empties the canvas).
    level: 0,
    pos: 0,
    olp: null,
    properties: {
      'custom-id': n.id
    },
    tags: n.tags
  }))
  // `type: 'id'` = the id: citations the exporter resolved. Duplicate pairs
  // collapse engine-side (linkKey dedup in GraphView's sync), so no dedup
  // pass is needed here. A synthesized co-citation keeps type 'id' too —
  // its category travels as `kind`, which is what the painter tests.
  const links: RoamLink[] = g.links.map((l): RoamLink =>
    l.kind === 'cocite'
      ? { source: l.source, target: l.target, type: 'id', kind: 'cocite' }
      : { source: l.source, target: l.target, type: 'id' }
  )
  return { nodes, links, tags: [] }
}
