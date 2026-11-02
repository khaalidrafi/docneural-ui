// Unit tests for the presence core (SPEC 4, workstream C3): snapshot
// parsing with mocked fetch, age math, the node grouping the field reads,
// the phone/lite gate (ZERO background loops on phone), the swallowed-error
// beacon, and the reactive store's ask halo. Node environment — the fetch
// fake is a plain function, no jsdom.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actionVerb,
  ageLabel,
  agentsByNode,
  beacon,
  liveCount,
  PULSE_INTERVAL_MS,
  parseSnapshot,
  shouldPoll,
  type PulseEntry
} from './pulse'
import { ASK_AGENT, PulseStore } from './pulse.svelte'

const NOW = 1_700_000_000_000

describe('parseSnapshot', () => {
  it('parses rows, converting millisecond age to whole seconds', () => {
    const snap = parseSnapshot(
      {
        updated: NOW,
        total: 2,
        agents: [
          { agent: 'org-docs-cli', kind: 'cli', nodes: ['org--Introduction'], action: 'read', age: 65_432 },
          { agent: 'ask-the-corpus', kind: 'assistant', nodes: ['emacs--Killing'], action: 'ask', age: 500 }
        ]
      },
      NOW
    )
    expect(snap.total).toBe(2)
    expect(snap.updated).toBe(NOW)
    expect(snap.agents.map((a) => a.age)).toEqual([0, 65]) // ms -> s, floor
  })

  it('accepts raw epoch `t` rows and computes the age from now', () => {
    const snap = parseSnapshot(
      { agents: [{ agent: 'mcp', kind: 'mcp', nodes: [], action: 'read', t: NOW - 120_000 }] },
      NOW
    )
    expect(snap.agents[0].age).toBe(120)
  })

  it('sorts newest first and caps at 50', () => {
    const agents = Array.from({ length: 60 }, (_, i) => ({
      agent: `a${i}`,
      kind: 'agent',
      nodes: [],
      action: 'read',
      age: i * 1_000
    }))
    const snap = parseSnapshot({ agents }, NOW)
    expect(snap.agents.length).toBe(50)
    expect(snap.agents[0].age).toBe(0)
  })

  it('drops junk rows instead of throwing (one torn write never sinks a snapshot)', () => {
    const snap = parseSnapshot(
      {
        agents: [
          null,
          'nope',
          { agent: '', kind: 'cli', nodes: [], action: 'read' },
          { agent: 'ok-but-kind', kind: 'bogus', nodes: [], action: 'read' },
          { agent: 'ok-but-action', kind: 'cli', nodes: [], action: 'steal' },
          { agent: 'ok-but-nodes', kind: 'cli', nodes: 'everything', action: 'read' },
          { agent: 'fine', kind: 'cli', nodes: ['a', 3, 'b'], action: 'read', age: 0 }
        ]
      },
      NOW
    )
    expect(snap.agents.map((a) => a.agent)).toEqual(['fine'])
    expect(snap.agents[0].nodes).toEqual(['a', 'b'])
  })

  it('accepts the teach action (an agent taught the node) and still rejects unknowns', () => {
    const snap = parseSnapshot(
      { agents: [{ agent: 'tutor-agent', kind: 'agent', nodes: ['emacs--Basic'], action: 'teach', age: 0 }] },
      NOW
    )
    expect(snap.agents.length).toBe(1)
    expect(snap.agents[0].action).toBe('teach')
    expect(snap.agents[0].nodes).toEqual(['emacs--Basic'])
    const junk = parseSnapshot(
      { agents: [{ agent: 'tutor-agent', kind: 'agent', nodes: ['emacs--Basic'], action: 'lecture', age: 0 }] },
      NOW
    )
    expect(junk.agents).toEqual([])
  })

  it('answers a shape-shaped empty snapshot for junk input, never throws', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { agents: 'all' }]) {
      const snap = parseSnapshot(junk, NOW)
      expect(snap.updated).toBe(NOW)
      expect(snap.total).toBe(0)
      expect(snap.agents).toEqual([])
    }
  })
})

describe('actionVerb (the ticker/card wording)', () => {
  it('renders the honest verb per action — teach reads as taught', () => {
    expect(actionVerb('read')).toBe('reading')
    expect(actionVerb('ask')).toBe('asked')
    expect(actionVerb('import')).toBe('imported')
    expect(actionVerb('teach')).toBe('taught')
  })
})

describe('agentsByNode / liveCount', () => {
  const e = (agent: string, nodes: string[], age = 0): PulseEntry => ({
    agent,
    kind: 'cli',
    nodes,
    action: 'read',
    age
  })

  it('groups entries by slug in arrival order', () => {
    const map = agentsByNode([e('one', ['a', 'b']), e('two', ['b'])])
    expect(map.get('a')?.map((x) => x.agent)).toEqual(['one'])
    expect(map.get('b')?.map((x) => x.agent)).toEqual(['one', 'two'])
    expect(map.get('c')).toBeUndefined()
  })

  it('counts DISTINCT agents — the chip says N AGENTS, not N rows', () => {
    expect(liveCount([e('one', ['a']), e('one', ['b']), e('two', ['c'])])).toBe(2)
    expect(liveCount([])).toBe(0)
  })
})

describe('shouldPoll (the phone/lite law)', () => {
  it('refuses phone and lite — ZERO background loops there', () => {
    expect(shouldPoll({ phone: true, lite: false })).toBe(false)
    expect(shouldPoll({ phone: false, lite: true })).toBe(false)
    expect(shouldPoll({ phone: true, lite: true })).toBe(false)
  })

  it('allows desktop full mode only', () => {
    expect(shouldPoll({ phone: false, lite: false })).toBe(true)
  })

  it('polls every 8 seconds', () => {
    expect(PULSE_INTERVAL_MS).toBe(8000)
  })
})

