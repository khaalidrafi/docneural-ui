<script lang="ts">
  // DocReader — the docs-first reading surface, the site's front door.
  //   [ChapterNav]      [ article + prev/next ]      [SynapseRail]
  // Content is byte-identical to what graph mode previews (same fragments,
  // same store), so a doc read here or there is the same Org export. The
  // org-roam connections live in the right rail, branded "synapses".
  import ChapterNav from './ChapterNav.svelte'
  import SynapseRail from './SynapseRail.svelte'
  import LinkPeek from './LinkPeek.svelte'
  import { onMount } from 'svelte'
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import { copyText } from '../core/clipboard'
  import type { DocNode, Peek } from '../core/types'

  let { store }: { store: DocneuralStore } = $props()

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
  // The whole reader wears ONE hue: the corpus this page came from. It rides
  // down through --dn-src so the article's heading sigils, the rail's
  // mini-map frame and the pager all take that colour — you always know
  // which source you are inside without reading a label.
  const srcVars = $derived(sourceVars(doc?.tags[0] ?? store.manual))
  const ancestors = $derived(doc ? store.ancestorsOf(doc) : [])
  const prev = $derived(store.prevChapter())
  const next = $derived(store.nextChapter())

  // Reading a manual is sequential, so the two chapters the pager advertises
  // are fetched while you are still reading this one. Next first: forward is
  // the direction readers move.
  $effect(() => {
    const slugs = [next?.slug, prev?.slug].filter(Boolean) as string[]
    if (slugs.length) store.prefetch(slugs)
  })

  function go(d: DocNode): void {
    store.goto(d, 'reader')
  }

  // Scroll to a heading inside the current article (TOC click / deep anchor)
  // and flash it so the eye lands on the right spot.
  function flash(el: Element | null | undefined): void {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.remove('dn-flash')
    void (el as HTMLElement).offsetWidth // restart the animation
    el.classList.add('dn-flash')
    el.addEventListener('animationend', () => el.classList.remove('dn-flash'), { once: true })
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
  // On phones the whole page scrolls (.doc-main stops being a scroller), so
  // the observer root falls back to the viewport there.
  $effect(() => {
    const ready = html // re-observe whenever a new body paints
    if (!ready || !mainEl || !proseEl) return
    const isScroller = getComputedStyle(mainEl).overflowY !== 'visible'
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
      { root: isScroller ? mainEl : null, rootMargin: '0px 0px -75% 0px', threshold: 0 }
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
  })

  // ---------- reading tools: keys, copies, progress ----------

  // On a phone the whole page scrolls (.doc-main stops being a scroller), so
  // every scroll consumer has to ask which element actually moves.
  function scroller(): HTMLElement | Window {
    if (!mainEl) return window
    return getComputedStyle(mainEl).overflowY !== 'visible' ? mainEl : window
  }

  /** `j` / `k`: most of a screen down or up. Not a full page — a full page
   *  jumps past the heading you were about to read. */
  function nudge(dir: number): void {
    const s = scroller()
    const h = s === window ? innerHeight : (s as HTMLElement).clientHeight
    s.scrollBy({ top: dir * h * 0.85, behavior: 'smooth' })
  }

  /** A URL that names this exact position: the page plus the heading at the
   *  top of the screen. This is what `y` and the ⧉ link button copy. */
  function linkFor(anchor: string | null): string {
    const url = new URL(location.href)
    url.search = ''
    url.searchParams.set('doc', doc?.slug ?? '')
    url.hash = anchor ? `#${encodeURIComponent(anchor)}` : ''
    return url.toString()
  }

  // The scroll-spy only names a heading once it reaches the top quarter of
  // the article, so at the very top there is no activeId yet — and a link to
  // "the chapter, somewhere" is not a citation. Fall back to the first
  // heading, which is the chapter's own.
  function currentAnchor(): string | null {
    if (activeId) return activeId
    return proseEl?.querySelector('h2[id], h3[id]')?.id ?? null
  }

  // One line of feedback in the shell's voice, auto-hidden. A copy that
  // silently "succeeded" is indistinguishable from one the browser blocked.
  let note = $state('')
  let noteTimer: ReturnType<typeof setTimeout> | 0 = 0
  function say(msg: string): void {
    note = msg
    clearTimeout(noteTimer)
    noteTimer = setTimeout(() => (note = ''), 2600)
  }

  async function copyLink(anchor: string | null): Promise<void> {
    const text = linkFor(anchor)
    say((await copyText(text)) ? `copied ${anchor ? `link · ${anchor}` : 'link'}` : 'copy blocked by browser')
  }

  /** `b` — keep this section. The title is the heading you are under when the
   *  scroll-spy has one, else the chapter's own, so a mark always names
   *  something a reader recognising later. */
  function mark(): void {
    if (!doc) return
    const anchor = currentAnchor()
    const titled = anchor ? proseEl?.querySelector(`#${CSS.escape(anchor)}`)?.textContent?.replace(/^\/\/\s*/, '').replace(/\s*#\s*$/, '').trim() : ''
    const title = titled || crumbTitle || doc.title
    const wasSaved = store.isSaved(doc.slug, anchor)
    store.toggleSaved(doc.slug, anchor, title)
    say(wasSaved ? `unmarked · ${title}` : `marked · ${title}`)
  }

  /** The page as a block an LLM can use: identity first, then the text the
   *  reader is looking at, plus the lossless raw-Org URL for the agent that
   *  wants more than the excerpt. */
  function pageAsContext(): string {
    if (!doc || !proseEl) return ''
    const raw = new URL(`${store.base}/docs/${doc.slug}.org`, location.href).toString()
    const head =
      `# ${doc.title}\n` +
      `Source: docneural · ${doc.tags[0] ?? 'corpus'} · ${linkFor(null)}\n` +
      `Raw Org: ${raw}\n\n`
    return head + (proseEl.innerText ?? '').trim() + '\n'
  }

  /* A paste budget, in characters. Long chapters (69 kB measured) are more
     than a agent turn wants, and the full text is one fetch away at the
     `Raw Org:` URL in the header — so trading the tail for a prompt that
     still fits is the honest call. ~10 chars/token ≈ 10 k tokens. */
  const CONTEXT_BUDGET = 40_000

  async function copyContext(): Promise<void> {
    let text = pageAsContext()
    if (!text) return
    const full = text.length
    if (full > CONTEXT_BUDGET) {
      // Cut at a line boundary so the paste never ends mid-sentence, and
      // say so — a silently truncated paste is worse than a smaller one.
      const cut = text.slice(0, CONTEXT_BUDGET)
      const nl = cut.lastIndexOf('\n')
      text = `${cut.slice(0, nl > 0 ? nl : CONTEXT_BUDGET)}\n\n[… truncated — the whole chapter is at the Raw Org URL above. ]\n`
    }
    const kb = (n: number) => (n > 2048 ? `${(n / 1024).toFixed(1)} kB` : `${n} B`)
    const copied = await copyText(text)
    say(
      copied
        ? full > CONTEXT_BUDGET
          ? `copied ${kb(text.length)} of ${kb(full)} · full: ${doc?.slug}.org`
          : `copied page as context · ${kb(full)}`
        : 'copy blocked by browser'
    )
  }

  // Progress: how far through THIS chapter you are. Written straight to the
  // element from a rAF callback — a $state updated per frame would re-render
  // the reader 60 times a second on a Celeron.
  let barEl: HTMLDivElement | undefined = $state()
  $effect(() => {
    const ready = html // re-measure whenever a new body paints
    const bar = barEl
    if (!ready || !bar || !mainEl) return
    const src = scroller()
    const measure = () => {
      const el = src === window ? document.documentElement : (src as HTMLElement)
      const max = el.scrollHeight - el.clientHeight
      bar.style.transform = `scaleX(${max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 1})`
    }
    let raf = 0
    const onScroll = () => {
      // The card is pinned to the link's viewport box, so scrolling invalidates
      // it. Closing is cheaper and less confusing than repositioning per frame.
      if (peek) closePeek()
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure() })
    }
    src.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      src.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  })

  // Every heading is a target: click one and the link to that section is on
  // the clipboard. The `#` affordance is CSS; this pass only labels them.
  $effect(() => {
    if (!html || !proseEl) return
    for (const h of proseEl.querySelectorAll<HTMLElement>('h2[id], h3[id]')) {
      h.title = 'Click to copy a link to this section'
      h.dataset.anchor = h.id
    }
  })

  // Remember where the reader stopped, for Home's `--resume` line. Heading,
  // not pixel offset: see core/lastRead.ts.
  $effect(() => {
    const slug = doc?.slug
    if (slug) store.notePosition(slug, activeId)
  })

  // Reader keys live here, not in DocneuralApp's app-level layer, because only
  // this component knows the article element, which box scrolls, and which
  // heading is at the top of the screen.
  onMount(() => {
    function onKey(e: KeyboardEvent): void {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (!store.selected) return
      const k = e.key.toLowerCase()
      if (k === 'j') { e.preventDefault(); nudge(1) }
      else if (k === 'k') { e.preventDefault(); nudge(-1) }
      else if (k === 'y') { e.preventDefault(); void copyLink(currentAnchor()) }
      else if (k === 'b') { e.preventDefault(); mark() }
      else if (k === 'v') {
        e.preventDefault()
        zen = !zen
        say(zen ? 'distraction-free · esc back' : 'panels back')
      } else if (e.key === 'Escape' && zen) zen = false
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- hover peek: the citation card ----------
     A cross-reference is a promise ("explained there"), and every other docs
     reader makes you break your place to check it. Here the promise can be
     answered in place, because the exporter kept the SENTENCE each citation
     was made in: that is the card's body, and it is already on disk per node.
     One timer, one delegation pair, no new payload — a hover-intent delay
     (300 ms) is what keeps it from firing on the way past a paragraph. */
  let peek = $state<Peek | null>(null)
  let peekTimer: ReturnType<typeof setTimeout> | 0 = 0
  /** The link the timer is armed for — one at a time, so moving along a
   *  paragraph resets the delay instead of stacking cards. */
  let peekToEl: HTMLAnchorElement | null = null
  let pressTimer: ReturnType<typeof setTimeout> | 0 = 0
  const HREF = /(?:^|\/)?docs\/([^#]+)\.html(?:#(.*))?$/

  // A chapter change should feel like turning to a page, not like a reload.
  // The Web Animations API on the scroller is the cheap way: compositor-only
  // properties (opacity + transform), no CSS class to un-toggle, no subtree
  // remount, and nothing re-renders. Reduced-motion readers get no animation
  // at all, which is what they asked for.
  $effect(() => {
    const slug = doc?.slug
    const el = mainEl
    if (!slug || !el) return
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
      { duration: 170, easing: 'cubic-bezier(.2,.7,.3,1)' }
    )
  })

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

  function onContentClick(e: MouseEvent): void {
    const el = e.target as HTMLElement
    const a = el.closest('a')
    if (!a) {
      // No link under the pointer: a heading click is the affordance, not a
      // navigation.
      const head = el.closest?.('[data-anchor]') as HTMLElement | null
      if (head?.dataset.anchor) {
        e.preventDefault()
        void copyLink(head.dataset.anchor)
      }
      return
    }
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/(?:^|\/)?docs\/([^#]+)\.html(?:#(.*))?$/)
    if (!m) return // external link: let the browser handle it
    e.preventDefault()
    const target = store.bySlug(m[1])
    if (!target) return
    if (target.id === doc?.id && m[2]) scrollTo(decodeURIComponent(m[2]))
    else store.goto(target)
  }

  // Mobile: the sidebar is an off-canvas drawer (a static strip above the
  // article just clipped the chapter list). It closes on any navigation —
  // watching the selected id covers rail/palette/crumb clicks too.
  let drawer = $state(false)
  $effect(() => {
    if (store.selected?.id) {
      drawer = false
      // A new chapter is a new document: a card describing the last one's
      // wire must not survive the jump.
      closePeek()
    }
  })

  /* Distraction-free: the two side panels are useful, and on a phone in
     landscape they are also two chances for the article to be 40% of the
     screen. `v` hides them, esc brings them back — the article goes to full
     measure by dropping its grid columns, not by re-rendering anything. */
  let zen = $state(false)
</script>

<div class="reader" class:zen style={srcVars}>
  {#if drawer}
    <div class="scrim" role="presentation" onclick={() => (drawer = false)}></div>
  {/if}
  {#if !zen}
    <aside class="side" class:open={drawer} aria-label="Sidebar">
      <ChapterNav {store} />
    </aside>
  {/if}

  <div class="doc-main" bind:this={mainEl}>
    <!-- Reading progress for this chapter: a hairline that fills as you go.
         transform-only, so it costs the compositor nothing. -->
    <div class="prog" bind:this={barEl} aria-hidden="true"></div>
    {#if doc}
      <nav class="crumbs dn-mono dn-brackets" aria-label="Breadcrumb">
        <button class="menu" onclick={() => (drawer = true)} aria-label="Open contents">☰</button>
        <!-- A path, not a label: the corpus is a directory, the chapters are
             what is under it. `~/` says you started at the front door, which
             is exactly what the chip links to.
             FULL-RIGHTS OP-42: this bar is the instrument's ADDRESS BAR —
             reticle frame, the channel chip in a fixed gutter, the action
             zone split off by a rule, contents as the first action. -->
        <button class="src-chip" onclick={() => store.goHome()} title="Back to the front door">{`~/${doc?.tags[0] || store.manual || 'org-docs'}`}</button>
        <span class="slash" aria-hidden="true">›</span>
        {#each ancestors as a (a.id)}
          <button class="crumb" onclick={() => go(a)}>{a.title}</button>
          <span class="sep">/</span>
        {/each}
        {#if store.origin && doc}
          <button class="crumb" onclick={() => go(doc)}>{doc.title}</button>
          <span class="sep">/</span>
        {/if}
        <span class="here">{crumbTitle}</span>
        <!-- The affordances sit far right, out of the reading path: keep this
             section (⚑), copy a link to exactly here (⧉ link), copy the page
             as agent context (⧉ llm), and the same page as raw Org — what
             llms.txt links, one click from what you are reading. -->
        <span class="acts">
          <button class="cpy" class:on={store.isSaved(doc.slug, currentAnchor())}
                  onclick={mark}
                  title="Keep this section — b (shows on the front door)">⚑ {store.isSaved(doc.slug, currentAnchor()) ? 'marked' : 'mark'}</button>
          <button class="cpy" onclick={() => copyLink(currentAnchor())}
                  title="Copy a link to this position (y)">link</button>
          <button class="cpy" onclick={copyContext}
                  title="Copy this page as plain text with its sources, for an LLM">llm</button>
          <a class="raw" href="{store.base}/docs/{doc.slug}.org"
             title="This page as plain Org (lossless, LLM-friendly)">raw org</a>
        </span>
      </nav>

      {#if html === undefined}
        <p class="loading dn-mono">loading this chapter…</p>
      {:else if html === null}
        <!-- A static file the export never produced. Say which file is
             missing and what to run, in plain words. -->
        <p class="missing dn-mono">This chapter has no page yet — the export did not produce <code>docs/{doc.slug}.html</code>. Run <code>make export &amp;&amp; make build</code>.</p>
      {:else}
        <!-- FULL-RIGHTS OP-43: every chapter opens as a MASTHEAD — corpus,
               position in the manual, wire weight — the same rhythm a
               printed manual uses before its title. Data is real store
               derivation, no script changes. -->
        <p class="masthead dn-mono">
          <span class="mh-src">{DocneuralStore.manualTitle(doc.tags[0] || store.manual || 'org-docs')}</span>
          · chapter {store.chapters.findIndex((c) => c.id === doc.id) + 1} of {store.chapters.length}
          · {store.views.get(doc.id)?.degree ?? 0}⌁
        </p>
        <div class="dn-org" bind:this={proseEl} role="presentation"
             onclick={onContentClick}
             onpointerover={onPeekMove} onpointerout={onPeekLeave}
             onpointerdown={onPeekDown} onpointerup={onPeekUp}
             onpointercancel={onPeekUp} onpointerleave={closePeek}>
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
      <p class="dn-mono">select a chapter</p>
    {/if}
  </div>

  {#if !zen}
    <SynapseRail {store} {toc} {activeId} onJump={scrollTo} />
  {/if}

  <LinkPeek {store} {peek} />

  {#if note}
    <p class="note dn-mono" role="status" aria-live="polite">{note}</p>
  {/if}
</div>

<style>
  .reader {
    display: grid;
    grid-template-columns: var(--dn-side-w) minmax(0, 1fr) var(--dn-panel-w);
    height: calc(100dvh - var(--dn-header-h));
    min-height: 0;
  }
  /* Distraction-free (v): one column, and the article keeps its own measure
     (max-width lives on .dn-prose), so this is purely about removing the two
     panels — nothing re-lays-out, nothing re-renders. */
  .reader.zen { grid-template-columns: minmax(0, 1fr); }
  /* Tablet: sidebar + article; the rail's own scoped CSS drops it (its
     content reappears stacked on phones, see SynapseRail). */
  @media (max-width: 1100px) {
    .reader { grid-template-columns: var(--dn-side-w) minmax(0, 1fr); }
  }
  /* Phone: single column; sidebar becomes an off-canvas drawer opened by
     the ☰ button in the breadcrumb row. */
  @media (max-width: 700px) {
    .reader {
      display: block;
      overflow-y: auto;
    }
    .side {
      position: fixed;
      top: var(--dn-header-h);
      bottom: 0;
      left: 0;
      width: min(78vw, 20rem);
      z-index: 30;
      transform: translateX(-105%);
      transition: transform 160ms ease;
      background: var(--dn-bg);
      border-right: 1px solid var(--dn-border-strong);
      box-shadow: 0 0 40px color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
    }
    .side.open { transform: none; }
    .doc-main {
      height: auto;
      overflow: visible;
      padding: 0.9rem 1rem 3rem;
    }
  }
  .scrim {
    position: fixed;
    inset: var(--dn-header-h) 0 0 0;
    z-index: 29;
    background: color-mix(in srgb, var(--dn-bg-sunken) 55%, transparent);
  }
  .menu {
    display: none;
    font-family: var(--dn-font-mono);
    font-size: 0.85rem;
    color: var(--dn-fg-muted);
    background: none;
    border: 1px solid var(--dn-border);
    border-radius: var(--dn-radius);
    padding: 0.1em 0.55em;
    cursor: pointer;
  }
  @media (max-width: 700px) {
    .menu { display: inline-block; }
  }
  .side { min-height: 0; overflow: hidden; }
  .doc-main {
    overflow-y: auto;
    padding: 1.1rem 2.4rem 4rem;
    min-width: 0;
    scroll-behavior: smooth;
  }
  /* Reading progress: a hairline pinned to the top of the scroller, filled by
     transform only (scaleX), so it never costs the article a reflow. */
  .prog {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2px;
    margin-bottom: -2px;
    background: linear-gradient(
      90deg,
      var(--dn-src, var(--dn-accent)),
      var(--dn-accent-2)
    );
    transform: scaleX(0);
    transform-origin: 0 50%;
  }
  /* Copy feedback: one toast, bottom-left, auto-hidden. */
  .note {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    z-index: 40;
    margin: 0;
    max-width: min(90vw, 34rem);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--dn-fg);
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border-strong);
    border-left: 2px solid var(--dn-accent);
    padding: 0.4rem 0.7rem;
    animation: dn-rise 160ms ease-out;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.7rem;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg-faint);
    margin-bottom: 1.2rem;
    padding: 0.4rem 0.7rem;
    min-height: 2.5rem;
  }
  /* FULL-RIGHTS OP-42: contents is the bar's FIRST action — a zone, not a
     tucked button. */
  .menu {
    border-right: 1px solid var(--dn-border);
    padding-right: 0.55rem;
    margin-right: 0.1rem;
  }
  /* the channel you are on, as a path — and a path is never uppercased.
     OP-42: it leads the address bar from a fixed gutter. */
  .src-chip {
    font: inherit;
    color: var(--dn-accent);
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 40%, transparent);
    border-radius: 2px;
    padding: 0.15em 0.6em;
    cursor: pointer;
    min-width: 6rem;
    text-align: left;
  }
  .src-chip:hover {
    box-shadow: 0 0 14px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 30%, transparent);
  }
  .slash { color: var(--dn-border-strong); }
  /* The affordance group, split off from the path by a rule — a distinct
     zone at the right end of the address bar (OP-42). */
  .acts {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-left: 1px solid var(--dn-border-strong);
    padding-left: 0.65rem;
  }
  /* FULL-RIGHTS OP-43 — the chapter masthead: corpus · position · weight,
     on a strong rule, the same rhythm a printed manual uses. */
  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15em 0.5em;
    font-size: var(--dn-text-2xs);
    letter-spacing: var(--dn-track-wide);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    margin: 0 0 var(--dn-space-3);
    padding-bottom: var(--dn-space-2);
    border-bottom: 1px solid var(--dn-border-strong);
  }
  .masthead .mh-src { color: var(--dn-src, var(--dn-accent)); }
  .cpy {
    font: inherit;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg-faint);
    background: none;
    border: 1px solid var(--dn-border);
    border-radius: 2px;
    padding: 0.15em 0.6em;
    cursor: pointer;
    white-space: nowrap;
  }
  .cpy:hover {
    color: var(--dn-accent);
    border-color: color-mix(in srgb, var(--dn-accent) 45%, transparent);
  }
  /* A section you already marked stays lit — the state has to be visible, or
     `b` looks like a key that does nothing the second time. */
  .cpy.on {
    color: var(--dn-hot);
    border-color: color-mix(in srgb, var(--dn-hot) 55%, transparent);
    background: color-mix(in srgb, var(--dn-hot) 10%, transparent);
  }
  .crumbs .raw {
    letter-spacing: var(--dn-track);
    /* DS-COOLEST directive 5: the wire hue, not pink — raw org is a link to
       a file, and links ride the cyan wire. */
    color: var(--dn-accent);
    text-decoration: none;
    border: 1px solid color-mix(in srgb, var(--dn-accent) 45%, transparent);
    border-radius: 2px;
    padding: 0.15em 0.6em;
    white-space: nowrap;
  }
  .crumbs .raw:hover {
    color: var(--dn-bg);
    background: var(--dn-accent);
    box-shadow: none;
  }
  .crumb {
    font: inherit;
    color: var(--dn-fg-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-transform: none;
    letter-spacing: normal;
  }
  .crumb:hover { color: var(--dn-accent); }
  .crumbs .sep { color: var(--dn-border-strong); }
  .crumbs .here {
    color: var(--dn-fg);
    letter-spacing: normal;
  }
  .loading { color: var(--dn-fg-muted); }
  .missing { color: var(--dn-amber); }
  .missing code { font-family: var(--dn-font-mono); font-size: 0.92em; }

  .pager {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 3rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--dn-border);
  }
  .pager-btn {
    display: flex;
    flex-direction: column;
    gap: 0.15em;
    max-width: 46%;
    font-family: var(--dn-font-mono);
    text-align: left;
    color: var(--dn-fg);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    padding: 0.6em 0.9em;
    cursor: pointer;
    transition: border-color 120ms, box-shadow 120ms;
  }
  /* notch the outer corner so the pager reads as HUD hardware, not cards */
  .pager-btn.prev { clip-path: polygon(0 0, 100% 0, 100% 100%, var(--dn-notch) 100%, 0 calc(100% - var(--dn-notch))); }
  .pager-btn.next { clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--dn-notch)), calc(100% - var(--dn-notch)) 100%, 0 100%); }
  .pager-btn:hover {
    border-color: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 60%, var(--dn-border-strong));
    box-shadow: 0 0 18px color-mix(in srgb, var(--dn-src, var(--dn-accent)) 24%, transparent);
  }
  .pager-btn.next { text-align: right; align-items: flex-end; margin-left: auto; }
  .pager-btn .dir { font-size: 0.62rem; color: var(--dn-fg-faint); letter-spacing: var(--dn-track); text-transform: uppercase; }
  .pager-btn .pt { font-size: 0.85rem; color: var(--dn-accent); }
</style>
