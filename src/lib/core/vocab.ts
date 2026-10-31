// The neural-vocabulary ledger (network pass 2026-10-31, SPEC §1).
//
// The Owner's hard law: user-facing copy NEVER says "graph" — a document is a
// NEURON, a cross-reference is a SYNAPSE, the whole system is the NEURAL
// NETWORK. This module is the curated string list the rename test scans: every
// user-visible sentence, title, placeholder and aria-label this UI renders in
// its neural voice. It is documentation you can execute — `vocab.test.ts`
// asserts (a) none of these strings carries the forbidden word outside the
// data-contract names (`graph.json`, `docs/`, `ctx/` stay literal so the
// artifacts stay findable), and (b) the component sources do not regress to
// the banned literals.
//
// Code identifiers are NOT covered: localGraph(), graph.json, LayoutMode and
// friends are implementation names and stay.

export const USER_VISIBLE_STRINGS: readonly string[] = [
  // status plate (DocneuralApp) — the +N suffix counts bridge WIRES (F4),
  // not references; the card's provenance list stays the refs' only home.
  '${n} NEURONS · ${m} SYNAPSES · ${s} SRC · +${r} recovered',
  'SYNAPSE LINK DOWN',
  'BUS · ARMING',
  // mode chip — DOCS/SYNAPSES stays the Owner's own word; the hint loses "graph"
  'See the citations in the neural network',
  'Read the documentation',
  'neural network engine on/off',
  'Toggle theme',
  'Toggle lite mode',
  // boot readout
  'reading the neural network',
  // fatal panel
  'This documentation neural network did not load',
  'The site builds its neural network from an exported corpus.',
  // synapse panel
  'SYNAPSES · ${n} SYNAPSES',
  // help blurb
  'A documentation reader enhanced with an org-roam neural network.',
  '⌁ synapses is the neural network between docs',
  // home
  'wired into an org-roam neural network of',
  'the whole neural network, live',
  'corpus plate · 96 of 1386 neurons · phyllotaxis',
  'one row per neuron, degree = real synapse count',
  'degree = real synapse count · corpora wear their neural hue · source of truth: graph.json',
  'index neuron',
  'the Corpus Plate plots the 96 most-connected of 1386 neurons',
  'each in its neural hue',
  '1386 neurons, 30915 synapses, three GNU manuals',
  'export 2026-10-28 · 1386 neurons · 30915 synapses · 3 corpora · AA-verified · 0 trackers',
  'synapse network',
  '30915 synapses drawn from the corpus\' real cross-references',
  'navigation is neural-network traversal',
  // chapter rail
  '⌁ NEURAL NETWORK: ${n} TICKED',
  'tick to isolate in the synapses network',
  // filter bar
  'Search neurons',
  'filter neurons',
  'bridge · recovered (${n})',
  // palette — the three jump sections (SPEC §6.1)
  'neural network mode',
  'Documents',
  'Chapters',
  'Neurons',
  // corpus field
  '${n} neurons · ${m} synapses · ${s} src',
  // synapse rail
  'local neural network',
  'open full neural network ›',
  'show in the synapses network',
  // toc
  'flat list · no structure in export',
  'No chapters parsed — showing reading order.',
  'Filter chapters',
  '${n} synapses',
  'Expand all chapters',
  'Collapse all chapters',
  // canvas chrome
  '⌁ synapses unavailable',
  'Lock network positions',
  'Unlock network positions',
  'Zoom in',
  'Zoom out',
  'Fit the neural network to the frame',
  'Increase synapse spacing',
  'Decrease synapse spacing',
  'arrows on selection · ${n} synapses exceeds paint budget',
  // phone-only nc-status copy (the desktop line is ~440px at 10px/0.14em;
  // a 180px corner gets the tier, not the arithmetic)
  'arrows: selection only',
  // synapse click card
  'SYNAPSE',
  'bridge · recovered',
  'Recovered from text reference — not in the source link graph',
  'No citing line recorded',
  'Light trail through this synapse',
  'Copy citation',
  'Close synapse detail',
  'Open ${title}',
  // note preview
  'neuron // preview',
  // home tagline
  'docs are neurons · citations are synapses · fire together, wire stronger',
  // library drawer
  'Library',
  'No document matches — ${n} manuals loaded.',
  '${n} neurons · ${m} synapses',
  'recents',
  'Open the document library',
  'Close the document library',
  'Filter the library',
  // boilerplate citing-line fallback (SPEC F3): a ctx line that is really a
  // GNU Info navigation header is not a citation — say so, on every surface.
  'navigation header — no prose citation recorded',
  'navigation header — no prose citation',
]

/** Allowed literals: the exported artifacts keep their file names so they
 *  stay findable and debuggable (data-contract exception, SPEC §0) — and the
 *  bridge honesty sentence the SPEC law pins verbatim ("not in the source
 *  link graph"): that phrase NAMES the artifact's link data, so the ledger
 *  test exempts it like any other contract name. */
export const DATA_CONTRACT_NAMES: readonly string[] = [
  'graph.json',
  'docs/',
  'ctx/',
  'llms.txt',
  'the source link graph'
]

/* ---------- citing-line boilerplate (final polish 2026-10-31, SPEC F3) ----------
   GNU Info chapters open with a navigation header — "Next: Foo, Up: Top
   [Contents][Index]" — and the ctx miner sometimes caught that line instead
   of a citation sentence. A prose RATIO provably misses "Next: Previous: The
   Fill Prefix Up: Filling Text", so the rule is structural: ≥2 DISTINCT nav
   labels, or one label plus the bracket-link residue the header footer
   leaves behind. */

const NAV_LABELS = /\b(?:Previous|Up|Next):/g
const BRACKET_RESIDUE = /\].*Index\]/

/** True when a citing line is navigation chrome, not a sentence. ONE shared
 *  predicate: the synapse card, the hover chip, the clipboard, the rail,
 *  LinkPeek and mergeBridges must all answer identically or the surfaces
 *  disagree about what a wire's evidence is. */
export function isBoilerplateCtx(line: string | null | undefined): boolean {
  if (!line) return false
  const labels = new Set(line.match(NAV_LABELS))
  if (labels.size >= 2) return true
  return labels.size === 1 && BRACKET_RESIDUE.test(line)
}
