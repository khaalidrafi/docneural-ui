# SPEC 4 — agents on the field (presence + AI ladder)

Owner directive 2026-11-01T06:28Z (verbatim excerpts): "Where is our ready to
use AI assistant, btw? TRY HARDER to find free options to integrate AI agents.
If no options found, use Workers AI. I want to integrate AI agents with the
network to add cool features, such as showing an indicator in the network for
where the agent is interacting. Even further, we'll add features to show any
agent that reads docs here online. It looks super cool. Brainstorm more cool
ideas and add them. You'll also take up org-docs and org-roam-lite-ui
projects. Hire for them."

## Lead rulings (read first)

- Workers AI ban is LIFTED conditionally: free options were hunted again
  (2026-11-01, evidence in git history of this file's commit message).
  Verdict: Pollinations remains the ONLY keyless+free+CORS default (verified
  live: `openai-fast` and `openai` both answer keyless, HTTP 200). Groq /
  OpenRouter / Gemini / Cerebras are free-tier but need keys → BYOK presets.
  Therefore: **free default stays, Workers AI becomes the automatic
  last-resort fallback** (Owner explicitly permitted). Rationale note: the
  earlier objection to relaying was burning a THIRD PARTY's shared free tier
  through one egress IP; Workers AI quota is OUR OWN account allocation
  (10,000 neurons/day, resets 00:00 UTC) — acceptable for fallback-only
  volume.
- Vocabulary law unchanged: UI copy NEVER says "graph" (the field / neurons /
  synapses). Colors only via `--dn-*` tokens. 40px tap targets. Phone and
  lite run ZERO background loops (polling is desktop+full only). No new
  deps, no new fonts. localStorage stays the only client storage; the beacon
  carries NO PII (agent name + node slugs + action). Human readers are never
  tracked ambiently — presence fires only from explicit ASK actions and from
  agents announcing themselves.
- The AI assistant ALREADY exists (ASK panel, live). This wave makes it
  impossible to miss and wires it into the field.

## Workstream A — `dn-pulse` presence worker (repo: docneural, path cf/pulse/)

Presence API. Workers + KV only, no AI binding, no secrets.

- `cf/pulse/wrangler.jsonc`: name `dn-pulse`, compatibility_date 2026-10-01,
  `kv_namespaces: [{ binding: "PULSE", id: "LEAD_FILLS" }]` (lead creates the
  namespace and fills the id before deploy), `workers_dev: true`, no routes.
- `POST /pulse` — body JSON `{ agent: string(1..40), kind:
  "assistant"|"agent"|"mcp"|"cli", nodes: string[](0..12 slugs), action:
  "read"|"ask"|"import", host?: string }`. Reject bodies > 2 KB (400).
  Validate types (400 on junk). **Dedupe guard**: key
  `d:{sha256(agent|action|nodes.sorted().join(","))}` — if present and younger
  than 90 s, return `200 {"ok":true,"deduped":true}` WITHOUT writing (KV free
  tier = ~1k writes/day; this is the quota wall). Otherwise write `p:{ulid}`
  → value `{agent,kind,nodes,action,t}` with `expirationTtl: 600`.
  Per-IP limiter 30/min (in-isolate Map, best-effort). CORS `*` on
  GET/POST/OPTIONS. Never leak internals (500 → opaque).
- `GET /pulse` — list prefix `p:`, read values, return
  `{updated, total, agents:[{agent,kind,nodes,action,age}]}` sorted newest
  first, cap 50. Set `Cache-Control: public, max-age=3` (edge cache protects
  the 100k reads/day quota). Expired entries vanish via TTL.
- `GET /health` → `{ok:true}`.
- `scripts/pulse-probe.mjs` (docneural repo): POST a beacon, GET, assert it
  appears; POST same again, assert `deduped:true`; assert snapshot shape.
  Lead runs it live post-deploy.

## Workstream B — `dn-brain` fallback relay (repo: docneural-ui, path cf/brain/)

Minimal OpenAI-shaped relay onto Workers AI. Exists ONLY for failover.

- `cf/brain/wrangler.jsonc`: name `dn-brain`, compatibility_date 2026-10-01,
  `"ai": { "binding": "AI", "experimental_remote": "rerun" }` — if that key
  errors on deploy, use plain `{ "binding": "AI" }`.
- `POST /v1/chat/completions`: validate OpenAI-ish body, clamp
  `max_tokens ≤ 700`, `temperature ≤ 0.6`, map to
  `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages,
  max_tokens, temperature })`, respond OpenAI-shaped
  `{id, object:"chat.completion", model, choices:[{index:0,
  message:{role:"assistant",content}, finish_reason}], usage}`.
  Per-IP 10/min. CORS `*`. `GET /health` → `{ok, model}`.
- No auth, no keys, no storage.

## Workstream C — the site (repo: docneural-ui, branch ai/main)

1. `src/lib/core/ai.ts`:
   - `AI_DEFAULTS.model` → `"openai-fast"` (verified).
   - Add `BRAIN_FALLBACK = "https://dn-brain.khalidrafi.workers.dev/v1/chat/completions"`
     and a small pure helper `describeBrain(cfg, usedFallback)` for the
     status line ("free brain" / "edge brain" / "your key").
   - Keep `AiConfig` shape; add `fallback: boolean` (default true,
     localStorage-persisted with the rest).
2. `AskPanel.svelte`: on primary fetch failure (network/429/402/5xx) and
   `fallback` enabled, retry ONCE against BRAIN_FALLBACK with the same
   messages; label which brain answered (status line, honest). Add provider
   presets row in the optional key settings: chips that fill url+model for
   Pollinations (default, keyless), Groq (`https://api.groq.com/openai/v1`,
   `llama-3.3-70b-versatile`), OpenRouter (`https://openrouter.ai/api/v1`,
   any `:free` model), Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`,
   `gemini-2.0-flash`), Cerebras (`https://api.cerebras.ai/v1`,
   `llama-3.3-70b`). Keys stay in localStorage, only ever sent to the
   visitor's chosen url.
