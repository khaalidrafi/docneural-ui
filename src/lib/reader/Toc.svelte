<script lang="ts">
  // Toc — the manual's table of contents as a tree, the Home "contents"
  // section's body. Replaces the flat card grid (Owner directive
  // 2026-10-31: "Show TOC instead of listing each page of the doc. We'll
  // add hundreds of docs to this site later"): a 752-page manual collapses
  // to its Info chapter tree, everything closed until asked for. The tree
  // is pure data (core/graph.ts#manualToc, unit-testable); the recursion
  // here is a Svelte 5 snippet calling itself, one component for all depths.
  //
  // Branch rows pair a disclosure toggle (a real <button> driving bind:open
  // on <details> — keyboard and screen-reader semantics come free, and no
  // <summary> ever nests an interactive element) with the page link itself;
  // leaf rows are just the link.
  import type { DocNode } from '../core/types'
  import { manualToc, tocTitle, type TocNode } from '../core/graph'
  import { sourceVars } from '../core/source'

  let {
    chapters,
    goto,
    degree,
    activeId = null
  }: {
    chapters: DocNode[]
    goto: (c: DocNode) => void
    degree: Map<string, number>
    activeId?: string | null
  } = $props()

  // Deep-reactive on purpose: the disclosure state lives ON the tree nodes
  // (TocNode.open), and a $derived of a plain builder returns unproxied
  // objects whose writes nothing would see. $state deep-proxies the
  // assignment, so toggle writes re-render their row and nothing else.
  let tree = $state<TocNode[]>([])

  function subtreeHas(n: TocNode, id: string): boolean {
    for (const c of n.children) {
      if (c.doc?.id === id || subtreeHas(c, id)) return true
    }
    return false
  }

  $effect(() => {
    const built = manualToc(chapters)
    // A branch whose subtree holds the open page starts opened: deep links
    // land visibly inside their section, not inside a closed directory.
    const id = activeId
    if (id != null) {
      const mark = (nodes: TocNode[]): boolean => {
        let hit = false
        for (const n of nodes) {
          if (n.doc?.id === id || mark(n.children)) {
            n.open = true
            hit = true
          }
        }
        return hit
      }
      mark(built)
    }
    tree = built
  })
</script>

{#snippet row(node: TocNode, depth: number)}
  {@const active = node.doc != null && activeId === node.doc.id}
  {#if node.children.length > 0}
    <!-- The header IS the <summary>: a closed <details> without one hides
         every child including the row itself (the bug the first build had).
         Group rows carry no link, so the whole summary toggles natively;
         doc branches nest the page's goto button inside the summary —
         activating a nested interactive element does not toggle the
         disclosure, so title = navigate, row/arrow = expand. -->
    <details class="toc-branch" bind:open={node.open} data-depth={depth}>
      <summary
        class="toc-row"
        style={node.doc ? sourceVars(node.doc.tags[0]) : ''}
        aria-label="{node.open ? 'Collapse ' : 'Expand '}{node.group ?? (node.doc ? ' ' + tocTitle(node.doc.title) : '')}"
      >
        <span class="tg dn-mono" aria-hidden="true">{node.open ? '▾' : '▸'}</span>
        {#if node.doc}
          <button class="toc-link" class:active onclick={() => goto(node.doc!)}>{tocTitle(node.doc.title)}</button>
        {:else}
          <span class="toc-group dn-label">{node.group}</span>
        {/if}
        <span class="toc-count dn-mono">{node.children.length}</span>
      </summary>
      <div class="toc-kids">
        {#each node.children as child (child.doc?.id ?? child.group)}
          {@render row(child, depth + 1)}
        {/each}
      </div>
    </details>
  {:else if node.doc}
    <div class="toc-row" style={sourceVars(node.doc.tags[0])} data-depth={depth}>
      <span class="toc-leaf-dot" aria-hidden="true"></span>
      <button class="toc-link" class:active onclick={() => goto(node.doc!)}>{tocTitle(node.doc.title)}</button>
      <span class="toc-count dn-mono" aria-label="{degree.get(node.doc.id) ?? 0} wires">{degree.get(node.doc.id) ?? 0}⌁</span>
    </div>
  {/if}
{/snippet}

<nav class="toc" aria-label="Table of contents">
  {#each tree as node (node.doc?.id ?? node.group)}
    {@render row(node, 0)}
  {:else}
    <p class="toc-empty dn-mono">no pages in this manual</p>
  {/each}
</nav>

<style>
  .toc {
    width: 100%;
  }
  .toc-empty {
    color: var(--dn-fg-faint);
    font-size: 0.72rem;
    padding: 1rem 0;
  }
  .toc-branch {
    margin: 0;
  }
  .toc-branch > .toc-kids {
    /* The left rule is the tree: it shows nesting depth at a glance and
       carries the source hue one level down. */
    margin-left: 0.85rem;
    padding-left: 0.55rem;
    border-left: 1px solid color-mix(in srgb, var(--dn-src, var(--dn-accent)) 38%, transparent);
  }
  .toc-row {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 40px; /* tap-target law */
    border-bottom: 1px solid var(--dn-border);
  }
  .toc-row[data-depth='0'] {
    border-bottom-color: var(--dn-border-strong);
  }
  summary.toc-row {
    cursor: pointer;
    list-style: none; /* the arrow glyph is ours, not the browser's */
  }
  summary.toc-row::-webkit-details-marker {
    display: none;
  }
  summary.toc-row:hover {
    background: color-mix(in srgb, var(--dn-src, var(--dn-accent)) 7%, transparent);
  }
  .tg {
    flex: 0 0 auto;
    width: 26px;
    display: grid;
    place-items: center;
    color: var(--dn-src, var(--dn-accent));
    font-size: 0.72rem;
  }
  .toc-group {
    flex: 1 1 auto;
    padding: 0.45rem 0.35rem;
    color: var(--dn-fg-muted);
    letter-spacing: 0.18em;
    font-size: 0.78rem;
  }
  .toc-leaf-dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin: 0 14px;
    border-radius: 50%;
    background: var(--dn-src, var(--dn-accent));
    opacity: 0.65;
  }
  .toc-link {
    flex: 1 1 auto;
    text-align: left;
    background: none;
    border: 0;
    padding: 0.45rem 0.35rem;
    min-height: 40px;
    color: var(--dn-fg);
    font-size: 0.9rem;
    line-height: 1.35;
    cursor: pointer;
  }
  .toc-link:hover {
    color: var(--dn-src, var(--dn-accent));
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .toc-link.active {
    color: var(--dn-src, var(--dn-accent));
    font-weight: 600;
  }
  .toc-count {
    flex: 0 0 auto;
    margin-right: 0.5rem;
    font-size: 0.62rem;
    color: var(--dn-fg-faint);
    letter-spacing: var(--dn-track);
  }

</style>
