<script lang="ts">
  // NotePreview — reading a doc INSIDE the graph view. This is the roam
  // promise kept: click a node, its text appears; follow its links
  // and the graph selection follows you. org-roam-lite-ui got its text via
  // a `getText` WS frame; here we fetch the static Org-export fragment.
  import type { DocneuralStore } from '../core/store.svelte'
  import { backlinks, outlinks } from '../core/graph'
  import { sourceTitle, sourceVars } from '../core/source'
  import { parseDocHref } from '../core/href'
  import LinkPeek from './LinkPeek.svelte'
  import { createPeekPointer } from './peek.svelte'
  import { onMount } from 'svelte'

  let { store }: { store: DocneuralStore } = $props()

  const doc = $derived(store.selected)
  const html = $derived(doc ? store.bodies.get(doc.slug) : undefined)
  const ins = $derived(doc ? backlinks(store.data, doc.id).length : 0)
  const outs = $derived(doc ? outlinks(store.data, doc.id).length : 0)

  // Intercept in-preview link clicks: a cross-doc link re-selects the node
  // and swaps the preview in place (no page load, no losing the graph).
  function onContentClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const m = parseDocHref(a.getAttribute('href') ?? '')
    if (!m) return // external or in-page anchor: let the browser handle it
    const target = store.bySlug(m.slug)
    if (!target) return
    e.preventDefault()
    store.goto(target)
  }

  /* ---------- hover peek: the citation card, same as the reader ----------
     This panel previews the SAME prose DocReader shows, so a cross-reference
     here gets the same answer: the card (reader/LinkPeek.svelte) over the
     citation sentence from ctx/<id>.json — the lazy fetch the synapse rail
     already makes, zero new bytes. The restraint rules live in the shared
     peek.svelte.ts machine (300 ms hover-intent, 420 ms long-press on touch,
     pointer-events: none card); this surface only adds what it alone knows:
     which box scrolls, and when a selection counts as new. */
  const peeker = createPeekPointer(() => store, () => doc?.id)
  // Same teardown contract as the reader (QA-1(d)): no armed timer outlives
  // the surface — a late fire would warm a ctx file nobody shows and write
  // $state nobody reads.
  onMount(() => peeker.destroy)

  // The preview pane is its own scroller (the whole bottom sheet on a phone):
  // the card is pinned to the link's viewport box, so scrolling invalidates
  // it. Closing is cheaper and less confusing than repositioning per frame.
  let paneEl: HTMLElement | undefined = $state()
  $effect(() => {
    const el = paneEl
    if (!el) return
    const onScroll = () => peeker.closePeek()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  })

  // A new selection is a new document: a card describing the last node's
  // wire must not survive the jump (the rule DocReader applies per chapter).
  $effect(() => {
    if (store.selected?.id) peeker.closePeek()
  })

  // Preview fetch is a side effect of selection, not of this component's
  // markup; trigger it here so the store cache stays the single source.
  $effect(() => {
    if (doc) void store.body(doc.slug)
  })
</script>

