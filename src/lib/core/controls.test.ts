// controls.test.ts — the persistence + predicate layer behind the canvas
// chrome (board TODO-001 S4/S5). Node env, stubbed localStorage (same shape
// trail.test.ts runs): the pref split is exactly the place a wrong key shows
// up as a desktop "open" answer booting the phone with the filter sheet up.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTROLS_OPEN_PREFIX,
  controlsOpenKey,
  loadControlsPref,
  spacingSectionVisible,
  writeControlsPref
} from './controls'

type LS = {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
}

const g = globalThis as Record<string, unknown>
let backing: Map<string, string>

beforeEach(() => {
  backing = new Map()
  g.localStorage = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => {
      backing.set(k, v)
    },
    removeItem: (k: string) => {
      backing.delete(k)
    }
  } satisfies LS
})

afterEach(() => {
  delete g.localStorage
})

describe('S4: controls-open pref is form-factor split', () => {
  it('writes desk and phone answers to DIFFERENT keys', () => {
    writeControlsPref(true, false)
    writeControlsPref(false, true)
    expect(backing.get(controlsOpenKey(false))).toBe('1')
    expect(backing.get(controlsOpenKey(true))).toBe('0')
    expect(controlsOpenKey(false)).toBe(`${CONTROLS_OPEN_PREFIX}desk`)
    expect(controlsOpenKey(true)).toBe(`${CONTROLS_OPEN_PREFIX}phone`)
  })

  it('a desktop "open" answer never reaches the phone (the S4 bug)', () => {
    // The old single key let this value cross form factors; the split must
    // keep the phone boot on ITS OWN key.
    writeControlsPref(true, false)
    expect(loadControlsPref(true)).toBeNull()
    expect(loadControlsPref(false)).toBe(true)
  })

  it('no stored answer reads as null so each form factor applies its default', () => {
    expect(loadControlsPref(false)).toBeNull()
    expect(loadControlsPref(true)).toBeNull()
  })

  it('junk values are ignored, like loadLock', () => {
    backing.set(controlsOpenKey(true), 'open')
    backing.set(controlsOpenKey(false), 'yes')
    expect(loadControlsPref(true)).toBeNull()
    expect(loadControlsPref(false)).toBeNull()
  })

  it('blocked storage degrades to the default (null), never throws', () => {
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {}
    } satisfies LS
    expect(loadControlsPref(true)).toBeNull()
    expect(() => writeControlsPref(true, true)).not.toThrow()
  })
})

describe('S5: the spacing section is spread-only', () => {
  it('visible in spread, hidden where spacing is inert', () => {
    expect(spacingSectionVisible('spread')).toBe(true)
    expect(spacingSectionVisible('cluster')).toBe(false)
    expect(spacingSectionVisible('lattice')).toBe(false)
  })
})
