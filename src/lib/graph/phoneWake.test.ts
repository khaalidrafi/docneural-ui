// Unit tests for the wake machine's arming contract (the audit's dead-engine
// defect, DocneuralGraph's plain-let `engine` read inside $effect bodies).
//
// The engine is a lazy chunk that lands AFTER first paint, so the wake
// listeners must attach the moment it arrives — the defect was that a plain
// variable's read registered no dependency: the component's wake $effect ran
// once at mount, saw no engine, and never ran again, and a parked phone
// canvas froze on pan/pinch after a layout toggle. The machine is driven here
// through the SAME seams the component wires — setWrap (the wrap element's
// use: action, which has run by first paint) and setEngine (onEngine, which
// fires when the lazy chunk lands) — so every test below is the component's
// actual call order. That the seams fire at those arrivals is structural
// (onEngine cannot fire before its chunk resolves); what is pinned here:
//
//   - arming happens EXACTLY ONCE when the engine arrives after first paint;
//   - a fired listener resumes the loop and clears the park mark;
//   - an engine replacement re-arms: the cleanup removes the old pair first,
//     so listeners can never stack and the live pair drives the NEW engine;
//   - teardown removes the listeners and resumes (unmount parity);
//   - resume() wakes a parked canvas and arms nothing;
//   - desktop never arms.
//
// (Why no $effect.root here: vitest compiles runes modules for the server,
// where effects are no-ops — the machine is effect-free precisely so this
// gate can run it in node.)
import { describe, expect, it, vi } from 'vitest'
import { createPhoneWake, type PhoneWake } from './phoneWake'
import type { Engine } from './neuronEngine'

const makeEngine = (): Engine =>
  ({ resumeAnimation: vi.fn(), pauseAnimation: vi.fn() }) as unknown as Engine

// A wrap element with just the listener/attribute surface the machine uses —
// node tests have no DOM (peek.test.ts fakes the same way).
function fakeWrap() {
  let added = 0
  let removed = 0
  const live = new Set<{ type: string; fn: () => void }>()
  const attrs = new Map<string, string>()
  const el = {
    addEventListener(type: string, fn: () => void): void {
      added++
      live.add({ type, fn })
    },
    removeEventListener(type: string, fn: () => void): void {
      removed++
      for (const l of live) {
        if (l.type === type && l.fn === fn) {
          live.delete(l)
          break
        }
      }
    },
    removeAttribute(name: string): void {
      attrs.delete(name)
    },
    setAttribute(name: string, value: string): void {
      attrs.set(name, value)
    }
  } as unknown as HTMLElement
  return {
    el,
    attrs,
    // Functions, not getters: the scenario spreads these, and a spread would
    // snapshot a getter's VALUE (added=0 forever) instead of reading it live.
    stats: (): { added: number; removed: number } => ({ added, removed }),
    count: (type: string): number => [...live].filter((l) => l.type === type).length,
    fire: (type: string): void => {
      for (const l of live) if (l.type === type) l.fn()
    }
  }
}

// The component's order, driven as the component drives it: the wrap mounts
// first (the use: action runs at element mount — by first paint), the engine
// lands later (onEngine, once the lazy chunk resolves).
function scenario(phone: () => boolean) {
  const f = fakeWrap()
  const wake: PhoneWake = createPhoneWake(phone)
  wake.setWrap(f.el) // the action's mount side; the engine has NOT landed yet
  return {
    arrive: (e: Engine): Engine => {
      wake.setEngine(e) // onEngine: the chunk landed, after first paint
      return e
    },
    repeat: (e: Engine): void => wake.setEngine(e), // a duplicate sighting
    resume: (): void => wake.resume(),
    destroy: (): void => wake.destroy(),
    unbind: (): void => wake.setWrap(undefined), // the action's destroy side
    ...f
  }
}
describe('phone wake machine', () => {
  it('arms the wake listeners exactly once when the engine arrives after first paint', () => {
    const s = scenario(() => true)
    expect(s.stats().added).toBe(0) // wrap mounted, engine still lazy: nothing armed
    const eng = s.arrive(makeEngine())
    // pointerdown + wheel, one pair, no more.
    expect(s.stats().added).toBe(2)
    expect(s.count('pointerdown')).toBe(1)
    expect(s.count('wheel')).toBe(1)
    // A duplicate engine sighting (the seam is once-per-instance, but the
    // contract must not depend on that) never stacks a second pair.
    s.repeat(eng)
    expect(s.stats().added).toBe(2)
    // And the pair is live: a touch resumes the loop and clears the park mark.
    s.attrs.set('data-paused', '1')
    s.fire('pointerdown')
    expect(eng.resumeAnimation).toHaveBeenCalled()
    expect(s.attrs.has('data-paused')).toBe(false)
    s.destroy()
  })

  it('an engine replacement re-arms: cleanup removes the old pair first, the live pair drives the new engine', () => {
    const s = scenario(() => true)
    const first = s.arrive(makeEngine())
    const second = s.arrive(makeEngine())
    expect(s.stats().added).toBe(4) // two attach runs, never a stacked third
    expect(s.stats().removed).toBe(2) // the first run's pair came off
    expect(s.count('pointerdown')).toBe(1)
    expect(s.count('wheel')).toBe(1)
    expect(first.resumeAnimation).toHaveBeenCalled() // teardown resumed the OLD engine
    s.fire('wheel')
    expect(second.resumeAnimation).toHaveBeenCalled() // the live pair drives the NEW one
    s.destroy()
  })

  it('teardown removes the listeners and resumes: unmount parity, by destroy or by the element leaving', () => {
    const s = scenario(() => true)
    const eng = s.arrive(makeEngine())
    s.attrs.set('data-paused', '1')
    s.destroy()
    expect(s.count('pointerdown')).toBe(0)
    expect(s.count('wheel')).toBe(0)
    expect(eng.resumeAnimation).toHaveBeenCalled()
    expect(s.attrs.has('data-paused')).toBe(false)
    // The other unmount door — the wrap element's action destroy — lands in
    // the same place: disarmed, resumed, and nothing left to stack later.
    const eng2 = s.arrive(makeEngine())
    expect(s.stats().added).toBe(4) // two arrivals, two attach runs
    s.unbind()
    expect(s.count('pointerdown')).toBe(0)
    expect(s.count('wheel')).toBe(0)
    expect(eng2.resumeAnimation).toHaveBeenCalled()
    s.destroy() // nothing armed: a no-op, not a crash
  })

  it('resume() wakes a parked canvas and arms nothing, and is a no-op before the engine arrives', () => {
    const s = scenario(() => true)
    s.resume() // no engine yet: dispatch on nothing, not a crash
    expect(s.stats().added).toBe(0)
    const eng = s.arrive(makeEngine())
    s.attrs.set('data-paused', '1')
    s.resume()
    expect(eng.resumeAnimation).toHaveBeenCalled()
    expect(s.attrs.has('data-paused')).toBe(false)
    expect(s.stats().added).toBe(2) // resume armed nothing new
    s.destroy()
  })

  it('never arms off a phone: the breakpoint question stays the caller’s', () => {
    const s = scenario(() => false)
    s.arrive(makeEngine())
    expect(s.stats().added).toBe(0)
    s.resume() // same answer on the manual resume path
    s.destroy()
    expect(s.stats().removed).toBe(0)
  })
})
