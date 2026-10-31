import { describe, expect, it } from 'vitest'
import {
  askScore,
  rankContext,
  buildMessages,
  buildEssenceMessages,
  buildQuizMessages,
  endpointHeaders,
  sanitizeAnswer,
  parseFollowUps,
  loadAiConfig,
  AI_DEFAULTS,
  EXTRACT_BUDGET
} from './ai'
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
  it('pins the model to the extracts, marks the refusal path, asks for follow-ups', () => {
    const msgs = buildMessages('how do I fold?', [
      { title: 'Folding', slug: 'emacs--Folding', text: 'Folding hides…' }
    ])
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('ONLY')
    expect(msgs[0].content).toContain('never guess')
    expect(msgs[0].content).toContain('FOLLOW-UPS:')
    expect(msgs[0].content).toContain('3')
    expect(msgs[0].content).toContain(' | ')
    expect(msgs[1].content).toContain('<extract title="Folding" slug="emacs--Folding">')
    expect(msgs[1].content).toContain('Question: how do I fold?')
  })

  it('budgets extracts at a size every model can swallow', () => {
    expect(EXTRACT_BUDGET).toBeLessThanOrEqual(8000)
  })
})

describe('endpointHeaders', () => {
  it('never sends an authorization header when the key is empty', () => {
    const headers = endpointHeaders({ ...AI_DEFAULTS, key: '' })
    expect(headers['content-type']).toBe('application/json')
    expect(headers).not.toHaveProperty('authorization')
  })

  it('sends a Bearer token only for a non-empty key, trimmed', () => {
    const headers = endpointHeaders({ url: AI_DEFAULTS.url, key: '  sk-live-1  ', model: 'm' })
    expect(headers['content-type']).toBe('application/json')
    expect(headers.authorization).toBe('Bearer sk-live-1')
  })
})

describe('sanitizeAnswer', () => {
  it('passes text without a think block through unchanged', () => {
    const t = 'The agenda dispatcher collects commands.'
    expect(sanitizeAnswer(t)).toBe(t)
  })

  it('strips one leading think block and trims what follows', () => {
    const out = sanitizeAnswer('<think>reasoning about org-mode…\nmore thinking</think>\n\nThe answer.')
    expect(out).toBe('The answer.')
  })

  it('matches the block case-insensitively across many lines', () => {
    const out = sanitizeAnswer('<THINK>\nline\nline\nline\n</THINK>Answer body')
    expect(out).toBe('Answer body')
  })

  it('strips only a LEADING block — a later block is content', () => {
    const t = 'Answer first. <think>inline aside</think> done'
    expect(sanitizeAnswer(t)).toBe('Answer first. <think>inline aside</think> done')
  })
})

describe('parseFollowUps', () => {
  it('answers without a marker keep their trimmed text and no follow-ups', () => {
    const out = parseFollowUps('  Use C-c C-s to schedule.  ')
    expect(out).toEqual({ answer: 'Use C-c C-s to schedule.', followUps: [] })
  })

  it('parses 3 pipe-separated follow-ups and removes the marker line', () => {
    const out = parseFollowUps('Answers live in the agenda.\nFOLLOW-UPS: How to filter? | How to export? | What is a TODO?')
    expect(out.answer).toBe('Answers live in the agenda.')
    expect(out.followUps).toEqual(['How to filter?', 'How to export?', 'What is a TODO?'])
  })

  it('caps the list at 3 even when the model offers more', () => {
    const out = parseFollowUps('Body.\nFOLLOW-UPS: aaaa | bbbb | cccc | dddd | eeee')
    expect(out.followUps).toEqual(['aaaa', 'bbbb', 'cccc'])
  })

  it('drops items shorter than 4 or longer than 90 chars', () => {
    const ok = 'x'.repeat(90)
    const tooLong = 'x'.repeat(91)
    const out = parseFollowUps(`Body.\nFOLLOW-UPS: ab | ${ok} | ${tooLong} | valid question`)
    expect(out.followUps).toEqual([ok, 'valid question'])
  })

  it('dedupes case-insensitively, keeping the first spelling', () => {
    const out = parseFollowUps('Body.\nFOLLOW-UPS: What is Org? | what is org? | How does it work?')
    expect(out.followUps).toEqual(['What is Org?', 'How does it work?'])
  })

  it('only honors a TRAILING marker line — mid-answer prose stays prose', () => {
    const t = 'FOLLOW-UPS: fake | marker | here\nThen the real answer continues.'
    const out = parseFollowUps(t)
    expect(out.answer).toBe(t)
    expect(out.followUps).toEqual([])
  })
})

describe('buildEssenceMessages', () => {
  it('asks for a TL;DR, a KEY POINTS line and 3 grounded bullets', () => {
    const msgs = buildEssenceMessages('Agenda Views', 'The agenda dispatcher…')
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('KEY POINTS')
    expect(msgs[0].content).toContain('ONLY')
    expect(msgs[0].content).toContain('never guess')
    expect(msgs[0].content).toContain('TL;DR')
    expect(msgs[1].content).toContain('Page: Agenda Views')
    expect(msgs[1].content).toContain('The agenda dispatcher…')
  })
})

describe('buildQuizMessages', () => {
  it('asks for Q1/Q2/Q3, an ANSWERS line and short grounded answers', () => {
    const msgs = buildQuizMessages('Agenda Views', 'The agenda dispatcher…')
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('Q1.')
    expect(msgs[0].content).toContain('ANSWERS')
    expect(msgs[0].content).toContain('A1.')
    expect(msgs[0].content).toContain('ONLY')
    expect(msgs[0].content).toContain('never guess')
    expect(msgs[1].content).toContain('Page: Agenda Views')
    expect(msgs[1].content).toContain('The agenda dispatcher…')
  })
})

describe('AI_DEFAULTS', () => {
  it('ships the free public brain: no key, anonymous model, pollinations path', () => {
    expect(AI_DEFAULTS.url).toBe('https://text.pollinations.ai/openai')
    expect(AI_DEFAULTS.key).toBe('')
    expect(AI_DEFAULTS.model).toBe('openai')
  })
})

describe('loadAiConfig', () => {
  it('falls back to defaults outside a browser (SSR/tests)', () => {
    // jsdom-less import path: no localStorage — must not throw
    expect(AI_DEFAULTS.model.length).toBeGreaterThan(0)
    expect(loadAiConfig().url).toContain('http')
  })
})
