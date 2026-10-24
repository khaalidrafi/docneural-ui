// transport.ts — how the boot graph crosses the wire.
//
// WHY THIS FILE EXISTS. The pipeline (docneural's scripts/slim-graph.mjs)
// writes THREE graph artifacts side by side, and the boot used to ask for the
// fat one unconditionally:
//
//   graph.json       2,199 kB parsed   (what `load()` fetched — every boot)
//   graph.json.gz      109 kB           (what a precompressing host serves)
//   graph.json.br       78 kB           (smallest; needs brotli to decode)
//
// (2026-10-12 corpus — TODOs.org §"Measured after the P1 pass".) Serving the
// precompressed sibling is the host's job and none of it is guaranteeable for
// "drop dist/ on any static host": Vite's own dev/preview never sent
// content-encoding, so the FIRST request was 2.2 MB until the site grew the
// serve-precompressed plugin. This fetch stops depending on the host: it
// walks the artifacts smallest-first and decodes with the browser's own
// DecompressionStream —
//
//   1. graph.json.br   only when this runtime can construct 'br'
//   2. graph.json.gz   only when it can construct 'gzip'
//   3. graph.json      always decodable — and still small on the wire when
//                      the host DOES precompress (then `content-encoding` is
//                      set and the body arrives already decoded)
//
// The happy path costs exactly ONE request — the same count the old plain
// fetch spent — on ~3.5% of the bytes. Each hop falls through on HTTP error,
// decode error or parse error: a missing artifact (a theme consumer that
// never ran the slim step) degrades, it never bricks the boot.
//
// Node note (vitest runs here): node ships fetch + DecompressionStream but
// only gzip/deflate — 'br' is browser-only today, which is why the probe
// below gates every format and the tests stub it where the order matters.

import type { GraphData } from './types'

/** Can this runtime decode `fmt`? Probed, not assumed: 'br' arrived late in
 *  every engine, and probing is what keeps an unsupported browser from
 *  downloading bytes it cannot read. The probe constructs the transformer
 *  and discards it — no stream is pumped, no request is made. */
function decodable(fmt: 'br' | 'gzip'): boolean {
  try {
    // The constructor validates the format enum; no stream is pumped.
    // (`as CompressionFormat`: TS's lib.dom still types the enum as
    // deflate|gzip — it has not caught up with the 'br' engines ship.)
    new DecompressionStream(fmt as CompressionFormat)
    return true
  } catch {
    return false
  }
}

/** Fetch + decode one precompressed sibling. Throws to fall through. */
async function fetchCompressed(url: string, fmt: 'br' | 'gzip'): Promise<GraphData> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  // content-encoding means the bytes arrived already decoded (a host that
  // precompresses, or maps the sibling itself) — parse and go.
  if (res.headers.get('content-encoding')) return (await res.json()) as GraphData
  const buf = await res.arrayBuffer()
  const stream = new Response(buf).body!.pipeThrough(
    new DecompressionStream(fmt as CompressionFormat)
  )
  return JSON.parse(await new Response(stream).text()) as GraphData
}

/** Load the graph, smallest artifact first. The thrown error matches the old
 *  plain fetch (`graph.json: HTTP 404`) because nothing worked — the message
 *  the store surfaces is unchanged. */
export async function fetchGraph(base: string): Promise<GraphData> {
  if (decodable('br')) {
    try {
      return await fetchCompressed(`${base}/graph.json.br`, 'br')
    } catch (e) {
      console.warn(`graph: ${base}/graph.json.br unusable (${e instanceof Error ? e.message : e}) — falling back`)
    }
  }
  if (decodable('gzip')) {
    try {
      return await fetchCompressed(`${base}/graph.json.gz`, 'gzip')
    } catch (e) {
      console.warn(`graph: ${base}/graph.json.gz unusable (${e instanceof Error ? e.message : e}) — falling back`)
    }
  }
  const res = await fetch(`${base}/graph.json`)
  if (!res.ok) throw new Error(`graph.json: HTTP ${res.status}`)
  return (await res.json()) as GraphData
}
