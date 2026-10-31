// Graph computations for static doc data. Kept free of Svelte so the
// export pipeline's output can be unit-tested against these functions.

import type { DocLink, DocNode, GraphData } from './types'

/** node id -> [node, degree], precomputed for canvas painting. */
export type NodeView = DocNode & { degree: number }

/* ---------- ingest normalization ---------- */

/** One doc's tags with duplicates removed, first occurrence kept (so the
 *  deterministic colour seed — tags[0] — never moves). The exporter can emit
 *  `["org","org"]` (tag inheritance meeting an explicit tag), and a duplicate
 *  inside a Svelte `{#each ... (tag)}` key throws `each_key_duplicate`, which
 *  killed the graph-mode note preview on the shipped corpus (real-browser
 *  sweep 2026-10-31). Deduped once at ingest; the render guards at the keyed
 *  each sites are the second belt. */
export function dedupeTags(tags: string[] | undefined | null): string[] {
  if (!tags || tags.length < 2) return tags ?? []
  return [...new Set(tags)]
}

/** Ingest pass over a freshly loaded GraphData: every node's tags deduped.
 *  Returns new node objects (the input is the fetch result — nothing else
 *  holds a reference yet), so the function stays pure. */
export function dedupeGraphTags(data: GraphData): GraphData {
  return {
    nodes: data.nodes.map((n) => ({ ...n, tags: dedupeTags(n.tags) })),
    links: data.links
  }
}

export function degreesOf(links: DocLink[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const l of links) {
    d.set(l.source, (d.get(l.source) ?? 0) + 1)
    d.set(l.target, (d.get(l.target) ?? 0) + 1)
  }
  return d
}

export function nodeViews(data: GraphData): Map<string, NodeView> {
  const deg = degreesOf(data.links)
  const m = new Map<string, NodeView>()
  for (const n of data.nodes) m.set(n.id, { ...n, degree: deg.get(n.id) ?? 0 })
  return m
}

/** Directly connected node ids of `id` (both link directions). */
export function neighborIds(data: GraphData, id: string): Set<string> {
  const out = new Set<string>()
  for (const l of data.links) {
    if (l.source === id) out.add(l.target)
    if (l.target === id) out.add(l.source)
  }
  return out
}

/**
 * Local graph centered on one doc — org-roam-lite-ui's core interaction.
 * Includes center + 1-hop neighbors, and only links whose BOTH endpoints are
 * in that set (so the panel never renders dangling edges).
 */
export function localGraph(data: GraphData, centerId: string): GraphData {
  const keep = neighborIds(data, centerId)
  keep.add(centerId)
  return {
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target))
  }
}

/** Backlinks: links pointing AT docId, newest-most-connected source first. */
export function backlinks(data: GraphData, docId: string): DocLink[] {
  return data.links.filter((l) => l.target === docId)
}

/** Outgoing links: links FROM docId. */
export function outlinks(data: GraphData, docId: string): DocLink[] {
  return data.links.filter((l) => l.source === docId)
}

/** Filter for the graph mode (ported from org-roam-lite-ui filters.ts):
 *  a node is visible when its title matches the query (empty = all) and,
 *  if any tag filter is active, it carries at least one of those tags. */
export function nodeMatches(
  n: DocNode,
  query: string,
  tags: string[]
): boolean {
  if (query && !n.title.toLowerCase().includes(query.toLowerCase())) return false
  if (tags.length > 0 && !tags.some((t) => n.tags.includes(t))) return false
  return true
}

/** Subgraph limited to visible nodes (both endpoints must pass).
 *  Stubs are always dropped: an Info stub is a pointer, not knowledge,
 *  and the exporter deliberately gives it no edges (770 of 1559 corpus
 *  nodes) — on the canvas they would be 770 floating dots, which is
 *  exactly what makes the graph read as broken. The reader, the sidebar
 *  and llms.txt already exclude them; this keeps the synapses view honest
 *  about the same rule. */
export function filteredGraph(
  data: GraphData,
  query: string,
  tags: string[]
): GraphData {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const visible = (id: string) => {
    const n = byId.get(id)
    return n ? !n.stub && nodeMatches(n, query, tags) : false
  }
  return {
    nodes: data.nodes.filter((n) => !n.stub && nodeMatches(n, query, tags)),
    links: data.links.filter((l) => visible(l.source) && visible(l.target))
  }
}

