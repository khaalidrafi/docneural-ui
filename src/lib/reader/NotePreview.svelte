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

{#if doc}
  <!-- Slide-in: the panel is a HUD surface arriving, not a div blinking in.
       Fly from the right (the edge it is docked to), 200ms, spring-ish ease. -->
  <aside
    class="note-preview"
    aria-label="Note preview"
    style={sourceVars(doc.tags[0])}
    in:fly={{ x: 24, duration: 200, easing: cubicOut }}
  >
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
