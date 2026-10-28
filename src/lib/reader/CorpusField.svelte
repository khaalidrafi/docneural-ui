<script lang="ts">
  // CorpusField — the "Corpus Plate" (DS-COOLEST directive 11 + signature
  // moment). The hero shows the REAL graph, drawn once: top-N nodes by
  // synapse degree laid out on a golden-angle phyllotaxis spiral, wires
  // between them, one halo ring per soma. Deterministic, static, zero
  // filters, zero animation, zero extra request — the first thing a visitor
  // sees is the thing the site actually is.
  //
  // Geometry (DS spec, followed literally): θ = i * 2.399963 rad,
  // r = 3 + 4.3·√i in a 100×100 viewBox. Soma radius grows log with degree.
  // Wires: links with both ends in the set, strongest-first, capped.
  // Phone: 40 somas / 90 wires in a full-bleed 112px band (Home's PHONE
  // media block sizes the band; the counts are chosen once at init).
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'

  let { store }: { store: DocneuralStore } = $props()

  const phone =
    typeof matchMedia === 'function' &&
    matchMedia('(max-width: 700px)').matches
  const N_NODES = phone ? 40 : 96
  const N_WIRES = phone ? 90 : 240

  type Soma = { id: string; x: number; y: number; r: number; tag: string }
  type Wire = { x1: number; y1: number; x2: number; y2: number }

  const field = $derived.by(() => {
    const deg = new Map<string, number>()
    for (const [id, v] of store.views) deg.set(id, v.degree)
    const dOf = (id: string): number => deg.get(id) ?? 0

    const top = [...store.data.nodes]
      .sort((a, b) => dOf(b.id) - dOf(a.id))
      .slice(0, N_NODES)
    const pos = new Map<string, { x: number; y: number; r: number }>()
    const somas: Soma[] = top.map((n, i) => {
      const th = i * 2.399963
      const r = 3 + 4.3 * Math.sqrt(i)
      const p = {
        x: 50 + r * Math.cos(th),
        y: 50 + r * Math.sin(th),
        r: 0.55 + 0.32 * Math.log2(1 + dOf(n.id)),
      }
      pos.set(n.id, p)
      return { id: n.id, ...p, tag: n.tags[0] ?? '' }
    })

    const wires: Wire[] = store.data.links
      .filter((l) => pos.has(l.source) && pos.has(l.target))
      .sort(
        (a, b) =>
          Math.min(dOf(b.source), dOf(b.target)) -
          Math.min(dOf(a.source), dOf(a.target)),
      )
      .slice(0, N_WIRES)
      .map((l) => {
        const a = pos.get(l.source)!
        const b = pos.get(l.target)!
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
      })

    // Group somas per source so the hue is data (one inline --dn-src per g).
    const groups = new Map<string, Soma[]>()
    for (const s of somas) {
      const arr = groups.get(s.tag) ?? []
      arr.push(s)
      groups.set(s.tag, arr)
    }
    return { somas, wires, groups: [...groups.entries()] }
  })

  const docCount = $derived(store.data.nodes.length)
  const synCount = $derived(store.data.links.length)
  const srcCount = $derived(store.sources.length)
</script>

<figure class="corpus-field" aria-hidden="true">
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet"
    focusable="false"
  >
    <g class="wires">
      {#each field.wires as w, i (i)}
        <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
      {/each}
    </g>
    {#each field.groups as [tag, somas] (tag)}
      <g style={sourceVars(tag)}>
        {#each somas as s (s.id)}
          <circle class="halo" cx={s.x} cy={s.y} r={s.r + 1.1} />
          <circle class="soma" cx={s.x} cy={s.y} r={s.r} />
        {/each}
      </g>
    {/each}
  </svg>
  <figcaption class="plate-legend dn-mono">
    {docCount} nodes · {synCount} wires · {srcCount} src
  </figcaption>
</figure>

<style>
  /* The Plate: one 1px border frame + four corner brackets in the accent +
     a bottom legend. Static composition only — nothing here animates. */
  .corpus-field {
    position: relative;
    margin: 0;
    padding: var(--dn-space-3);
    border: 1px solid var(--dn-border);
    background: color-mix(in srgb, var(--dn-bg-sunken) 55%, transparent);
  }
  /* Four reticle corner brackets, drawn with two gradients per corner via
     background-image on the wrapper's ::before/::after — no extra DOM. */
  .corpus-field::before,
  .corpus-field::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    pointer-events: none;
  }
  .corpus-field::before {
    top: -1px;
    left: -1px;
    border-top: 1px solid var(--dn-accent);
    border-left: 1px solid var(--dn-accent);
  }
  .corpus-field::after {
    bottom: -1px;
    right: -1px;
    border-bottom: 1px solid var(--dn-accent);
    border-right: 1px solid var(--dn-accent);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
  }
  .wires line {
    stroke: var(--dn-graph-link);
    stroke-width: 0.22;
  }
  .soma {
    fill: var(--dn-src, var(--dn-accent));
  }
  /* The halo ring replaces drop-shadow: same "lit soma" read, zero filter
     passes (DS directive 11 — 400 static nodes, no filters). */
  .halo {
    fill: none;
    stroke: var(--dn-src, var(--dn-accent));
    opacity: 0.18;
  }
  .plate-legend {
    margin: var(--dn-space-2) 0 0;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-wide);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    text-align: left;
  }

  /* PHONE (directive 22): the Plate becomes a full-bleed 112px band under
     the wordmark rail — one memorable element for one paint. 40 somas /
     90 wires (chosen at init), no halos, hairline band edges. The -1rem
     bleed matches Home's 1rem gutters. */
  @media (max-width: 700px) {
    .corpus-field {
      width: calc(100% + 2rem);
      margin-inline: -1rem;
      height: 112px;
      padding: var(--dn-space-2) var(--dn-space-3) 0;
      display: flex;
      flex-direction: column;
      border: 0;
      border-block: 1px solid var(--dn-hairline);
      background: none;
    }
    .corpus-field::before,
    .corpus-field::after { content: none; }
    svg {
      flex: 1;
      min-height: 0;
      aspect-ratio: auto;
      width: 100%;
    }
    .halo { display: none; }
    .plate-legend { margin-top: var(--dn-space-1); }
  }
</style>
