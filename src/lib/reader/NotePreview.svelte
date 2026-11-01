<script lang="ts">
  // NotePreview — reading a doc INSIDE the graph view. This is the roam
  // promise kept: click a node, its text appears; follow its links
  // and the graph selection follows you. org-roam-lite-ui got its text via
  // a `getText` WS frame; here we fetch the static Org-export fragment.
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import type { DocneuralStore } from '../core/store.svelte'
  import { backlinks, outlinks } from '../core/graph'
  import { sourceTitle, sourceVars } from '../core/source'
  import LinkPeek from './LinkPeek.svelte'
  import type { Peek } from '../core/types'

  let { store }: { store: DocneuralStore } = $props()

  const doc = $derived(store.selected)
  const html = $derived(doc ? store.bodies.get(doc.slug) : undefined)
  const ins = $derived(doc ? backlinks(store.data, doc.id).length : 0)
  const outs = $derived(doc ? outlinks(store.data, doc.id).length : 0)

  /* ---------- hover peek: the same citation card DocReader has ----------
     A cross-doc link in the preview is the same promise as one in the
     reader: "explained there". Hover it and the LinkPeek card answers in
     place — the target's title plus the citation sentence that created the
     wire, straight from store.ctxFor(). Same machinery as DocReader.svelte,
     no 200 ms grace-period touch (Owner-box): hover-intent delay (300 ms),
     one delegation pair on the .dn-org div, and the card itself is
     pointer-events: none inside LinkPeek, so it can never steal the click
     that follows the node. */
  let peek = $state<Peek | null>(null)
  let peekTimer: ReturnType<typeof setTimeout> | 0 = 0
  /** The link the timer is armed for — one at a time, so moving along a
   *  paragraph resets the delay instead of stacking cards. */
  let peekToEl: HTMLAnchorElement | null = null
  let pressTimer: ReturnType<typeof setTimeout> | 0 = 0
  const HREF = /(?:^|\/)?docs\/([^#]+)\.html(?:#(.*))?$/

  function openPeek(a: HTMLAnchorElement): void {
    if (!doc) return
    const m = (a.getAttribute('href') ?? '').match(HREF)
    if (!m) return // an external link is its own destination; nothing to peek
    const to = store.bySlug(m[1])
    if (!to || to.id === doc.id) return
    // The prose for a wire lives in either endpoint's file; ctxFor() checks
    // both, so ask for both (each is ~1.3 kB and de-duplicated by the store).
    store.loadContext(doc.id)
    store.loadContext(to.id)
    const r = a.getBoundingClientRect()
    peek = { x: r.left, y: r.bottom, fromId: doc.id, toId: to.id,
      degree: store.views.get(to.id)?.degree ?? 0 }
  }

  function onPeekMove(e: PointerEvent): void {
    const a = (e.target as HTMLElement).closest?.('a') as HTMLAnchorElement | null
    if (!a || a === peekToEl) return // already armed for this very link
    clearTimeout(peekTimer)
    peekToEl = a
    // Touch has no hover: a long-press is the same intent (see onPeekDown).
    if (e.pointerType !== 'mouse') return
    peekTimer = setTimeout(() => openPeek(a), 300)
  }

  function onPeekLeave(e: PointerEvent): void {
    const a = (e.target as HTMLElement).closest?.('a') as HTMLAnchorElement | null
    if (!a) return
    clearTimeout(peekTimer)
    if (a === peekToEl) {
      peekToEl = null
      peek = null
    }
  }

  function onPeekDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return
    const a = (e.target as HTMLElement).closest?.('a') as HTMLAnchorElement | null
    if (!a) return
    clearTimeout(pressTimer)
    pressTimer = setTimeout(() => openPeek(a), 420)
  }

  function onPeekUp(): void {
    clearTimeout(pressTimer)
  }

  function closePeek(): void {
    peekToEl = null
    peek = null
  }

  // Following a cross-doc link swaps the preview in place: a card describing
  // the previous wire must not survive the jump.
  $effect(() => {
    if (doc?.id) closePeek()
  })

  // Intercept in-preview link clicks: a cross-doc link re-selects the node
  // and swaps the preview in place (no page load, no losing the graph).
  function onContentClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/(?:^|\/)?docs\/([^#]+)\.html(?:$|#)/)
    if (!m) return // external or in-page anchor: let the browser handle it
    const target = store.bySlug(m[1])
    if (!target) return
    e.preventDefault()
    store.goto(target)
  }

  // Preview fetch is a side effect of selection, not of this component's
  // markup; trigger it here so the store cache stays the single source.
  $effect(() => {
    if (doc) void store.body(doc.slug)
  })
</script>

{#if !store.previewOpen}
  <!-- The dock is collapsed (Owner directive 2026-11-01: the doc preview must
       be hideable, and the choice must persist). One pill, one tap, back: it
       sits in the corner the panel used to own, clears a 44px thumb on a
       phone, and rides the safe-area inset so a home-indicator phone does not
       clip it. -->
  <button
    class="preview-restore dn-mono"
    onclick={() => store.setPreviewOpen(true)}
    title="Show the document panel"
    aria-label="Show the document panel"
  ><span class="chev" aria-hidden="true">▴</span> panel</button>
{:else if doc}
  <!-- Slide-in: the panel is a HUD surface arriving, not a div blinking in.
       Fly from the right (the edge it is docked to), 200ms, spring-ish ease. -->
  <aside
    id="note-preview-panel"
    class="note-preview"
    aria-label="Note preview"
    style={sourceVars(doc.tags[0])}
    in:fly={{ x: 24, duration: 200, easing: cubicOut }}
  >
    <header>
      <p class="kicker dn-label">neuron // preview</p>
      <h2 class="dn-mono">{doc.title}</h2>
      <div class="meta dn-mono">
        <span class="src">{sourceTitle(doc.tags[0]) || 'corpus'}</span>
        <!-- Render guard: the each is KEYED BY the tag, so a duplicate in the
             data throws each_key_duplicate and unmounts this preview (the
             graph-mode crash of the 2026-10-31 sweep). The store dedupes at
             ingest; this Set is the cheap second belt on the raw array. -->
        {#each [...new Set(doc.tags)] as tag (tag)}<span class="tag">#{tag}</span>{/each}
        <span class="deg" title="synapses touching this neuron">⌁ {ins} IN · {outs} OUT</span>
        <button class="open-reader dn-mono" onclick={() => store.setMode('reader')}
          title="Open this chapter in the docs reader">
          open in docs ›
        </button>
        <!-- The hide switch the Owner asked for: a labelled verb, not a
             mystery ×. aria-expanded names the panel's state for AT; the
             tap target clears 44px on touch (see the phone block). -->
        <button
          class="hide-panel dn-mono"
          onclick={() => store.setPreviewOpen(false)}
          title="Hide panel — tap ▴ panel to bring it back"
          aria-controls="note-preview-panel"
          aria-expanded="false"
        >hide <span class="chev" aria-hidden="true">▾</span></button>
      </div>
    </header>

    {#if html === undefined}
      <p class="loading dn-mono">loading this chapter…</p>
    {:else if html === null}
      <p class="missing dn-mono">No page for <code>docs/{doc.slug}.html</code> — run <code>make export</code>.</p>
    {:else}
      <!-- Organically trusted content: our own build pipeline's static
           files only (never user input), hence raw {@html} is fine. -->
      <div class="dn-org" onclick={onContentClick}
           onpointerover={onPeekMove} onpointerout={onPeekLeave}
           onpointerdown={onPeekDown} onpointerup={onPeekUp}
           onpointercancel={onPeekUp} onpointerleave={closePeek}
           onscroll={closePeek} role="presentation">
        {@html html}
      </div>
    {/if}
  </aside>

  <LinkPeek {store} {peek} />
{:else}
  <aside class="note-preview empty">
    <p class="dn-mono"><span class="dn-neuron-mark" aria-hidden="true"></span> select a neuron — its text lands here</p>
  </aside>
{/if}
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
       opaque anyway. The lit left edge carries the source's hue, and the top
       edge carries a whisper of the same — a panel plugged into the bus. */
    background: color-mix(in srgb, var(--dn-bg-raise) 97%, transparent);
    border-left: 2px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 45%, var(--dn-electric));
    border-top: 2px solid var(--dn-electric);
    padding: 1.2rem 1.6rem 3rem;
    box-shadow:
      -1px 0 0 color-mix(in srgb, var(--dn-src, var(--dn-accent)) 16%, transparent),
      -22px 0 44px color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
  }
  .note-preview.empty {
    /* F5: the hint is a corner chip, not a strip. left:auto pins it to the
       right edge at every width — the phone bottom-sheet rule stretches the
       FULL preview left:0, and a stretched empty hint turned the canvas's
       corner reservation into a whole top inset. Aside padding dies with it:
       the dashed box is the p's, and dead padding only grew the corner. */
    left: auto;
    width: fit-content;
    padding: 0;
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
    /* Fit-content under an 18rem cap: this copy wraps to two lines, never a
       third, and word wrapping never clips mid-word. */
    width: fit-content;
    max-width: 18rem;
    border: 1px dashed var(--dn-border-strong);
    border-radius: 2px;
    background: color-mix(in srgb, var(--dn-bg) 70%, transparent);
    letter-spacing: 0.06em;
    font-size: 0.75rem;
  }
  .note-preview.empty .dn-neuron-mark { width: 0.75em; height: 0.75em; }
  /* Phone: a side panel would eat the whole canvas. The preview becomes a
     bottom sheet so the graph keeps the top half of the screen — a BOUNDED
     45% that scrolls inside (the aside is the scroller), never the whole
     view, with the home-indicator inset added to the padding so content
     clears the gesture bar. */
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
      padding: 0.8rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    }
    .note-preview.empty {
      height: auto;
      /* Stack UNDER the controls chip — one module column on phone (chip,
         hint beneath). top:0 put the hint in the chip's pocket (hotfix 4b);
         5.8rem clears the chip box's bottom edge (top 0.9rem + 44px chip +
         2×0.7rem padding) with an 8px breath. The canvas corner pass measures
         real rects, so it follows for free. */
      top: 5.8rem;
      left: 0.9rem;
      right: auto;
      bottom: auto;
    }
    /* Touch: the two meta actions are thumb targets — 44px, the dock's
       whole contract. */
    .open-reader, .hide-panel {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    /* The restore pill centres above the gesture bar, where a thumb lands
       without stretching. */
    .preview-restore {
      right: 50%;
      transform: translateX(50%);
      bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
      min-height: 44px;
    }
  }
  .kicker { color: var(--dn-accent); margin: 0 0 0.3rem; }
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
    color: var(--dn-accent);
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
  /* The hide switch: same ghost chrome as open-reader, muted until hovered.
     The chevron is decoration — the word carries the verb. */
  .hide-panel {
    font: inherit;
    color: var(--dn-fg-muted);
    background: transparent;
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    padding: 0.15em 0.6em;
    cursor: pointer;
    min-height: 40px;
  }
  .hide-panel:hover { color: var(--dn-fg); border-color: var(--dn-accent); }
  .hide-panel .chev { color: var(--dn-fg-faint); }
  /* The one-tap way back: a pill in the corner the panel vacated. Visible in
     both themes via tokens, ≥40px everywhere (44px on touch below). */
  .preview-restore {
    position: absolute;
    right: 0.9rem;
    bottom: 0.9rem;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    min-height: 40px;
    min-width: 44px;
    padding: 0.35em 0.9em;
    font: inherit;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg);
    background: color-mix(in srgb, var(--dn-bg-raise) 92%, transparent);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    cursor: pointer;
  }
  .preview-restore .chev { color: var(--dn-accent); }
  .preview-restore:hover { color: var(--dn-accent); border-color: var(--dn-accent); }
  .loading, .missing { color: var(--dn-fg-faint); font-size: 0.85rem; }
  .missing { color: var(--dn-amber); }
</style>