/**
 * EGO GRAPH: the chapter you are reading, what it touches, and what those
 * touch (`depth` hops, both directions). Stubs excluded, same rule as
 * filteredGraph.
 *
 * WHY 2 HOPS AND NOT 3: with 29,017 wires a third hop is the whole corpus,
 * and the whole corpus on a canvas is the hairball that makes a graph view
 * worthless (the honest verdict on any "global graph" is that it answers no
 * question a reader has). Two hops answers the one question you actually have
 * at a cross-reference: what is connected to THIS, and how.
 */
export function egoGraph(data: GraphData, centerId: string, depth = 2): GraphData {
  const stub = new Set(data.nodes.filter((n) => n.stub).map((n) => n.id))
  const keep = new Set<string>([centerId])
  let frontier = keep
  for (let hop = 0; hop < depth; hop++) {
    const next = new Set<string>()
    for (const l of data.links) {
      if (frontier.has(l.source) && !stub.has(l.target)) next.add(l.target)
      if (frontier.has(l.target) && !stub.has(l.source)) next.add(l.source)
    }
    for (const id of next) keep.add(id)
    frontier = next
  }
  return {
    nodes: data.nodes.filter((n) => keep.has(n.id) && !n.stub),
    links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target))
  }
}

/**
 * CO-CITATION: chapters that are cited *together with* `centerId` by other
 * chapters, ranked by how many citers they share. Two sections that always
 * get cited in the same breath are related even when neither links to the
 * other — the edge type citation-network research leans on and documentation
 * sites never show, because they have no citation data to lean on. We do:
 * every Org link.
 *
 * Cost is O(citers x degree) at open time on one node, not over the corpus,
 * which is why this is a click-time computation and not an export-time one.
 */
export function coCitations(
  data: GraphData,
  centerId: string,
  cap = 10
): Map<string, number> {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  // One pass to index "who cites whom", then the lookup is per-citer degree and
  // not per-citer times the whole edge list — 29,017 links scanned once, not
  // once per citation.
  const out = new Map<string, string[]>()
  const citers: string[] = []
  for (const l of data.links) {
    const list = out.get(l.source)
    if (list) list.push(l.target)
    else out.set(l.source, [l.target])
    if (l.target === centerId && l.source !== centerId) citers.push(l.source)
  }
  const shared = new Map<string, number>()
  for (const citer of citers) {
    for (const id of new Set((out.get(citer) ?? []).filter((t) => {
      if (t === centerId) return false
      const n = byId.get(t)
      return !!n && !n.stub
    }))) {
      shared.set(id, (shared.get(id) ?? 0) + 1)
    }
  }
  return new Map(
    [...shared.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, cap)
  )
}

/** Collapse repeated wires to the same chapter into one row, keeping the
 *  first link (its `context` is the sentence shown) and counting the rest.
 *
 *  WHY: the Org manual's index chapter cites nearly everything, so an
 *  ungrouped afferent list is 792 rows that are really five titles — density
 *  with no signal. Grouped, the same list answers "who cites this, and how
 *  much do they lean on it" in six rows. */
export function groupWires(
  links: DocLink[],
  key: 'source' | 'target'
): { id: string; n: number; link: DocLink }[] {
  const order: string[] = []
  const seen = new Map<string, { id: string; n: number; link: DocLink }>()
  for (const l of links) {
    const id = l[key]
    const g = seen.get(id)
    if (g) g.n++
    else {
      seen.set(id, { id, n: 1, link: l })
      order.push(id)
    }
  }
  // Most-cited first; ties keep corpus order, so the list is stable across
  // reloads instead of shuffling with Map insertion order.
  return order
    .map((id) => seen.get(id)!)
    .sort((a, b) => b.n - a.n)
}

/** All tags that appear on >= 2 nodes — the tag chips worth offering. */
export function commonTags(data: GraphData, min = 2): string[] {
  const count = new Map<string, number>()
  for (const n of data.nodes)
    for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
}

