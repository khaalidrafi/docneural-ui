// Tests for core/source.ts — the contract that a documentation SOURCE (Org,
// GNU Emacs, ...) has one name and one colour, and that the colour is the
// colour the graph canvas paints its nodes with.
//
// The parity test is the point of this file. Nothing visually checks it: if
// our hash or our palette indexing drifts from orui's, a source's chip and its
// neurons silently disagree and the "one identity per source" idea is gone.
import { describe, expect, it } from 'vitest'
// The real canvas colouring, imported through the orui/* alias (see
// vite.config.ts) so the assertion compares against the actual implementation
// rather than a copy that could rot.
import { canvasTokens, hashString as oruiHash, nodeColor } from 'orui/graph/colors'
import { graphPalette, hashString, sourceColor, sourceTitle, sourceVars } from './source'

describe('sourceTitle', () => {
  it('uses real project names', () => {
    expect(sourceTitle('org')).toBe('Org')
    expect(sourceTitle('emacs')).toBe('GNU Emacs')
    expect(sourceTitle('guix')).toBe('GNU Guix')
    expect(sourceTitle('org-roam')).toBe('Org Roam')
  })

  it('humanizes an unnamed corpus instead of echoing the tag', () => {
    expect(sourceTitle('std_docs')).toBe('Std Docs')
    expect(sourceTitle('kubernetes')).toBe('Kubernetes')
    expect(sourceTitle('')).toBe('')
    expect(sourceTitle(undefined)).toBe('')
  })
})

describe('sourceColor vs the canvas', () => {
  it('is null with no DOM to read a palette from (headless node)', () => {
    expect(sourceColor('org')).toBeNull()
    expect(sourceVars('org')).toBe('')
    expect(graphPalette()).toEqual([])
  })

  it('gives a source exactly the colour GraphView paints its nodes with', () => {
    // A theme in the browser: --sy-graph-palette resolves to a literal list,
    // which is what both the canvas (canvasTokens) and the DOM read.
    const palette = ['#00e5ff', '#ff2d95', '#ffd60a', '#7c5cff', '#00ff9d', '#ff6b35', '#4cc9f0', '#f72585']
    const getComputedStyle = (el: unknown) => ({
      getPropertyValue: (name: string) =>
        name === '--sy-graph-palette'
          ? palette.join(', ')
          : name === '--orui-link-color'
            ? 'rgba(0,229,255,.3)'
            : ''
    })
    // graphPalette() memoizes for 500 ms (mirrors GraphView's token poll), so
    // one stub serves the whole test — and the previous case already proved
    // the cache is empty before this point.
    ;(globalThis as Record<string, unknown>).document = {
      documentElement: {}
    }
    ;(globalThis as Record<string, unknown>).getComputedStyle = getComputedStyle

    expect(graphPalette()).toEqual(palette)

    // Every tag that a corpus could plausibly use: the DOM lookup and orui's
    // canvas lookup must land on the same entry, always.
    for (const tag of ['org', 'emacs', 'guix', 'python', 'rust', 'nix', 'zzz-unnamed']) {
      const tokens = canvasTokens(() => '')
      tokens.palette = palette
      expect(sourceColor(tag)).toBe(nodeColor({ title: 'whatever', tags: [tag] }, tokens))
    }
  })

  it('hashes identically to orui (the parity tripwire)', () => {
    for (const s of ['org', 'emacs', 'guix', 'a', '', 'long-corpus-name-9']) {
      expect(hashString(s)).toBe(oruiHash(s))
    }
  })

  it('sourceVars emits the inline custom property components read', () => {
    expect(sourceVars('org')).toBe(`--sy-src:${sourceColor('org')}`)
  })
})
