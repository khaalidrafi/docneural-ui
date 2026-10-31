// Unit tests for the pure graph math. graph.ts is deliberately Svelte-free so
// the exporter's output contract can be checked here without a DOM or canvas.
import { describe, expect, it } from 'vitest'
import {
  backlinks,
  coCitations,
  commonTags,
  degreesOf,
  egoGraph,
  filteredGraph,
  groupWires,
  labelExtent,
  labelWidth,
  latticePitch,
  latticePlace,
  manualToc,
  localGraph,
  neighborIds,
  nodeMatches,
  nodeViews,
  outlinks,
  shortTitle,
  spreadStrength
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

describe('groupWires', () => {
  it('collapses a chapter cited many times into one row, counted', () => {
    const links = [
      { source: 'hub', target: 'x' }, { source: 'hub', target: 'x' }, { source: 'hub', target: 'x' },
      { source: 'other', target: 'x' }
    ]
    const g = groupWires(links, 'source')
    expect(g.map((r) => [r.id, r.n])).toEqual([['hub', 3], ['other', 1]])
  })
  it('keeps the FIRST link, so the citation sentence shown is stable', () => {
    const links = [
      { source: 'a', target: 'x', context: 'first' },
      { source: 'a', target: 'x', context: 'second' }
    ]
    expect(groupWires(links, 'source')[0].link.context).toBe('first')
  })
  it('sorts by weight and keeps corpus order for ties', () => {
    const links = [
      { source: 'low', target: 'x' },
      { source: 'high', target: 'x' }, { source: 'high', target: 'x' },
      { source: 'low2', target: 'x' }
    ]
    expect(groupWires(links, 'source').map((r) => r.id)).toEqual(['high', 'low', 'low2'])
  })
  it('groups efferents by target', () => {
    const g = groupWires(
      [{ source: 'a', target: 'y' }, { source: 'a', target: 'z' }, { source: 'a', target: 'y' }],
      'target'
    )
    expect(g.map((r) => [r.id, r.n])).toEqual([['y', 2], ['z', 1]])
  })
  it('is empty for no wires', () => {
    expect(groupWires([], 'source')).toEqual([])
  })
})

describe('commonTags', () => {
  it('lists tags on >= min nodes, most-frequent first', () => {
    expect(commonTags(DATA, 2)).toEqual(['x', 'y']) // each on 2 nodes
    expect(commonTags(DATA, 3)).toEqual([])
  })
})

// A chain long enough that two hops cannot reach the ends: a-b-c-d-e-f, plus a
// stub hanging off `b` (a stub is a pointer, so egoGraph must not carry it).
const CHAIN: GraphData = {
  nodes: [
    node('a'), node('b'), node('c'), node('d'), node('e'), node('f'),
    { ...node('stub'), stub: true }
  ],
  links: [
    { source: 'a', target: 'b' }, { source: 'b', target: 'c' },
    { source: 'c', target: 'd' }, { source: 'd', target: 'e' },
    { source: 'e', target: 'f' }, { source: 'b', target: 'stub' }
  ]
}

describe('egoGraph', () => {
  it('reaches exactly two hops and no further', () => {
    const g = egoGraph(CHAIN, 'c', 2)
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('keeps only links whose both ends are in the neighbourhood', () => {
    const g = egoGraph(CHAIN, 'c', 2)
    expect(g.links.map((l) => `${l.source}>${l.target}`)).toEqual([
      'a>b', 'b>c', 'c>d', 'd>e'
    ])
  })
  it('drops stubs, so a hop cannot fill the canvas with floating dots', () => {
    const g = egoGraph(CHAIN, 'b', 2)
    expect(g.nodes.some((n) => n.id === 'stub')).toBe(false)
    expect(g.links.some((l) => l.target === 'stub')).toBe(false)
  })
  it('one hop is the local graph the rail already shows', () => {
    expect(egoGraph(DATA, 'b', 1).nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

// Two chapters cited together by the same chapters are related even when
// neither links to the other. `alpha` and `beta` share both hubs; `gamma`
// shares only hub2.
const CITED: GraphData = {
  nodes: [node('alpha'), node('beta'), node('gamma'), node('hub1'), node('hub2'), node('far')],
  links: [
    { source: 'hub1', target: 'alpha' }, { source: 'hub1', target: 'beta' },
    { source: 'hub2', target: 'alpha' }, { source: 'hub2', target: 'beta' },
    { source: 'hub2', target: 'beta' }, // the same citer twice: one evidence
    { source: 'hub2', target: 'gamma' },
    { source: 'far', target: 'gamma' }
  ]
}

describe('coCitations', () => {
  it('ranks chapters by how many citers they share', () => {
    const m = coCitations(CITED, 'alpha')
    expect(m.get('beta')).toBe(2)
    expect(m.get('gamma')).toBe(1)
  })
  it('counts a repeated citation from one chapter once', () => {
    // hub2 links beta twice; that is one piece of evidence, not two.
    expect(coCitations(CITED, 'alpha').get('beta')).toBe(2)
  })
  it('never returns the centre or the citers themselves', () => {
    const m = coCitations(CITED, 'alpha')
    expect(m.has('alpha')).toBe(false)
    expect(m.has('hub1')).toBe(false)
  })
  it('honours the cap, so a hub page cannot swallow the graph', () => {
    const many: GraphData = {
      nodes: [node('center'), ...Array.from({ length: 12 }, (_, i) => node(`t${i}`)), node('hub')],
      links: [
        { source: 'hub', target: 'center' },
        ...Array.from({ length: 12 }, (_, i) => ({ source: 'hub', target: `t${i}` }))
      ]
    }
    expect(coCitations(many, 'center', 5).size).toBe(5)
  })
  it('is empty for a chapter nobody cites', () => {
    expect(coCitations(CITED, 'far').size).toBe(0)
  })
})

/* The spread layout's whole promise is "far enough apart to read the title",
   and that promise is arithmetic, not pixels — so it is checked here rather
   than hoped for on a canvas. A wrong constant here is an unreadable overview
   that still looks fine in a unit test of the graph math. */
describe('label geometry', () => {
  it('drops the manual suffix the canvas never prints', () => {
    expect(shortTitle('Agenda Views (The Org Manual)')).toBe('Agenda Views')
  })
  it('caps a long title, bounding the widest label box', () => {
    const long = 'Variable Index Of All User Options And Faces'
    expect(shortTitle(long)).toHaveLength(26)
    expect(shortTitle(long).endsWith('…')).toBe(true)
    // The cap is what keeps one 60-word Info node from owning the screen, and
    // it is the reason labelWidth() has a ceiling the layout can rely on.
    expect(labelWidth(long)).toBeLessThanOrEqual(8 + 26 * 6.6 + 0.001)
  })
  it('repels in proportion to the title, never attractively', () => {
    expect(spreadStrength('Fonts')).toBeGreaterThan(spreadStrength('Interactive Configuration'))
    expect(spreadStrength('Fonts')).toBeLessThan(0)
    expect(spreadStrength(undefined)).toBeLessThan(0)
  })
  it('repels weakly, and never attractively', () => {
    expect(spreadStrength('Fonts')).toBeGreaterThan(spreadStrength('Interactive Configuration'))
    expect(spreadStrength('Fonts')).toBeLessThan(0)
    expect(spreadStrength(undefined)).toBeLessThan(0)
    // Weaker than the cluster default of -30 per node would imply for a long
    // name: charge shapes the field, `labelExtent` packs it. A -490 hub charge
    // was the old bug — it spread the ego graph to circle density and the 1:1
    // fit could not frame it.
    expect(Math.abs(spreadStrength('Variable Index Of All User Options'))).toBeLessThan(120)
  })
  it('gives the widest label less room than its own box demands', () => {
    // Guards against drifting back to a charge that does the packing: if the
    // repulsion alone were enough to separate two titles, the boxes would be
    // dead code.
    const t = 'Variable Index Of All User Options'
    expect(Math.abs(spreadStrength(t))).toBeLessThan(labelWidth(t))
  })
  it('hard-body separates two titles by a gutter, not by luck', () => {
    // The promise labelCollide makes literal: two boxes may never overlap, and
    // each label is centred on its node, so (r1 + r2) - (w1 + w2)/2 is the CLEAR
    // AIR between two shoulder-to-shoulder names at 1:1. Strip the gutter and
    // the paper halo and that number is zero: touching, not readable.
    const a = 'Variable Index Of All User Options'
    const b = 'Agenda Views'
    const air = labelExtent(a, 8).r + labelExtent(b, 8).l - (labelWidth(a) + labelWidth(b)) / 2
    expect(air).toBeGreaterThan(0)
    expect(air).toBeCloseTo(12) // 2 × (GUTTER 4 + HALO 2)
  })
  it('reserves the label, not a circle around it', () => {
    // Why a box replaced forceCollide. The old radius was half the title width
    // plus a gutter; two of those touching is a circle CIRCUMSCRIBING a line of
    // text, which buys 2.5–3× more empty canvas than the name needs — and on a
    // 30-node ego graph that waste widened the field past the viewport, so the
    // fit zoomed OUT and re-overlapped the titles it had just separated.
    const t = 'Variable Index Of All User Options'
    const e = labelExtent(t, 8)
    const box = (e.l + e.r) * (e.t + e.b)
    const circle = Math.PI * (labelWidth(t) / 2 + 7) ** 2
    expect(box).toBeLessThan(circle / 2.5)
  })
  it('protects the disc above and the printed name below', () => {
    // The label hangs UNDER the soma (the painter drops it at r * LABEL_LINE), so the
    // box is asymmetric: bottom reach > top reach, and the bottom must cover a
    // full line of 11px text. A symmetric box would either clip names or waste
    // the air above every node.
    const e = labelExtent('Agenda Views', 8)
    expect(e.b).toBeGreaterThan(e.t)
    expect(e.b).toBeGreaterThan(8 * 1.2 + 11)
    expect(e.t).toBeGreaterThan(8) // the soma itself is inside its own box
    expect(labelExtent('Fonts', 8).l).toBeLessThan(labelExtent('Agenda Views', 8).l)
    expect(labelExtent(undefined, 8).l).toBeGreaterThan(0)
  })
})


// ---------- LATTICE (Owner law 2026-10-28: fixed-distance overview) ----------

describe('latticePitch', () => {
  it('fills the measured room: OP-56 hex math, no clamps, degenerate rooms guarded', () => {
    expect(latticePitch(0, 1000, 800)).toBe(32)
    // OP-56 table row: n=1392 in ~1000x700 lands near p=24 — a 42x34 field.
    expect(latticePitch(1392, 1200, 700)).toBeGreaterThan(20)
    expect(latticePitch(1392, 1200, 700)).toBeLessThan(32)
    // A 30-node ego graph OPENS UP: the room, not a clamp, sets the distance.
    expect(latticePitch(30, 1000, 700)).toBeGreaterThan(100)
    // Direct formula check (cols from the hex density — the precise
    // sin-60 constant, since a 0.866 literal leaves a 0.0009 lie — then the
    // height bind).
    const HEX = Math.sqrt(3) / 2
    const n = 400, w = 1000, h = 1000
    const cols = Math.max(1, Math.round(Math.sqrt((HEX * n * w) / h)))
    const rows = Math.ceil(n / cols)
    expect(latticePitch(n, w, h)).toBeCloseTo(Math.min(w / cols, h / ((rows - 1) * HEX + 1)), 6)
  })
})

describe('latticePlace', () => {
  const nodes = (specs: [string, string, number][]): any[] =>
    specs.map(([id, tag, degree]) => ({ id, tags: [tag], degree }))

  it('puts every full-row neighbour exactly one pitch away — the Owner fixed-distance law, checked', () => {
    const bodies = nodes([
      ['a', 'emacs', 3], ['b', 'emacs', 2], ['c', 'emacs', 1],
      ['d', 'org', 3], ['e', 'org', 2], ['f', 'org', 1],
      ['g', 'guix', 3], ['h', 'guix', 2], ['i', 'guix', 1]
    ])
    latticePlace(bodies, 40, 800, 800)
    const at = new Map(bodies.map((b) => [b.id, b]))
    for (const b of bodies) {
      expect(b.fx).toBe(b.x)
      expect(b.fy).toBe(b.y)
    }
    const dist = (p: any, q: any) => Math.hypot(p.x - q.x, p.y - q.y)
    // THE LAW, orientation-free: every node's six-neighbour ring sits at
    // exactly one pitch. (The hex stagger uses the literal 0.866 = sin 60°,
    // so the diagonal is 40.0009, not 40 — the tolerance is the literal's.)
    for (const p of bodies) {
      const nearest = Math.min(...bodies.filter((q) => q !== p).map((q) => dist(p, q)))
      expect(nearest).toBeCloseTo(40, 2)
    }
    // the band fold is visible: the next band's first node takes the cell the
    // serpentine reversed into, one hex row down, half a pitch across.
    expect(dist(at.get('c'), at.get('g'))).toBeCloseTo(40, 2)
  })

  it('is deterministic and keeps each hue band contiguous along the serpentine walk', () => {
    const make = () => nodes([
      ['a', 'emacs', 1], ['b', 'org', 5], ['c', 'emacs', 9],
      ['d', 'guix', 2], ['e', 'org', 7], ['f', 'emacs', 4]
    ])
    const one = make(); const two = make()
    latticePlace(one, 32, 600, 600)
    latticePlace(two, 32, 600, 600)
    expect(one.map((b) => `${b.x},${b.y}`)).toEqual(two.map((b) => `${b.x},${b.y}`))
    const cols = Math.max(1, Math.round(Math.sqrt((0.866 * 6 * 600) / 600)))
    const offX = ((cols - 1) * 32) / 2
    const rows = Math.ceil(6 / cols)
    const hexY = 32 * 0.866
    const offY = ((rows - 1) * hexY) / 2
    const walkAt = (b: any): number => {
      const row = Math.round((b.y + offY) / hexY)
      const col = Math.round((b.x + offX - (row % 2 ? 16 : 0)) / 32)
      return row * cols + (row % 2 ? cols - 1 - col : col)
    }
    const walked = [...one].sort((a, b) => walkAt(a) - walkAt(b))
    const bands = new Map<string, number[]>()
    walked.forEach((b, i) => bands.set(b.tags?.[0] ?? '', [...(bands.get(b.tags?.[0] ?? '') ?? []), i]))
    for (const idxs of bands.values()) {
      expect(Math.max(...idxs) - Math.min(...idxs)).toBe(idxs.length - 1)
    }
  })
})

// ---------- manualToc (Owner directive 2026-10-31: TOC not a page listing) ----------

describe('manualToc', () => {
  const page = (id: string, up?: string, next?: string): any => ({
    id, slug: id, title: id, tags: ['emacs'], ...(up ? { up } : {}), ...(next ? { next } : {})
  })

  it('builds the Info tree: roots are pages whose up is outside the set, siblings ride next', () => {
    const tree = manualToc([
      page('m--Top', undefined, 'm--Ch1'),
      page('m--Ch1', 'm--Top', 'm--Sec1'),
      page('m--Sec1', 'm--Ch1'),
      page('m--Ch2', 'm--Top')
    ])
    expect(tree.map((n) => n.doc!.id)).toEqual(['m--Top'])
    expect(tree[0].children.map((n) => n.doc!.id)).toEqual(['m--Ch1', 'm--Ch2'])
    expect(tree[0].children[0].children.map((n) => n.doc!.id)).toEqual(['m--Sec1'])
  })

  it('falls back to A–Z letter groups when a big corpus carries no Info structure', () => {
    // 25+ pages: above the small-manual flat threshold, so the folder
    // fallback is what the directive asked for at hundreds-of-docs scale.
    const pages = [
      ...Array.from({ length: 12 }, (_, i) => page(`org--alpha-${i}`, undefined, undefined).title = 'Alpha ' + i),
      ...Array.from({ length: 10 }, (_, i) => page(`org--mid-${i}`, undefined, undefined).title = 'Mid ' + i),
      ...Array.from({ length: 8 }, (_, i) => page(`org--zulu-${i}`, undefined, undefined).title = 'Zulu ' + i)
    ].map((_, i) => page(`org--p${i}`))
    // give the generated pages their spread of first letters
    pages.forEach((n: any, i: number) => {
      n.title = i < 12 ? 'Alpha ' + i : i < 22 ? 'Mid ' + i : 'Zulu ' + i
    })
    const tree = manualToc(pages)
    expect(tree.map((n) => n.group)).toEqual(['A', 'M', 'Z'])
    expect(tree[0].doc).toBeUndefined() // groups are pure folders
    expect(tree[0].children.length).toBe(12)
  })

  it('keeps small unstructured manuals flat (a 24-page list needs no folders)', () => {
    const pages = Array.from({ length: 10 }, (_, i) => page(`m--p${i}`))
    const tree = manualToc(pages)
    expect(tree.every((n) => n.doc && n.children.length === 0)).toBe(true)
  })

  it('survives a cyclic up: unreachable pages are salvaged as roots, not dropped', () => {
    const a = page('m--a', 'm--b')
    const b = page('m--b', 'm--a')
    const tree = manualToc([a, b])
    expect(tree.length).toBe(2) // both still render — corruption never loses pages
  })
})
