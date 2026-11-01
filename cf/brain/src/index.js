// dn-brain — the fallback relay onto Workers AI (SPEC 4, workstream B).
//
// Exists ONLY for failover: the ASK panel's free public brain stays the
// default; this relay answers once, when that brain is unreachable. Minimal
// OpenAI-shaped surface — no auth, no keys, no storage. Clamps keep the
// relay inside the owner's own Workers AI allocation (10,000 neurons/day,
// resets 00:00 UTC): max_tokens <= 700, temperature <= 0.6, 10 req/min/IP.
//
// Deploy (lead-owned): npx wrangler deploy   # from cf/brain/
// Health: GET /health -> {ok, model}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400'
}

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const MAX_TOKENS_CAP = 700
const TEMP_CAP = 0.6
const RATE_LIMIT = 10 // per IP per minute, in-isolate, best-effort

const rate = { window: 0, seen: new Map() }
function rateLimited(ip, now) {
  if (now - rate.window >= 60_000) {
    rate.window = now
    rate.seen = new Map()
  }
  const n = (rate.seen.get(ip) ?? 0) + 1
  rate.seen.set(ip, n)
  return n > RATE_LIMIT
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  })
}

/** Validate the OpenAI-ish request. Returns {ok:true, messages} or {ok:false}. */
function validate(body) {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false }
  const messages = []
  for (const m of body.messages) {
    if (typeof m !== 'object' || m == null) return { ok: false }
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') return { ok: false }
    if (typeof m.content !== 'string') return { ok: false }
    messages.push({ role: m.role, content: m.content })
  }
  return { ok: true, messages }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, model: MODEL })
      }

      if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
        const now = Date.now()
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
        if (rateLimited(ip, now)) {
          return json(
            {
              error: {
                message: 'rate limited (10/min) — the fallback relay is for failover only',
                type: 'rate_limit_error'
              }
            },
            429
          )
        }

        let body
        try {
          body = await request.json()
        } catch {
          return json({ error: { message: 'invalid json', type: 'invalid_request_error' } }, 400)
        }
        const v = validate(body)
        if (!v.ok) {
          return json(
            { error: { message: 'expected OpenAI-shaped body: messages:[{role, content}]', type: 'invalid_request_error' } },
            400
          )
        }

        // Clamp, never amplify: the relay runs on the owner's own quota.
        const opts = { messages: v.messages }
        if (body.max_tokens != null) {
          const n = Number(body.max_tokens)
          if (Number.isFinite(n)) opts.max_tokens = Math.max(1, Math.min(MAX_TOKENS_CAP, Math.floor(n)))
        }
        if (body.temperature != null) {
          const n = Number(body.temperature)
          if (Number.isFinite(n)) opts.temperature = Math.max(0, Math.min(TEMP_CAP, n))
        }

        const out = await env.AI.run(MODEL, opts)
        const content = typeof out?.response === 'string' ? out.response : ''
        return json({
          id: `dn-brain-${now}`,
          object: 'chat.completion',
          model: MODEL,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop'
            }
          ],
          usage:
            out?.usage ??
            { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        })
      }

      return json({ error: { message: 'not found', type: 'invalid_request_error' } }, 404)
    } catch {
      // Opaque 5xx: never leak internals, never lie about capacity.
      return json({ error: { message: 'upstream failure', type: 'api_error' } }, 500)
    }
  }
}
