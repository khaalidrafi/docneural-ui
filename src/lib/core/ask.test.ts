// ask.ts unit tests: the prompt shape is the product, so it is tested
// like one — grounded-only rules, the page, the corpus index, the
// question — while the network call stays a thin untested fetch.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k)
})

const { askReady, composeAskPrompt, loadAskSettings, saveAskSettings } = await import('./ask')

beforeEach(() => store.clear())

describe('composeAskPrompt', () => {
  const ctx = {
    docTitle: 'The Synapse Model',
    docText: 'A synapse is a citation between chapters.',
    query: 'what is a synapse?',
    rawOrgUrl: 'https://x/docs/demo--Synapses.org',
    corpus: 'demo--Synapses — The Synapse Model'
  }
  it('carries the grounding rules', () => {
    const p = composeAskPrompt({ ...ctx, docText: '', corpus: '' })
    expect(p).toMatch(/grounded ONLY in the\s+context/)
    expect(p).toContain('§ <heading>')
    expect(p).toContain('say so plainly')
  })
  it('includes the page, its raw URL and the question', () => {
    const p = composeAskPrompt(ctx)
    expect(p).toContain('## Page: The Synapse Model')
    expect(p).toContain('https://x/docs/demo--Synapses.org')
    expect(p).toContain('A synapse is a citation between chapters.')
    expect(p).toContain('## Question: what is a synapse?')
  })
  it('omits the page block when there is no page', () => {
    const p = composeAskPrompt({ ...ctx, docTitle: '', docText: '', rawOrgUrl: undefined })
    expect(p).not.toContain('## Page:')
    expect(p).toContain('## Question:')
  })
  it('caps a huge page and the index rather than sending all of it', () => {
    const p = composeAskPrompt({ ...ctx, docText: 'x'.repeat(50_000), corpus: 'y'.repeat(50_000) })
    expect(p.length).toBeLessThan(30_000)
    expect(p).toContain('## Question:')
  })
})

describe('ask settings', () => {
  it('round-trips through storage', () => {
    saveAskSettings({ baseUrl: 'http://localhost:11434/v1', model: 'llama3', key: '' })
    expect(loadAskSettings()).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
      key: ''
    })
  })
  it('counts a local endpoint as ready with no key', () => {
    expect(askReady({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', key: '' })).toBe(true)
    expect(askReady({ baseUrl: '', model: 'm', key: '' })).toBe(false)
    expect(askReady({ baseUrl: '', model: 'm', key: 'sk-test' })).toBe(true)
  })
  it('survives a corrupt blob', () => {
    store.set('docneural:ask-settings', 'not json')
    expect(loadAskSettings()).toEqual({ baseUrl: '', model: 'gpt-4o-mini', key: '' })
  })
})
