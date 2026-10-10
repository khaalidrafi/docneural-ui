<script lang="ts">
  // NotePreview — reading a doc INSIDE the graph view. This is the roam
  // promise kept: click a node, its text appears; follow its links
  // and the graph selection follows you. org-roam-lite-ui got its text via
  // a `getText` WS frame; here we fetch the static Org-export fragment.
  import type { SynaptStore } from '../core/store.svelte'
  import { backlinks, outlinks } from '../core/graph'

  let { store }: { store: SynaptStore } = $props()

  const doc = $derived(store.selected)
  const html = $derived(doc ? store.bodies.get(doc.slug) : undefined)
  const ins = $derived(doc ? backlinks(store.data, doc.id).length : 0)
  const outs = $derived(doc ? outlinks(store.data, doc.id).length : 0)

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
  <aside class="note-preview" aria-label="Note preview">
    <header>
      <h2 class="sy-mono">{doc.title}</h2>
      <div class="meta sy-mono">
        {#each doc.tags as tag (tag)}<span class="tag">#{tag}</span>{/each}
        <span class="deg" title="synapses touching this doc">⇤{ins} ⇥{outs}</span>
        <button class="open-reader sy-mono" onclick={() => store.setMode('reader')}>
          open in docs ↗
        </button>
      </div>
    </header>

    {#if html === undefined}
      <p class="loading sy-mono">fetching {doc.slug}.html…</p>
    {:else if html === null}
      <p class="missing sy-mono">⚠ no export for “{doc.slug}”. Run the site build.</p>
    {:else}
      <!-- Organically trusted content: our own build pipeline's static
           files only (never user input), hence raw {@html} is fine. -->
      <div class="sy-org" onclick={onContentClick} role="presentation">
        {@html html}
      </div>
    {/if}
  </aside>
{:else}
  <aside class="note-preview empty">
    <p class="sy-mono">◌ pick a node — its text lands here</p>
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
    background: color-mix(in srgb, var(--sy-bg) 92%, transparent);
    backdrop-filter: blur(6px);
    border-left: 1px solid var(--sy-border-strong);
    padding: 1.2rem 1.6rem 3rem;
    box-shadow: -18px 0 40px color-mix(in srgb, var(--sy-bg-sunken) 60%, transparent);
  }
  .note-preview.empty {
    width: auto;
    border: none;
    background: transparent;
    box-shadow: none;
    bottom: auto;
    color: var(--sy-fg-faint);
  }
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
      border-top: 1px solid var(--sy-border-strong);
      box-shadow: 0 -12px 30px color-mix(in srgb, var(--sy-bg-sunken) 60%, transparent);
      padding: 0.8rem 1rem 2rem;
    }
    .note-preview.empty {
      height: auto;
      top: 0;
      bottom: auto;
    }
  }
  header h2 {
    font-family: var(--sy-font-mono);
    font-size: 1.15rem;
    margin: 0 0 0.4rem;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--sy-fg-muted);
    border-bottom: 1px dashed var(--sy-border);
    padding-bottom: 0.6rem;
    margin-bottom: 0.8rem;
  }
  .tag { color: var(--sy-accent-2); }
  .deg { margin-left: auto; }
  .open-reader {
    font: inherit;
    color: var(--sy-accent);
    background: transparent;
    border: 1px solid var(--sy-accent-dim);
    border-radius: var(--sy-radius);
    padding: 0.15em 0.6em;
    cursor: pointer;
  }
  .open-reader:hover { background: var(--sy-accent); color: var(--sy-bg); }
  .loading, .missing { color: var(--sy-fg-faint); font-size: 0.85rem; }
  .missing { color: var(--sy-amber); }
</style>
