// Tests for the bridge merge's honesty contract (final polish 2026-10-31,
// SPEC F3/F4): the wire's context prefers the first NON-boilerplate recovered
// line — a GNU Info nav header is chrome, not a citation — while provenance
// stays FULL (the click card is where every recovered line stays visible);
// and the plate's `+N recovered` counts bridge WIRES, not references, so the
// arithmetic against the SYNAPSES total closes.
import { describe, expect, it } from 'vitest'
import { bridgeWireCount, mergeBridges, parseBridges } from './bridges'
import type { GraphData } from './types'

const corpus = (): GraphData => ({
  nodes: [
    { id: 'g1', slug: 'g1', title: 'Guix chapter', tags: ['guix'] },
    { id: 'e1', slug: 'e1', title: 'Emacs chapter', tags: ['emacs'] },
    { id: 'e2', slug: 'e2', title: 'Emacs second', tags: ['emacs'] }
  ],
  links: []
})

describe('mergeBridges context preference (SPEC F3)', () => {
  it('context is the first recovered line that is not a nav header', () => {
    const merged = mergeBridges(
      corpus(),
      parseBridges([
        {
          source: 'g1',
          target: 'e1',
          ctx: ['Next: Previous: The Fill Prefix Up: Filling Text', 'a real citing sentence lives here']
        }
      ])
    )
    expect(merged.links[0].context).toBe('a real citing sentence lives here')
  })

  it('provenance stays full — every recovered line rides the wire', () => {
    const merged = mergeBridges(
      corpus(),
      parseBridges([
        {
          source: 'g1',
          target: 'e1',
          ctx: ['Next: Previous: The Fill Prefix Up: Filling Text', 'a real citing sentence lives here']
        }
      ])
    )
    expect(merged.links[0].provenance).toEqual([
      'Next: Previous: The Fill Prefix Up: Filling Text',
      'a real citing sentence lives here'
    ])
  })

  it('all-boilerplate falls back to the first line (never empty)', () => {
    const merged = mergeBridges(
      corpus(),
      parseBridges([{ source: 'g1', target: 'e1', ctx: 'Up: Top [Contents][Index]' }])
    )
    expect(merged.links[0].context).toBe('Up: Top [Contents][Index]')
    expect(merged.links[0].provenance).toBeUndefined() // one line = no array
  })
})

describe('bridgeWireCount (SPEC F4)', () => {
  it('counts wires, not references — 2 wires / 3 refs is 2', () => {
    const merged = mergeBridges(
      corpus(),
      parseBridges([
        { source: 'g1', target: 'e1', ctx: ['one', 'two'] },
        { source: 'g1', target: 'e2', ctx: 'three' }
      ])
    )
    expect(merged.links.filter((l) => l.kind === 'bridge')).toHaveLength(2)
    expect(bridgeWireCount(merged.links)).toBe(2)
  })
})