/* ---------- label geometry ----------
   Shared by the painter (how big a label box is) and the spread layout (how
   much room that box needs). Both must use the SAME string: the canvas prints
   shortTitle(), so spacing for a longer name nobody sees would be room wasted.
   Lives here rather than in graph/neuronEngine.ts because these are pure
   numbers — testable without a canvas, which is where a wrong constant shows
   up as an unreadable overview long after it ships. */

/** The title as the canvas prints it: a chapter name without its manual
    suffix, capped so one 60-word Info node cannot dominate a whole screen. */
export function shortTitle(title: string, max = 26): string {
  const t = title.replace(/\s*\([^)]*\)\s*$/, '') // drop "(The Org Manual)"
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/* Advance width of the label font: 11px JetBrains Mono is a monospace at
   roughly 0.6 em, so a title's pixel width is a multiplication, not a
   measureText per node. shortTitle() caps at 26 chars, which bounds the
   widest box at ~180 px. */
const CHAR_PX = 6.6

/** Width of this node's printed title in canvas units. */
export function labelWidth(title?: string): number {
  return 8 + shortTitle(title ?? '').length * CHAR_PX
}

/** Air each label box keeps for itself on every side, in canvas units, so two
    neighbours end up with 2 × GUTTER of blank canvas between their inks. */
const GUTTER = 4
/** The painter strokes the label in paper colour at `fontSize * 0.32` wide to
    give the glyphs a readable outline, so the ink reaches half that — 2 px —
    past the measured text. */
const HALO = 2
/** Drop from a node's centre to its label line, in soma radii. MUST match the
    painter in graph/neuronEngine.ts, which is what makes the reserve true. */
export const LABEL_LINE = 1.2

/** The label font size at zoom 1: the canvas paints at `11 / globalScale` so a
    name is 11 px on screen at ANY zoom, and 1.2 × that is its line height. */
const LABEL_PX = 11

/** A node's keep-out rectangle, in world units at zoom 1, measured from the
    node's own centre: how far it reaches left, right, up, down. */
export type Extent = { l: number; r: number; t: number; b: number }

/**
 * Repulsion one node asks for in spread layout, scaled by the spacing
 * multiplier `k` (network pass 2026-10-31, SPEC §3): a 44px baseline halo,
 * plus ~one full label extent per competing node, times k. The old
 * `20 + labelWidth * 0.5` cut reserved less than one extent and let sibling
 * chapter names share air they had not paid for; the new reserve plus the
 * 220px link distance (see applyLayout) is what buys a visible gap between
 * two adjacent labels at the default fit.
 *
 * Still WEAK relative to the hard bodies: charge sets the SHAPE (open,
 * knotted-free, centred by force-graph's own `forceCenter`), the label boxes
 * set the DENSITY — `labelExtent` packing stays the promise owner.
 */
export function spreadStrength(title: string | undefined, k = 1): number {
  return -(44 + labelWidth(title) * 1.1) * k
}

/** The rectangle a neuron OCCUPIES on screen: its soma, its halo rings, and the
 *  title printed under it. Two nodes may not come closer than their boxes
 *  require — which is the promise the overview needs.
 *
 *  This used to be a CIRCLE (d3's forceCollide, radius = half the title width),
 *  and the circle defeats itself. A chapter name is 26 chars of 11 px monospace:
 *  about 180 × 13 px of ink. Circumscribing that costs r ≈ 90, i.e. 25,000 px²
 *  of reserve for 2,300 px² of ink, and a 30-node ego graph then spreads past
 *  the viewport. `fitReadable` has to zoom OUT to frame it (measured: `data-fit`
 *  0.597) — and because a label keeps its SCREEN size while the world shrinks,
 *  zooming out re-overlaps every name the physics just separated. Wasted area
 *  becomes unreadable text.
 *
 *  Packing boxes instead breaks that: a column of short names sits as tight as
 *  a row of long ones, the field takes the aspect of the canvas it is read on,
 *  and the 1:1 cap becomes an honest framing.
 *
 *  The box is asymmetric, and `LABEL_LINE` is why: `t` protects the disc, `b`
 *  reaches past the name the painter drops `r * LABEL_LINE` below the centre.
 *  That drop used to be 2.4 so a label cleared the outer dendritic haze ring —
 *  44 px of reserve for 13 px of text on a hub. The ring is decoration at 0.22
 *  alpha and the glyphs carry their own paper stroke, so a name may cross it,
 *  and the vertical reserve is exactly what decides whether a view fits at 1:1
 *  in a window with 574 px of readable canvas above the note panel.
 *
 *  Scale invariance still governs the whole picture and no force escapes it:
 *  crowding at fit-all is set by the box and by how many nodes are IN the view
 *  (roughly box/√N pixels per node), not by physics magnitudes. Scaling a layout
 *  up shrinks the fit by exactly as much as it widened the gaps. So this buys
 *  the air at 1:1, which is where reading happens, and the corpus-scale overview
 *  still leans on the painter's label grid to ink only the names with room. */
