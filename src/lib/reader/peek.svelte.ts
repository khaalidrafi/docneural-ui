// The hover-peek state machine — the restraint rules, in ONE place.
//
// A cross-reference is a promise ("explained there"), and every other docs
// reader makes you break your place to check it. Both surfaces that render
// corpus prose — DocReader (docs mode) and NotePreview (graph mode) — answer
// it with the same card (reader/LinkPeek.svelte) driven by the same machine
// below, so the two can never drift: hover a link in either surface and you
// get the identical delay, the identical card, the identical dismissal.
//
// The rules that keep the card out of your way, each a decision (see
// AI-REVIEW.org "=LinkPeek= — the hover card's restraint rules"):
//   - PEEK_HOVER_MS of hover-intent — a card that fires on the way past a
//     paragraph is noise.
//   - PEEK_PRESS_MS long-press on touch, because touch has no hover.
//   - the card itself is `pointer-events: none` (LinkPeek's stylesheet) — a
//     label, not a menu; it can never steal a click or trap a pointer.
//     Whether it should ever become clickable is the owner's open QUESTION;
//     no grace period is implemented here on purpose.
//   - the HOST closes it on scroll (the pinned box went stale) and on
//     chapter/selection change; repositioning per frame would cost a layout
//     read every scroll event.
//
// Deliberately NOT extracted (stays in the components): which element
// scrolls, and when a selection counts as "new" — each surface knows that.
import type { DocneuralStore } from '../core/store.svelte'
import type { Peek } from '../core/types'
import { parseDocHref } from '../core/href'

/** Hover-intent delay before the card opens. Measured shipped value: a card
 *  at 120 ms reads as a flicker, at 720 ms as a lag. */
export const PEEK_HOVER_MS = 300
/** Touch long-press before the card opens (touch has no hover to wait for). */
export const PEEK_PRESS_MS = 420

/** What a prose surface wires up to get the card. Feed `peek` to
 *  `<LinkPeek>`; attach the handlers to the prose container. */
export type PeekPointer = {
  /** The open card, if any — positions are viewport coordinates. */
  readonly peek: Peek | null
  /** Delegation pair, armed on pointerover/pointerout of the prose box. */
  onPeekMove: (e: PointerEvent) => void
  onPeekLeave: (e: PointerEvent) => void
  /** Touch: long-press intent (pointerdown/up/cancel on the prose box). */
  onPeekDown: (e: PointerEvent) => void
  onPeekUp: () => void
  /** Close now — on scroll, and whenever the chapter/selection changes. */
  closePeek: () => void
  /** Unmount teardown: clear both armed timers and drop the card. Without
   *  it, a pending 300/420 ms open at unmount fires one late loadContext
   *  warm and writes $state nobody will ever read (QA-1(d)). */
  destroy: () => void
}

/** Create the machine for one prose surface.
 *
 *  `store` and `fromId` are reactive getters — the store because the app
 *  shell derives it (`$derived(new DocneuralStore(…))`) and this machine
 *  must never hold a stale instance; the id because it is the card's `from`
 *  endpoint and the ctx file that gets warmed (store.selected?.id in both
 *  surfaces). */
export function createPeekPointer(
  store: () => DocneuralStore,
  fromId: () => string | undefined
): PeekPointer {
  let peek = $state<Peek | null>(null)
  let peekTimer: ReturnType<typeof setTimeout> | 0 = 0
  /** The link the hover timer is armed for — one at a time, so moving along
   *  a paragraph resets the delay instead of stacking cards. */
  let peekToEl: HTMLAnchorElement | null = null
  let pressTimer: ReturnType<typeof setTimeout> | 0 = 0

  function openPeek(a: HTMLAnchorElement): void {
    const from = fromId()
    if (!from) return
    const m = parseDocHref(a.getAttribute('href') ?? '')
    if (!m) return // an external link is its own destination; nothing to peek
    const s = store()
    const to = s.bySlug(m.slug)
    if (!to || to.id === from) return
    // The prose for a wire lives in either endpoint's file; ctxFor() checks
    // both, so ask for both (each is ~1.3 kB and de-duplicated by the store).
    s.loadContext(from)
    s.loadContext(to.id)
    const r = a.getBoundingClientRect()
    peek = { x: r.left, y: r.bottom, fromId: from, toId: to.id,
      degree: s.views.get(to.id)?.degree ?? 0 }
  }

  function onPeekMove(e: PointerEvent): void {
    const a = (e.target as HTMLElement).closest?.('a') as HTMLAnchorElement | null
    if (!a || a === peekToEl) return // already armed for this very link
    clearTimeout(peekTimer)
    peekToEl = a
    // Touch has no hover: a long-press is the same intent (see onPeekDown).
    if (e.pointerType !== 'mouse') return
    peekTimer = setTimeout(() => openPeek(a), PEEK_HOVER_MS)
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
    pressTimer = setTimeout(() => openPeek(a), PEEK_PRESS_MS)
  }

  function onPeekUp(): void {
    clearTimeout(pressTimer)
  }

  function closePeek(): void {
    // An armed open must not survive the close. A stationary pointer that
    // scroll-closed the card would otherwise re-open it the instant its
    // hover timer fires, and a long-press interrupted by a scroll would
    // open one late — both after the box the card was measured against has
    // already moved under the pointer.
    clearTimeout(peekTimer)
    clearTimeout(pressTimer)
    peekToEl = null
    peek = null
  }

  function destroy(): void {
    clearTimeout(peekTimer)
    clearTimeout(pressTimer)
    peekTimer = 0
    pressTimer = 0
    peekToEl = null
    peek = null
  }

  return {
    get peek() { return peek },
    onPeekMove,
    onPeekLeave,
    onPeekDown,
    onPeekUp,
    closePeek,
    destroy
  }
}
