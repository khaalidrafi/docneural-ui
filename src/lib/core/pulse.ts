// pulse.ts — the presence beacon + snapshot parser, DOM-free and
// unit-testable (SPEC 4, workstream C3).
//
// Agents announce where they are on the field: agent NAME + node slugs +
// action. NO PII, ever (team law) — and human readers are never tracked
// ambiently: the site fires a beacon ONLY from an explicit ASK action, and
// external agents announce themselves through the same public API.
//
// The fetch is fire-and-forget with a hard 3 s timeout and swallows every
// error: presence must never break the thing it decorates. The worker
// dedupes (90 s window); the client adds nothing smart.
//
// The reactive store lives beside it in pulse.svelte.ts (runes need the
// .svelte.ts transform); everything that can be wrong on its own lives here.

/** The dn-pulse worker (docneural repo, cf/pulse/). Lead-owned deploy. */
export const PULSE_URL = 'https://dn-pulse.khalidrafi.workers.dev'

export type PulseKind = 'assistant' | 'agent' | 'mcp' | 'cli'
export type PulseAction = 'read' | 'ask' | 'import'

/** One announce payload. The exact shape the worker validates. */
export type PulseBeacon = {
  agent: string
  kind: PulseKind
  nodes: string[]
  action: PulseAction
  host?: string
}

/** One row of the snapshot: who, what, where, how long ago. */
export type PulseEntry = {
  agent: string
  kind: PulseKind
  nodes: string[]
  action: PulseAction
  /** Seconds since the announce landed (computed at parse time). */
  age: number
}

/** The GET /pulse answer. */
export type PulseSnapshot = {
  updated: number
  total: number
  agents: PulseEntry[]
}

const KINDS: readonly PulseKind[] = ['assistant', 'agent', 'mcp', 'cli']
const ACTIONS: readonly PulseAction[] = ['read', 'ask', 'import']
export const PULSE_LIST_CAP = 50

/**
 * Fire-and-forget beacon. POSTs to the worker with a 3 s AbortController
 * timeout and swallows EVERY error — offline, 5xx, CORS, junk JSON: the
 * field keeps working without presence. Returns a promise only so callers
 * can `void` it; it never rejects.
 */
export function beacon(payload: PulseBeacon, fetchImpl: typeof fetch = fetch): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3000)
  return (async () => {
    try {
      await fetchImpl(`${PULSE_URL}/pulse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      })
    } catch {
      /* presence is decoration, never a dependency */
    } finally {
      clearTimeout(timer)
    }
  })()
}

/**
 * Parse a GET /pulse body into entries. Tolerant by design: junk rows are
 * DROPPED, never thrown on — one torn write must not sink the snapshot.
 * `now` is injectable so the age math is testable.
 */
export function parseSnapshot(raw: unknown, now: number): PulseSnapshot {
  const b = (raw ?? {}) as {
    updated?: unknown
    total?: unknown
    agents?: unknown
  }
  const rows = Array.isArray(b.agents) ? b.agents : []
  const agents: PulseEntry[] = []
  for (const r of rows) {
    if (typeof r !== 'object' || r == null) continue
    const e = r as Record<string, unknown>
    if (typeof e.agent !== 'string' || e.agent.length === 0) continue
    if (!KINDS.includes(e.kind as PulseKind)) continue
    if (!ACTIONS.includes(e.action as PulseAction)) continue
    if (!Array.isArray(e.nodes)) continue
    const nodes = e.nodes.filter((s): s is string => typeof s === 'string')
    // The worker reports `age` in MILLISECONDS (same epoch as `updated`);
    // entries that still carry their raw `t` are converted the same way.
    // ages normalize to whole SECONDS here — the only unit the UI reads.
    let ageSec = 0
    if (typeof e.t === 'number') ageSec = Math.max(0, Math.floor((now - e.t) / 1000))
    else if (typeof e.age === 'number') ageSec = Math.max(0, Math.floor(e.age / 1000))
    agents.push({ agent: e.agent, kind: e.kind as PulseKind, nodes, action: e.action as PulseAction, age: ageSec })
  }
  agents.sort((a, x) => a.age - x.age) // newest first (smallest age wins)
  return {
    updated: typeof b.updated === 'number' ? b.updated : now,
    total: typeof b.total === 'number' ? b.total : agents.length,
    agents: agents.slice(0, PULSE_LIST_CAP)
  }
}

/**
 * Group entries by node slug: the map the field painter and the plate
 * ticker read. A node several agents touch carries them in arrival order.
 */
export function agentsByNode(entries: readonly PulseEntry[]): Map<string, PulseEntry[]> {
  const out = new Map<string, PulseEntry[]>()
  for (const e of entries) {
    for (const slug of e.nodes) {
      const list = out.get(slug)
      if (list) list.push(e)
      else out.set(slug, [e])
    }
  }
  return out
}

/** How many DISTINCT agents are live — the chip's N. */
export function liveCount(entries: readonly PulseEntry[]): number {
  return new Set(entries.map((e) => e.agent)).size
}

/**
 * The phone/lite gate (team law: phone and lite run ZERO background loops).
 * Polling may start only on a desktop running full mode — `lite` is the
 * resolved FULL/FAST state, and a lite session never polls.
 */
export function shouldPoll(o: { phone: boolean; lite: boolean }): boolean {
  return !o.phone && !o.lite
}

/** Poll cadence (SPEC 4): GET every 8 s; the worker's edge cache (max-age=3)
 *  absorbs the rest of the world's polls. */
export const PULSE_INTERVAL_MS = 8000

/** Human age for the ticker and the card: `42s`, `7m`, `2h`. */
export function ageLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s'
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}
