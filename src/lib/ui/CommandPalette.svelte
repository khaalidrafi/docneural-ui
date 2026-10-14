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
  import { DocneuralStore } from '../core/store.svelte'
  import { sourceVars } from '../core/source'
  import type { DocNode } from '../core/types'
  import type { SearchHit } from '../core/search'

  let {
    store,
    open = $bindable(false),
    onClose = () => {},
    onAsk = (_q: string) => {}
  }: {
    store: DocneuralStore
    open?: boolean
    onClose?: () => void
    onAsk?: (q: string) => void
  } = $props()

  let q = $state('')
  let input: HTMLInputElement | undefined = $state()
  let index = $state(0)

  type Item =
    | { kind: 'doc'; node: DocNode; label: string; hint: string; src: string }
    | { kind: 'section'; hit: SearchHit; label: string; hint: string; src: string }
    | { kind: 'cmd'; label: string; hint: string; run: () => void }

  const commands: Item[] = [
    { kind: 'cmd', label: 'Go home', hint: 'welcome', run: () => store.goHome() },
    { kind: 'cmd', label: 'Open reader', hint: 'docs mode', run: () => store.setMode('reader') },
    { kind: 'cmd', label: 'Open synapses', hint: 'graph mode', run: () => store.setMode('graph') }
  ]

  // `? what is a synapse?` switches the palette into ask mode: one row
  // hands the question to the grounded-answer panel (BYO key).
  const askQuery = $derived(q.trim().startsWith('?') ? q.trim().slice(1).trim() : '')

  const items = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    const docs: Item[] = store
      .search(needle, 0)
      .slice(0, 8)
      .map((n) => ({
        kind: 'doc' as const,
        node: n,
        label: n.title,
        // Hint disambiguates the aggregator: every manual has an
        // "Introduction"; say which one a hit belongs to.
        hint: n.redirect
          ? `§ ${n.redirect.slug}`
          : (DocneuralStore.manualTitle(n.tags[0] ?? '') || 'chapter').toUpperCase(),
        src: n.tags[0] ?? ''
      }))
    // Section hits: the manual has ~30k headings and one "Introduction",
    // so what a reader actually types is the SECTION name. Rows read
    // "chapter › heading" and land on the anchor.
    const sections: Item[] = store
      .headingHits(q.trim(), 8)
      .map((h) => {
        const n = store.bySlug(h.slug)
        return {
          kind: 'section' as const,
          hit: h,
          label: h.heading ? `${h.pageTitle} › ${h.heading}` : h.pageTitle,
          hint: h.matched === 'title'
            ? (DocneuralStore.manualTitle(n?.tags[0] ?? '') || 'page').toUpperCase()
            : '§ section',
          src: n?.tags[0] ?? ''
        }
      })
    const cmds: Item[] = needle
      ? commands.filter((c) => c.label.toLowerCase().includes(needle))
      : commands
    if (askQuery) {
      return [
        {
          kind: 'cmd' as const,
          label: `ask this corpus: ${askQuery}`,
          hint: 'grounded · byo key',
          run: () => onAsk(askQuery)
        },
        ...docs,
        ...sections
      ]
    }
    return [...cmds, ...docs, ...sections]
  })

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

  function choose(item: Item | undefined): void {
    if (!item) return
    if (item.kind === 'doc') store.goto(item.node)
    else if (item.kind === 'section') {
      const node = store.bySlug(item.hit.slug)
      if (node) store.goto(node, 'reader', item.hit.anchor)
    } else item.run()
    close()
  }
  function close(): void {
    open = false
    onClose()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, items.length - 1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); return }
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
    <div class="palette dn-hud">
      <div class="titlebar dn-mono">
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
          placeholder="jump to a doc, run a command, or “? ask this corpus”…"
          aria-label="Command input"
        />
      </div>
      <ul>
        {#each items as it, i (it.kind === 'doc' ? it.node.id : it.kind === 'section' ? `${it.hit.slug}#${it.hit.anchor}` : it.label)}
          <li style={it.kind === 'cmd' ? '' : sourceVars(it.src)}>
            <button
              class="row"
              class:active={i === index}
              class:cmd={it.kind === 'cmd'}
              onclick={() => choose(it)}
              onmouseenter={() => (index = i)}
            >
              <span class="ico dn-mono">{it.kind === 'doc' ? '▤' : it.kind === 'section' ? '§' : '›'}</span>
              <span class="label">{it.label}</span>
              <span class="hint dn-mono">[{it.hint}]</span>
            </button>
          </li>
        {:else}
          <li class="empty dn-mono">nothing matches “{q}” in titles or sections</li>
        {/each}
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
    width: min(42rem, 100%);
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
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45em 0.9em;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 80%, transparent);
    border-bottom: 1px solid var(--dn-border);
  }
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
  .row {
    display: flex;
    align-items: center;
    gap: 0.7em;
    width: 100%;
    text-align: left;
    color: var(--dn-fg);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    padding: 0.5em 0.7em;
    cursor: pointer;
    transition: background 100ms;
  }
  .row .ico { color: var(--dn-src, var(--dn-accent-dim)); width: 1em; }
  .row .label { flex: 1; font-family: var(--dn-font-prose); font-size: 0.88rem; }
  .row .hint { font-size: 0.64rem; letter-spacing: 0.1em; color: var(--dn-fg-faint); }
  /* Selected row: lit in the SOURCE's hue, so the highlight itself tells you
     which corpus you are about to open. */
  .row.active {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 14%, transparent);
    border-left-color: var(--dn-src, var(--dn-accent));
  }
  .row.active .label { color: var(--dn-src, var(--dn-accent)); }
  .row.active .hint { color: var(--dn-src, var(--dn-accent)); }
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
