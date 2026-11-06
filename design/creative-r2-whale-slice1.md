# Whale R2 — Slice 1/7: seven signature sparks (the ignition wave)

> RE-LAND: the original spec (commit `ba7ac64`) was lost to a sandbox
> rollback — never pushed, shipped only as a wiped patch. Rebuilt from the
> session ledger; the original burn (72,893 tok) landed 7/7 on
> `deepseek/deepseek-v4.1-flash`. Marked sections are reconstructed at
> spec fidelity, not verbatim.

Design language (fixed): "A HUD, not a magazine" — ink-blue black #05070e,
neon cyan / magenta / electric yellow, self-hosted Electrolize / Inter /
JetBrains Mono, sharp corners with one notched edge, corner brackets on
focus, circuit grid + scanlines, per-source neon hue via `--dn-src`.

PERF LAW: phones run ZERO animations; desktop at most 3 ambient loops per
page; `prefers-reduced-motion` renders every spark's static end-state.

| # | Spark | Intent (feel) | Implementation shape | Loop slot |
| --- | --- | --- | --- | --- |
| 1 | Fire-ripple canvas | the page ignites under the pointer | canvas radial ripples on pointerdown, additive compositing, ripple pool capped at 12 | none (event-driven) |
| 2 | Boot-decode wordmark | the wordmark decodes from noise on load | per-glyph scramble → settle, 900 ms total, charset of box-drawing + katakana | none (one-shot) |
| 3 | Magnetic cursor comet | the cursor drags a comet with gravity | spring-follow dot + fading trail, attracted to interactive sources | none (rAF on move) |
| 4 | Per-source hue ignition | every interactive source ignites its own hue | `--dn-src` set per element class; hover breathes the hue into brackets + underline glow | 0 (hover only) |
| 5 | Synapse scroll rail | scroll position travels a synapse rail | fixed rail with a firing node at scroll progress; crossings spark | 1 of 3 |
| 6 | Corner-bracket target lock | focus = target lock | focus/selected elements grow corner brackets that snap in with 120 ms cubic-out | 0 (transition only) |
| 7 | Ignition boot | first paint boots like a reactor | staged unmask: grid → scanline → chrome → content, 1.2 s, skippable via reduced-motion | none (one-shot) |

## Perf & motion budget (whole wave)

One-shot sparks (2, 7) run once per page and never occupy a loop slot.
Event-driven sparks (1, 3, 4, 6) idle at zero cost. The only permanent
ambient consumer is the synapse scroll rail (1 of 3 desktop slots), leaving
2 slots free for page-specific ambience. On phones everything renders the
end-state; `prefers-reduced-motion` collapses decode/boot to instant.

## Why it surprises

Each spark treats the HUD as a physical system — ignition, lock-on,
synapse — instead of decorating it. The boot-decode wordmark and ignition
boot make every page load feel like a machine waking; the fire-ripple and
comet make the pointer feel massy in a canvas that answers back.

## Ledger

| slice | sparks | tokens (salvo) | note |
| --- | --- | --- | --- |
| 1/7 | 7/7 | 72,893 (original burn; $0.041842) | this document — re-landed |
| 2/7 | 7/7 | 99,709 | see creative-r2-whale-slice2.md |
| 3/7–7/7 | — | — | remaining (Nov ÷ 7 plan) |
