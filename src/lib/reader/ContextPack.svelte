<script lang="ts">
  // ContextPack — tick several sections, hand an AGENT one bundle.
  //
  // "Copy this page as context" exists (⧉ llm). What no docs site ships is
  // the multi-page version: the sidebar checkboxes are already a
  // multi-select (today they only scope the graph canvas), so the bundle
  // is the same habit applied to the agent-facing half of the site.
  //
  // The novel bit is free and honest: a token estimate (string length / 4)
  // shown BEFORE you copy, so a reader who knows their context window can
  // trim the pack instead of discovering the overflow in the assistant's
  // error. Each section carries its own citation edge list — the wires INTO
  // it — because that is the context that makes a section answerable.
  //
  // Zero new payload: bodies come from the same lazy fragment fetch the
  // reader already performs; citation sentences from ctx/<id>.json.
  import { DocneuralStore } from '../core/store.svelte'
  import { copyText } from '../core/clipboard'
  import type { DocNode } from '../core/types'

  let {
    store,
    open = $bindable(false)
  }: {
    store: DocneuralStore
    open?: boolean
  } = $props()

  const docs = $derived(
    store.checked
      .map((id) => store.byId(id))
      .filter((n): n is DocNode => !!n && !n.stub)
  )

  /* Fetch every ticked body on open (the reader may have read only one of
     them). De-duplicated through store.body(). */
  $effect(() => {
    if (open) for (const d of docs) void store.body(d.slug)
  })

  /** The text of ONE h2/h3 section inside a fragment: from the heading to
   *  the next heading of the same or higher level. A chapter's top section
   *  is everything above its first h3. Returns '' when the anchor is gone
   *  (the export changed under an old link). */
  function sectionText(html: string, anchor: string | null): string {
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const heads = [...dom.querySelectorAll('h2[id], h3[id]')] as HTMLElement[]
    if (!heads.length) return dom.body.textContent?.trim() ?? ''
    const start = anchor ? heads.findIndex((h) => h.id === anchor) : -1
    const from = start >= 0 ? heads[start] : heads[0]
    const upto = start >= 0 ? heads[start + 1] : heads[1]
    const nodes: Node[] = []
    let el: Node | null = from
    while (el && el !== upto) {
      nodes.push(el)
      el = el.nextSibling
    }
    return nodes
      .map((n) => (n.textContent ?? '').trim())
      .filter(Boolean)
      .join('\n')
  }

  /** The whole bundle, in tick order: identity header per section, the
   *  prose, and the wires into it. */
  function bundle(): string {
    const parts: string[] = [
      '# Context pack — docneural',
      `Sections: ${docs.length} · built ${new Date().toISOString().slice(0, 10)}`,
      ''
    ]
    for (const d of docs) {
      const html = store.bodies.get(d.slug)
      const text = html ? sectionText(html, null) : d.title
      const citeIn = store.data.links.filter((l) => l.target === d.id)
      parts.push(
        `## ${d.title}`,
        `Source: docneural · ${d.tags[0] ?? 'corpus'} · docs/${d.slug}.org`,
        ''
      )
      parts.push(text.slice(0, 6000) + (text.length > 6000 ? '\n[… truncated]' : ''))
      if (citeIn.length) {
        parts.push('', 'Cited by:')
        for (const l of citeIn.slice(0, 12)) {
          const from = store.byId(l.source)
          parts.push(`- ${from?.title ?? l.source}`)
        }
      }
      parts.push('', '---', '')
    }
    return parts.join('\n')
  }

  const est = $derived(bundle().length)
  const tokens = $derived(Math.round(est / 4))
  const kb = (n: number) => (n > 2048 ? `${(n / 1024).toFixed(1)} kB` : `${n} B`)

  let note = $state('')
  async function copyPack(): Promise<void> {
    const text = bundle()
    const ok = await copyText(text)
    note = ok
      ? `pack copied · ${kb(text.length)} · ~${tokens.toLocaleString()} tokens`
      : 'copy blocked by browser'
    setTimeout(() => (note = ''), 3000)
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Context pack"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) open = false
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') open = false
    }}
  >
    <div class="pack dn-hud">
      <div class="titlebar dn-mono">
        <span class="tb-l">⧉ context pack</span>
        <span class="tb-r">{docs.length} sections · ~{tokens.toLocaleString()} tokens</span>
      </div>
      {#if docs.length === 0}
        <p class="empty dn-mono">
          Nothing ticked yet. Tick chapters in the contents sidebar (they also
          scope the graph), then build the pack here — or use <b>⧉ llm</b> on a
          single page.
        </p>
      {:else}
        <ul>
          {#each docs as d (d.id)}
            <li>
              <span class="num dn-mono">{docs.indexOf(d) + 1}</span>
              <span class="t">{d.title}</span>
              <span class="src dn-mono">{d.tags[0] ?? 'corpus'}</span>
              <button
                class="x"
                onclick={() => store.toggleChecked(d.id)}
                aria-label={`Drop ${d.title} from the pack`}>✕</button
              >
            </li>
          {/each}
        </ul>
        <div class="bar dn-mono">
          <span>one deduplicated markdown bundle, each section with its cited-by list</span>
          <button class="go" onclick={copyPack}>copy · {kb(est)} · ~{tokens.toLocaleString()} tokens</button>
        </div>
      {/if}
      {#if note}<p class="note dn-mono" role="status">{note}</p>{/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 10vh 1rem 1rem;
    background: color-mix(in srgb, var(--dn-bg-sunken) 74%, transparent);
  }
  .pack {
    position: relative;
    width: min(34rem, 100%);
    background: var(--dn-bg-raise);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    box-shadow: 0 24px 60px color-mix(in srgb, var(--dn-bg-sunken) 85%, transparent);
    overflow: hidden;
    animation: dn-rise 160ms ease-out both;
  }
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
  .empty { padding: 1.2em; color: var(--dn-fg-muted); font-size: 0.85rem; line-height: 1.5; }
  ul { list-style: none; margin: 0; padding: 0.3rem; max-height: 50vh; overflow-y: auto; }
  li {
    display: flex;
    align-items: center;
    gap: 0.7em;
    padding: 0.4em 0.7em;
    border-bottom: 1px solid var(--dn-border);
  }
  .num { color: var(--dn-accent-dim); font-size: 0.7rem; }
  .t { flex: 1; font-family: var(--dn-font-prose); font-size: 0.85rem; }
  .src { font-size: 0.6rem; color: var(--dn-fg-faint); letter-spacing: 0.08em; text-transform: uppercase; }
  .x {
    background: none;
    border: none;
    color: var(--dn-fg-faint);
    cursor: pointer;
    font-size: 0.75rem;
  }
  .x:hover { color: var(--dn-accent); }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid var(--dn-border);
    padding: 0.6em 0.9em;
    font-size: 0.66rem;
    color: var(--dn-fg-faint);
    background: color-mix(in srgb, var(--dn-bg-sunken) 60%, transparent);
  }
  .go {
    background: color-mix(in srgb, var(--dn-accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--dn-accent) 45%, transparent);
    color: var(--dn-accent);
    padding: 0.35em 0.8em;
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    font-family: inherit;
  }
  .go:hover { background: color-mix(in srgb, var(--dn-accent) 26%, transparent); }
  .note { margin: 0; padding: 0.5em 0.9em; color: var(--dn-accent-2); font-size: 0.7rem; }
</style>
