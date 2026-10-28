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

<figure class="corpus-field dn-brackets" aria-hidden="true">
  <!-- COOLER-3 OP-21: the stage is 4/5 (portrait plate) — the y axis is
       stretched ×1.25 in the TEMPLATE expressions (never in the script, so
       the script-hash gate stays byte-identical) and somas stay circles. -->
  <svg
    viewBox="0 0 100 125"
    preserveAspectRatio="xMidYMid meet"
    focusable="false"
  >
    <g class="wires">
      {#each field.wires as w, i (i)}
        <line x1={w.x1} y1={w.y1 * 1.25} x2={w.x2} y2={w.y2 * 1.25} />
      {/each}
    </g>
    {#each field.groups as [tag, somas] (tag)}
      <!-- COOLER-3 OP-19: constellation reading. Each source's brightest
           soma (si === 0) wears two dashed orbit rings and full opacity;
           the rest of the cluster steps down by index. Hovering one source
           dims the others — the field RESOLVES under the cursor. Pure CSS
           opacity + static SVG; zero JS, zero filters. -->
      <g class="src-g" style={sourceVars(tag)}>
        {#each somas as s, si (s.id)}
          {@const focal = si === 0}
          {#if focal}
            <circle class="orbit" cx={s.x} cy={s.y * 1.25} r={s.r + 4} />
            <circle class="orbit orbit-2" cx={s.x} cy={s.y * 1.25} r={s.r + 7} />
          {/if}
          <circle class="halo" cx={s.x} cy={s.y * 1.25} r={s.r + 1.1} opacity={focal ? 0.42 : 0.18} />
          <circle class="soma" cx={s.x} cy={s.y * 1.25} r={s.r} opacity={focal ? 1 : 0.62 + 0.38 * (1 - si / somas.length)} />
        {/each}
      </g>
    {/each}
    <!-- COOLER-3 OP-20: the two highest-degree somas in the whole plate get
         static callouts — a constellation that labels its brightest stars
         reads as a reading of data, not decoration. -->
    <g class="callouts" aria-hidden="true">
      {#each field.somas.slice(0, 2) as s, i (s.id)}
        {@const dx = i === 0 ? 14 : -14}
        {@const anchor = i === 0 ? 'start' : 'end'}
        <line class="callout-line" x1={s.x} y1={s.y * 1.25} x2={s.x + dx} y2={s.y * 1.25 - 6} />
        <text class="callout-t" x={s.x + dx + (i === 0 ? 1.2 : -1.2)} y={s.y * 1.25 - 7.5} text-anchor={anchor}>HUB·{i + 1}</text>
      {/each}
    </g>
  </svg>
  <figcaption class="plate-legend dn-mono">
    {docCount} nodes · {synCount} wires · {srcCount} src
  </figcaption>
</figure>

<style>
  /* The Plate: hairline frame + the evolved double-reticle brackets come
     from the global .dn-brackets class (COOLER-3 OP-30 — the Plate is its
     first consumer); a bottom legend closes it. Static composition only. */
  .corpus-field {
    position: relative;
    margin: 0;
    padding: var(--dn-space-3);
    background: color-mix(in srgb, var(--dn-bg-sunken) 55%, transparent);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 5;
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
  /* COOLER-3 OP-19: phantom keplerian orbits on each source's focal soma,
     plus the resolve-on-hover group dim (opacity only, 200ms). */
  .orbit {
    fill: none;
    stroke: var(--dn-src, var(--dn-accent));
    stroke-width: 0.18;
    stroke-dasharray: 1.4 1.8;
    opacity: 0.55;
  }
  .orbit-2 {
    stroke-dasharray: 0.6 2.4;
    opacity: 0.28;
  }
  .src-g {
    transition: opacity 200ms;
  }
  .corpus-field:hover .src-g:not(:hover) {
    opacity: 0.32;
  }
  /* COOLER-3 OP-20: static hub callouts. 2.6px in a 100-unit viewBox ≈
     11px at render — legible, tiny, HUD-correct. */
  .callouts {
    color: var(--dn-fg-faint);
  }
  .callout-line {
    stroke: var(--dn-border-strong);
    stroke-width: 0.16;
    opacity: 0.7;
  }
  .callout-t {
    font-family: var(--dn-font-mono);
    font-size: 2.6px;
    letter-spacing: 0.3px;
    fill: var(--dn-fg-faint);
    text-transform: uppercase;
  }
  .plate-legend {
    margin: var(--dn-space-2) 0 0;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-wide);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    text-align: left;
  }

  /* PHONE (directive 22 + COOLER-3): the Plate stays a full-bleed 112px
     band under the wordmark rail — 40 somas / 90 wires (chosen at init),
     no halos, no orbits, no callouts (sub-pixel noise at band scale),
     hairline band edges. The -1rem bleed matches Home's 1rem gutters. */
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
    svg {
      flex: 1;
      min-height: 0;
      aspect-ratio: auto;
      width: 100%;
    }
    .halo,
    .orbit,
    .callouts { display: none; }
    .plate-legend { margin-top: var(--dn-space-1); }
  }
</style>
