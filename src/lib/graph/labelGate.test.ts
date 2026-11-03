// labelGate.test.ts — the painter's label-eligibility rules as a value
// (board TODO-001 S3). The pitch gate exists to keep a phone lattice a clean
// starfield; the bug the board caught is that it also erased the ONE name the
// visitor chose. These tests pin the override and the band rules it must not
// disturb. Node env — the gate is pure, the canvas stays out of it.
import { describe, expect, it } from 'vitest'
import { labelEligible } from './neuronEngine'

// A phone lattice at fit: pitch ≈ 17px world, zoom ≈ 1 → 17px on screen,
// under the 18px gate. Every non-chosen label must stay hidden here.
const PHONE_LATTICE_FIT = {
  chosen: false,
  hot: false,
  degree: 0,
  zoom: 0.93,
  pitchPx: 17,
  lattice: true,
  latFit: true,
  spread: false,
  band: 2
}

describe('S3: the selected neuron is always eligible', () => {
  it('draws through the phone lattice pitch gate that hides everyone else', () => {
    expect(labelEligible(PHONE_LATTICE_FIT)).toBe(false)
    expect(labelEligible({ ...PHONE_LATTICE_FIT, chosen: true })).toBe(true)
  })

  it('draws in every layout and at every zoom, even at degree 0', () => {
    const base = { ...PHONE_LATTICE_FIT, latFit: false, zoom: 0.4, band: 0, pitchPx: 24 }
    expect(labelEligible({ ...base, chosen: true, lattice: true })).toBe(true)
    expect(labelEligible({ ...base, chosen: true, lattice: false, spread: true })).toBe(true)
    expect(labelEligible({ ...base, chosen: true, lattice: false, spread: false })).toBe(true)
  })

  it('still respects the claim-grid path: eligibility is the gate, not ink', () => {
    // The override is about ELIGIBILITY; nothing here promises the label
    // survives an overlap drop — that is the painter's separate rule.
    expect(labelEligible({ ...PHONE_LATTICE_FIT, chosen: true, hot: true })).toBe(true)
  })
})

describe('the pitch gate still guards every other label', () => {
  it('hides a low-degree label when pitch·zoom < 18 on the lattice', () => {
    expect(labelEligible(PHONE_LATTICE_FIT)).toBe(false)
  })

  it('passes when the pitch is unknown (<= 0), as before', () => {
    expect(labelEligible({ ...PHONE_LATTICE_FIT, pitchPx: 0 })).toBe(false) // latFit, deg 0
    expect(labelEligible({ ...PHONE_LATTICE_FIT, pitchPx: 0, degree: 60 })).toBe(true)
  })

  it('opens up as the visitor zooms (pitch·zoom >= 18)', () => {
    const zoomed = { ...PHONE_LATTICE_FIT, zoom: 1.2 } // 17 * 1.2 = 20.4px
    expect(labelEligible(zoomed)).toBe(false) // latFit tier still caps at hubs
    expect(labelEligible({ ...zoomed, latFit: false, degree: 40 })).toBe(true)
    expect(labelEligible({ ...zoomed, latFit: false, degree: 0 })).toBe(false)
  })
})

describe('the desktop band rules are unchanged', () => {
  const desk = {
    chosen: false,
    hot: false,
    degree: 0,
    zoom: 1,
    pitchPx: 0,
    lattice: false,
    latFit: false
  }

  it('spread: hubs at corpus zoom, everyone once the field is readable', () => {
    expect(labelEligible({ ...desk, spread: true, band: 0, degree: 10 })).toBe(false)
    expect(labelEligible({ ...desk, spread: true, band: 0, degree: 60 })).toBe(true)
    expect(labelEligible({ ...desk, spread: true, band: 1, degree: 1 })).toBe(true)
  })

  it('cluster: hub tiers at bands 0/1, everything at detail zoom', () => {
    expect(labelEligible({ ...desk, spread: false, band: 0, degree: 59 })).toBe(false)
    expect(labelEligible({ ...desk, spread: false, band: 1, degree: 19 })).toBe(false)
    expect(labelEligible({ ...desk, spread: false, band: 1, degree: 19, hot: true })).toBe(true)
    expect(labelEligible({ ...desk, spread: false, band: 2, zoom: 1.2, degree: 0 })).toBe(true)
    expect(labelEligible({ ...desk, spread: false, band: 2, zoom: 1.0, degree: 59 })).toBe(false)
  })
})