describe('ageLabel', () => {
  it('formats seconds, minutes, hours', () => {
    expect(ageLabel(0)).toBe('0s')
    expect(ageLabel(42)).toBe('42s')
    expect(ageLabel(59)).toBe('59s')
    expect(ageLabel(60)).toBe('1m')
    expect(ageLabel(754)).toBe('12m')
    expect(ageLabel(3600)).toBe('1h')
    expect(ageLabel(7261)).toBe('2h')
  })

  it('never goes negative or NaN', () => {
    expect(ageLabel(-5)).toBe('0s')
    expect(ageLabel(NaN)).toBe('0s')
  })
})

describe('beacon (fire-and-forget, 3 s abort, swallow everything)', () => {
  const payload = { agent: 'ask-the-corpus', kind: 'assistant' as const, nodes: ['emacs--Killing'], action: 'ask' as const }

  it('POSTs the exact payload to the worker pulse path', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true }
    }) as unknown as typeof fetch
    await beacon(payload, fake)
    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe('https://dn-pulse.khalidrafi.workers.dev/pulse')
    expect((calls[0].init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((calls[0].init as RequestInit).body))).toEqual(payload)
  })

  it('swallows network failure and never rejects — dedupe-friendly re-fires are no-throw', async () => {
    const rejecting = (async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch
    await expect(beacon(payload, rejecting)).resolves.toBeUndefined()
    await expect(beacon(payload, rejecting)).resolves.toBeUndefined()
  })

  it('swallows a hard 500 the same as silence', async () => {
    const fiveHundred = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    await expect(beacon(payload, fiveHundred)).resolves.toBeUndefined()
  })
})

describe('PulseStore (reactive shell)', () => {
  let fetchCalls: { url: string }[] = []
  const fakeFetch = (snap: unknown) =>
    (async (url: string) => {
      fetchCalls.push({ url })
      return { ok: true, json: async () => snap } as unknown as Response
    }) as unknown as typeof fetch

  beforeEach(() => {
    fetchCalls = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refresh parses a snapshot into entries', async () => {
    const store = new PulseStore()
    await store.refresh(
      fakeFetch({
        updated: NOW,
        total: 1,
        agents: [{ agent: 'org-docs-cli', kind: 'cli', nodes: ['org--Introduction'], action: 'read', age: 0 }]
      })
    )
    expect(store.entries.length).toBe(1)
    expect(store.live).toBe(1)
    expect(store.byNode.get('org--Introduction')?.[0].agent).toBe('org-docs-cli')
  })

  it('a failed refresh keeps the last snapshot standing', async () => {
    const store = new PulseStore()
    await store.refresh(fakeFetch({ agents: [{ agent: 'a', kind: 'cli', nodes: [], action: 'read', age: 0 }] }))
    const bad = (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    await store.refresh(bad)
    expect(store.entries.length).toBe(1)
  })

  it('beginAsk/endAsk put the ask halo on the asked neurons instantly', () => {
    const store = new PulseStore()
    store.beginAsk(['emacs--Killing', 'emacs--Killing', 'org--Introduction'])
    expect(store.localAsk).toEqual(['emacs--Killing', 'org--Introduction'])
    expect(store.live).toBe(1) // ask-the-corpus, counted the moment it starts
    const rows = store.byNode.get('emacs--Killing') ?? []
    expect(rows.map((r) => r.agent)).toEqual([ASK_AGENT])
    expect(rows[0].action).toBe('ask')
    expect(rows[0].age).toBe(0)
    store.endAsk()
    expect(store.live).toBe(0)
    expect(store.byNode.size).toBe(0)
  })

  it('the ask row never duplicates a poll-carried ask entry on the same node', async () => {
    const store = new PulseStore()
    await store.refresh(
      fakeFetch({
        agents: [{ agent: 'ask-the-corpus', kind: 'assistant', nodes: ['emacs--Killing'], action: 'ask', age: 1_000 }]
      })
    )
    store.beginAsk(['emacs--Killing'])
    expect((store.byNode.get('emacs--Killing') ?? []).length).toBe(1)
  })

  it('recent carries the newest 8', async () => {
    const store = new PulseStore()
    const agents = Array.from({ length: 12 }, (_, i) => ({
      agent: `a${i}`,
      kind: 'cli',
      nodes: [],
      action: 'read',
      age: i
    }))
    await store.refresh(fakeFetch({ agents }))
    expect(store.recent.length).toBe(8)
    expect(store.recent[0].agent).toBe('a0')
  })

  it('start refuses phone and lite: no fetch, no timer (the 0-loop law)', async () => {
    const store = new PulseStore()
    const impl = fakeFetch({ agents: [] })
    expect(store.start({ phone: true, lite: false }, impl)).toBe(false)
    expect(store.start({ phone: false, lite: true }, impl)).toBe(false)
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 3)
    expect(fetchCalls.length).toBe(0)
    store.stop()
  })

  it('start on desktop full polls immediately, then every 8 s; stop ends it', async () => {
    const store = new PulseStore()
    const impl = fakeFetch({ agents: [] })
    expect(store.start({ phone: false, lite: false }, impl)).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchCalls.length).toBe(1)
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS)
    expect(fetchCalls.length).toBe(2)
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS)
    expect(fetchCalls.length).toBe(3)
    store.stop()
    await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 2)
    expect(fetchCalls.length).toBe(3) // the timer is gone
    expect(store.start({ phone: false, lite: true }, impl)).toBe(false) // restart honours the gate
  })
})
