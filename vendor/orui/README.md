# vendor/orui — vendored subset of org-roam-lite-ui

Snapshot of `khaalidrafi/org-roam-lite-ui` @ `864593f` (`src/lib`: api.ts,
graph/GraphView.svelte, graph/colors.ts, protocol/protocol.ts,
state/filters.ts, state/focus.ts, state/graphStore.ts — exactly the import
closure this site's graph mode needs).

Why vendored: docneural-ui must build and test standalone (GitHub CI, the
Copilot coding agent, any fresh clone). The previous sibling-checkout alias
(`../org-roam-lite-ui`) only worked on machines with both repos side by side
under one parent directory.

Rules:

- DO NOT edit these files in place. Treat them as a read-only dependency.
- Design changes live in docneural-ui's own files
  (styles/docneural-ui.css, src/lib/**).
- To update: re-copy the same 7 files from a newer orui commit, bump the sha
  in this README and in vite.config.ts, then run the full gate
  (`npm ci && npm run build && npm test && npm run check`).
- orui tests are intentionally NOT vendored (they run in orui's own repo);
  docneural-ui's vitest include (`src/**/*.test.ts`) never picks them up.