export function labelExtent(title: string | undefined, soma: number): Extent {
  const side = labelWidth(title) / 2 + HALO + GUTTER
  return {
    l: side,
    r: side,
    t: soma + HALO + GUTTER,
    b: soma * LABEL_LINE + LABEL_PX * 1.2 + HALO + GUTTER
  }
}



/* ---------- LATTICE — the fixed-distance overview (Owner law 2026-10-28) ----------
   "ALL nodes will maintain a fixed distance so that the overview can be seen
   clearly other than crowded clusters." A square lattice does exactly that:
   every neuron's four neighbours sit exactly one PITCH away, forever, no
   matter how hard the citation graph pulls. A serpentine walk over hue-grouped
   chapters keeps each manual's colour one contiguous band, so the grid still
   reads as structure — bands of source hue, hubs leading — instead of static. */

/** sin 60° — the exact hex row-height ratio, so "one pitch away" is exact
 *  to float precision (a 0.866 literal left a 0.0009 lie in the math). */
const HEX = Math.sqrt(3) / 2

/** The column count of the hex field that packs `count` nodes into a w×h
 *  room. ONE function, used by BOTH the pitch and the placement: the bug
 *  that shipped measured cols from the hex density here but re-measured it
 *  without the HEX factor inside latticePlace, so the placed field ran
 *  ~3% wider than the room it was packed to fill — the camera then zoomed
 *  out and the serpentine hue bands folded a column early. Same inputs,
 *  same cols, everywhere, or the field and the room disagree. */
export function latticeCols(count: number, w: number, h: number): number {
  if (!count || w <= 0 || h <= 0) return 1
  return Math.max(1, Math.round(Math.sqrt((HEX * count * w) / h)))
}

/** The pitch (world px between neighbouring nodes) for `count` nodes filling
 *  a w×h room: OP-56's hex fill math — the field is authored to the room at
 *  1:1 with no clamps, every interior node holds six neighbours at exactly
 *  p, and the painter's radiusScale keeps somas inside the pitch. */
export function latticePitch(count: number, w: number, h: number): number {
  if (!count || w <= 0 || h <= 0) return 32
  // OP-56 fill math: the hex field is authored to FILL the measured room at
  // 1:1 — columns from the hex density (latticeCols, shared with the
  // placement), then the pitch is whatever keeps `rows` of that width
  // inside the height. No clamps: the field IS the room, every node holds
  // the same six-neighbour distance p, and the painter's radiusScale
  // (0.36·p/18.33) keeps somas inside it.
  const cols = latticeCols(count, w, h)
  const rows = Math.ceil(count / cols)
  return Math.min(w / cols, h / ((rows - 1) * HEX + 1))
}

/** A node the lattice can place: the fields GraphView copies onto the engine
 *  objects (title/tags/degree — the color seed is the first tag) plus the
 *  position fields the placement writes. */
