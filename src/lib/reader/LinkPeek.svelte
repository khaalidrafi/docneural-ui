<script lang="ts">
  // LinkPeek — the card that appears when you hover a cross-reference.
  //
  // WHY THIS EXISTS
  // A docs site's cross-reference is a promise: "this is explained there".
  // Every other reader makes you break your place to find out whether the
  // promise is worth keeping — click, scroll, back. Feishu/Yuque solved this
  // with a hover card, and we can do it better for free: the citation SENTENCE
  // that created the wire is already stored per node in ctx/<id>.json, so the
  // card can show the REASON for the link, not just its title. That is the
  // "fire together, wire stronger" claim made visible, on every one of the
  // 29,017 wires, with no new data and no new dependency.
  //
  // COST
  // Zero new bytes: the prose file for the page you are reading is the same one
  // the synapse rail loads. Positioning is one fixed div, and the card is
  // deliberately not interactive (pointer-events: none) so it can never steal
  // a click or trap a pointer mid-scroll.
  import type { SynaptStore } from '../core/store.svelte'
  import type { Peek } from '../core/types'
  import { sourceVars } from '../core/source'

  let { store, peek }: { store: SynaptStore; peek: Peek | null } = $props()

  const node = $derived(peek ? store.byId(peek.toId) : undefined)
  const title = $derived(node?.title ?? peek?.toId ?? '')
  const manual = $derived(node?.tags[0] ?? '')
  // Read through the store, not from the peek object: the ctx file for a node
  // arrives a beat after the hover, and `contexts` is reactive, so the card
  // fills itself in without a second hover.
  const why = $derived.by(() => {
    if (!peek) return ''
    const l = store.wire(peek.fromId, peek.toId)
    const w = (l ? store.ctxFor(l) : '')?.replace(/\s+/g, ' ').trim() ?? ''
    // One line of the sentence, capped: the card is a decision aid, not a
    // second page. Cutting at a word boundary keeps it readable at any width.
    return w.length > 210 ? `${w.slice(0, 210).replace(/\s\S*$/, '')}…` : w
  })

  // Clamped into the viewport by arithmetic, not by measuring after paint:
  // the card has a fixed max width, so this never jitters and never costs a
  // second frame on a phone.
  const style = $derived.by(() => {
    if (!peek) return ''
    const x = Math.max(12, Math.min(peek.x, window.innerWidth - 372))
    const y = Math.max(60, Math.min(peek.y + 14, window.innerHeight - 200))
    return `left:${x}px; top:${y}px; width:22rem; ${sourceVars(manual)}`
  })
</script>

{#if peek && node}
  <aside class="peek sy-hud" {style} role="tooltip" aria-live="polite">
    <p class="pk-src sy-mono">~/{manual || 'corpus'}</p>
    <p class="pk-title">{title}</p>
    {#if why}
      <p class="pk-why">{why}</p>
    {:else}
      <p class="pk-why faint">no citation quote stored on this wire</p>
    {/if}
    <p class="pk-meta sy-mono">
      <span>{peek.degree} synapses</span>
      <span class="pk-go">↵ follow</span>
    </p>
  </aside>
{/if}

<style>
  .peek {
    position: fixed;
    z-index: 60;
    box-sizing: border-box;
    max-width: min(22rem, calc(100vw - 24px));
    padding: 0.6rem 0.75rem 0.55rem;
    background: color-mix(in srgb, var(--sy-bg) 92%, black);
    border: 1px solid var(--sy-border);
    border-left: 2px solid var(--sy-src, var(--sy-accent));
    border-radius: 3px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    animation: pk-in 120ms ease-out;
  }
  @keyframes pk-in {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .peek { animation: none; }
  }
  .pk-src {
    color: var(--sy-src, var(--sy-accent));
    font-size: 0.62rem;
    letter-spacing: var(--sy-track);
  }
  .pk-title { margin: 0.15rem 0 0.3rem; color: var(--sy-fg); font-size: 0.86rem; line-height: 1.3; }
  .pk-why { margin: 0 0 0.35rem; color: var(--sy-fg-muted); font-size: 0.74rem; line-height: 1.45; }
  .pk-why.faint { color: var(--sy-fg-faint); font-style: italic; }
  .pk-meta {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: var(--sy-fg-faint);
    font-size: 0.62rem;
    letter-spacing: var(--sy-track);
    border-top: 1px solid var(--sy-border);
    padding-top: 0.3rem;
  }
  .pk-go { color: var(--sy-accent-2); }
</style>
