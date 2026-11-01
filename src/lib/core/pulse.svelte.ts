// pulse.svelte.ts — the reactive presence store (SPEC 4, workstream C3).
//
// Runes live in a .svelte.ts module (the transform is file-name gated);
// every piece of logic that can be wrong on its own lives in ./pulse.ts
// and is unit-tested there. This file is the thin reactive shell:
//   - `entries`   the last snapshot (newest first, capped by the worker)
//   - `localAsk`  the visitor's OWN ask in flight — the ask-the-corpus
//                 agent appears on those neurons instantly, before the
//                 next poll would prove it
//   - `recent`    newest 8 pulses (the plate ticker reads the last 5)
//   - `byNode`    slug -> live agents (the canvas halo's source of truth)
//   - `live`      distinct agents on the field (the chip's N)
//
// Polling is desktop + full mode ONLY (team law: phone and lite run ZERO
// background loops) — `start` refuses everything else and the caller must
// treat a `false` return as "never started".
import {
  agentsByNode,
  liveCount,
  parseSnapshot,
  PULSE_INTERVAL_MS,
  PULSE_URL,
  shouldPoll,
  type PulseEntry
} from './pulse'

/** The site's own assistant, as it announces itself on the field. */
export const ASK_AGENT = 'ask-the-corpus'

export class PulseStore {
  entries = $state<PulseEntry[]>([])
  localAsk = $state<string[]>([])

  #timer: ReturnType<typeof setInterval> | undefined = undefined
  #started = false

  /** Newest 8 pulses (spec); the plate ticker renders the last 5. */
  recent = $derived(this.entries.slice(0, 8))

  /** Live agents per node slug — the painter, the ticker and the synapse
   *  card all read this one map. The visitor's in-flight ask merges in as
   *  an age-0 ask-the-corpus row, never duplicating a row a poll already
   *  carried (the beacon lands in `entries` within one poll cycle). */
  byNode = $derived.by(() => {
    const map = agentsByNode(this.entries)
    if (this.localAsk.length) {
      for (const slug of this.localAsk) {
        const list = map.get(slug)
        if (list?.some((e) => e.agent === ASK_AGENT && e.action === 'ask')) continue
        const row: PulseEntry = { agent: ASK_AGENT, kind: 'assistant', nodes: [], action: 'ask', age: 0 }
        map.set(slug, [...(list ?? []), row])
      }
    }
    return map
  })

  /** Distinct agents live on the field right now — the chip's N. The
   *  visitor's own ask counts the moment it starts: the agent IS on the
   *  field while the answer streams. */
  live = $derived.by(() => {
    const names = new Set(this.entries.map((e) => e.agent))
    if (this.localAsk.length) names.add(ASK_AGENT)
    return names.size
  })

  /** Agents touching one node slug (card line, ticker lookup). */
  agentsFor(slug: string): PulseEntry[] {
    return this.byNode.get(slug) ?? []
  }

  /** One GET. Failures leave the last snapshot standing — a down worker
   *  must never blank a field that was showing agents. */
  async refresh(fetchImpl: typeof fetch = fetch): Promise<void> {
    try {
      const res = await fetchImpl(`${PULSE_URL}/pulse`, {
        headers: { 'cache-control': 'no-cache' }
      })
      if (!res.ok) return
      this.entries = parseSnapshot(await res.json(), Date.now()).agents
    } catch {
      /* the field stands alone */
    }
  }

  /** Start the 8 s poll — desktop + full mode ONLY. Returns whether it
   *  actually started; `false` means the gate refused and NO timer exists. */
  start(o: { phone: boolean; lite: boolean }, fetchImpl: typeof fetch = fetch): boolean {
    if (this.#started) return true
    if (!shouldPoll(o)) return false
    this.#started = true
    void this.refresh(fetchImpl)
    this.#timer = setInterval(() => void this.refresh(fetchImpl), PULSE_INTERVAL_MS)
    return true
  }

  stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer)
    this.#timer = undefined
    this.#started = false
  }

  /** The visitor asked: those neurons wear the ask halo while streaming. */
  beginAsk(slugs: string[]): void {
    this.localAsk = [...new Set(slugs)].slice(0, 12)
  }

  endAsk(): void {
    this.localAsk = []
  }
}

/** App singleton: one field for the whole visit. Tests build their own. */
export const pulse = new PulseStore()
