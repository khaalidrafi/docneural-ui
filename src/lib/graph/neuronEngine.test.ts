// Unit tests for the link-painter seam of the neuron engine (QA-1(b)).
//
// installNeuron is the construction seam force-graph itself goes through, so
// the tests run it against a RECORDING mock of the kapsule chain — the real
// engine cannot exist in node (no canvas), and the seam's contract is plain
// chainable setters. What is pinned here is the arming contract: force-graph's
// paintLinks pays its {before,after,replace} mode-routing per visible link per
// frame ONLY while a linkCanvasObject is installed, so a snapshot with no
// co-cite edges (the whole corpus view) must leave that prop untouched, and
// the painter must come and go as the snapshot's co-cites do.
import { describe, expect, it } from 'vitest'
import { installNeuron, type NeuronFocus } from './neuronEngine'

/** A force-graph instance that records every setter call and chains. */
function mockEngine(): { engine: any; calls: Map<string, unknown[][]> } {
  const calls = new Map<string, unknown[][]>()
  const engine: any = {
    // The real engine answers with the current data (the painter's frame
    // counting reads it); the tests only need a shape.
    graphData: () => ({ nodes: [], links: [] })
  }
  const chain = (name: string) => (...args: unknown[]) => {
    if (!calls.has(name)) calls.set(name, [])
    calls.get(name)!.push(args)
    return engine
  }
  for (const m of [
    'nodeCanvasObjectMode',
    'nodeCanvasObject',
    'linkWidth',
    'linkDirectionalParticles',
    'linkDirectionalParticleWidth',
    'linkDirectionalParticleColor',
    'linkCanvasObjectMode',
    'linkCanvasObject'
  ]) engine[m] = chain(m)
  return { engine, calls }
}

function focus(over: Partial<NeuronFocus> = {}): NeuronFocus {
  return {
    tokenEl: () => undefined,
    selected: () => null,
    neighbors: () => new Set<string>(),
    ...over
  }
}

/** Last recorded argument list for one setter, or undefined if never called. */
const last = (calls: Map<string, unknown[][]>, name: string): unknown[] | undefined => {
  const list = calls.get(name)
  return list && list.length ? list[list.length - 1] : undefined
}

describe('installNeuron: co-cite painter arming', () => {
  it('corpus scope (no co-cite links): the painter is never installed — force-graph keeps its default path', () => {
    const { engine, calls } = mockEngine()
    installNeuron(engine, focus({ hasCocites: () => false }))
    // Data landing must not arm the painter...
    engine.graphData({ nodes: [{}], links: [{}] })
    // ...and neither the install itself.
    expect(calls.get('linkCanvasObject')).toBeUndefined()
    expect(calls.get('linkCanvasObjectMode')).toBeUndefined()
  })

  it('ego scope (co-cites present): painter + replace-mode accessor are installed when the data lands', () => {
    const { engine, calls } = mockEngine()
    installNeuron(engine, focus({ hasCocites: () => true }))
    engine.graphData({ nodes: [{}], links: [{}] })
    const mode = last(calls, 'linkCanvasObjectMode')?.[0] as (l: { kind?: string }) => string | undefined
    expect(typeof mode).toBe('function')
    expect(mode({ kind: 'cocite' })).toBe('replace')
    expect(mode({})).toBeUndefined() // a real wire keeps the default painter
    expect(typeof last(calls, 'linkCanvasObject')?.[0]).toBe('function')
  })

  it('the painter flips with the snapshot: ego -> corpus disarms it, corpus -> ego re-arms the SAME painter', () => {
    let cocites = true
    const { engine, calls } = mockEngine()
    installNeuron(engine, focus({ hasCocites: () => cocites }))
    engine.graphData({ nodes: [], links: [] })
    const armed = last(calls, 'linkCanvasObject')?.[0]
    expect(typeof armed).toBe('function')
    cocites = false
    engine.graphData({ nodes: [], links: [] })
    expect(last(calls, 'linkCanvasObject')?.[0]).toBe(null)
    expect(last(calls, 'linkCanvasObjectMode')?.[0]).toBe(null)
    cocites = true
    engine.graphData({ nodes: [], links: [] })
    expect(last(calls, 'linkCanvasObject')?.[0]).toBe(armed) // same instance: no churn
  })

  it('repeated syncs with no flip cost nothing (the flip check is the only per-sync cost)', () => {
    let cocites = true
    const { engine, calls } = mockEngine()
    installNeuron(engine, focus({ hasCocites: () => cocites }))
    engine.graphData({ nodes: [], links: [] })
    engine.graphData({ nodes: [], links: [] })
    expect(calls.get('linkCanvasObject')!.length).toBe(1)
  })

  it('the graphData seam still reaches the engine: same args, engine returned, arming re-evaluated', () => {
    const { engine, calls } = mockEngine()
    const seen: unknown[] = []
    engine.graphData = (d?: unknown) => {
      seen.push(d)
      return engine
    }
    installNeuron(engine, focus({ hasCocites: () => true }))
    const data = { nodes: [{}], links: [] }
    const r = engine.graphData(data)
    expect(seen).toEqual([data])
    expect(r).toBe(engine)
    expect(calls.get('linkCanvasObject')!.length).toBe(1)
  })

  it('the compact mini-map never arms a link painter (its data has no co-cite marks to paint)', () => {
    const { engine, calls } = mockEngine()
    installNeuron(engine, focus({ compact: true, hasCocites: () => true }))
    expect(calls.get('linkCanvasObject')).toBeUndefined()
    expect(calls.get('linkCanvasObjectMode')).toBeUndefined()
  })
})