export type LatticeBody = {
  id: string
  title?: string
  tags?: string[]
  degree?: number
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

/** Place `nodes` on a serpentine square lattice, IN PLACE, and PIN them
 *  (fx/fy): the lattice is deterministic, so the simulation has nothing to
 *  settle — the mode parks the physics and the field cannot re-knot.
 *  Ordering: hue groups (first tag — the same key nodeColor hashes)
 *  alphabetically, degree descending inside a group, id as the final
 *  tiebreak, so identical inputs always give the identical picture. `cols`
 *  follows the room's aspect: a wide window gets wide rows. */
export function latticePlace(
  nodes: LatticeBody[],
  pitch: number,
  w: number,
  h: number
): void {
  const n = nodes.length
  if (!n || pitch <= 0) return
  // The SAME cols the pitch was computed from — latticeCols carries the hex
  // density. A plain square-density measure here disagreed with latticePitch
  // by 3 columns on this corpus and the field overflowed its room (the
  // "lattice is a wall of paint" deploy bug, 2026-10-31).
  const cols = latticeCols(n, w, h)
  const ordered = [...nodes].sort((a, b) => {
    const ga = a.tags?.[0] ?? ''
    const gb = b.tags?.[0] ?? ''
    if (ga !== gb) return ga < gb ? -1 : 1
    const da = a.degree ?? 0
    const db = b.degree ?? 0
    if (da !== db) return db - da
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const rows = Math.ceil(n / cols)
  // OP-56 hex: odd rows shift half a pitch right and every row steps HEX·p
  // down (HEX = sin 60°, exact), so each interior node holds SIX neighbours
  // at exactly p — the fixed-distance promise as geometry, not as a force.
  // The serpentine walk stays: a hue band FOLDS at the row end instead of
  // tearing (the next band starts where this one stops), now on the hex grid.
  const hexY = pitch * HEX
  const offX = ((cols - 1) * pitch) / 2
  const offY = ((rows - 1) * hexY) / 2
  ordered.forEach((nd, i) => {
    const row = Math.floor(i / cols)
    const colRaw = i % cols
    const col = row % 2 ? cols - 1 - colRaw : colRaw
    nd.x = col * pitch - offX + (row % 2 ? pitch / 2 : 0)
    nd.y = row * hexY - offY
    nd.fx = nd.x
    nd.fy = nd.y
  })
}

// ---------- TABLE OF CONTENTS (Owner directive 2026-10-31) ----------

/** One row of the manual TOC: the page plus the sections nested under it
 *  (Info's `up` field, resolved inside the same manual's content set).
 *  `open` is UI scratch — the disclosure state the Toc component writes. */
export type TocNode = {
  doc: DocNode
  children: TocNode[]
  open?: boolean
}

/** A filter hit: the row plus its breadcrumb chain (ancestor page titles,
 *  ending with the hit's own — the `Up › Section › Page` path). */
export type TocHit = { node: TocNode; path: string[] }

/** Depth the TOC opens to by default (SPEC §2: depth 2 — the root and its
 *  chapter rows visible, sections closed until asked for). */
export const TOC_OPEN_DEPTH = 2

/** The title a TOC row prints: the canvas's suffix rule (drop "(The Org
 *  Manual)") WITHOUT the 26-char truncation — a directory row can afford
 *  the full name, and truncating it would hide the one thing rows are
 *  picked by. */
export function tocTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '')
}

/** Build a manual's TOC tree from its content pages (the store's `chapters`
 *  list, already stub-free and manual-scoped). The Owner's ship directive:
 *  "Show TOC instead of listing each page of the doc. We'll add hundreds of
 *  docs to this site later" — a flat grid of 752 cards dies at that scale,
 *  while the Info tree the exporter already rides along (up/next/prev) is a
 *  collapsible directory for free. Roots are pages whose `up` is missing or
 *  outside the set; siblings keep Info reading order via the same next-chain
 *  walk the reading-order spine uses, with id order as the fallback so the
 *  output is deterministic for identical exports. A corpus with no Info
 *  structure at all comes back as a FLAT reading-order list (the A–Z letter
 *  fallback was removed 2026-10-31 — never letter groups). */
export function manualToc(chapters: DocNode[]): TocNode[] {
  const inSet = new Set(chapters.map((c) => c.id))
  const byId = new Map(chapters.map((c) => [c.id, c]))
  const kids = new Map<string, DocNode[]>()
  const roots: DocNode[] = []
  for (const c of chapters) {
    const up = c.up && inSet.has(c.up) ? c.up : null
    if (up) {
      const list = kids.get(up)
      if (list) list.push(c)
      else kids.set(up, [c])
    } else {
      roots.push(c)
    }
  }
  /** Info reading order inside one sibling list: walk `next` chains from the
   *  chain heads (id order), then sweep leftovers — mirrors the store's
   *  `chapters` walk so the TOC and the reader spine never disagree. */
  const orderSiblings = (list: DocNode[]): DocNode[] => {
    if (list.length <= 1) return list
    const set = new Set(list.map((n) => n.id))
    const targeted = new Set(list.map((n) => n.next).filter(Boolean) as string[])
    const seen = new Set<string>()
    const out: DocNode[] = []
    const walk = (start: DocNode) => {
      let cur: DocNode | undefined = start
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id)
        out.push(cur)
        cur = cur.next && set.has(cur.next) ? byId.get(cur.next) : undefined
      }
    }
    for (const n of [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (!targeted.has(n.id)) walk(n)
    }
    for (const n of list) if (!seen.has(n.id)) walk(n)
    return out
  }
  // Depth cap is a corruption guard, not a design choice: real manuals top
  // out at 4 (measured on this corpus), 8 keeps a cyclic `up` from hanging.
  const build = (doc: DocNode, depth: number): TocNode => ({
    doc,
    children: depth >= 8 ? [] : orderSiblings(kids.get(doc.id) ?? []).map((c) => build(c, depth + 1))
  })
  const ordered = orderSiblings(roots)
  let tree = ordered.map((r) => build(r, 1))
  // Corruption guard: a chapter whose `up` chain never reaches a root (a
  // cyclic export, or a parent filtered out by the manual scope) would
  // silently vanish from the tree — unreachable from any root, rendered by
  // nothing. Salvage: every chapter the walk did not touch becomes a root
  // itself, in reading order, so pages are lost to no bug.
  const reachable = new Set<string>()
  const markReach = (n: TocNode) => {
    if (reachable.has(n.doc.id)) return
    reachable.add(n.doc.id)
    for (const c of n.children) markReach(c)
  }
  for (const r of tree) markReach(r)
  const orphaned = chapters.filter((c) => !reachable.has(c.id))
  if (orphaned.length) {
    for (const c of orderSiblings(orphaned)) tree.push(build(c, 1))
  }
  // SINGLE-CHILD ROOT DESCENT (SPEC §2.1): a root whose only content is one
  // nested child is a pass-through folder — the lone `Top` row a manual shows
  // when its Info header chains through a single hub. Promote that child (and
  // its subtree) to the root until the tree stops being a single-file chain:
  // the visitor sees chapter rows, not a directory with one door.
  while (tree.length === 1 && tree[0].children.length === 1) {
    tree = [tree[0].children[0]]
  }
  // No letter-group fallback. A corpus whose export carries no Info structure
  // (this site's Org and Guix manuals today) renders as a FLAT reading-order
  // list with degree badges — NEVER A–Z folders (SPEC §2.5: the letter groups
  // hid the reading order behind an alphabet nobody asked for). The real
  // chapter tree takes over automatically the moment the exporter rides `up`
  // along for a manual; no UI change.
  return tree
}

