<script lang="ts">
  // CommandPalette — ⌘K / Ctrl-K. Fuzzy-jump to any node (chapters AND the
  // 391 indirect sections, which the sidebar hides) plus a few commands.
  // Zero dependencies: a filtered list + arrow-key selection is enough, and
  // stays light on the potato.
  import type { SynaptStore } from '../core/store.svelte'
  import type { DocNode } from '../core/types'

  let {
    store,
    open = $bindable(false),
    onClose = () => {}
  }: {
    store: SynaptStore
    open?: boolean
    onClose?: () => void
  } = $props()

  let q = $state('')
  let input: HTMLInputElement | undefined = $state()
  let index = $state(0)

  type Item =
    | { kind: 'doc'; node: DocNode; label: string; hint: string }
    | { kind: 'cmd'; label: string; hint: string; run: () => void }

  const commands: Item[] = [
    { kind: 'cmd', label: 'Go home', hint: 'welcome', run: () => store.goHome() },
    { kind: 'cmd', label: 'Open reader', hint: 'docs mode', run: () => store.setMode('reader') },
    { kind: 'cmd', label: 'Open synapses', hint: 'graph mode', run: () => store.setMode('graph') }
  ]

  const items = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    const docs: Item[] = store
      .search(needle, 0)
      .slice(0, 12)
      .map((n) => ({
        kind: 'doc' as const,
        node: n,
        label: n.title,
        hint: n.redirect ? `section of ${n.redirect.slug}` : 'chapter'
      }))
    const cmds: Item[] = needle
      ? commands.filter((c) => c.label.toLowerCase().includes(needle))
      : commands
    return [...cmds, ...docs]
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
    else item.run()
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
    <div class="palette">
      <input
        bind:this={input}
        bind:value={q}
        class="sy-mono"
        type="text"
        placeholder="jump to a doc, or run a command…"
        aria-label="Command input"
      />
      <ul>
        {#each items as it, i (it.kind === 'doc' ? it.node.id : it.label)}
          <li>
            <button
              class="row"
              class:active={i === index}
              onclick={() => choose(it)}
              onmouseenter={() => (index = i)}
            >
              <span class="ico sy-mono">{it.kind === 'doc' ? '▤' : '›'}</span>
              <span class="label">{it.label}</span>
              <span class="hint sy-mono">{it.hint}</span>
            </button>
          </li>
        {:else}
          <li class="empty sy-mono">no matches</li>
        {/each}
      </ul>
      <div class="bar sy-mono">↑↓ move · ⏎ open · esc close</div>
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
    padding: 12vh 1rem 1rem;
    background: color-mix(in srgb, var(--sy-bg-sunken) 62%, transparent);
    backdrop-filter: blur(3px);
  }
  .palette {
    width: min(40rem, 100%);
    background: var(--sy-bg);
    border: 1px solid var(--sy-border-strong);
    border-radius: 10px;
    box-shadow: 0 24px 60px color-mix(in srgb, var(--sy-bg-sunken) 75%, transparent);
    overflow: hidden;
  }
  .palette input {
    width: 100%;
    background: var(--sy-bg-raise);
    border: none;
    border-bottom: 1px solid var(--sy-border);
    color: var(--sy-fg);
    font-size: 1rem;
    padding: 0.9em 1.1em;
  }
  .palette input:focus { outline: none; }
  ul { list-style: none; margin: 0; padding: 0.3rem; max-height: 60vh; overflow-y: auto; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.7em;
    width: 100%;
    text-align: left;
    color: var(--sy-fg);
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0.5em 0.7em;
    cursor: pointer;
  }
  .row .ico { color: var(--sy-accent-dim); width: 1em; }
  .row .label { flex: 1; font-family: var(--sy-font-prose); font-size: 0.9rem; }
  .row .hint { font-size: 0.7rem; color: var(--sy-fg-faint); }
  .row.active { background: color-mix(in srgb, var(--sy-accent) 14%, transparent); }
  .row.active .label { color: var(--sy-accent); }
  .empty { padding: 0.7em; color: var(--sy-fg-faint); font-size: 0.85rem; }
  .bar {
    border-top: 1px solid var(--sy-border);
    padding: 0.5em 0.9em;
    font-size: 0.7rem;
    color: var(--sy-fg-faint);
    background: var(--sy-bg-raise);
  }
</style>
