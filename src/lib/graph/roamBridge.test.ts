// The one conversion both graph mounts need carries every field the painter
// reads. If the co-cite marker were dropped here, the store would synthesize
// honest edges the canvas paints as ordinary wires — the exact regression
// TODOs.org's "dashed-vs-solid is only in the data" note describes.
import { describe, expect, it } from 'vitest'
import { toRoam } from './roamBridge'

describe('toRoam', () => {
  it('forwards the co-cite marker and leaves a real wire untouched', () => {
    const r = toRoam({
      nodes: [],
      links: [
        { source: 'a', target: 'b', context: 'a cites b' },
        { source: 'a', target: 'c', context: 'co-cited: 2 chapters cite both', kind: 'cocite' }
      ]
    })
    expect(r.links[0]).toEqual({ source: 'a', target: 'b', type: 'id' })
    expect(r.links[1]).toEqual({ source: 'a', target: 'c', type: 'id', kind: 'cocite' })
  })
  it('marks nothing when the graph has no synthesized edges (corpus scope)', () => {
    const r = toRoam({
      nodes: [],
      links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]
    })
    expect(r.links.every((l) => !('kind' in l && l.kind))).toBe(true)
  })
})
