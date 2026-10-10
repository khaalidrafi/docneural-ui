// Neuron-style canvas painting, injected through orui's supported
// `loadEngine` seam. GraphView's props are only store/onNodeClick/loadEngine,
// so a `nodeCanvasObject` prop on it is silently dropped — custom painting
// happens by WRAPPING the engine factory instead: we configure the force-graph
// instance at construction, then GraphView's own accessor chain runs on top
// and keeps owning node colours, sizes, tooltips and theme polling.
//
// What we add (hero mode):
//  - 'after' node paint: the themed default disc stays the soma; we draw two
//    halo rings and an always-legible title over it;
//  - firing synapses: directional particles and a thicker wire on every link
//    touching the selected node.
// Compact mode (the reader's 210px mini-map) uses 'replace' paint: a small
// clean soma, no labels, no particles — degree-sized default discs were
// unreadable blobs at that size.
//
// Colour source: the same computed-style tokens GraphView polls (--orui-*),
// read through `tokenEl` at most twice a second — a getComputedStyle per node
// per frame would freeze this machine. Label ink/paper come from the site's
// own --sy-fg/--sy-bg so text stays readable on both themes.
import { canvasTokens, nodeColor, type CanvasTokens } from 'orui/graph/colors'

// The force-graph instance is a chainable kapsule; GraphView keeps its own
// structural type private, so we stay loose here on purpose.
type Engine = any
type Ctx = CanvasRenderingContext2D

export type NeuronFocus = {
  /** Element whose computed style carries the resolved --orui-* / --sy-* tokens. */
  tokenEl: () => HTMLElement | undefined
  /** Live selection, read per paint: closures keep the painter current without
   *  re-syncing graph data (which would disturb the physics). */
  selected: () => string | null
  neighbors: () => Set<string>
  /** Mini-map: replace-mode small soma, no labels or particles. */
  compact?: boolean
}

/** Wrap force-graph's module loader. GraphView does `create()(container)`,
 *  so we return a module-shaped object whose default builds a neuron-configured
 *  instance. */
export function makeNeuronLoader(focus: NeuronFocus): () => Promise<unknown> {
  return async () => {
    const mod = (await import('force-graph')) as { default?: unknown }
    const create = (mod.default ?? mod) as () => (el: HTMLElement) => Engine
    return {
      default: () => (el: HTMLElement) => {
        const engine: Engine = create()(el)
        installNeuron(engine, focus)
        return engine
      }
    }
  }
}

// GraphView's nodeVal is 1 + min(degree, 20) and force-graph's default radius
// is sqrt(val) * nodeRelSize (4). Mirror that so halos and labels sit on the
// disc the engine actually drew.
function somaRadius(n: { degree?: number }, compact: boolean | undefined): number {
  const val = 1 + Math.min(n.degree ?? 0, 20)
  return Math.sqrt(val) * (compact ? 1.6 : 4)
}

function shortTitle(n: { title?: string }): string {
  const t = (n.title ?? '').replace(/\s*\([^)]*\)\s*$/, '') // drop "(The Org Manual)"
  return t.length > 26 ? t.slice(0, 25) + '…' : t
}

function installNeuron(engine: Engine, focus: NeuronFocus): void {
  let tokens: CanvasTokens = canvasTokens(() => '')
  let ink = '#d7e2dc'
  let paper = '#10151a'
  let readAt = 0
  const tokensNow = (): CanvasTokens => {
    const t = performance.now()
    if (t - readAt > 500) {
      readAt = t
      const el = focus.tokenEl()
      if (el) {
        const get = (name: string) => getComputedStyle(el).getPropertyValue(name)
        tokens = canvasTokens(get)
        ink = get('--sy-fg').trim() || ink
        paper = get('--sy-bg').trim() || paper
      }
    }
    return tokens
  }

  const isHot = (id: string): boolean => {
    const sel = focus.selected()
    return sel != null && (id === sel || focus.neighbors().has(id))
  }

  const paintNode = (n: any, ctx: Ctx, globalScale: number): void => {
    const col = nodeColor(n, tokensNow())
    const r = somaRadius(n, focus.compact)
    const hot = isHot(n.id)
    const x = n.x ?? 0
    const y = n.y ?? 0

    if (focus.compact) {
      // 'replace': we own the whole drawing — one small disc, ring when hot.
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = col
      ctx.fill()
      if (hot) {
        ctx.strokeStyle = col
        ctx.lineWidth = 1 / globalScale
        ctx.beginPath()
        ctx.arc(x, y, r * 1.9, 0, 2 * Math.PI)
        ctx.stroke()
      }
      return
    }

    // Dendritic glow: two rings, hot neighbourhood at full strength.
    ctx.save()
    ctx.strokeStyle = col
    ctx.lineWidth = (hot ? 1.8 : 1.1) / globalScale
    ctx.globalAlpha = hot ? 0.9 : 0.35
    ctx.beginPath()
    ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.globalAlpha = hot ? 0.45 : 0.14
    ctx.beginPath()
    ctx.arc(x, y, r * 2.2, 0, 2 * Math.PI)
    ctx.stroke()
    ctx.restore()

    // Titles: hubs always (that is how you recognise the chapters), the hot
    // set always, everything else once the user zooms in.
    if (globalScale > 1.15 || hot || (n.degree ?? 0) >= 60) {
      const label = shortTitle(n)
      if (!label) return
      const fontSize = 11 / globalScale
      ctx.save()
      ctx.font = `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      // Paper-coloured stroke behind the glyphs: readable on either theme and
      // over any wire hairball.
      ctx.strokeStyle = paper
      ctx.globalAlpha = 0.8
      ctx.lineWidth = fontSize * 0.32
      ctx.strokeText(label, x, y + r * 2.2 + 1 / globalScale)
      ctx.globalAlpha = 1
      ctx.fillStyle = hot ? col : ink
      ctx.fillText(label, x, y + r * 2.2 + 1 / globalScale)
      ctx.restore()
    }
  }

  engine
    .nodeCanvasObjectMode(() => (focus.compact ? 'replace' : 'after'))
    .nodeCanvasObject(paintNode)

  if (!focus.compact) {
    const touches = (l: any): boolean => {
      const sel = focus.selected()
      return sel != null && (l.source?.id === sel || l.target?.id === sel)
    }
    engine
      // 0.25 was invisible on the light theme; axons should read as wires.
      .linkWidth((l: any) => (touches(l) ? 1.4 : 0.5))
      .linkDirectionalParticles((l: any) => (touches(l) ? 3 : 0))
      .linkDirectionalParticleWidth(1.8)
      // After graphData() force-graph resolves endpoints to node objects.
      .linkDirectionalParticleColor((l: any) => nodeColor(l.source ?? {}, tokensNow()))
  }
}
