<script lang="ts">
  // DocReader — the docs-first reading surface, the site's front door.
  //   [ChapterNav]      [ article + prev/next ]      [SynapseRail]
  // Content is byte-identical to what graph mode previews (same fragments,
  // same store), so a doc read here or there is the same Org export. The
  // org-roam connections live in the right rail, branded "synapses".
  import ChapterNav from './ChapterNav.svelte'
  import SynapseRail from './SynapseRail.svelte'
  import type { SynaptStore } from '../core/store.svelte'
  import type { DocNode } from '../core/types'

  let { store }: { store: SynaptStore } = $props()

  const doc = $derived(store.selected)
  const html = $derived(doc ? store.bodies.get(doc.slug) : undefined)

  let mainEl: HTMLElement | undefined = $state()
  let proseEl: HTMLElement | undefined = $state()
  let activeId = $state<string | null>(null)

  $effect(() => {
    if (doc) void store.body(doc.slug)
  })

  // TOC from the fetched fragment: org-export gives each headline an id
  // (CUSTOM_ID / <<target>> under prefer-user-labels). Parse once per body.
  const toc = $derived.by(() => {
    if (!html) return []
    const dom = new DOMParser().parseFromString(html, 'text/html')
    return [...dom.querySelectorAll('h2[id], h3[id]')].map((h) => ({
      id: h.id,
      text: (h.textContent ?? '').replace(/^\s*[0-9.]*\s*/, '').trim(),
      level: h.tagName === 'H2' ? 2 : 3
    }))
  })

  // The chapter shown plus, when the reader asked for a stub, the stub's own
  // title as the leaf of the breadcrumb.
  const crumbTitle = $derived(store.origin?.title ?? doc?.title ?? '')
  const ancestors = $derived(doc ? store.ancestorsOf(doc) : [])
  const prev = $derived(store.prevChapter())
  const next = $derived(store.nextChapter())

  function go(d: DocNode): void {
    store.goto(d, 'reader')
  }

  // Scroll to a heading inside the current article (TOC click / deep anchor)
  // and flash it so the eye lands on the right spot.
  function flash(el: Element | null | undefined): void {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.remove('sy-flash')
    void (el as HTMLElement).offsetWidth // restart the animation
    el.classList.add('sy-flash')
    el.addEventListener('animationend', () => el.classList.remove('sy-flash'), { once: true })
  }
  function scrollTo(id: string): void {
    flash(proseEl?.querySelector(`#${CSS.escape(id)}`))
  }

  // Consume a pending redirect anchor once the body is present, then clear it
  // so a later redraw doesn't jump back.
  $effect(() => {
    const want = store.anchor
    if (want && html) {
      const tries = () => {
        const el = proseEl?.querySelector(`#${CSS.escape(want)}`)
        if (el) {
          flash(el)
          store.anchor = null
        } else if (++n < 30) setTimeout(tries, 40)
      }
      let n = 0
      tries()
    }
  })

  // Scroll-spy: highlight the heading currently at the top of the article.
  // IntersectionObserver is cheap enough for a 4 GB machine (no scroll math).
  $effect(() => {
    const ready = html // re-observe whenever a new body paints
    if (!ready || !mainEl || !proseEl) return
    const heads = [...proseEl.querySelectorAll('h2[id], h3[id]')]
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id
          if (e.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        // Topmost visible heading in document order wins.
        const top = heads.find((h) => visible.has(h.id))
        activeId = top?.id ?? activeId
      },
      { root: mainEl, rootMargin: '0px 0px -75% 0px', threshold: 0 }
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
  })

  function onContentClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/(?:^|\/)?docs\/([^#]+)\.html(?:#(.*))?$/)
    if (!m) return // external link: let the browser handle it
    e.preventDefault()
    const target = store.bySlug(m[1])
    if (!target) return
    if (target.id === doc?.id && m[2]) scrollTo(decodeURIComponent(m[2]))
    else store.goto(target)
  }
</script>

<div class="reader">
  <aside class="side" aria-label="Sidebar">
    <ChapterNav {store} />
  </aside>

  <div class="doc-main" bind:this={mainEl}>
    {#if doc}
      <nav class="crumbs sy-mono" aria-label="Breadcrumb">
        <button class="crumb" onclick={() => store.goHome()}>The Org Manual</button>
        {#each ancestors as a (a.id)}
          <span class="sep">›</span>
          <button class="crumb" onclick={() => go(a)}>{a.title}</button>
        {/each}
        {#if store.origin && doc}
          <span class="sep">›</span>
          <button class="crumb" onclick={() => go(doc)}>{doc.title}</button>
        {/if}
        <span class="sep">›</span>
        <span class="here">{crumbTitle}</span>
      </nav>

      {#if html === undefined}
        <p class="sy-mono loading">· loading {doc.slug}.html…</p>
      {:else if html === null}
        <p class="missing sy-mono">⚠ no export for “{doc.slug}”. Run the site build.</p>
      {:else}
        <div class="sy-org" bind:this={proseEl} onclick={onContentClick} role="presentation">
          {@html html}
        </div>

        <nav class="pager" aria-label="Chapter pager">
          {#if prev}
            <button class="pager-btn prev" onclick={() => go(prev)}>
              <span class="dir">‹ previous</span>
              <span class="pt">{prev.title}</span>
            </button>
          {:else}<span></span>{/if}
          {#if next}
            <button class="pager-btn next" onclick={() => go(next)}>
              <span class="dir">next ›</span>
              <span class="pt">{next.title}</span>
            </button>
          {/if}
        </nav>
      {/if}
    {:else}
      <p class="sy-mono">select a chapter</p>
    {/if}
  </div>

  <SynapseRail {store} {toc} {activeId} onJump={scrollTo} />
</div>

<style>
  .reader {
    display: grid;
    grid-template-columns: var(--sy-side-w) minmax(0, 1fr) var(--sy-panel-w);
    height: calc(100dvh - var(--sy-header-h));
    min-height: 0;
  }
  @media (max-width: 1100px) {
    .reader { grid-template-columns: minmax(0, 1fr) var(--sy-panel-w); }
    .side { display: none; }
  }
  @media (max-width: 760px) {
    .reader { grid-template-columns: minmax(0, 1fr); }
    :global(.rail) { display: none; }
  }
  .side { min-height: 0; overflow: hidden; }
  .doc-main {
    overflow-y: auto;
    padding: 1.1rem 2.4rem 4rem;
    min-width: 0;
    scroll-behavior: smooth;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35em;
    font-size: 0.75rem;
    color: var(--sy-fg-faint);
    margin-bottom: 1rem;
  }
  .crumb {
    font: inherit;
    color: var(--sy-fg-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .crumb:hover { color: var(--sy-accent); }
  .crumbs .sep { color: var(--sy-border-strong); }
  .crumbs .here { color: var(--sy-fg); }
  .loading { color: var(--sy-fg-faint); }
  .missing { color: var(--sy-amber); }

  .pager {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 3rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--sy-border);
  }
  .pager-btn {
    display: flex;
    flex-direction: column;
    gap: 0.15em;
    max-width: 46%;
    font-family: var(--sy-font-mono);
    text-align: left;
    color: var(--sy-fg);
    background: var(--sy-bg-raise);
    border: 1px solid var(--sy-border);
    border-radius: var(--sy-radius);
    padding: 0.6em 0.9em;
    cursor: pointer;
    transition: border-color 120ms, box-shadow 120ms;
  }
  .pager-btn:hover {
    border-color: var(--sy-accent-dim);
    box-shadow: 0 0 16px color-mix(in srgb, var(--sy-accent) 22%, transparent);
  }
  .pager-btn.next { text-align: right; align-items: flex-end; margin-left: auto; }
  .pager-btn .dir { font-size: 0.68rem; color: var(--sy-fg-faint); letter-spacing: 0.08em; text-transform: uppercase; }
  .pager-btn .pt { font-size: 0.85rem; color: var(--sy-accent); }
</style>
