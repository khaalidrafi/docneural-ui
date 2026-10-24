// The wake side of the phone settle-park — the unparking half of the parked
// canvas machine.
//
// The park (DocneuralGraph's stop handler) stops force-graph's render loop
// after each settle: on a 4 GB phone a parked canvas is repaints-for-nobody.
// This module owns the WAKE: touch or wheel on the dish resumes the loop for
// as long as the interaction lasts, a data change resumes it (the snapshot
// effect calls resume()), and unmount resumes it too, so a mode switch never
// leaves the next mount staring at a frozen frame of the previous one.
//
// Why explicit seams instead of an $effect watching component state: the two
// arrivals that matter — the wrap element mounting and the lazy 174 kB engine
// chunk landing AFTER first paint — are exactly what the audit's dead-read
// defect turned into "never" (a plain `let engine` read inside an $effect
// registers no dependency in Svelte 5, so the effect ran once at mount, saw
// no engine, and never ran again: the listeners never attached and a parked
// phone froze on pan/pinch). The machine therefore takes both through the
// construction seams the component already has — onEngine (the same door the
// co-cite painter arms through, 89af16b) and the element's own use: action —
// which fire at the arrivals themselves. A side effect of staying effect-free:
// the arming contract below is pinned by node tests (phoneWake.test.ts) —
// vitest compiles runes modules for the server, where effects are no-ops, so
// an $effect-based machine cannot be tested in this repo's node gate at all.
//
// Deliberately NOT here: the park itself (the stop handler). It needs the fit
// bookkeeping around applyLayout, which lives with the layout effect.
import type { Engine } from './neuronEngine'

export type PhoneWake = {
  /** The engine arrived (onEngine — once per engine instance, after first
   *  paint). Arms the listeners the moment BOTH the engine and the wrap
   *  exist; a repeat call with the SAME instance costs nothing. */
  setEngine: (engine: Engine | null) => void
  /** The wrap element mounted (its use: action) or left (the action's
   *  destroy). Same arming rule as setEngine. */
  setWrap: (wrap: HTMLElement | undefined) => void
  /** Resume the loop now, parked or not: the snapshot effect runs this when
   *  it hands the canvas new data, so a filter keystroke never leaves a
   *  parked canvas on a stale frame. Reads the machine's own handle — never
   *  a reason for the caller's effect to re-run. */
  resume: () => void
  /** Unmount teardown: listeners off, engine resumed. */
  destroy: () => void
}

/** Create the wake machine for one canvas. `phone` is the caller's breakpoint
 *  question (isPhoneViewport), kept the caller's on purpose — it is asked
 *  when arming and when waking, never stored. */
export function createPhoneWake(phone: () => boolean): PhoneWake {
  let engine: Engine | null = null
  let wrap: HTMLElement | undefined = undefined
  /** This run's listener teardown, while a pair is armed. Re-arming always
   *  goes through it first, so listeners can never stack. */
  let disarm: (() => void) | null = null

  const wakeInto = (eng: Engine, el: HTMLElement): void => {
    try {
      eng.resumeAnimation()
      el.removeAttribute('data-paused')
    } catch {
      /* an engine without the knob was never parked, so there is nothing to wake */
    }
  }

  // Arm the listeners for the CURRENT pair — cleanup-first, so an engine
  // replacement or a wrap rebind removes the old pair before the new one
  // goes on. Guards on the seams make repeats idempotent: the same engine
  // or the same element arriving twice arms exactly once.
  const rearm = (): void => {
    if (disarm) {
      disarm()
      disarm = null
    }
    if (!engine || !wrap || !phone()) return
    const eng = engine
    const el = wrap
    const wake = (): void => wakeInto(eng, el)
    el.addEventListener('pointerdown', wake, { passive: true })
    el.addEventListener('wheel', wake, { passive: true })
    disarm = () => {
      el.removeEventListener('pointerdown', wake)
      el.removeEventListener('wheel', wake)
      el.removeAttribute('data-paused')
      try {
        eng.resumeAnimation()
      } catch {
        /* ignore */
      }
    }
  }

  return {
    setEngine: (e) => {
      if (e === engine) return
      engine = e
      rearm()
    },
    setWrap: (w) => {
      if (w === wrap) return
      wrap = w
      rearm()
    },
    resume: () => {
      if (engine && wrap && phone()) wakeInto(engine, wrap)
    },
    destroy: () => {
      if (disarm) {
        disarm()
        disarm = null
      }
    }
  }
}
