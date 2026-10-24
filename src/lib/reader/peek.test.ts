// Unit tests for the peek pointer machine's teardown contract (QA-1(d)).
//
// The card opens on an ARMED timer (300 ms hover-intent, 420 ms touch
// long-press), so the machine owns timers that can outlive the intent that
// armed them. Two rules are pinned here:
//   1. closePeek() disarms both timers — a stationary pointer that
//      scroll-closed the card must not re-open it when its hover timer fires,
//      and a long-press interrupted by a scroll must not open one late;
//   2. destroy() does the same and drops any open card — so a pending timer
//      at unmount can never fire its late loadContext warm + dead $state
//      write (the defect QA-1(d) flagged in both consumers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeekPointer, PEEK_HOVER_MS, PEEK_PRESS_MS } from './peek.svelte'
import { DocneuralStore } from '../core/store.svelte'
import type { DocNode, GraphData } from '../core/types'

function node(p: Partial<DocNode> & { id: string }): DocNode {
  return { slug: p.id, title: p.id, tags: [], ...p }
}

function fixture(): GraphData {
  return {
    nodes: [node({ id: 'a', title: 'Alpha' }), node({ id: 'b', title: 'Beta' })],
    links: [{ source: 'a', target: 'b' }]
  }
}

function makeStore(): DocneuralStore {
  const s = new DocneuralStore()
  s.data = fixture()
  // openPeek warms both endpoints' prose; stub it so the tests stay hermetic
  // AND so the "no late warm" assertion is exact.
  ;(s as unknown as { loadContext: unknown }).loadContext = vi.fn()
  return s
}

const anchor = (href: string): HTMLAnchorElement =>
  ({
    getAttribute: (n: string) => (n === 'href' ? href : null),
    getBoundingClientRect: () => ({ left: 8, right: 60, top: 8, bottom: 24 }) as DOMRect
  }) as unknown as HTMLAnchorElement

const hover = (a: HTMLAnchorElement): PointerEvent =>
  ({ target: { closest: () => a }, pointerType: 'mouse' }) as unknown as PointerEvent

const touch = (a: HTMLAnchorElement): PointerEvent =>
  ({ target: { closest: () => a }, pointerType: 'touch' }) as unknown as PointerEvent

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('peek pointer teardown', () => {
  it('hover intent opens the card (the baseline the teardown tests guard)', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekMove(hover(anchor('docs/b.html')))
    vi.advanceTimersByTime(PEEK_HOVER_MS)
    expect(pk.peek?.toId).toBe('b')
  })

  it('destroy() clears a pending hover timer: no card, no late ctx warm', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekMove(hover(anchor('docs/b.html')))
    pk.destroy()
    vi.advanceTimersByTime(PEEK_HOVER_MS * 2)
    expect(pk.peek).toBeNull()
    expect(vi.mocked(store.loadContext as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('closePeek() clears the pending hover timer (scroll-close cannot re-open)', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekMove(hover(anchor('docs/b.html')))
    pk.closePeek()
    vi.advanceTimersByTime(PEEK_HOVER_MS * 2)
    expect(pk.peek).toBeNull()
  })

  it('destroy() clears a pending long-press too', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekDown(touch(anchor('docs/b.html')))
    pk.destroy()
    vi.advanceTimersByTime(PEEK_PRESS_MS * 2)
    expect(pk.peek).toBeNull()
  })

  it('closePeek() clears a pending long-press (interrupted press opens nothing)', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekDown(touch(anchor('docs/b.html')))
    pk.closePeek()
    vi.advanceTimersByTime(PEEK_PRESS_MS * 2)
    expect(pk.peek).toBeNull()
  })

  it('destroy() drops an OPEN card as well as armed timers', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekMove(hover(anchor('docs/b.html')))
    vi.advanceTimersByTime(PEEK_HOVER_MS)
    expect(pk.peek).not.toBeNull()
    pk.destroy()
    expect(pk.peek).toBeNull()
  })

  it('after destroy() the machine still arms fresh intents (teardown is not a lockout)', () => {
    const store = makeStore()
    const pk = createPeekPointer(() => store, () => 'a')
    pk.onPeekMove(hover(anchor('docs/b.html')))
    pk.destroy()
    pk.onPeekMove(hover(anchor('docs/b.html')))
    vi.advanceTimersByTime(PEEK_HOVER_MS)
    expect(pk.peek?.toId).toBe('b')
  })
})
