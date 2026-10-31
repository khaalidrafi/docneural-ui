<script lang="ts">
  // GraphView: renders the org-roam graph with the vanilla `force-graph`
  // canvas engine (the same engine the old UI used via its React adapter,
  // minus React). Performance notes:
  //
  //  - The engine is dynamically imported (loadEngine) so it is a separate
  //    chunk and never blocks first paint (see vite.config manualChunks).
  //  - Node objects are REUSED across syncs: force-graph stores physics state
  //    (x/y/vx/vy) on the node objects themselves, so replacing objects would
  //    reset the simulation on every Emacs save. We mutate fields in place.
  //  - The engine loader is injectable purely for testing (jsdom has no canvas).
  //
  // API note: force-graph is a kapsule factory — `ForceGraph()` returns a
  // config function, and THAT is called with the container element:
  //   ForceGraph()(elem)
  import { onMount } from 'svelte'
  import {
    graphShapeChanged,
    linkKey,
    type GraphState,
    type GraphStore
  } from '../state/graphStore'
  import { nodeMatchesFilters } from '../state/filters'
  import { FOCUS_PADDING_PX, FOCUS_SPEED_MS, type FocusRequest } from '../state/focus'
  import { canvasTokens, dimColor, nodeColor, type CanvasTokens } from './colors'

  // Engine-side node object. force-graph writes the physics fields (x/y/vx/vy)
  // onto whatever objects it is given, which is why they are reused across
  // syncs — and why a focus request can read a node's live position from here.
  type GraphNode = {
    id: string
    title: string
    tags: string[]
    degree: number
    x?: number
    y?: number
  }
  type GraphLink = { source: string; target: string; type: string }
  // force-graph's instance is a chainable factory; its types are awkward to
  // import standalone, so we keep it structural.
  type Engine = {
    graphData(d: { nodes: GraphNode[]; links: GraphLink[] }): Engine
    nodeColor(f: (n: GraphNode) => string): Engine
    nodeLabel(f: (n: GraphNode) => string): Engine
    nodeVal(f: (n: GraphNode) => number): Engine
    linkColor(f: (l: GraphLink) => string): Engine
    /** force-graph's dash array per link; null/undefined = solid line. */
    linkLineDash(f: (l: GraphLink) => number[] | null): Engine
    /** Hit tolerance for wire hover, in canvas px (see the pass-through
     *  props below — docneural's synapse click rides these). Optional so
     *  mock engines in tests stay constructible. */
    linkHoverPrecision?(n: number): Engine
    onLinkClick?(f: (l: GraphLink) => void): Engine
    onLinkHover?(f: (l: GraphLink | null) => void): Engine
    backgroundColor(c: string): Engine
    onNodeClick(f: (n: { id: string }) => void): Engine
    /** Stop physics once the layout has visibly settled (see d3AlphaMin note). */
    d3AlphaMin(n: number): Engine
    /** Ticks run synchronously (no repaint) on the next graphData() call. */
    warmupTicks(n: number): Engine
    /** Move the viewport centre. Positional args, despite what old docs show. */
    centerAt(x: number, y: number, transitionDuration?: number): Engine
    /** Fit nodes: (duration, padding, nodeFilter) — duration comes FIRST. */
    zoomToFit(
      transitionDuration?: number,
      padding?: number,
      nodeFilter?: (n: GraphNode) => boolean
    ): Engine
    width(n: number): Engine
    height(n: number): Engine
    /** force-graph's own teardown: stops the rAF loop, cancels the d3
     *  simulation, removes the canvas and disposes the WebGL context.
     *  Optional in the type because tests inject mock engines. */
    _destructor?(): void
  }

  let {
    store,
    onNodeClick = () => {},
    /** Edge interrogation (docneural network pass): wire click + hover,
     *  pass-through to force-graph's own onLinkClick/onLinkHover. Default
     *  no-ops keep the orui contract unchanged for embedders that never
     *  pass them; registering them also arms force-graph's `.clickable`
     *  cursor class on hover, so the pointer affordance is free. */
    onLinkClick = () => {},
    onLinkHover = () => {},
    /** Canvas-px hit tolerance for the pointer against a wire.
     *  6 = the docneural spec (large enough for a finger). */
    linkHoverPrecision = 6,
    /** Defaults to importing force-graph as its own lazy chunk. */
    loadEngine = (): Promise<{ default: unknown }> => import('force-graph')
  }: {
    store: GraphStore
    onNodeClick?: (node: import('../api').OrgRoamNode) => void
    onLinkClick?: (link: GraphLink) => void
    onLinkHover?: (link: GraphLink | null) => void
    linkHoverPrecision?: number
    loadEngine?: () => Promise<unknown>
  } = $props()

  let container: HTMLDivElement | undefined = $state()

  let engine: Engine | null = null

  // Set by the unmount teardown; the async loader checks it after its await so
  // a chunk that lands after unmount never builds an engine on a detached node
  // (the container binding survives unmount, so `!container` alone misses it).
  let disposed = false

  // Canvas colours come from the page's CSS, like every DOM rule in this UI.
  // The difference is the drawing method: force-graph paints to a <canvas>, and
  // canvas code cannot read custom properties, so the graph was the one part of
  // an embed that ignored the page's theme. `tokens` is read from the container's
  // COMPUTED style — which carries both the page's stylesheet and the inline
  // `--orui-*` the Emacs theme puts on the root — and is consulted per repaint.
  let tokens: CanvasTokens = canvasTokens(() => '')

  const readToken = (name: string): string =>
    container ? getComputedStyle(container).getPropertyValue(name) : ''

  // Flattened so a change check is a string compare, not an object one.
  const tokenKey = (t: CanvasTokens): string =>
    [t.link, t.flat ?? '', ...t.palette].join(' ; ')

  // A poll rather than a MutationObserver, on purpose: the usual way a site
  // changes theme (toggle a class on <html>, or a prefers-color-scheme flip)
  // mutates no attribute of this element, so an observer here would never fire.
  const TOKEN_POLL_MS = 500

  // ----- Kind-aware link paint -----
  // A link's `type` has exactly the producers our wire shape knows: 'id' (a
  // real citation the exporter resolved), 'cocite' (a SYNTHETIC edge the
  // UI itself computed — a co-citation: two chapters the corpus cites
  // together, no real wire between them), and 'bridge' (a RECOVERED
  // cross-manual wire, docneural's xref miner). The visual must match the
  // meaning: synthetic/recovered edges paint dashed — dimColor for cocite,
  // the engine's own mined hue for bridge (which re-asserts color through
  // its LOD chain) — and real wires stay solid and full-strength. Both
  // accessors travel with GraphView's non-canvas paint (linkColor): a kind
  // that is not in {id, cocite, bridge} paints as a real wire, so future
  // wire types stay default-true. The dash is kind-only (no token), so it
  // survives a theme-flip clobber here without reading canvas colors.
  const COCITE_DASH: number[] = [4, 4]
  const BRIDGE_DASH: number[] = [4, 3]
  const linkColorFor = (l: GraphLink): string =>
    l.type === 'cocite' ? dimColor(tokens.link) : tokens.link
  const linkDashFor = (l: GraphLink): number[] | null =>
    l.type === 'cocite' ? COCITE_DASH : l.type === 'bridge' ? BRIDGE_DASH : null

  function repaintTokens(): void {
    if (!engine) return
    // Re-setting the accessors is what forces the repaint: kapsule re-renders
    // on any accessor call, and a settled simulation (d3AlphaMin) never ticks
    // again on its own — new colours would sit unread until the next interaction.
    engine
      .nodeColor((n) => nodeColor(n, tokens))
      .linkColor(linkColorFor)
      .linkLineDash(linkDashFor)
  }

  function syncTokens(): void {
    const next = canvasTokens(readToken)
    if (tokenKey(next) === tokenKey(tokens)) return
    tokens = next
    repaintTokens()
  }

  // Engine node objects persist across syncs to keep physics state (see above).
  const engineNodes = new Map<string, GraphNode>()
  const engineLinks = new Map<string, GraphLink>()

  // State last drawn into the engine. Text-only notifications (getText replies
  // while reading notes) leave nodeMap/links/filter identical, so we skip:
  // rebuilding the ~10k-link engine maps would re-seed force-graph's whole
  // cooldown for a change the graph cannot even show.
  let lastDrawn: GraphState | null = null

  // First paint only: run a short physics head-start synchronously (no
  // repaint per tick) so the initial "big bang" costs fewer full-canvas
  // redraws of a 10k-link hairball. Kept small because on this machine even
  // 100 ticks over 10k links is a visible main-thread freeze; d3AlphaMin
  // (below) settles the rest cheaply. Later syncs reuse node positions.
  const FIRST_PAINT_WARMUP = 30

  function syncNow(state: GraphState): void {
    if (!engine) return
    if (lastDrawn && !graphShapeChanged(lastDrawn, state)) return
    const firstPaint = lastDrawn === null
    lastDrawn = state

    // UI filter lives IN the store (see graphStore.ts), so filter changes
    // arrive through the same subscription as data changes. Hidden nodes
    // never enter the engine maps.
    const filter = state.filter

    // Degree counts on the fly; nodes not in the map are new (fresh objects).
    const degrees = new Map<string, number>()
    for (const l of state.links) {
      degrees.set(l.source, (degrees.get(l.source) ?? 0) + 1)
      degrees.set(l.target, (degrees.get(l.target) ?? 0) + 1)
    }

    for (const [id, n] of state.nodeMap) {
      // Filter check: invisible nodes never enter the engine maps.
      if (!nodeMatchesFilters(n, filter)) continue
      const existing = engineNodes.get(id)
      if (existing) {
        // Mutate in place — do NOT replace the object.
        existing.title = n.title
        existing.tags = n.tags
        existing.degree = degrees.get(id) ?? 0
      } else {
        engineNodes.set(id, {
          id,
          title: n.title,
          tags: n.tags,
          degree: degrees.get(id) ?? 0
        })
      }
    }
    for (const id of [...engineNodes.keys()]) {
      // Removed from the store, or now filtered out — drop it.
      const n = state.nodeMap.get(id)
      if (!n || !nodeMatchesFilters(n, filter)) engineNodes.delete(id)
    }

    // Links: rebuild the engine-side map keyed by (source,target,type),
    // keeping only links whose endpoints are both visible. Store links
    // always carry string node ids.
    engineLinks.clear()
    for (const l of state.links) {
      if (engineNodes.has(l.source) && engineNodes.has(l.target)) {
        // A COPY, never the store's object: force-graph resolves endpoints in
        // place (id string -> node object). Shared objects come back from
        // graphData() with node references in `source`/`target`, which makes
        // every later id-based lookup miss — `filterLiveLinks` would drop the
        // whole link list on the next snapshot and a `local`/`zoom` frame would
        // see "no neighbours". Links carry no physics state (the nodes do), so
        // re-creating them per sync costs nothing the engine cares about.
        engineLinks.set(linkKey(l), { ...l })
      }
    }

    // Warm up only for the first structural paint (see FIRST_PAINT_WARMUP).
    engine.warmupTicks(firstPaint ? FIRST_PAINT_WARMUP : 0)
    engine.graphData({
      nodes: [...engineNodes.values()],
      links: [...engineLinks.values()]
    })
    // Test/integration hook: how many nodes the engine currently holds,
    // visible to tests and embedders without reaching into the engine.
    if (container) container.dataset.nodes = String(engineNodes.size)
  }

  // Store subscription points at the shared sync path.
  const sync = (state: GraphState): void => {
    syncNow(state)
    applyFocus(state)
  }

  // Acting on a viewport request from Emacs (follow / zoom). Identity is the
  // trigger: only a NEW FocusRequest object means "Emacs moved again", so a
  // save or a getText reply that carries the same request does not re-pan.
  let appliedFocus: FocusRequest | null = null

  function applyFocus(state: GraphState): void {
    if (!engine) return // the catch-up sync after the engine loads replays it
    const req = state.focus
    if (!req || req === appliedFocus) return
    appliedFocus = req

    // A node the view does not have — Emacs can point at a note the current
    // filter hides, or one that has not arrived yet. Panning to nothing would
    // jerk the camera, and fitting nothing would zoom to the whole vault.
    const node = engineNodes.get(req.id)
    if (!node) return

    const speed = req.speed ?? FOCUS_SPEED_MS
    if (req.fit) {
      // zoomToFit measures the node set itself, so it needs no coordinates —
      // and it does its own centerAt, so this branch must not also pan.
      const fit = req.fit
      engine.zoomToFit(speed, req.padding ?? FOCUS_PADDING_PX, (n) => fit.has(n.id))
      return
    }
    // A pan needs the node's live position, which the simulation writes onto
    // the object. Before the first tick there is none, so skip rather than
    // center on (undefined, undefined).
    if (node.x == null || node.y == null) return
    engine.centerAt(node.x, node.y, speed)
  }

  onMount(() => {
    // Subscribe BEFORE the engine finishes loading: sync() is a no-op until
    // `engine` exists, and the catch-up sync below replays whatever arrived
    // in the meantime (e.g. the initial graphdata snapshot).
    const unsubscribe = store.subscribe(sync)
    // Hoisted out of the async loader so the teardown below can always see it,
    // whether or not the engine chunk had finished loading by unmount.
    let ro: ResizeObserver | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      const mod = (await loadEngine()) as { default?: unknown }
      const create = (mod.default ?? mod) as () => (elem: HTMLElement) => Engine
      if (!container || disposed) return
      try {
        engine = create()(container)
      } catch {
        // No usable canvas (e.g. non-browser environments). Leave the empty
        // container; the app stays usable for everything else.
        return
      }
      // Read the page's colours before the first sync so the opening frame is
      // already themed, then poll for later changes (see TOKEN_POLL_MS).
      tokens = canvasTokens(readToken)
      engine
        .backgroundColor('rgba(0,0,0,0)') // transparent; page bg follows the Emacs theme
        .d3AlphaMin(0.05) // settle-and-stop instead of a 15s full-cooldown
        .nodeColor((n) => nodeColor(n, tokens))
        .nodeLabel((n) => n.title)
        .nodeVal((n) => 1 + Math.min(n.degree, 20))
        .linkColor(linkColorFor)
        .linkLineDash(linkDashFor)
        // Edge interrogation pass-through (docneural): the wire is a first
        // class target. linkHoverPrecision widens the hit test; onLinkHover
        // is null on leave. Optional calls keep mock engines (jsdom tests)
        // constructible.
        .linkHoverPrecision?.(linkHoverPrecision)
        .onLinkClick?.((l) => onLinkClick(l))
        .onLinkHover?.((l) => onLinkHover(l))
        .onNodeClick((n) => {
          const node = store.getState().nodeMap.get(n.id)
          if (node) onNodeClick(node)
        })
        // Size the canvas to OUR box. force-graph defaults width/height to
        // window.innerWidth/innerHeight, so an embed in a 600px element used to
        // get a viewport-sized canvas: it overflowed its box and `zoomToFit`
        // framed the window, not the box. The standalone page hid this — there
        // the box IS the viewport.
        .width(container.clientWidth)
        .height(container.clientHeight)
      // The box can change after mount (an embedder's responsive layout, a
      // sidebar opening). jsdom has no ResizeObserver, hence the guard.
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
          if (!engine || !container) return
          engine.width(container.clientWidth).height(container.clientHeight)
        })
        if (container) ro.observe(container)
      }
      // Replay any state that arrived while the engine was loading.
      sync(store.getState())
      timer = setInterval(syncTokens, TOKEN_POLL_MS)
    })()
    return () => {
      disposed = true
      ro?.disconnect()
      if (timer) clearInterval(timer)
      unsubscribe()
      // The engine is the expensive part and the one thing the old teardown
      // skipped: its rAF loop and d3 simulation keep running with nobody
      // watching, its closures pin the store, and every WebGL context stays
      // allocated (browsers cap ~16 per page, so a leak here eventually
      // blanks the canvas). The docneural shell's FULL/FAST toggle mounts and
      // unmounts this component on every flip — the leak compounded per
      // click. (Audit dispatch #2.)
      engine?._destructor?.()
      engine = null
    }
  })
</script>

<div class="graph-view" part="graph" bind:this={container}></div>

<style>
  /* Fills the nearest positioned ancestor (the page in the standalone app,
     the host box when embedded). absolute (not fixed) so the <org-roam-graph>
     web component can contain it. */
  .graph-view {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
</style>
