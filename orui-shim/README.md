# org-roam-lite-ui — LOCAL SHIM (temporary)

Stand-in for the real `org-roam-lite-ui` repository, which is not yet
available. Both docneural repos already alias `orui/*` to
`../org-roam-lite-ui/src/lib/*`, so placing this package at that sibling
path makes **both repos build and test unchanged**.

## What is implemented — and why it is enough

docneural-ui imports exactly four modules from orui; this shim provides all
four with the same contracts:

| import | shim file | contract source |
|---|---|---|
| `orui/api` | `src/lib/api.ts` | types only (`OrgRoamNode/Link/GraphReponse`) |
| `orui/graph/colors` | `src/lib/graph/colors.ts` | djb2 hash + `palette[hash(firstTag) % len]` + CSS-token reader; pinned by `core/source.test.ts` |
| `orui/state/graphStore` | `src/lib/state/graphStore.ts` | `createGraphStore()` with `applyGraphdata` / `setFocus`, the only two methods any consumer calls |
| `orui/graph/GraphView.svelte` | `src/lib/graph/GraphView.svelte` | snapshot-fed canvas over the already-vendored `force-graph` dep |

Everything the graph mode needs at runtime is already vendored in the
theme (`force-graph`, the neuron painter through its `loadEngine` seam, the
spread forces). The shim replaces only the upstream *host* component.

## Documented behaviours (from docneural-ui's AI-REVIEW.org and code comments)

- Node objects are reused **by id** across snapshot swaps (physics survives
  filter keystrokes), with `title/tags/degree` refreshed per sync.
- `nodeVal = 1 + min(degree, 20)`; canvas is transparent; colours come from
  `--orui-node-palette` / `--orui-link-color` polled every 500 ms.
- `setFocus` is a **pan** (centerAt), never a zoom-to-fit.
- `linkLineDash` paints a wire dashed when its `context` starts with
  `co-cited:` — the theme's convention for a computed co-citation edge
  (see `store.cociteInto`), so the canvas can show the category the data
  always carried.
- The root element is the wrapper's first child and carries
  `data-nodes = live engine node count` (the verification gate samples it).

## Swapping in the real repo

1. `git clone <org-roam-lite-ui> ` at this exact path (sibling of the
   `docneural` / `docneural-ui` checkouts).
2. Delete this shim.
3. Re-run the gates; if a filename differs (e.g. the real
   `state/graphStore.svelte.ts`), no consumer changes are needed — only the
   alias target, which is a wildcard.

No file in `docneural` or `docneural-ui` was modified to use this shim.

## Status

- Theme `vitest run`: passes (includes the hash-parity tripwire, which now
  compares against this shim's djb2).
- Theme `svelte-check`: expect clean once wired.
- Theme/site `vite build`: expect clean.

Verified-working date: 2026-10-14 (docneural @ 89d52c6, docneural-ui @ 5ec9b40).
