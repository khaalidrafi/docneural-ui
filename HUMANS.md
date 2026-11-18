# HUMANS.md — docneural-ui

A guide for humans navigating and developing this codebase. Written
2026-11-18 per the org-wide rule that every agent-developed repo
carries one.

## What this is

The theme package of the docneural site (formerly "synapt"): a
Svelte 5 + Vite package, published with package exports, that renders
the docneural corpus as a graph-plus-reader UI. It is a static-data
port of the org-roam-lite-ui graph reading plus a classic document
reader: "fire together, wire stronger".

## Code map

| Path | Role |
|---|---|
| `src/lib/DocneuralApp.svelte` | The package's public root component (the `svelte` export). |
| `src/lib/core/store.svelte.ts` | The state store (the `./store` export). |
| `src/lib/core/graph.ts` | The graph model (the `./core` export). |
| `src/lib/` (rest) | Components, reader, rendering. |
| `styles/docneural-ui.css` | The exported stylesheet. |
| `vite.config.ts`, `svelte.config.js`, `tsconfig.json` | Build config. |
| `fonts/`, `public/` | Static assets. |

Package exports (package.json): `.` (the app component), `./store`,
`./core`, `./styles/docneural-ui.css` — the docneural site consumes
exactly these; anything else is internal.

## Invariants and gotchas

- The public surface is the four exports above; the docneural site
  depends on them staying stable.
- The graph reading logic mirrors org-roam-lite-ui's; behavioral
  parity with that repo is the reference for disputes.
- The working tree may carry large in-progress edits (48 modified
  files at the time of writing) — they belong to an ongoing work
  session; this file was added without touching them.

## Developing

```sh
npm install
npm run dev       # vite dev server
npm run test      # vitest (see package.json scripts for the exact lane)
npm run check     # svelte-check
```

Branch law: work lands on `ai/main`.
