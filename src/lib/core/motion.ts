/** Motion-law gate (Owner perf law: phones get ZERO animations; desktop at
 *  most three ambient loops; prefers-reduced-motion gets a static board).
 *
 *  CSS media queries can only park CSS animations — Svelte JS transitions
 *  (`in:fly`), rAF sweeps and canvas/physics effects run straight through
 *  them. Every JS-driven motion in the app must ask this once and drop to
 *  duration 0 / a final value when it answers false. */

export function motionAllowed(): boolean {
  if (typeof matchMedia !== 'function') return false // jsdom / crawler: static
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (matchMedia('(max-width: 700px)').matches) return false // phone board
  return true
}
