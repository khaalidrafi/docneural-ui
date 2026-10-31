<script lang="ts">
  // CommandPalette — ⌘K / Ctrl-K. Fuzzy-jump to any node in any manual
  // (chapters AND the indirect stub sections, which the sidebar hides)
  // plus a few commands.
  // Zero dependencies: a filtered list + arrow-key selection is enough, and
  // stays light on the potato.
  //
  // Styled as a terminal window: a title strip, a `>` prompt, rows tagged
  // with the SOURCE they belong to in that source's hue. The tag is the
  // point — in an aggregator, "Introduction" is ambiguous and "[ORG]" is not.
  //
  // DOC SWITCHER (network pass 2026-10-31, SPEC §6.1): the results now read
  // as three labelled sections so the same query answers three different
  // questions without a mode switch —
  //   Documents  every manual at once, fuzzy title match;
  //   Chapters   the manual you are reading, reading order;
  //   Neurons    the top-degree hubs of the whole corpus.
  // One flat cursor walks all sections (↑↓ Enter Esc unchanged).
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import type { DocNode } from '../core/types'

  let {
    store,
    open = $bindable(false),
    onClose = () => {}
  }: {
    store: DocneuralStore
    open?: boolean
    onClose?: () => void
  } = $props()

  let q = $state('')
  let input: HTMLInputElement | undefined = $state()
  let listEl: HTMLUListElement | undefined = $state()
  let index = $state(0)

  type Item =
    | { kind: 'cmd'; label: string; hint: string; run: () => void }
    | {
        kind: 'doc'
        /** Which section the row renders under (drives the icon + key). */
        sect: 'documents' | 'chapters' | 'neurons'
        node: DocNode
        label: string
        hint: string
        src: string
      }
  type DocItem = Extract<Item, { kind: 'doc' }>

  const commands: Item[] = [
    { kind: 'cmd', label: 'Go home', hint: 'welcome', run: () => store.goHome() },
    { kind: 'cmd', label: 'Open reader', hint: 'docs mode', run: () => store.setMode('reader') },
    { kind: 'cmd', label: 'Open synapses', hint: 'neural network mode', run: () => store.setMode('graph') },
    // Free-brain RAG over the corpus (core/ai.ts): answers, page essence and
    // quizzes — out of the box, no key. The one AI surface a static site
    // can honestly ship.
    { kind: 'cmd', label: 'Ask the corpus (AI)…', hint: 'answers, essence, quizzes — no setup', run: () => (store.aiOpen = true) }
  ]

  /** Fuzzy title match for the DOCUMENTS section: a case-insensitive
   *  SUBSEQUENCE test — every query character must appear, in order — scored
   *  so tight and word-boundary hits outrank scattered ones. A plain
   *  substring is the top score by construction, so normal searches keep
   *  behaving; a dropped letter ("vrable index") still lands. Hand-rolled
   *  because the palette has been dependency-free since it shipped. */
  function fuzzy(hay: string, needle: string): number | null {
    const h = hay.toLowerCase()
    let from = 0
    let score = 0
    for (const ch of needle) {
      const at = h.indexOf(ch, from)
      if (at === -1) return null
      score += at === from ? 3 : 1 // consecutive letters read as one intent
      if (at === 0 || h[at - 1] === ' ' || h[at - 1] === '-' || h[at - 1] === '_') score += 2
      from = at + 1
    }
    return score
  }

  type Section = { name: string | null; items: Item[] }

  const sections = $derived.by(() => {
    const needle = q.trim().toLowerCase()

    // Commands keep the top slot, headerless — they are the palette's own
    // verbs, not search results (the pre-network-pass behaviour, kept).
    const cmds: Item[] = needle
      ? commands.filter((c) => c.label.toLowerCase().includes(needle))
      : commands

    // DOCUMENTS (SPEC §6.1): all manuals at once, fuzzy over the title.
    const docs: DocItem[] = []
    if (needle) {
      const scored: { n: DocNode; s: number }[] = []
      for (const n of store.data.nodes) {
        const s = fuzzy(n.title, needle)
        if (s !== null) scored.push({ n, s })
      }
      scored.sort((a, b) => b.s - a.s || (a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0))
      for (const { n } of scored.slice(0, 12)) {
        docs.push({
          kind: 'doc',
          sect: 'documents',
          node: n,
          label: n.title,
          // Hint disambiguates the aggregator: every manual has an
          // "Introduction"; say which one a hit belongs to.
          hint: n.redirect
            ? `§ ${n.redirect.slug}`
            : (DocneuralStore.manualTitle(n.tags[0] ?? '') || 'chapter').toUpperCase(),
          src: n.tags[0] ?? ''
        })
      }
    }

    // CHAPTERS: the CURRENT manual's spine (store.chapters is already
    // manual-scoped), reading order. An empty query shows its first pages so
    // ⌘K opens as a chapter navigator; a query filters by title. Rows already
    // offered under Documents are not offered twice.
    const docIds = new Set(docs.map((d) => d.node.id))
    const chaps: DocItem[] = store.chapters
      .filter((c) => !docIds.has(c.id) && (!needle || c.title.toLowerCase().includes(needle)))
      .slice(0, 12)
      .map((n) => ({
        kind: 'doc' as const,
        sect: 'chapters' as const,
        node: n,
        label: n.title,
        hint: `${store.views.get(n.id)?.degree ?? 0} synapses`,
        src: n.tags[0] ?? ''
      }))

    // NEURONS: the top-degree hubs of the whole corpus (SPEC §6.1) — the
    // chapters a reader is usually hunting for in a strange manual. Same
    // dedupe; the hint names the manual for the same reason Documents' does.
    const taken = new Set([...docIds, ...chaps.map((c) => c.node.id)])
    const neurons: DocItem[] = [...store.views.values()]
      .filter((v) => !taken.has(v.id) && (!needle || v.title.toLowerCase().includes(needle)))
      .sort((a, b) => b.degree - a.degree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, 8)
      .map((v) => ({
        kind: 'doc' as const,
        sect: 'neurons' as const,
        node: v,
        label: v.title,
        hint: (DocneuralStore.manualTitle(v.tags[0] ?? '') || 'chapter').toUpperCase(),
        src: v.tags[0] ?? ''
      }))

    // Sections with nothing to say render no header at all.
    return [
      { name: null, items: cmds },
      ...(docs.length ? [{ name: 'Documents', items: docs }] : []),
      ...(chaps.length ? [{ name: 'Chapters', items: chaps }] : []),
      ...(neurons.length ? [{ name: 'Neurons', items: neurons }] : [])
    ] satisfies Section[]
  })

  const items = $derived(sections.flatMap((s) => s.items))
  const indexOf = $derived(new Map(items.map((it, i) => [it, i])))

  // Keep the cursor in range as the list changes.
  $effect(() => {
    if (index >= items.length) index = Math.max(0, items.length - 1)
  })

  // Focus on open, reset query.
  $effect(() => {
    if (open) {
      q = ''
      index = 0
      // Wait for the {#if open} block to mount before grabbing the input.
      requestAnimationFrame(() => input?.focus())
    }
  })

  // The cursor now crosses section boundaries, so a keyboard walker can end
  // up rows below the fold: after each re-render, bring the active row into
  // the scroll view (instant jump, no smooth-scroll animation).
  function reveal(): void {
    requestAnimationFrame(() => {
      listEl?.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' })
    })
  }

  function choose(item: Item | undefined): void {
    if (!item) return
    if (item.kind === 'doc') store.goto(item.node)
    else item.run()
    close()
  }
  function close(): void {
    open = false
    onClose()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, items.length - 1); reveal(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); reveal(); return }
    if (e.key === 'Enter') { e.preventDefault(); choose(items[index]); return }
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) close()
    }}
    onkeydown={onKey}
  >
    <div class="palette dn-brackets">
      <!-- FULL-RIGHTS OP-46: real window chrome — three neuron marks (the
           terminal dots, inverted), the corpus readout right. -->
      <div class="titlebar dn-mono">
        <span class="tb-dots" aria-hidden="true">
          <span class="dn-neuron-mark"></span>
          <span class="dn-neuron-mark"></span>
          <span class="dn-neuron-mark"></span>
        </span>
        <span class="tb-l">jump</span>
        <span class="tb-r">{store.manuals.length} sources · {store.data.nodes.length} chapters</span>
      </div>
      <div class="promptline">
        <span class="gt" aria-hidden="true">⌕</span>
        <input
          bind:this={input}
          bind:value={q}
          class="dn-mono"
          type="text"
          placeholder="jump to a doc, or run a command…"
          aria-label="Command input"
        />
      </div>
      <ul bind:this={listEl}>
        {#each sections as s (s.name ?? 'run')}
          {#if s.name}
            <li class="sect dn-mono" aria-hidden="true">{s.name}</li>
          {/if}
          {#each s.items as it (it.kind === 'doc' ? `${it.sect}:${it.node.id}` : it.label)}
            <li style={it.kind === 'doc' ? sourceVars(it.src) : ''}>
              <button
                class="row"
                class:active={indexOf.get(it) === index}
                class:cmd={it.kind === 'cmd'}
                onclick={() => choose(it)}
                onmouseenter={() => (index = indexOf.get(it) ?? 0)}
              >
                <span class="ico dn-mono">{it.kind === 'doc' ? (it.sect === 'neurons' ? '⌁' : '▤') : '›'}</span>
                <span class="label">{it.label}</span>
                <span class="hint dn-mono">[{it.hint}]</span>
              </button>
            </li>
          {/each}
        {/each}
        {#if items.length === 0}
          <li class="empty dn-mono">nothing matches “{q}”</li>
        {/if}
      </ul>
      <div class="bar dn-mono">↑↓ move · ⏎ open · esc quit · ⌘k toggle</div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 10vh 1rem 1rem;
    background: color-mix(in srgb, var(--dn-bg-sunken) 74%, transparent);
  }
  .palette {
    position: relative;
    width: min(40rem, 100%); /* SPEC §6.1: a 640px overlay */
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--dn-accent) 16%, transparent),
      0 24px 60px color-mix(in srgb, var(--dn-bg-sunken) 85%, transparent),
      0 0 40px color-mix(in srgb, var(--dn-accent) 10%, transparent);
    overflow: hidden;
    animation: dn-rise 160ms ease-out both;
  }
  /* Title strip: the window chrome of a terminal, and where the corpus
     readout lives so the palette says what it is searching. */
  .titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 1.8rem;
    padding: 0.45em 0.9em;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
    border-bottom: 1px solid var(--dn-border-strong);
  }
  .tb-dots { display: inline-flex; gap: 0.35em; align-items: center; }
  .tb-dots .dn-neuron-mark { width: 5px; height: 5px; color: var(--dn-accent); opacity: 0.85; }
  .tb-l { color: var(--dn-accent); }
  .promptline {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.15em 0.9em;
    border-bottom: 1px solid var(--dn-border);
  }
  .gt { color: var(--dn-fg-muted); font-family: var(--dn-font-mono); font-size: 1.05rem; }
  .promptline input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: var(--dn-fg);
    font-size: 0.95rem;
    padding: 0.7em 0;
  }
  .promptline input:focus { outline: none; caret-color: var(--dn-accent); }
  ul { list-style: none; margin: 0; padding: 0.3rem; max-height: 56vh; overflow-y: auto; }
  /* Section header: the mono chrome at its quietest — the row is what you
     read, the header only names the question each block answers. */
  .sect {
    display: flex;
    align-items: center;
    min-height: 1.6rem;
    padding: 0.5em 0.7em 0.1em;
    font-size: 0.6rem;
    letter-spacing: var(--dn-track);
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    border-bottom: 1px solid var(--dn-hairline);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.7em;
    width: 100%;
    min-height: 44px; /* SPEC §6.1 row height — the palette is a touch surface too */
    box-sizing: border-box;
    text-align: left;
    color: var(--dn-fg);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    padding: 0.2em 0.7em;
    cursor: pointer;
    transition: background 100ms;
  }
  .row .ico { color: var(--dn-src, var(--dn-accent-dim)); width: 1em; }
  .row .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--dn-font-prose);
    font-size: 0.88rem;
  }
  .row .hint { font-size: 0.64rem; letter-spacing: 0.1em; color: var(--dn-fg-faint); }
  /* Selected row: lit in the SOURCE's hue, so the highlight itself tells you
     which corpus you are about to open. FULL-RIGHTS OP-46: the selection is
     a SLOT IN A RACK — 18% fill, the source rail, and a chamfered corner
     cut by clip-path (no paint cost). Glow stays reserved for focus. */
  .row.active {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 18%, transparent);
    border-left-color: var(--dn-src, var(--dn-accent));
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 4px, 4px 0);
  }
  .row.active .label { color: var(--dn-accent); }
  .row.active .hint { color: var(--dn-accent); }
  .row.cmd .hint { color: var(--dn-accent-2); }
  .empty { padding: 0.7em; color: var(--dn-fg-faint); font-size: 0.85rem; }
  .bar {
    border-top: 1px solid var(--dn-border);
    padding: 0.5em 0.9em;
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 60%, transparent);
  }
</style>
