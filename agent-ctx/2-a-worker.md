# Task 2-a — "ready-to-use AI" pass (re-applied)

Worker: implementer · Branch `ai/main` · baseline a338fbe (clean)
Status: code written, **NOT committed / NOT pushed** (lead reviews & commits).

## Per-file summary

### 1. src/lib/core/ai.ts
- `AI_DEFAULTS` → `{ url: 'https://text.pollinations.ai/openai', key: '', model: 'openai' }`; header comment rewritten: free public brain out of the box, no key; personal endpoint+key is an OPTIONAL override.
- New exported `ChatMessage` type (`{ role: 'system' | 'user'; content: string }`) reused by all three builders.
- New pure helpers (all DOM-free, unit-tested):
  - `endpointHeaders(cfg)` — always `content-type: application/json`; adds `authorization: Bearer <trimmed key>` ONLY when the trimmed key is non-empty.
  - `sanitizeAnswer(text)` — strips ONE leading `<think>…</think>` (case-insensitive, `[\s\S]` dotall, tolerates leading whitespace) then trims; passthrough otherwise.
  - `parseFollowUps(answer)` — trailing-line `FOLLOW-UPS:` marker (case-sensitive), split on `|`, trim each, 4–90 chars, case-insensitive dedupe, 3 max; marker line removed from the trimmed answer; no trailing marker → `{ answer: trimmed, followUps: [] }`.
  - `buildEssenceMessages(title, text)` — 2–3 sentence TL;DR + line `KEY POINTS` + exactly 3 `- ` bullets; grounded in the given text only.
  - `buildQuizMessages(title, text)` — `Q1.`/`Q2.`/`Q3.` + line `ANSWERS` + short `A1.`/`A2.`/`A3.`; grounded in the given text only.
- `buildMessages` system prompt extended with: end the answer with one final line `FOLLOW-UPS:` + exactly 3 follow-up questions separated by ` | `. `ONLY` / `never guess` phrasing kept.
- `askScore` / `rankContext` / `EXTRACT_BUDGET` / `loadAiConfig` / `saveAiConfig` unchanged (askScore/rankContext are byte-identical to baseline).

### 2. src/lib/reader/AskPanel.svelte
- DELETED the `configured` BYOK gate; submit is `disabled={busy || !question.trim()}`.
- `$effect` on `store.aiOpen`: resets answer/error/sources/followUps, `editing = false`, focuses input. Panel always lands ready-to-ask.
- `postChat(messages)` shared helper: `endpointHeaders(cfg)`, AbortController with 45 000 ms timeout (abort → `the free brain took too long — try again`), temperature 0.2; 401/403 → key message, 429 → `free endpoint rate-limited (429) — wait a moment, or set your own endpoint in settings`, other !ok → `the endpoint answered {status} {statusText} — see its docs`; TypeError → CORS/network copy. Returns trimmed content or null with `error` set.
- `ask()`: unchanged RAG (rankContext + `.org` fetches + EXTRACT_BUDGET), then `sanitizeAnswer` → `parseFollowUps` → answer + followUps; busy line `retrieving pages · calling {cfg.model}…` (via `busyCopy` state).
- Presets in `.ask-row` (both `class="ask-alt dn-mono"`, only when `store.selected`, disabled while busy): `⚡ essence` (busy copy `distilling this page…`) and `quiz me` (busy copy `writing 3 questions…`) → fetch `${store.base}/docs/${store.selected.slug}.org` → `buildEssenceMessages`/`buildQuizMessages` → same POST → answer in the same `.ask-answer` area; no retrieval, no sources row, no follow-up parsing.
- Follow-up chips: `// ask next` (dn-label) row, chips styled exactly like `.ask-src` (min-height 40px), click → `question = chip; ask()`.
- Settings optional: note headed **optional: bring your own endpoint**, key-safety sentence kept; `dn-label` line `free public brain · no key needed` shown while the key is empty; three fields kept (`sk-… (optional)` key placeholder), save/back kept.
- Kept: `role="dialog"` `aria-label="Ask the corpus"`, Escape close, backdrop click close, `.ask-src` source chips, plain-text busy line. NO new keyframes/animation-name; all CSS uses existing `--dn-*` tokens (only new rules: layout-only `.ask-actions`, accent-colored `.ask-free`); all tap targets ≥ 40px.

### 3. src/lib/ui/CommandPalette.svelte
- Hint `your key, your endpoint` → `answers, essence, quizzes — no setup` (comment above updated to match).

### 4. src/lib/reader/DocReader.svelte
- Ask button: `title` and `aria-label` = `ask the corpus (AI)`.

### 5. src/lib/core/ai.test.ts
- 6 → 21 tests (project total 78 → 93). All offline pure, zero network. Covers: endpointHeaders with/without key (asserts no `authorization` when empty, trimmed Bearer when set); sanitizeAnswer passthrough / strip / case-insensitive / leading-only; parseFollowUps no-marker / parse-3 / cap-3 / length 4–90 / case-insensitive dedupe / trailing-marker-only; buildEssenceMessages + buildQuizMessages shape (`KEY POINTS`, `Q1.`, `ANSWERS`, `A1.`, grounded `ONLY`/`never guess`, title+text in user msg); AI_DEFAULTS (pollinations url, model `openai`, empty key). Existing buildMessages test extended with `FOLLOW-UPS:` / `3` / ` | ` assertions, keeping `ONLY`/`never guess`.

## Gates (exact outputs)
1. `npx vitest run` → `Test Files 6 passed (6)` · `Tests 93 passed (93)` — 0 fail
2. `npx svelte-check` → `svelte-check found 0 errors and 16 warnings in 2 files` (the 16 known-baseline warnings: 14 unused-CSS selectors + 2 pre-existing a11y warnings, all in untouched files)
3. `npx vite build` → `✓ built in 3.38s` (1178 modules; dist emitted)

## Spec deviations / micro-decisions (all additive, none behavioral-vs-spec)
1. **Preset page text is capped at EXTRACT_BUDGET (7500 chars + `[…cut]`)**, same as the RAG extracts — protects the anonymous tier's latency against the 45 s abort on huge manual pages. Spec didn't mention capping for presets.
2. **Preset answers DO pass through `sanitizeAnswer`** (spec only mandates sanitize+parse for the RAG path; presets skip `parseFollowUps` as specified). The anonymous reasoning model can inline `<think>` on any surface, and rendering raw think-noise in `.ask-answer` would be broken UI.
3. `endpointHeaders` uses `Record<string, string>` with lowercase header keys (baseline style); `ChatMessage` exported as a named type to keep the three builders' signatures DRY.
4. Test fixture for the with-key header case reuses `AI_DEFAULTS.url` instead of inventing a new URL literal, so the pollinations endpoint remains the ONLY new URL in the diff.
5. Settings section keeps the baseline show/hide swap (`editing` toggles between form and config view) rather than rendering both at once — the spec's "optional" was implemented as "no longer forced open" (`editing = false` on open), which matches the removed gate.

## Laws check
- Svelte 5 runes only (`$state`/`$derived` untouched usage, `$props`, `$effect`); no new deps (package.json untouched), no new fonts, only sanctioned new URL (pollinations).
- 40px+ tap targets everywhere in the panel; no new `@keyframes`/`animation-name` (grep-verified on the diff).
- Tests offline pure; `src/lib/graph/*`, `src/lib/core/graph.ts`, TOC files, `styles/docneural-ui.css` untouched (git status shows only the 5 spec files).
