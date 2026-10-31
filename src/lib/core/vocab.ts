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
  // status plate (DocneuralApp)
  '${n} NEURONS · ${m} SYNAPSES · ${s} SRC',
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
  // synapse click card
  'SYNAPSE',
  'bridge · recovered',
  'Recovered from text reference — not in the source link graph',
  'No citing line recorded',
  'Light trail through this synapse',
  'Copy citation',
  'Close synapse detail',
  'Open ${title}',
  // library drawer
  'Library',
  'No document matches — ${n} manuals loaded.',
  '${n} neurons · ${m} synapses',
  'recents',
  'Open the document library',
  'Close the document library',
  'Filter the library',
]

/** The one allowed literal: the exported artifact keeps its file name so it
 *  stays findable and debuggable (data-contract exception, SPEC §0). */
export const DATA_CONTRACT_NAMES: readonly string[] = ['graph.json', 'docs/', 'ctx/', 'llms.txt']
