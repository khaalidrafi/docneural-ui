// The vocabulary ledger's enforcement. vocab.ts always claimed this file
// exists — it never did, which is exactly how "Search nodes" survived the
// network pass (final polish 2026-10-31, SPEC F1). Three assertions:
//  a. no USER_VISIBLE_STRINGS entry carries a banned word outside the
//     data-contract allowlist;
//  b. no component source regresses to banned words in the four attribute
//     literals a screen reader quotes (aria-label/title/placeholder/alt);
//  c. the shared boilerplate predicate (SPEC F3) answers identically for
//     every surface that shows a citing line.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DATA_CONTRACT_NAMES, isBoilerplateCtx, USER_VISIBLE_STRINGS } from './vocab'

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

// The spec's exact shape: a tempered full-match scan, so a banned word cannot
// hide inside a longer entry and a "clean" prefix cannot bless a dirty tail.
const NO_BANNED_WORD = /^((?!\b(graph|nodes|edges)\b).)*$/i
const BANNED_IN_SOURCE = /\b(nodes?|edges?)\b|graph view/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Contract names + URLs stay literal (graph.json, ctx/, ?mode=graph keep
 *  their data-contract names); everything around them is judged. */
function outsideAllowlist(s: string): string {
  let out = s.replace(/https?:\/\/\S+/g, ' ').replace(/\?mode=graph\b/gi, ' ')
  for (const name of DATA_CONTRACT_NAMES) out = out.replace(new RegExp(escapeRe(name), 'g'), ' ')
  return out.replace(/\.nodes\b/g, ' ')
}

describe('the vocabulary ledger', () => {
  it('never says graph/nodes/edges outside the data-contract allowlist', () => {
    for (const s of USER_VISIBLE_STRINGS) {
      expect(NO_BANNED_WORD.test(outsideAllowlist(s)), JSON.stringify(s)).toBe(true)
    }
  })

  it('carries the strings this pass renamed (the ledger is the whole point)', () => {
    for (const s of [
      'Search neurons',
      'filter neurons',
      'neuron // preview',
      'docs are neurons · citations are synapses · fire together, wire stronger',
      'arrows: selection only',
      'navigation header — no prose citation recorded',
      'navigation header — no prose citation'
    ]) {
      expect(USER_VISIBLE_STRINGS, s).toContain(s)
    }
  })
})

function* walkSvelte(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* walkSvelte(p)
    else if (e.endsWith('.svelte')) yield p
  }
}

// Static attribute literals only: quoted values (and the quoted form inside
// {`...`}); a bare {expression} has no copy to read.
const ATTR_LITERAL = /\b(?:aria-label|title|placeholder|alt)=\{?"([^"]*)"/g
const ATTR_TEMPLATE = /\b(?:aria-label|title|placeholder|alt)=\{`([^`]*)`/g

describe('component sources', () => {
  it('quote no banned word in aria-label/title/placeholder/alt literals', () => {
    const offenders: string[] = []
    for (const file of walkSvelte(SRC_ROOT)) {
      const src = readFileSync(file, 'utf8')
      for (const re of [ATTR_LITERAL, ATTR_TEMPLATE]) {
        for (const m of src.matchAll(re)) {
          // Svelte interpolations are expressions, not copy — judge the
          // static text around them (a variable NAMED node is code, not UI).
          const literal = m[1].replace(/\{[^}]*\}/g, ' ')
          if (BANNED_IN_SOURCE.test(outsideAllowlist(literal))) {
            offenders.push(`${file.slice(SRC_ROOT.length)} → ${m[0].slice(0, 60)}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('isBoilerplateCtx (SPEC F3)', () => {
  it('calls a nav header by its ≥2 distinct labels, whatever prose follows', () => {
    // The prose-ratio rule provably misses this one — that miss is why the
    // rule is structural, not statistical.
    expect(isBoilerplateCtx('Next: Previous: The Fill Prefix Up: Filling Text')).toBe(true)
    expect(isBoilerplateCtx('Next: Introduction,  Up: Top')).toBe(true)
    expect(isBoilerplateCtx('Previous: Sorting, Up: Top, Next: Variables')).toBe(true)
  })
  it('calls one label + bracket-link residue (the header footer)', () => {
    expect(isBoilerplateCtx('Up: Top [Contents][Index]')).toBe(true)
    expect(isBoilerplateCtx('Next: Killing Text]…Index]')).toBe(true)
  })
  it('keeps single-label lines without residue, and prose, honest', () => {
    expect(isBoilerplateCtx('Previous: Sorting')).toBe(false)
    expect(isBoilerplateCtx('Next: A. Next: B')).toBe(false) // one DISTINCT label
    expect(isBoilerplateCtx('To kill the region, type C-w.')).toBe(false)
    expect(isBoilerplateCtx('up and next in prose: nothing to see')).toBe(false)
    expect(isBoilerplateCtx('')).toBe(false)
    expect(isBoilerplateCtx(undefined)).toBe(false)
  })
})
