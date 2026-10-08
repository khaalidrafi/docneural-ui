// Unit tests for the pure graph math. graph.ts is deliberately Svelte-free so
// the exporter's output contract can be checked here without a DOM or canvas.
import { describe, expect, it } from 'vitest'
import {
  backlinks,
  commonTags,
  degreesOf,
  filteredGraph,
  localGraph,
  neighborIds,
  nodeMatches,
  nodeViews,
  outlinks
} from './graph'
import type { DocNode, GraphData } from './types'

function node(id: string, title = id, tags: string[] = []): DocNode {
  return { id, slug: id, title, tags }
}

// a - b - c, plus a lone `d`. Links point source -> target.
const ab = { source: 'a', target: 'b', context: 'a cites b' }
const bc = { source: 'b', target: 'c', context: 'b cites c' }
const DATA: GraphData = {
  nodes: [node('a', 'Alpha', ['x']), node('b', 'Beta', ['x', 'y']), node('c', 'Zeta', ['y']), node('d', 'Delta')],
  links: [ab, bc]
}

describe('degreesOf', () => {
  it('counts both endpoints of every link', () => {
    const d = degreesOf(DATA.links)
    expect(d.get('a')).toBe(1)
    expect(d.get('b')).toBe(2)
    expect(d.get('c')).toBe(1)
    expect(d.has('d')).toBe(false) // isolated node has no entry
  })
})

describe('nodeViews', () => {
  it('attaches degree, 0 for isolated nodes', () => {
    const v = nodeViews(DATA)
    expect(v.get('b')?.degree).toBe(2)
    expect(v.get('d')?.degree).toBe(0)
  })
})

describe('neighborIds', () => {
  it('is symmetric across link direction', () => {
    expect([...neighborIds(DATA, 'b')].sort()).toEqual(['a', 'c'])
  })
})

describe('localGraph', () => {
  it('keeps center + 1-hop and only links fully inside that set', () => {
    const g = localGraph(DATA, 'b')
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(g.links).toEqual([ab, bc])
  })
  it('drops an isolated node down to just itself', () => {
    const g = localGraph(DATA, 'd')
    expect(g.nodes.map((n) => n.id)).toEqual(['d'])
    expect(g.links).toEqual([])
  })
})

describe('backlinks / outlinks', () => {
  it('splits by direction', () => {
    expect(backlinks(DATA, 'b').map((l) => l.source)).toEqual(['a'])
    expect(outlinks(DATA, 'b').map((l) => l.target)).toEqual(['c'])
  })
})

describe('nodeMatches', () => {
  it('empty query matches all; substring is case-insensitive on title', () => {
    expect(nodeMatches(node('a', 'Alpha'), '', [])).toBe(true)
    expect(nodeMatches(node('a', 'Alpha'), 'ALP', [])).toBe(true)
    expect(nodeMatches(node('a', 'Alpha'), 'zzz', [])).toBe(false)
  })
  it('requires at least one active tag when tags are set', () => {
    expect(nodeMatches(node('b', 'Beta', ['x']), '', ['x'])).toBe(true)
    expect(nodeMatches(node('b', 'Beta', ['x']), '', ['q', 'x'])).toBe(true)
    expect(nodeMatches(node('b', 'Beta', ['x']), '', ['q'])).toBe(false)
  })
})

describe('filteredGraph', () => {
  it('keeps a link only when both endpoints match', () => {
    const g = filteredGraph(DATA, 'eta', []) // matches "Beta" and "Zeta", not "Alpha"/"Delta"
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['b', 'c'])
    expect(g.links).toEqual([bc]) // ab dropped: 'a' filtered out
  })
})

describe('commonTags', () => {
  it('lists tags on >= min nodes, most-frequent first', () => {
    expect(commonTags(DATA, 2)).toEqual(['x', 'y']) // each on 2 nodes
    expect(commonTags(DATA, 3)).toEqual([])
  })
})