/** True when the tree carries real Info structure (any nested row) — false for
 *  the flat reading-order fallback, which wears the `flat list · no structure
 *  in export` rail badge. */
export function tocHasStructure(tree: TocNode[]): boolean {
  return tree.some(function hasKids(n: TocNode): boolean {
    return n.children.length > 0 || n.children.some(hasKids)
  })
}

/** In-TOC filter (SPEC §2.4): local substring over chapter titles, returning
 *  AT MOST `limit` hits as flat rows with breadcrumb paths. Pure — the
 *  component owns the 250ms debounce. Ancestors never filter in: a hit is a
 *  page whose OWN title matches (matching a parent would flood the cap with
 *  every section under it); its path is how the row still says where it lives. */
export function filterToc(tree: TocNode[], query: string, limit = 12): TocHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: TocHit[] = []
  const walk = (nodes: TocNode[], path: string[]): void => {
    for (const n of nodes) {
      const title = tocTitle(n.doc.title)
      const nextPath = [...path, title]
      if (hits.length >= limit) return
      if (title.toLowerCase().includes(needle)) {
        hits.push({ node: n, path: nextPath })
      }
      if (n.children.length) walk(n.children, nextPath)
      if (hits.length >= limit) return
    }
  }
  walk(tree, [])
  return hits
}
