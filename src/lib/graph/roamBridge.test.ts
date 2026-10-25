// The one conversion the graph mounts share: graph.json's DocLink shape ->
// orui's OrgRoamLink wire. Here the co-citation contract: a synthetic edge
// tagged kind:'cocite' rides through as type 'cocite' — the field orui's
// GraphView reads to paint it dashed and dimmed — while every corpus wire
// stays type 'id'.
import { describe, expect, it } from 'vitest'
import { toRoam } from './roamBridge'
import type { GraphData } from '../core/types'

describe('toRoam', () => {
  it('passes the link kind through as the wire type, corpus wires stay id', () => {
    const g: GraphData = {
      nodes: [],
      links: [
        { source: 'a', target: 'b', kind: 'cocite' },
        { source: 'a', target: 'b', context: 'a cites b' }
      ]
    }
    expect(toRoam(g).links).toEqual([
      { source: 'a', target: 'b', type: 'cocite' },
      { source: 'a', target: 'b', type: 'id' }
    ])
  })
})