3. `src/lib/core/pulse.ts` (new, DOM-free core) + thin glue:
   - `beacon(payload)` → POST `https://dn-pulse.khalidrafi.workers.dev/pulse`,
     fire-and-forget, 3 s AbortController timeout, swallow every error,
     dedupe-friendly (the worker dedupes; client adds nothing).
   - `startPulsePolling(store)` → GET every 8 s; desktop + full mode ONLY;
     phone/lite never start it (law). Runes store exposes
     `agentsByNode: Map<slug, {agent,kind,action,age}[]>` and
     `liveCount`, plus `recent: []` (newest 8 pulses).
   - Unit tests with mocked fetch: parse, age math, dedupe no-throw, phone
     never polls.
4. Field rendering (DocneuralGraph painter path):
   - Agent halo: pulsing ring + glyph dot in a NEW token `--dn-agent`
     (violet family, add token in styles) drawn on nodes that have live
     agents. The ring rides the EXISTING wave loop; when `liveCount === 0`
     the halo code must cost literally zero per-frame work (early-out).
   - ASK wiring: when a question runs, beacon
     `{agent:"ask-the-corpus", kind:"assistant", action:"ask",
     nodes:[...sourceSlugs]}`; asked + source nodes carry the halo while the
     answer streams; reuse the existing glow/charge visuals for the
     "reading the corpus" feel. No new particle systems.
   - Synapse/hover card: append an "agents here" line (name · action · age)
     when the node has live agents.
5. Plate: live chip `N AGENTS ON THE FIELD` (only N>0, mono, token colors);
   a pulse ticker line (last 5: name · action · node title via store title
   lookup, raw slug if unknown). ASK entry becomes a first-class visible
   chip "ASK THE CORPUS" outside the collapsed controls; `/` focuses it when
   no input is focused; first-visit hint (localStorage flag) "this site
   answers questions — try asking". Phone: chip visible, tap target 40px.
6. Agent surface: `agent-manifest.json` lives in docneural repo
   `static/agent-manifest.json` and the docneural Makefile build gains
   `cp static/agent-manifest.json dist/agent-manifest.json` (next to the
   robots cp). Content: site name, canonical URL, endpoints (llms.txt,
   llms-full.txt, graph.json, ctx/, docs/, `?raw=1`, COPY FOR AGENT),
   presence API (POST/GET /pulse schema + one curl example, TTL 600 s,
   etiquette: announce honestly, dedupe server-side, no PII), and the
   note that Emacs readers using org-docs beacon automatically.

## Workstream D — org-docs hire (separate worker, repo khaalidrafi/org-docs)

1. Presence beacon from the reader surfaces: in `org-docs-agent.el` (batch
   CLI query path) and `org-docs-mcp.el` (tool dispatcher), after a
   successful query, fire a best-effort async POST to
   `org-docs-pulse-url` (new defcustom, default
   `https://dn-pulse.khalidrafi.workers.dev/pulse`, empty string disables)
   with `{agent:"org-docs-cli"|"org-docs-mcp", kind:"cli"|"mcp", nodes:
   (up to 12 matched node slugs), action:"read"}`. Use `url-retrieve`
   async; EVERY failure silently ignored (agents must never break on
   network). Emacs 27+ compat, no new deps.
2. `.github/workflows/ci.yml`: ubuntu-latest, apt install emacs-nox, run the
   documented batch ERT command for every tests/ file on push + PR +
   workflow_dispatch. (No emacs in the dev sandbox — CI is the gate.)
3. Update AGENTS.md table (new defcustom + CI note). Do NOT touch recipes or
   the reader keymap this pass.

## Workstream E — org-roam-lite-ui hire (separate worker, branch ai/main)

- Read AGENTS-TODOS.org, pick the highest-priority actionable headless item,
  implement ONE step, tests-first (repo law), full gate `npm test` +
  `npm run check` + `npm run test:e2e` (if e2e cannot run headless here,
  say so honestly and gate on unit+check), commit on ai/main, push, report.
  Never touch `main`. No force-push.

## Gates (site workstream)

- `npm test` — all green INCLUDING new tests (baseline was 120).
- `npm run check` — svelte-check 0 errors / 16 warnings baseline.
- `npm run build` — clean.
- Do NOT deploy (lead deploys). Do NOT create root wrangler.jsonc in
  docneural-ui (config lives in docneural + cf/*/ subdirs).
- Vocabulary / tokens / tap / phone-loop laws as ruled above.

## Deliverable report format (every worker)

Commits (hash + one-line each), files touched, gate outputs (exact counts),
honest deviations, open questions. Push with:
`export GH_PAT=$(cat /tmp/.ghpat); git -c credential.helper='!f() { echo
username=x-access-token; echo password=$GH_PAT; }; f' push origin ai/main`
