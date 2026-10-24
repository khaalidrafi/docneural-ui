// Unit tests for core/transport.ts — the boot fetch's artifact ladder.
//
// The contract: smallest precompressed artifact first (graph.json.br, then
// .gz, then plain graph.json), each hop skipped without a request when this
// runtime cannot decode it, each failure falling through to the next, and
// the plain file's error message shape preserved (`graph.json: HTTP 404`).
//
// Node (the vitest environment) ships DecompressionStream for gzip/deflate
// but NOT 'br', so: the gzip hop runs through the REAL decoder; the 'br' hop
// is exercised by stubbing DecompressionStream with a pass-through
// transformer and feeding it plain bytes — that tests order, gating and
// wiring, not brotli itself (brotli's correctness belongs to zlib).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { fetchGraph } from './transport'
import type { GraphData } from './types'

const GRAPH: GraphData = {
  nodes: [{ id: 'n1', slug: 'n1', title: 'One', tags: ['org'] }],
  links: [{ source: 'n1', target: 'n1' }]
}
const JSON_BYTES = () => new TextEncoder().encode(JSON.stringify(GRAPH))
const GZ_BYTES = () => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(GRAPH))))

// The real constructor, captured before any stubbing.
const RealDS = globalThis.DecompressionStream

/** Stub DecompressionStream: a pass-through for 'br' (fed plain bytes by the
 *  tests), the real thing for everything else, or a refusing constructor.
 *  A regular function, not an arrow: the call site constructs it with new. */
function stubDS(mode: 'br-passthrough' | 'refuse'): void {
  const stub = function (fmt: string): TransformStream {
    if (mode === 'br-passthrough') {
      if (fmt === 'br') return new TransformStream()
      return new RealDS(fmt as CompressionFormat)
    }
    throw new Error(`must not be constructed (${fmt})`)
  }
  vi.stubGlobal('DecompressionStream', stub)
}

/** A fetch that answers from a table of URL -> response; records every ask. */
function serve(table: Record<string, Response | 'boom'>) {
  const asked: string[] = []
  const f = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    asked.push(url)
    const hit = table[url]
    if (hit === 'boom') return Promise.reject(new TypeError('network down'))
    return Promise.resolve(hit ?? new Response(null, { status: 404 }))
  })
  vi.stubGlobal('fetch', f)
  return { f, asked }
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchGraph artifact ladder', () => {
  it('prefers graph.json.br and decodes it in one request', async () => {
    // Node cannot construct a real 'br' stream, so the runtime is made to
    // look brotli-capable; the payload rides the pass-through untouched.
    stubDS('br-passthrough')
    const { asked } = serve({ './graph.json.br': new Response(JSON_BYTES()) })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).toEqual(['./graph.json.br'])
  })

  it('decodes the gzip artifact with the real DecompressionStream', async () => {
    const { asked } = serve({ './graph.json.gz': new Response(GZ_BYTES()) })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    // The .br hop is probed and skipped without a request (node has no br).
    expect(asked).toEqual(['./graph.json.gz'])
  })

  it('parses plain bytes when the host already decoded (content-encoding)', async () => {
    // No decompressor constructible at all: both compressed rungs are probed
    // away, the plain URL answers with content-encoding set — fetch hands the
    // body over already decoded, so the parse must not need any stream.
    stubDS('refuse')
    const { asked } = serve({
      './graph.json': new Response(JSON_BYTES(), { headers: { 'content-encoding': 'gzip' } })
    })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).toEqual(['./graph.json'])
  })

  it('falls through a corrupt artifact to the next rung', async () => {
    stubDS('br-passthrough')
    const { asked } = serve({
      './graph.json.br': new Response(new TextEncoder().encode('this is not json')),
      './graph.json.gz': new Response(GZ_BYTES())
    })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).toEqual(['./graph.json.br', './graph.json.gz'])
  })

  it('falls through HTTP 404s to the plain file', async () => {
    const { asked } = serve({
      './graph.json.gz': new Response(null, { status: 404 }),
      './graph.json': new Response(JSON_BYTES())
    })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).toEqual(['./graph.json.gz', './graph.json'])
  })

  it('never requests an artifact the runtime cannot decode', async () => {
    // Node really lacks 'br': the .br URL must not be spent, even though the
    // server would happily answer it. The .gz fetch succeeding is the proof.
    const { asked } = serve({ './graph.json.gz': new Response(GZ_BYTES()) })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).not.toContain('./graph.json.br')
  })

  it('survives a network failure mid-ladder', async () => {
    const { asked } = serve({
      './graph.json.gz': 'boom',
      './graph.json': new Response(JSON_BYTES())
    })
    await expect(fetchGraph('.')).resolves.toEqual(GRAPH)
    expect(asked).toEqual(['./graph.json.gz', './graph.json'])
  })

  it('throws the plain fetch error when nothing works', async () => {
    const { asked } = serve({
      './graph.json.gz': new Response(null, { status: 404 }),
      './graph.json': new Response(null, { status: 404 })
    })
    await expect(fetchGraph('.')).rejects.toThrow('graph.json: HTTP 404')
    expect(asked).toEqual(['./graph.json.gz', './graph.json'])
  })
})
