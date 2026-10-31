// Bridge synapses (network pass 2026-10-31, SPEC §5): cross-manual wires the
// xref miner RECOVERED from literal text references — a guix chapter that
// writes "(emacs)Network Security" cites the emacs manual across the corpus
// boundary, but the source export carries no link between them. These are the
// only synthetic wires this site ever draws besides co-citations, and the
// DO-NOT law is absolute: never synthesize by similarity or embedding —
// literal recovered matches only, each one carrying its citing line as
// provenance.
//
// Pure module (no Svelte, no fetch): the store merges the committed artifact
// (`public/sample/bridges.json`) into graph.json at ingest; a missing or
// broken artifact degrades to "no bridges" and the corpus works unchanged.

import type { DocLink, GraphData } from './types'
import { isBoilerplateCtx } from './vocab'

/** One entry of the committed artifact (a superset of the miner's
 *  proposed-wires.json shape: same fields, kind pinned to 'bridge'). */
export type BridgeEntry = {
  source: unknown
  target: unknown
  kind?: unknown
  ctx?: unknown
  provenance?: unknown
  confidence?: unknown
}

/** A deduped bridge: one wire per (source, target) pair, every recovered
 *  citing line kept in `provenance` (SPEC: the duplicate
 *  guix--Documentation→emacs--Network-Security pair folds into ONE wire that
 *  still shows both lines). */
export type BridgeWire = {
  source: string
  target: string
  ctx: string[]
}

const asLines = (v: unknown): string[] => {
  if (typeof v === 'string' && v.trim()) return [v]
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string' && !!s.trim())
  return []
}

/**
 * Parse + dedupe the artifact. Tolerates anything: a malformed file (HTML 404
 * page, truncated JSON, `null`) parses to [] and the app carries on —
 * "fetch fail = silently continue" is the contract. Duplicate (source,target)
 * pairs merge into one wire whose ctx keeps every distinct line, first-seen
 * order, so the render and the recovered count are stable.
 */
export function parseBridges(raw: unknown): BridgeWire[] {
  if (!Array.isArray(raw)) return []
  const byPair = new Map<string, BridgeWire>()
  for (const entry of raw as BridgeEntry[]) {
    if (!entry || typeof entry !== 'object') continue
    const source = typeof entry.source === 'string' ? entry.source : ''
    const target = typeof entry.target === 'string' ? entry.target : ''
    if (!source || !target || source === target) continue
    // A legacy 'xref' kind from the miner is still a bridge — the artifact is
    // the only source and every entry in it is a recovered match.
    if (entry.kind != null && entry.kind !== 'bridge' && entry.kind !== 'xref') continue
    const lines = [...asLines(entry.ctx), ...asLines(entry.provenance)]
    const key = `${source}>${target}`
    const seen = byPair.get(key)
    if (!seen) {
      byPair.set(key, { source, target, ctx: [...new Set(lines)] })
    } else {
      seen.ctx = [...new Set([...seen.ctx, ...lines])]
    }
  }
  return [...byPair.values()]
}

/**
 * Merge bridges into a loaded GraphData. Returns a NEW GraphData (the input is
 * the fetch result — nothing else may observe the mutation). Rules:
 *  - both endpoints must exist in the corpus (a dangling bridge cannot draw);
 *  - a pair the corpus already wires in EITHER direction is skipped — the real
 *    citation wins and the canvas never double-paints one synapse;
 *  - each wire is `kind: 'bridge'`, context = the first recovered line that
 *    is not a nav-header (a GNU Info navigation header is chrome, not a
 *    citation — final polish 2026-10-31, SPEC F3), provenance = every
 *    recovered line (the click card).
 */
export function mergeBridges(data: GraphData, bridges: BridgeWire[]): GraphData {
  if (!bridges.length) return data
  const ids = new Set(data.nodes.map((n) => n.id))
  const wired = new Set<string>()
  for (const l of data.links) {
    wired.add(`${l.source}>${l.target}`)
    wired.add(`${l.target}>${l.source}`)
  }
  const fresh: DocLink[] = []
  for (const b of bridges) {
    if (!ids.has(b.source) || !ids.has(b.target)) continue
    const key = `${b.source}>${b.target}`
    if (wired.has(key)) continue
    wired.add(key)
    fresh.push({
      source: b.source,
      target: b.target,
      // Provenance stays FULL (honesty); only the rail-fallback context
      // skips the boilerplate, falling back to the first line when every
      // recovered line is a nav header.
      context: b.ctx.find((l) => !isBoilerplateCtx(l)) ?? b.ctx[0],
      kind: 'bridge',
      provenance: b.ctx.length > 1 ? b.ctx : undefined
    })
  }
  return fresh.length ? { nodes: data.nodes, links: [...data.links, ...fresh] } : data
}

/** How many bridge WIRES are merged — the number the status plate prints as
 *  `+N recovered` (final polish 2026-10-31, SPEC F4: the plate counts WIRES
 *  so its arithmetic closes against the SYNAPSES total; the recovered
 *  REFERENCES stay visible only in the card's provenance list). */
export function bridgeWireCount(links: DocLink[]): number {
  let n = 0
  for (const l of links) if (l.kind === 'bridge') n++
  return n
}
