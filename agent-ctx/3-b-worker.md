# Task 3-b — network pass FINISHING pass

Worker: implementer · Branch `ai/main` · baseline ab43c8e + previous worker's uncommitted network-pass tree (kept intact, nothing reverted)
Status: code written, **NOT committed / NOT pushed** (lead reviews & commits).

Read SPEC.md first (bench/2026-10-31-network-pass). Previous 3-a record: see `2-a-worker.md` for conventions.

## Per-gap summary

### GAP 1 — src/lib/ui/CommandPalette.svelte (SPEC §6.1)
- Three labelled sections under the existing commands: **Documents** (fuzzy title match across ALL manuals: case-insensitive subsequence, consecutive/word-start scoring, top 12 by score), **Chapters** (store.chapters = current manual's spine, reading order; empty query = first 12; query filters; rows already under Documents not repeated), **Neurons** (top-degree from store.views, corpus-wide, top 8, query-filtered, deduped against the other two sections).
- One flat cursor walks all sections (↑↓ Enter Esc unchanged); `reveal()` scrolls the active row into view (instant, rAF, no smooth-scroll) since the cursor now crosses section boundaries.
- Overlay 42rem→40rem (**640px**, SPEC); rows `min-height: 44px` (SPEC); section headers = mono uppercase hairline li, aria-hidden; neurons row icon ⌁.
- SPEC §1 miss fixed in-file: command hint `graph mode` → `neural network mode` (vocab entry already existed).
- Empty-state copy/keys/titlebar unchanged; `satisfies Section[]`; `DocItem = Extract<Item,{kind:'doc'}>` for the section builders (keeps svelte-check at 0 errors).

### GAP 2 — Library drawer (SPEC §6.2)
- The ⌘⇧K keybind wired `store.toggleLibrary()` (store flag existed) but the imported `./ui/LibraryDrawer.svelte` did NOT exist — a dangling import that broke the build. Built the drawer as **`src/lib/ui/Library.svelte`** (per task instruction) and updated the import/tag in DocneuralApp (2 lines).
- Library.svelte: 320px fixed left drawer (`min(320px, 92vw)` for phones), `--dn-panel-*` ink (synapse-card tokens), grouped by manual; group header row = manual title (source hue) + `N neurons · M synapses` (same store.sources numbers Home prints); rows = non-stub docs, 40px, uniform (window math), nowrap+ellipsis; recents = trail-derived, pinned top, newest first, max 8, mirrored to `dn.library.recents` via controls.ts loadRecents/saveRecents (storage fallback when trail cleared); current doc marked (`.active` + aria-current); filter field narrows every manual at once; empty state verbatim `No document matches — {n} manuals loaded.`; window-render past 200 rows (Toc's ROW_H=40 spacer pattern); untagged stragglers grouped under `other` (never dropped); Esc closes via DocneuralApp's global Escape branch (+1 line); scrim click closes; row click = store.goto + close; NO new animation, 40px+ taps, no new deps.
- ManualTabs.svelte: trailing 40×40 `+` opens the drawer (`aria-label="Open the document library"`). Placed OUTSIDE role="tablist" (non-tab control must not join a tablist) — tabs moved into an inner `.tabs` div, zero visual change.
- vocab.ts: added the new user-visible strings ('Documents', 'Chapters', 'Neurons', 'Close the document library', 'Filter the library').

### SPEC §1 drive-by (rename misses the previous worker left in copy; vocab entries existed but components weren't updated)
- ChapterNav.svelte: `⌁ GRAPH: n TICKED` → `⌁ NEURAL NETWORK: n TICKED`; `show … in the synapses graph` → `…synapses network` (aria + title).
- SynapseRail.svelte: `local graph` → `local neural network`; `open full graph ›` → `open full neural network ›`.

### Test fixes (lead rulings applied verbatim)
- graph.test.ts `falls back to A–Z letter groups…` → **`returns a FLAT reading-order list when a big corpus carries no Info structure`**: 30 pages (zero-padded ids so fixture order = id order), asserts 30 depth-0 rows, title order preserved, `children` empty, and **no `group` nodes** (`'group' in n` false for every row).
- graph.test.ts `repels weakly…`: bound 120 → **≤ 260** for the widest capped title (241.56 = the new 44 + 1.1×extent reserve; 490 blow-out history recorded in comment); sign-still-negative asserts kept.
- graph.test.ts `gives the widest label less room…`: `< labelWidth` → **`≤ 1.5 × labelWidth`** with comment citing the 490 history and that labelExtent hard bodies remain the density promise owner.
- spreadForces.ts: **PASSES 2 → 3** (PUSH untouched — minimal change won; verified after the single edit). Comment documents why: the grown charge + corner-chrome eviction lands a node inside a neighbour's box on the same sweep; the third sweep sees the eviction's aftermath. Perf test still passes (~0.6s), cost still linear.
- DocneuralGraph.svelte (previous worker's uncommitted file carried 3 NEW svelte-check warnings vs the 16 baseline; fixed to hit the gate): aside→div for the synapse card (same class), `untrack()` for the intentional boot-time `loadLock(store.layout)` snapshot, cited `svelte-ignore a11y_no_noninteractive_tabindex` on the APG scrollable-region `sc-ctx` (tabindex 0 stays — keyboard scroll is a feature). No behavior changed.

## Gates (exact outputs, foreground)
1. `npm test` → `Test Files 7 passed (7)` · **`Tests 106 passed (106)`** (was 4 failed / 102 passed)
2. `npx svelte-check --tsconfig ./tsconfig.json` → **`0 errors and 16 warnings in 2 files`** (exactly the committed baseline: AskPanel 2 + Home 14; Library/CommandPalette/ManualTabs/DocneuralGraph contribute ZERO)
3. `npm run build` → **`✓ built in 3.90s`** (<5s)

## Spec deviations / risks for lead review
1. **Drawer component named `Library.svelte`** (per task instruction); the dangling import the previous worker left was `LibraryDrawer.svelte` — import/tag updated, 2-line diff in DocneuralApp.
2. **`N neurons · M synapses` read as the manual GROUP HEADER row** (manual title + counts), not per-chapter rows: a chapter row printing "1 neuron · 4 synapses" is noise, and store.sources already owns those numbers per manual. Chapter rows are title-only.
3. **Drawer width `min(320px, 92vw)`** — spec says 320px; the 92vw guard keeps ≤360px phones from a fully-covered screen.
4. **Left-rail toggle** implemented as the manual-tabs `+` (the tabs live inside the reader's left rail, so one control serves both readings); no separate rail button was added — DocReader structure left untouched per "do not restructure".
5. Palette keeps the 4 headerless commands above the three sections (SPEC §1 still legislates palette command hints, so commands survive); sections with no hits render no header; empty query shows Commands + first 12 chapters + top 8 neurons.
6. Recents update continuously (an $effect mirrors trail → `dn.library.recents`), not only while the drawer is open — keeps the fallback shelf fresh for a cleared trail.
7. DocneuralGraph warning fixes are inside the previous worker's uncommitted work — flagged here so the lead reviews those 3 small edits (markup element swap, untrack, one cited svelte-ignore) with the rest.
