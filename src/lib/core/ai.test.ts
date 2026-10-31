import { describe, expect, it } from 'vitest'
import { askScore, rankContext, buildMessages, loadAiConfig, AI_DEFAULTS, EXTRACT_BUDGET } from './ai'
import type { DocNode } from './types'

const doc = (id: string, title: string, tags: string[] = ['emacs']): DocNode => ({
  id,
  slug: id,
  title,
  tags
})

describe('askScore / rankContext', () => {
  it('puts title hits above mere hubs', () => {
    const words = ['agenda']
    const named = askScore(doc('a', 'Agenda Views'), words, 0)
    const hub = askScore(doc('b', 'Key Index'), words, 400)
    expect(named).toBeGreaterThan(hub)
  })

  it('ranks: title matches first, degree fills the rest, dedupe by id, capped', () => {
    const pool = [
      doc('1', 'Agenda Views'),
      doc('2', 'Agenda Commands'),
      doc('3', 'Key Index'), // huge degree, no word hit
      doc('4', 'Agenda Files'),
      doc('5', 'Mark Ring'),
      doc('6', 'Agenda Dispatcher'),
      doc('7', 'Agenda Data'), // 7th hit — beyond the cap
      doc('8', 'Completely Unrelated')
    ]
    const degreeOf = (id: string) => (id === '3' ? 400 : 2)
    const picks = rankContext('agenda buffers', pool, [pool[2]], degreeOf, 6)
    expect(picks.length).toBe(6)
    expect(picks.map((n) => n.id)).not.toContain('8') // no word hit, no degree
    expect(picks[0].id).toBe('3') // explicit title hit rides first
    expect(picks.slice(1).map((n) => n.id)).toEqual(['1', '2', '4', '6', '7'])
  })

  it('returns nothing when the query shares no words with the corpus', () => {
    const pool = [doc('1', 'Agenda Views'), doc('2', 'Mark Ring')]
    expect(rankContext('zzz qqq', pool, [], () => 1, 6)).toEqual([])
  })
})

describe('buildMessages', () => {
  it('pins the model to the extracts and marks the refusal path', () => {
    const msgs = buildMessages('how do I fold?', [
      { title: 'Folding', slug: 'emacs--Folding', text: 'Folding hides…' }
    ])
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('ONLY')
    expect(msgs[0].content).toContain('never guess')
    expect(msgs[1].content).toContain('<extract title="Folding" slug="emacs--Folding">')
    expect(msgs[1].content).toContain('Question: how do I fold?')
  })

  it('budgets extracts at a size every model can swallow', () => {
    expect(EXTRACT_BUDGET).toBeLessThanOrEqual(8000)
  })
})

describe('loadAiConfig', () => {
  it('falls back to defaults outside a browser (SSR/tests)', () => {
    // jsdom-less import path: no localStorage — must not throw
    expect(AI_DEFAULTS.model.length).toBeGreaterThan(0)
    expect(loadAiConfig().url).toContain('http')
  })
})