{#if doc}
  <aside class="note-preview" bind:this={paneEl} aria-label="Note preview" style={sourceVars(doc.tags[0])}>
    <header>
      <p class="kicker dn-label">node // preview</p>
      <h2 class="dn-mono">{doc.title}</h2>
      <div class="meta dn-mono">
        <span class="src">{sourceTitle(doc.tags[0]) || 'corpus'}</span>
        {#each doc.tags as tag (tag)}<span class="tag">#{tag}</span>{/each}
        <span class="deg" title="synapses touching this neuron">⌁ {ins} IN · {outs} OUT</span>
        <button class="open-reader dn-mono" onclick={() => store.setMode('reader')}>
          open in docs ↗
        </button>
      </div>
    </header>

    {#if html === undefined}
      <p class="loading dn-mono">loading this chapter…</p>
    {:else if html === null}
      <p class="missing dn-mono">No page for <code>docs/{doc.slug}.html</code> — run <code>make export</code>.</p>
    {:else}
      <!-- Organically trusted content: our own build pipeline's static
           files only (never user input), hence raw {@html} is fine. -->
      <div class="dn-org" onclick={onContentClick} role="presentation"
           onpointerover={peeker.onPeekMove} onpointerout={peeker.onPeekLeave}
           onpointerdown={peeker.onPeekDown} onpointerup={peeker.onPeekUp}
           onpointercancel={peeker.onPeekUp} onpointerleave={peeker.closePeek}>
        {@html html}
      </div>
    {/if}
  </aside>
{:else}
  <aside class="note-preview empty">
    <p class="dn-mono"><span class="dn-neuron-mark" aria-hidden="true"></span> select a neuron — its text lands here</p>
  </aside>
{/if}

<!-- The peek card itself: fixed-position, pointer-events:none, rendered
     outside the scrolling pane so the pane's own scroll can never move it. -->
<LinkPeek {store} peek={peeker.peek} />

<style>
  .note-preview {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(46rem, 55vw);
    overflow-y: auto;
    /* Solid ink, not frosted glass: a big backdrop-filter over an animating
       canvas is the first thing that stutters on a potato, and a HUD panel is
       opaque anyway. The lit left edge carries the source's hue. */
    background: color-mix(in srgb, var(--dn-bg-raise) 97%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 45%, var(--dn-border-strong));
    padding: 1.2rem 1.6rem 3rem;
    box-shadow:
      -1px 0 0 color-mix(in srgb, var(--dn-src, var(--dn-accent)) 12%, transparent),
      -18px 0 40px color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
  }
  .note-preview.empty {
    width: auto;
    border: none;
    background: transparent;
    box-shadow: none;
    bottom: auto;
    color: var(--dn-fg-faint);
  }
  .note-preview.empty p {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    margin: 0;
    padding: 0.55em 0.9em;
    border: 1px dashed var(--dn-border-strong);
    border-radius: 2px;
    background: color-mix(in srgb, var(--dn-bg) 70%, transparent);
    letter-spacing: 0.06em;
    font-size: 0.75rem;
  }
  .note-preview.empty .dn-neuron-mark { width: 0.75em; height: 0.75em; }
  /* Phone: a side panel would eat the whole canvas. The preview becomes a
     bottom sheet so the graph keeps the top half of the screen. */
  @media (max-width: 700px) {
    .note-preview {
      top: auto;
      left: 0;
      right: 0;
      width: auto;
      height: 45%;
      border-left: none;
      border-top: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 45%, var(--dn-border-strong));
      box-shadow: 0 -12px 30px color-mix(in srgb, var(--dn-bg-sunken) 70%, transparent);
      padding: 0.8rem 1rem 2rem;
    }
    .note-preview.empty {
      height: auto;
      top: 0;
      bottom: auto;
    }
  }
  .kicker { color: var(--dn-src, var(--dn-accent)); margin: 0 0 0.3rem; }
  header h2 {
    font-family: var(--dn-font-mono);
    font-size: 1.1rem;
    margin: 0 0 0.4rem;
    letter-spacing: 0.01em;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dn-fg-muted);
    border-bottom: 1px solid var(--dn-border);
    padding-bottom: 0.6rem;
    margin-bottom: 0.8rem;
  }
  /* The corpus label wears the source hue: which manual this page came from,
     stated by colour before it is stated by words. */
  .src {
    color: var(--dn-src, var(--dn-fg));
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 40%, transparent);
    border-radius: 2px;
    padding: 0.1em 0.5em;
  }
  .tag { color: var(--dn-accent-2); }
  .deg { margin-left: auto; color: var(--dn-hot); }
  .open-reader {
    font: inherit;
    color: var(--dn-accent);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--dn-accent) 45%, transparent);
    border-radius: 2px;
    padding: 0.15em 0.6em;
    cursor: pointer;
  }
  .open-reader:hover { background: var(--dn-accent); color: var(--dn-bg); box-shadow: var(--dn-glow); }
  .loading, .missing { color: var(--dn-fg-faint); font-size: 0.85rem; }
  .missing { color: var(--dn-amber); }
</style>
