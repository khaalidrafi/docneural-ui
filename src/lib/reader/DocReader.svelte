<script lang="ts">
  // DocReader — the generic docs interface: sidebar (index + TOC), article,
  // interlink rail. Same store, same navigation calls as graph mode, so a
  // doc read here and there is byte-identical content from the pipeline.
  import InterlinkPanel from './InterlinkPanel.svelte'
  import type { MyceliumStore } from '../core/store.svelte'

  let { store }: { store: MyceliumStore } = $props()

  const doc = $derived(store.selected)
  const html = $derived(doc ? store.bodies.get(doc.slug) : undefined)

  $effect(() => {
    if (doc) void store.body(doc.slug)
  })

  // TOC from the fetched fragment: org-export gives each headline an id
  // (CUSTOM_ID or outline-N). Parse once per body, not per render.
  let toc = $derived.by(() => {
    if (!html) return []
    const dom = new DOMParser().parseFromString(html, 'text/html')
    return [...dom.querySelectorAll('h2[id], h3[id]')].map((h) => ({
      id: h.id,
      text: h.textContent?.trim() ?? '',
      level: h.tagName === 'H2' ? 2 : 3
    }))
  })

  function onContentClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/(?:^|\/)?docs\/([^#]+)\.html(?:$|#)/)
    if (!m) return
    const target = store.bySlug(m[1])
    if (!target) return
    e.preventDefault()
    store.goto(target)
    if (location.hash) scrollToHash(m[0])
  }

  function scrollToHash(fragment: string): void {
    const hash = fragment.split('#')[1]
    if (!hash) return
    // The new body may still be fetching; retry until the anchor exists.
    let tries = 0
    const tick = () => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (tries++ < 20) setTimeout(tick, 50)
    }
    tick()
  }

  // Index list grouped by first tag (manual chapter), Org-style.
  const groups = $derived.by(() => {
    const m = new Map<string, typeof store.data.nodes>()
    for (const n of store.data.nodes) {
      const key = n.tags[0] ?? 'misc'
      ;(m.get(key) ?? m.set(key, []).get(key)!).push(n)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })
</script>

<div class="reader">
  <nav class="side" aria-label="Index">
    {#each groups as [group, docs] (group)}
      <div class="group">
        <h4 class="myc-mono">{group}</h4>
        <ul>
          {#each docs as d (d.id)}
            <li>
              <button
                class="index-btn"
                class:current={doc?.id === d.id}
                onclick={() => store.goto(d)}
              >{d.title}</button>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </nav>

  <article class="main">
    {#if doc}
      <div class="crumbs myc-mono">
        <button class="mode-link" onclick={() => store.setMode('graph')}>⌁ graph view</button>
        <span>/</span>
        <span>{doc.tags[0] ?? 'docs'}</span>
        <span>/</span>
        <span class="here">{doc.title}</span>
      </div>
      {#if toc.length > 2}
        <nav class="toc" aria-label="On this page">
          {#each toc as h (h.id)}
            <a class:sub={h.level === 3} href="#{h.id}"
               onclick={() => scrollToHash(h.id)}>{h.text}</a>
          {/each}
        </nav>
      {/if}
      {#if html === undefined}
        <p class="myc-mono loading">loading…</p>
      {:else if html === null}
        <p class="missing myc-mono">⚠ no export for “{doc.slug}”</p>
      {:else}
        <div class="myc-org" onclick={onContentClick} role="presentation">
          {@html html}
        </div>
      {/if}
    {:else}
      <p class="myc-mono">select a doc</p>
    {/if}
  </article>

  <InterlinkPanel {store} />
</div>

<style>
  .reader {
    display: grid;
    grid-template-columns: var(--myc-side-w) minmax(0, 1fr) var(--myc-panel-w);
    gap: 0;
    height: calc(100dvh - var(--myc-header-h));
    min-height: 0;
  }
  @media (max-width: 1100px) {
    .reader { grid-template-columns: minmax(0, 1fr) var(--myc-panel-w); }
    .side { display: none; }
  }
  @media (max-width: 760px) {
    .reader { grid-template-columns: minmax(0, 1fr); }
    /* InterlinkPanel's rail hides itself, but its class lives in that
       component's scope — reach it globally from the last breakpoint. */
    :global(.rail) { display: none; }
  }
  .side {
    overflow-y: auto;
    border-right: 1px solid var(--myc-border);
    padding: 0.8rem 0.6rem 2rem;
    background: color-mix(in srgb, var(--myc-bg-sunken) 50%, transparent);
  }
  .group h4 {
    font-family: var(--myc-font-mono);
    font-size: 0.7rem;
    text-transform: lowercase;
    letter-spacing: 0.1em;
    color: var(--myc-accent-dim);
    margin: 1rem 0 0.3rem;
  }
  .side ul { list-style: none; margin: 0; padding: 0; }
  .index-btn {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 0.8rem;
    color: var(--myc-fg-muted);
    background: none;
    border: none;
    border-radius: 4px;
    padding: 0.2em 0.5em;
    cursor: pointer;
  }
  .index-btn:hover { color: var(--myc-fg); background: var(--myc-bg-raise); }
  .index-btn.current {
    color: var(--myc-accent);
    background: color-mix(in srgb, var(--myc-accent) 10%, transparent);
    font-weight: 600;
  }
  .main {
    overflow-y: auto;
    padding: 1rem 2rem 4rem;
    min-width: 0;
  }
  .crumbs {
    font-size: 0.75rem;
    color: var(--myc-fg-faint);
    margin-bottom: 0.8rem;
  }
  .crumbs .here { color: var(--myc-fg); }
  .mode-link {
    font: inherit;
    color: var(--myc-accent-2);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .mode-link:hover { color: var(--myc-hot); }
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.8rem;
    font-size: 0.75rem;
    font-family: var(--myc-font-mono);
    border: 1px dashed var(--myc-border);
    border-radius: var(--myc-radius);
    padding: 0.5rem 0.8rem;
    margin-bottom: 1.2rem;
  }
  .toc a { color: var(--myc-fg-muted); text-decoration: none; }
  .toc a:hover { color: var(--myc-accent); }
  .toc a.sub { padding-left: 0.6em; opacity: 0.8; }
  .loading, .missing { color: var(--myc-fg-faint); }
  .missing { color: var(--myc-amber); }
</style>
