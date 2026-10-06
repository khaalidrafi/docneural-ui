<script lang="ts">
  // GraphView — the roaming canvas. Ported from org-roam-lite-ui's
  // GraphView.svelte; the WebSocket/store machinery is gone, props drive it.
  // Kept engine behaviors (they were tuned on this same 4 GB machine):
  //  - force-graph is dynamically imported so the canvas chunk never
  //    blocks first paint;
  //  - engine node objects are REUSED across updates (force-graph stores
  //    x/y/vx/vy on them, replacing objects would reset the sim);
  //  - d3AlphaMin settles-and-stops instead of cooling for 15 s;
  //  - a short synchronous warm-up on first paint skips the "big bang".
  import { onMount } from 'svelte'
  import { nodeColor } from '../core/colors'
  import { degreesOf } from '../core/graph'
  import type { GraphData } from '../core/types'

  type EngineNode = {
    id: string
    title: string
    tags: string[]
    degree: number
    x?: number
    y?: number
  }
  type EngineLink = { source: string; target: string }
  // force-graph's instance is a chainable kapsule; keep it structural.
  type Engine = {
    graphData(d: { nodes: EngineNode[]; links: EngineLink[] }): Engine
    nodeColor(f: (n: EngineNode) => string): Engine
    nodeLabel(f: (n: EngineNode) => string): Engine
    nodeVal(f: (n: EngineNode) => number): Engine
    linkColor(f: (l: EngineLink) => string): Engine
    backgroundColor(c: string): Engine
    d3AlphaMin(n: number): Engine
    warmupTicks(n: number): Engine
    onNodeClick(f: (n: EngineNode) => void): Engine
    centerAt(x: number, y: number, ms?: number): Engine
    zoomToFit(ms?: number, padding?: number, filter?: (n: EngineNode) => boolean): Engine
  }

  let {
    data,
    selectedId = undefined,
    onNodeClick = () => {},
    /** Injectable for tests (jsdom has no canvas) and embedders. */
    loadEngine = (): Promise<{ default?: unknown }> => import('force-graph')
  }: {
    data: GraphData
    selectedId?: string
    onNodeClick?: (id: string) => void
    loadEngine?: () => Promise<unknown>
  } = $props()

  let container: HTMLDivElement | undefined = $state()
  let engine: Engine | null = null

  // Persistent engine-side objects, keyed by node id (see reuse note above).
  const engineNodes = new Map<string, EngineNode>()

  const FIRST_PAINT_WARMUP = 30
  let firstPaint = true
  // Canvas paint can't read CSS custom properties, so the selected-node
  // highlight is a fixed color that works on both page modes.
  const SELECTED_HUE = '#ffffff'

  function sync(): void {
    if (!engine) return
    const deg = degreesOf(data.links)
    const visible = new Set(data.nodes.map((n) => n.id))

    for (const n of data.nodes) {
      const existing = engineNodes.get(n.id)
      if (existing) {
        existing.title = n.title
        existing.tags = n.tags
        existing.degree = deg.get(n.id) ?? 0
      } else {
        engineNodes.set(n.id, { ...n, degree: deg.get(n.id) ?? 0 })
      }
    }
    for (const id of [...engineNodes.keys()]) {
      if (!visible.has(id)) engineNodes.delete(id)
    }

    // Links are fresh copies each sync: force-graph rewrites source/target
    // into node refs in place, and links hold no physics state anyway.
    const links = data.links
      .filter((l) => visible.has(l.source) && visible.has(l.target))
      .map((l) => ({ source: l.source, target: l.target }))

    engine.warmupTicks(firstPaint ? FIRST_PAINT_WARMUP : 0)
    engine.graphData({ nodes: [...engineNodes.values()], links })
    if (firstPaint) {
      firstPaint = false
      engine.zoomToFit(400, 40)
    }
    if (container) container.dataset.nodes = String(engineNodes.size)
  }

  // Pan (not re-layout) when the selection changes outside a canvas click.
  // Also repaints node colors: the selected node gets the highlight hue, and
  // the engine caches its painter closure, so re-set it on every change.
  function centerSelected(): void {
    if (!engine || !selectedId) return
    engine.nodeColor((n) => (n.id === selectedId ? SELECTED_HUE : nodeColor(n)))
    const n = engineNodes.get(selectedId)
    if (!n || n.x == null || n.y == null) return
    engine.centerAt(n.x, n.y, 350)
  }

  $effect(sync)
  $effect(centerSelected)

  onMount(() => {
    ;(async () => {
      const mod = (await loadEngine()) as { default?: unknown }
      const create = (mod.default ?? mod) as () => (elem: HTMLElement) => Engine
      if (!container) return
      try {
        engine = create()(container)
      } catch {
        return // no canvas (non-browser env): app stays usable without it
      }
      engine
        .backgroundColor('rgba(0,0,0,0)') // page backdrop shows through
        .d3AlphaMin(0.05)
        .nodeColor((n) => (n.id === selectedId ? SELECTED_HUE : nodeColor(n)))
        .nodeLabel((n) => n.title)
        .nodeVal((n) => 1 + Math.min(n.degree, 20))
        .linkColor(() => 'rgba(110,110,110,0.5)')
        .onNodeClick((n) => onNodeClick(n.id))
      sync()
    })()
  })
</script>

<div class="graph-view" bind:this={container}></div>

<style>
  .graph-view {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
</style>
