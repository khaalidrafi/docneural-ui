<script lang="ts">
  // SpacingControl — the spread layout's spacing dial (Owner directive
  // 2026-11-01: "no need to limit spacing. User will increase as much as they
  // wish."). Two inputs, one value:
  //
  //  - the range slider stops at 10 because that is where a drag is still
  //    precise, NOT because the layout ends there;
  //  - the numeric input beside it accepts everything up to MAX_SPACING
  //    (100) — the ceiling is a typo guard, not a design opinion. A visitor
  //    who wants a 40× field types 40.
  //
  // The physics scales with the value (repulsion, wire rest length, search
  // radius, container — see neuronEngine.applyLayout), so a huge spacing is a
  // vast but sane layout, and the camera zooms out to frame it. The floor is
  // the one sensible bound: 1 is the authored spread layout.
  import { MAX_SPACING, MIN_SPACING } from '../core/layout'
  import type { DocneuralStore } from '../core/store.svelte'

  let { store }: { store: DocneuralStore } = $props()

  // Where the slider stops. The number input is the door to everything above.
  const SLIDER_MAX = 10
</script>

<div class="spacing">
  <label class="dn-label" for="dn-spacing-range">spread spacing</label>
  <div class="row">
    <input
      id="dn-spacing-range"
      type="range"
      min={MIN_SPACING}
      max={SLIDER_MAX}
      step="0.1"
      value={store.spacing}
      oninput={(e) => store.setSpacing(Number(e.currentTarget.value))}
      aria-label="Spread spacing — how far apart the chapters sit"
      title="Spread spacing — higher pulls the chapters further apart"
    />
    <input
      class="num dn-mono"
      type="number"
      inputmode="decimal"
      min={MIN_SPACING}
      max={MAX_SPACING}
      step="0.1"
      value={store.spacing}
      onchange={(e) => store.setSpacing(Number(e.currentTarget.value))}
      aria-label="Spread spacing, exact value — up to {MAX_SPACING}"
      title="Exact spread spacing — up to {MAX_SPACING}"
    />
  </div>
  <p class="hint dn-mono">1 = packed · higher = more room · spread layout</p>
</div>

<style>
  .spacing {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  /* The track: theme tokens only — the accent fills the dial, the hairline
     draws the track, so it matches the rest of the panel in both themes. */
  input[type='range'] {
    flex: 1;
    min-height: 40px; /* touch: the thumb's whole row is the tap target */
    margin: 0;
    accent-color: var(--dn-accent);
    cursor: pointer;
  }
  .num {
    width: 4.2em;
    background: var(--dn-bg-sunken);
    border: 1px solid var(--dn-border-strong);
    border-radius: 2px;
    color: var(--dn-fg);
    font-size: 0.8rem;
    padding: 0.35em 0.5em;
    text-align: right;
    min-height: 40px;
  }
  .num:focus {
    outline: none;
    border-color: var(--dn-accent);
  }
  .hint {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: var(--dn-track);
    color: var(--dn-fg-faint);
  }
</style>
