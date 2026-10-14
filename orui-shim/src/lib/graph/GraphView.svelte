<!-- GraphView — the shim's drop-in for org-roam-lite-ui's canvas component.

     docneural-ui mounts the REAL orui GraphView against orui's own store,
     fed from static graph.json snapshots (no Emacs, no WebSocket). This shim
     implements exactly that subset, directly over the force-graph engine the
     theme already depends on. Prop names and behaviour match what the two
     consumers (graph/DocneuralGraph.svelte hero mode, reader/SynapseRail.svelte
     mini-map) and the neuron painter (graph/neuronEngine.ts) expect:

     props
       store       the graphStore instance (applyGraphdata / setFocus)
       onNodeClick (node) => void
       loadEngine  () => Promise<module>  — the neuron loader; it returns a
                   module-shaped object whose `default` builds a configured
                   engine: `{ default: () => (el) => engine }`. Painting
                   accessors (nodeCanvasObject, linkWidth, particles) are
                   already installed on the engine by the time it is handed
                   to this component, so this component MUST NOT overwrite
                   them — see the linkWidth guard below.

     behaviour contract
       - sync: on every applyGraphdata, engine node objects are REUSED by id
         (x/y/vx/vy survive) so a filter keystroke never re-seeds physics;
         title/tags/degree are refreshed onto them, since the neuron painter
         reads those per frame.
       - nodeVal: 1 + min(degree, 20) — mirrors what the painter assumes when
         it computes soma radius from degree.
       - colours: node/link colours come from the container's computed style
         (--orui-node-palette / --orui-link-color) polled every 500 ms, the
         same cadence the painter uses. A theme flip therefore repaints the
         canvas; because force-graph's render loop auto-pauses once the
         simulation cools, the poll re-sets the same graphData to kick one
         redraw (cheap, camera untouched).
       - sizing: force-graph does not observe its container, so a
         ResizeObserver pushes width/height.
       - focus: setFocus pans (centerAt) to the node — never zoom-to-fit.
         Requests that arrive before their node exists are retried on the
         next sync.
       - the root element carries data-nodes = live engine node count, which
         is the hook the verification gate and probes sample. It must remain
         the FIRST element child of the consumer's wrapper.
       - first data sync gets one zoom-to-fit framing pass.
     Not implemented (nothing calls them in docneural-ui): orui's filter
     machinery (filters ride as whole-snapshot swaps here), follow-mode, and
     the live Emacs transport. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import type { GraphStore } from '../state/graphStore'
  import { canvasTokens, nodeColor, type CanvasTokens } from './colors'

  type Loose = any

  let {
    store,
    onNodeClick,
    loadEngine
  }: {
    store: GraphStore
    onNodeClick: (node: Loose) => void
    loadEngine: () => Promise<unknown>
  } = $props()

  let rootEl: HTMLDivElement | undefined = $state()
  let engine: Loose = null
  let nodeCount = $state(0)

  /* ---------- node continuity across snapshot swaps ---------- */
  // force-graph writes x/y/vx/vy/index onto node objects and mutates link
  // source/target into node references. Keeping one object per id in `live`
  // is what makes a keystroke not re-seed the physics.
  const live = new Map<string, Loose>()
  const degrees = new Map<string, number>()
  let lastNodes: Loose[] = []
  let lastLinks: Loose[] = []

  let framed = false
  let pendingFocus: string | null = null

  /* ---------- theme tokens, polled on GraphView's own 500 ms beat ---------- */
  let tokens: CanvasTokens = { palette: [], link: '' }

  function pollTokens(): void {
    if (!rootEl || !engine) return
    const el = rootEl
    const next = canvasTokens((name) => getComputedStyle(el).getPropertyValue(name))
    const changed =
      next.palette.join(',') !== tokens.palette.join(',') || next.link !== tokens.link
    tokens = next
    if (changed && lastNodes.length) {
      // Kick one redraw; the sim may be cooled (auto-paused loop).
      engine.graphData({ nodes: lastNodes, links: lastLinks })
    }
  }

  function sync(): void {
    if (!engine) return
    const gd = store.graphdata
    degrees.clear()
    for (const l of gd.links) {
      degrees.set(l.source, (degrees.get(l.source) ?? 0) + 1)
      degrees.set(l.target, (degrees.get(l.target) ?? 0) + 1)
    }
    const seen = new Set<string>()
    const nodes: Loose[] = []
    for (const n of gd.nodes) {
      seen.add(n.id)
      let obj = live.get(n.id)
      if (!obj) {
        obj = {}
        live.set(n.id, obj)
      }
      // refresh painter-visible fields; x/y/vx/vy stay (physics memory)
      obj.id = n.id
      obj.title = n.title
      obj.tags = n.tags ?? []
      obj.level = n.level
      obj.file = n.file
      obj.degree = degrees.get(n.id) ?? 0
      nodes.push(obj)
    }
    for (const id of [...live.keys()]) if (!seen.has(id)) live.delete(id)
    const links = gd.links.map((l) => ({ source: l.source, target: l.target }))
    lastNodes = nodes
    lastLinks = links
    engine.graphData({ nodes, links })
    nodeCount = nodes.length
    if (pendingFocus) {
      panTo(pendingFocus)
      pendingFocus = null
    }
  }

  function panTo(id: string): void {
    if (!engine) {
      pendingFocus = id
      return
    }
    const n = live.get(id)
    if (!n || n.x == null || n.y == null) {
      pendingFocus = id // node not on canvas yet; retry on next sync
      return
    }
    engine.centerAt(n.x, n.y, 420)
  }

  /* ---------- effects: snapshot swaps and focus requests ---------- */
  $effect(() => {
    store.dataSeq
    sync()
  })

  $effect(() => {
    store.focusSeq
    const id = store.focus.id
    if (id == null) return
    panTo(id)
  })

  /* ---------- engine lifecycle ---------- */
  let disposed = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let ro: ResizeObserver | null = null

  onMount(() => {
    void (async () => {
      let mod: unknown
      try {
        mod = await loadEngine()
      } catch {
        return // graph chunk failed; leave the mount empty
      }
      if (disposed || !rootEl) return
      const create = ((mod as { default?: unknown }).default ?? mod) as () => (el: HTMLElement) => Loose
      engine = create()(rootEl)

      // Accessors this component owns. linkWidth is the neuron painter's when
      // it set one (firing wires read 1.4); only install the default where
      // nobody else claimed it (compact mini-map leaves links unstyled).
      engine
        .nodeVal((n: Loose) => 1 + Math.min(n?.degree ?? 0, 20))
        .nodeColor((n: Loose) => nodeColor(n, tokens))
        .linkColor(() => tokens.link)
      if (typeof engine.linkWidth() !== 'function') engine.linkWidth(0.5)
      // Theme convention (docneural-ui): a synthesized co-citation edge
      // carries its evidence in `context` as "co-cited: N chapters cite
      // both". Paint it dashed so a reader can tell a wire that exists in
      // the corpus from a relationship this site computed — the honest but
      // otherwise invisible category the theme's TODOs call out. Solid
      // links are nulls, which force-graph reads as "no dash".
      if (typeof engine.linkLineDash === 'function') {
        engine.linkLineDash((l: Loose) =>
          String(l?.context ?? '').startsWith('co-cited:') ? [4, 4] : null
        )
      }
      engine.onNodeClick((n: Loose) => onNodeClick(n))

      pollTokens()
      pollTimer = setInterval(pollTokens, 500)
      const size = () => {
        if (rootEl && engine) engine.width(rootEl.clientWidth).height(rootEl.clientHeight)
      }
      size()
      ro = new ResizeObserver(size)
      ro.observe(rootEl)

      // One framing pass, once positions exist (the first engine tick).
      engine.onEngineTick(() => {
        if (framed) return
        framed = true
        engine.zoomToFit(420, 40)
      })

      // Data or focus that landed while the chunk was loading.
      sync()
      if (pendingFocus) {
        panTo(pendingFocus)
        pendingFocus = null
      }
    })()

    return () => {
      disposed = true
      if (pollTimer) clearInterval(pollTimer)
      ro?.disconnect()
      ro = null
    }
  })
</script>

<div bind:this={rootEl} class="roam-view" data-nodes={nodeCount}></div>

<style>
  /* Fill the consumer's wrapper (.roam-wrap is absolute inset:0). force-graph
     paints a transparent canvas, so whatever shows through is the page's own
     themed background, exactly as the upstream component behaves. */
  .roam-view {
    position: absolute;
    inset: 0;
  }
</style>
