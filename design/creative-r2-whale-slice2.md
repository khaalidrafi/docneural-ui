# Whale R2 — Slice 2/7: seven signature sparks (glitch-to-gauge wave)

Burned 2026-11-06 on `deepseek/deepseek-v4.1-flash` — the only funded zenmux lane.
Salvo: 7/7 sparks landed, 99,709 tok this slice.
Design language and PERF LAW unchanged (see slice 1): phones run zero
animations, desktop gets at most 3 ambient loops per page,
`prefers-reduced-motion` collapses every spark to its static end-state.

| # | Spark | The feel |
| --- | --- | --- |
| 1 | Glitch-slice page transition | the viewport shears into neon bands |
| 2 | Radar-sweep navigation | the sidebar pings each node as the beam passes |
| 3 | Thermal doc heatmap | dwell-time heat glows and cools across the prose |
| 4 | Keystroke sonar palette | every keystroke sends a ring; results echo back |
| 5 | Circuit-trace loader | a PCB route draws itself to the content |
| 6 | Constellation breadcrumb | ancestors pinned as stars on the dock ceiling |
| 7 | Pressure-gauge status | build health as a needle with overpressure jitter |


---

## Spark 1 — glitch-slice page transition

## Intent

The page doesn't fade, slide, or wipe — it **comes apart**. When you click a doc link, your current page is frozen and cut along four invisible horizontal rules; the five strips then shear sideways at different speeds and different directions, and through the widening slits you see not the next page but *the void* — ink-black with a barely-there circuit grid. That gap is the whole trick: for ~290 ms you are looking at the machine, not the document. The new page arrives already wearing its own five ink shroud-strips, sheared apart, and they slam shut and collapse upward in a 16 ms cascade, so the destination is *reassembled* rather than *loaded*. Total elapsed ~646 ms, and at no point does anything cross-fade — everything is a hard cut dressed in neon.

## Implementation

```html
<!-- A. FIRST thing inside <body>, parser-blocking: shroud exists before first paint -->
<script>try{if(sessionStorage.getItem('dn-slice:in')==='1'){sessionStorage.removeItem('dn-slice:in');document.documentElement.classList.add('dn-slice-in')}}catch(e){}</script>

<style>
:root{--dn-slice-hue:var(--dn-src,#00e5ff)}
html.dn-slice-in{background:#05070e;overflow:hidden}
.dn-slice{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;contain:strict;background:#05070e;
  background-image:linear-gradient(#0b1a2e 1px,transparent 1px),linear-gradient(90deg,#0b1a2e 1px,transparent 1px);background-size:64px 64px}
.dn-slice__b{position:absolute;left:0;right:0;overflow:hidden;background:#05070e;contain:strict;
  transform-origin:50% 0;will-change:transform;backface-visibility:hidden}
.dn-slice__b::after{content:"";position:absolute;left:-12%;right:-12%;top:0;height:2px;opacity:0;mix-blend-mode:screen;
  background:linear-gradient(90deg,transparent,var(--dn-slice-hue) 15%,#fff 50%,var(--dn-slice-hue) 85%,transparent);
  box-shadow:0 0 14px var(--dn-slice-hue);transition:opacity 70ms linear}
.dn-slice--fire .dn-slice__b::after{opacity:1}
.dn-slice__page{position:absolute;left:0;width:100vw;pointer-events:none;user-select:none}
@media (prefers-reduced-motion:reduce){.dn-slice{display:none}}
</style>

<script>
(() => {
  const RM = matchMedia('(prefers-reduced-motion:reduce)'), PHONE = matchMedia('(max-width:640px),(pointer:coarse)');
  const BANDS = () => innerWidth < 900 ? 3 : 5;         // 3 on tablets, 5 on desktop
  const SHEAR = i => 24 + (i % 3) * 26;                 // 24 | 50 | 76 px — deterministic, no RNG
  const HUE = el => getComputedStyle(el).getPropertyValue('--dn-src').trim() || '#00e5ff';
  const stage = () => document.getElementById('dn-slice') || (() => {
    const s = document.createElement('div'); s.id = 'dn-slice'; s.className = 'dn-slice';
    document.body.appendChild(s); return s; })();

  function build(n, src) {                              // band math: base = floor(H/n); LAST band absorbs H - base*(n-1)
    const s = stage(), H = innerHeight, base = Math.floor(H / n);
    const heavy = src && src.querySelectorAll('*').length > 3000;   // clone-cost guard
    s.replaceChildren();
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div'); b.className = 'dn-slice__b';
      b.style.top = i * base + 'px';
      b.style.height = (i === n - 1 ? H - base * (n - 1) : base) + 'px';
      if (src && !heavy) {
        const c = src.cloneNode(true);
        c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); // no duplicate ids, ever
        c.classList.add('dn-slice__page'); c.style.top = -i * base + 'px'; // offset == band top → seamless slice
        b.appendChild(c);
      }
      s.appendChild(b);
    }
    return [...s.children];
  }

  async function sliceOut(href, trigger) {
    if (PHONE.matches || RM.matches) { location.href = href; return; }   // phones: zero animation
    const bands = build(BANDS(), document.querySelector('main') || document.body), s = stage();
    s.style.setProperty('--dn-slice-hue', HUE(trigger || document.documentElement));
    const A = bands.map((b, i) => b.animate(
      [{ transform: 'translate3d(0,0,0)' },
       { transform: `translate3d(${(i % 2 ? -1 : 1) * SHEAR(i)}px,0,0)` }],
      { duration: 220, delay: i * 18, easing: 'cubic-bezier(.3,0,.12,1)', fill: 'forwards' }));
    void s.offsetWidth; s.classList.add('dn-slice--fire');   // forced read = the seams actually fade in
    sessionStorage.setItem('dn-slice:in', '1');
    await A[A.length - 1].finished.catch(() => {});         // last band lands at 220 + 4*18 = 292 ms
    location.href = href;
  }

  function sliceIn() {
    if (!document.documentElement.classList.contains('dn-slice-in')) return;
    const done = () => { stage().remove(); document.documentElement.classList.remove('dn-slice-in'); };
    if (RM.matches || PHONE.matches) return done();          // static end-state: page is already there
    let last; build(BANDS(), null).forEach((b, i) => {
      const d = (i % 2 ? -1 : 1) * SHEAR(i);
      last = b.animate([
        { transform: `translate3d(${d}px,0,0) scaleY(1)`, opacity: 1 },
        { transform: 'translate3d(0,0,0) scaleY(1)', opacity: 1, offset: .42 },
        { transform: 'translate3d(0,0,0) scaleY(0)', opacity: 1 }],
        { duration: 280, delay: 10 + i * 16, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    });
    last.finished.then(done);                                // last strip collapses at 10 + 4*16 + 280 = 354 ms
  }

  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', sliceIn) : sliceIn();
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || a.origin !== location.origin) return;
    e.preventDefault(); sliceOut(a.href, a);
  });
})();
</script>
```

## Perf & motion budget

**Loop slot: none — and that's the point.** This is an event-scoped, single-shot timeline, so it claims **0 of the 3 ambient slots**; the page's idle loops stay untouched. It runs once, then `stage().remove()` deletes the node entirely — nothing lingers in the DOM, no `will-change` leaks.

**Two phases, hard-bounded.** OUT = 220 ms + 18 ms × bandIndex → last band lands at **292 ms**; IN = 10 + 16·i + 280 → last strip collapses at **354 ms**; perceived total **≈ 646 ms**. Both easings are monotone `cubic-bezier` overshoot-free so nothing wobbles at the seam. Only `transform` animates — WAAPI keeps it on the compositor, `innerHeight` is read exactly once in `build()`, and after that no layout is touched. Stage and each band are `contain:strict`; at most 5 nodes carry `will-change`.

**Cost guard:** the outgoing page is cloned up to 5×. If `main` holds >3000 elements the clones are skipped and the bands are pure ink — the shear still reads, because the grid and seams carry the effect, not the frozen content.

**Phone:** `(pointer:coarse)` or `≤640px` → `location.href` fires on the same tick, band count never computed, no DOM written. Zero animations, zero clones, zero jank. **Reduced motion:** `sliceIn()` strips the class before building anything, and the CSS `@media` rule hides the stage outright — end-state is the destination page, fully loaded, no shroud, scroll position intact.

## Why it surprises

Every other site treats a page transition as a *dissolve between two images*. This one treats the page as a **physical panel that gets guillotined** — and the subversion is what's in the gap. You expect the next page to bleed through the slits; instead you get the substrate: raw `#05070e` and a 64 px circuit grid, the machine's own floor. That single decision flips the metaphor from "loading" to "the interface was a surface all along, and we just lifted it." Then the destination doesn't slide in — it arrives pre-shrouded and *snaps shut* in a 16 ms cascade of `scaleY` collapses, so the new page feels assembled by the HUD rather than fetched by the network. And because the shear distance is a deterministic `24 + (i%3)*26`, the same strips always fly the same distance — the motion is a signature, not a random glitch.


---

## Spark 2 — radar-sweep navigation

## Intent

The sidebar stops being a list and becomes an instrument. A cyan wedge sweeps the scope once every few seconds, and every time its leading edge touches a nav node, that node's corner brackets snap open in its own neon and a hairline tick draws itself under the label — then both dissolve before the beam comes back around. The user feels *swept*, not *browsed*: the nav has a heartbeat they can read peripherally, and because each node pings in a fixed order, they learn the map without ever reading it. The whole thing reads as a console indexing itself, which is the point — chrome that is alive, prose that stays quiet.

## Implementation

```html
<nav class="dn-radar" aria-label="Sections">
  <div class="dn-radar__scope" aria-hidden="true"></div>
  <div class="dn-radar__beam" aria-hidden="true"></div>
  <ul class="dn-radar__nodes">
    <li style="--dn-src:#35f0ff"><a href="#overview" aria-current="page">Overview</a></li>
    <li style="--dn-src:#ff2fd0"><a href="#design">Design</a></li>
    <li style="--dn-src:#f5e33a"><a href="#perf">Perf</a></li>
    <li style="--dn-src:#35f0ff"><a href="#tokens">Tokens</a></li>
    <li style="--dn-src:#ff2fd0"><a href="#motion">Motion</a></li>
    <li style="--dn-src:#f5e33a"><a href="#api">API</a></li>
  </ul>
</nav>
```

```css
.dn-radar{
  --T:5.4s; --r:88px;              /* fallback clock + ring radius; JS overwrites both */
  position:relative; width:280px; height:280px; margin:24px auto; font-family:Inter,system-ui,sans-serif;
  background:radial-gradient(circle at 50% 50%,#0a1120 0 40%,#05070e 74%);
  border:1px solid #13223c;
  clip-path:polygon(0 0,calc(100% - 34px) 0,100% 34px,100% 100%,0 100%); /* one notch, top-right */
}
.dn-radar__scope{
  position:absolute; inset:11%; border-radius:50%;
  background:
    repeating-radial-gradient(circle,transparent 0 21px,rgba(53,240,255,.10) 21px 22px),
    repeating-conic-gradient(from 0deg,rgba(53,240,255,.09) 0 1deg,transparent 1deg 30deg);
  -webkit-mask:radial-gradient(circle closest-side,#000 0 90%,transparent 100%);
  mask:radial-gradient(circle closest-side,#000 0 90%,transparent 100%);
}
.dn-radar__beam{                    /* the single ambient loop */
  position:absolute; inset:0; border-radius:50%; pointer-events:none; mix-blend-mode:screen;
  background:conic-gradient(from 0deg,transparent 0 294deg,rgba(53,240,255,.04) 300deg,
    rgba(53,240,255,.18) 346deg,rgba(53,240,255,.60) 357deg,#35f0ff 360deg);
  -webkit-mask:radial-gradient(circle closest-side,#000 0 66%,transparent 88%);
  mask:radial-gradient(circle closest-side,#000 0 66%,transparent 88%);
  will-change:transform; animation:dn-sweep var(--T) linear infinite;
}
@keyframes dn-sweep{to{transform:rotate(1turn)}}

.dn-radar__nodes{position:absolute; inset:0; margin:0; padding:0; list-style:none}
.dn-radar__nodes li{
  position:absolute; inset:0; display:grid; place-items:center; pointer-events:none;
  transform:rotate(calc(var(--a,0) * 1deg));          /* bearing */
}
.dn-radar__nodes a{
  position:relative; padding:4px 6px; white-space:nowrap; text-decoration:none; pointer-events:auto;
  color:#8fa6c4; font:500 9.5px/1 Inter,sans-serif; letter-spacing:.15em; text-transform:uppercase;
  text-shadow:0 0 8px #05070e; transition:color .15s;
  transform:rotate(calc(var(--a,0) * -1deg)) translateY(calc(var(--r,88px) * -1)); /* out to ring, upright */
}
.dn-radar__nodes a:hover,.dn-radar__nodes a:focus-visible{color:#eaf6ff}
.dn-radar__nodes a:focus-visible{outline:none}
.dn-radar__nodes a:focus-visible::before{animation:none; opacity:1; transform:none}

.dn-radar__nodes a::before,.dn-radar__nodes a::after{   /* phase-locked to the beam */
  content:""; position:absolute; opacity:0; pointer-events:none;
  animation-duration:var(--T); animation-timing-function:linear;
  animation-iteration-count:infinite; animation-delay:var(--d,0s);
}
.dn-radar__nodes a::before{                             /* bracket flash */
  inset:-7px; animation-name:dn-ping;
  background:
    linear-gradient(var(--dn-src) 0 0) 0 0/7px 1px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 0 0/1px 7px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 100% 0/7px 1px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 100% 0/1px 7px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 0 100%/7px 1px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 0 100%/1px 7px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 100% 100%/7px 1px no-repeat,
    linear-gradient(var(--dn-src) 0 0) 100% 100%/1px 7px no-repeat;
}
.dn-radar__nodes a::after{                              /* label tick */
  left:6px; right:6px; bottom:0; height:1px; background:var(--dn-src);
  transform-origin:0 50%; animation-name:dn-tick;
}
@keyframes dn-ping{
  0%{opacity:0;transform:scale(.86)} 2%{opacity:1;transform:scale(1)}
  13%{opacity:0;transform:scale(1.07)} 100%{opacity:0;transform:scale(.86)}
}
@keyframes dn-tick{
  0%{opacity:0;transform:scaleX(0)} 3%{opacity:1}
  22%{opacity:0;transform:scaleX(1)} 100%{opacity:0;transform:scaleX(1)}
}
@media (prefers-reduced-motion:reduce),(max-width:640px),(pointer:coarse){
  .dn-radar__beam{animation:none; transform:rotate(42deg); opacity:.45}
  .dn-radar__nodes a::before,.dn-radar__nodes a::after{animation:none; opacity:0; transform:none}
  .dn-radar__nodes a[aria-current]{color:#eaf6ff}
  .dn-radar__nodes a[aria-current]::before{opacity:1}   /* static bracket, zero motion */
}
```

```js
const nav = document.querySelector('.dn-radar');
const nodes = [...nav.querySelectorAll('.dn-radar__nodes li')];
const n = nodes.length || 6;
const T = Math.min(9.6, Math.max(4.8, n * 0.9));        // 0.9 s of beam per node, clamped
nav.style.setProperty('--T', T.toFixed(2) + 's');
nav.style.setProperty('--r', Math.round(140 * 0.63) + 'px'); // ring at 63% of box radius
nodes.forEach((li, i) => {
  const a = (360 / n) * i;                              // bearing, clockwise from 12 o'clock
  li.style.setProperty('--a', a);
  li.style.setProperty('--d', (a / 360 * T).toFixed(3) + 's'); // beam-touch time = phase delay
});
```

## Perf & motion budget

**Slot 2 of 3.** The rotation is one `transform: rotate()` on `.dn-radar__beam` — compositor-only, no layout, no paint, `will-change:transform` declared on that element alone. The twelve ping animations (6 nodes × bracket + tick) are *not* separate loops: they read the same `--T` and are offset by `--d = a/360 · T`, so they are phase-locked children of one clock. There is zero JS on the frame path — the script above runs once at init and then never again. Each ping is transform/opacity-only, attacks in 2% of the cycle (≈108 ms at T = 5.4 s) and is fully dark by 13% (≈700 ms), so at any instant at most one node is lit and the paint area is a 60×20 px pseudo-element. **Phones:** the media query kills every animation — beam parks at 42° and dims to 0.45, brackets and ticks go to `opacity:0`, and only `[aria-current]` keeps its bracket as a static frame. **Reduced motion:** identical end-state, so a motion-sensitive desktop user sees the same instrument at rest, not a degraded one. Sweep speed vs. node count is the load-bearing rule: `T = clamp(4.8s, 0.9·n, 9.6s)`. Six nodes → 5.4 s → 66.7°/s → 0.9 s of attention each. Three nodes → clamped up to 4.8 s so the beam never whips. Twelve nodes → clamped down to 9.6 s → 0.8 s each; below ~0.6 s per node the 700 ms ping tail starts overlapping the next arrival and reads as flicker instead of rhythm.

## Why it surprises

Menus don't have a clock. Every other nav on the page is a static column waiting to be read; this one is already running when you arrive, and the first thing you notice is not the labels but the *order* — you catch two pings in your peripheral vision and your brain silently files "cyan before magenta." Then comes the second, quieter surprise: the labels never rotate, even though the entire rig does, because each chip carries `rotate(-a) translateY(-r)` against its parent's `rotate(a)` — the counter-rotation is invisible until you look for it, at which point the nav reads as a gimballed instrument rather than a decorated list. And because the ping is an echo of a physical cause — *the beam touched here* — it doesn't feel like an animation someone added; it feels like a measurement being reported. That is the difference between chrome that is alive and chrome that is merely animated: the motion is the information.


---

## Spark 3 — thermal doc heatmap

## Intent

The document keeps a thermal record of your attention. A section you rest on warms — the neon cyan bleeds in from the left rail, a scanline grid ghosts up behind the prose, the mono `DWELL` readout climbs — and the moment your reading band leaves it, that heat starts bleeding away over a full minute at exactly 1.0 per 60s. Scroll back and the section is already cooling mid-glow, not reset. The reader feels tracked but not nagged: chrome brightens, prose never moves, and after a minute of walking away the page is cold, quiet, and holds no grudge. Read the whole doc and you end with a heatmap of where you actually were.

## Implementation

```html
<article class="dn-heat" tabindex="0" aria-labelledby="s2">
  <div class="dn-heat__glow" aria-hidden="true"></div>
  <h2 id="s2">02 · Signal Integrity</h2>
  <p>Prose stays quiet while the chrome remembers you.</p>
  <span class="dn-heat__meter" aria-hidden="true">DWELL 00</span>
</article>
```

```css
@property --heat{syntax:"<number>";inherits:true;initial-value:0}

.dn-heat{
  --heat-dur:60s; --dn-src:188 100% 56%; --br:linear-gradient(hsl(var(--dn-src)/.92) 0 0);
  position:relative; isolation:isolate; contain:paint; margin:0 0 26px; padding:26px 30px 32px;
  color:#b9c5d8; background-color:#05070e;
  background-image:
    repeating-linear-gradient(0deg,hsl(var(--dn-src)/calc(var(--heat)*.055)) 0 1px,transparent 1px 22px),
    linear-gradient(90deg,hsl(var(--dn-src)/calc(var(--heat)*.15)),transparent 55%);
  clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,0 100%);
  box-shadow:inset 1px 0 0 hsl(var(--dn-src)/calc(.10 + var(--heat)*.70));
  transition:--heat var(--heat-dur) linear;
}
.dn-heat h2{margin:0 0 10px;font:400 12px/1 Electrolize,system-ui,sans-serif;letter-spacing:.24em;
  text-transform:uppercase;color:hsl(var(--dn-src)/calc(.40 + var(--heat)*.60))}
.dn-heat p{margin:0;max-width:66ch;font:400 15px/1.68 Inter,system-ui,sans-serif}

.dn-heat__glow{position:absolute;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(115% 85% at 12% -10%,hsl(var(--dn-src)/calc(var(--heat)*.26)),transparent 60%);
  box-shadow:inset 0 0 90px hsl(var(--dn-src)/calc(var(--heat)*.16))}

.dn-heat__meter{position:absolute;right:16px;bottom:12px;pointer-events:none;
  font:500 9.5px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.16em;
  color:hsl(var(--dn-src)/calc(.30 + var(--heat)*.70));
  opacity:calc(var(--heat)*1.6);font-variant-numeric:tabular-nums}
.dn-heat__meter::after{content:"";display:block;height:1px;margin-top:5px;width:62px;
  background:hsl(var(--dn-src)/.85);transform:scaleX(var(--heat));transform-origin:left}

.dn-heat:focus-visible{outline:0}
.dn-heat:focus-visible::after{content:"";position:absolute;inset:5px;pointer-events:none;
  background:
    var(--br) left 0 top 0/11px 1px no-repeat,    var(--br) left 0 top 0/1px 11px no-repeat,
    var(--br) right 0 top 0/11px 1px no-repeat,   var(--br) right 0 top 0/1px 11px no-repeat,
    var(--br) left 0 bottom 0/11px 1px no-repeat, var(--br) left 0 bottom 0/1px 11px no-repeat,
    var(--br) right 0 bottom 0/11px 1px no-repeat,var(--br) right 0 bottom 0/1px 11px no-repeat}

@media (pointer:coarse),(prefers-reduced-motion:reduce){
  .dn-heat{transition:none;--heat:0;box-shadow:inset 1px 0 0 hsl(var(--dn-src)/.28)}
  .dn-heat__glow,.dn-heat__meter{display:none}
}
```

```js
(() => {
  const nodes = [...document.querySelectorAll('.dn-heat')];
  if (matchMedia('(pointer: coarse)').matches ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)) return;   // static end-state, zero motion

  const TICK = 250, GAIN = 0.0325, COOL = 60;        // 8s to charge, 60s to bleed dry
  const heat = new WeakMap(), live = new Set();
  let timer = 0;

  const tick = () => {
    if (!live.size) { clearInterval(timer); timer = 0; return; }   // page goes inert
    live.forEach(el => {
      const h = Math.min(1, (heat.get(el) || 0) + GAIN);
      heat.set(el, h);
      el.style.setProperty('--heat-dur', '260ms');
      el.style.setProperty('--heat', h.toFixed(3));
      const m = el.querySelector('.dn-heat__meter');
      const v = String(Math.round(h * 100));
      if (m && m.dataset.v !== v) { m.dataset.v = v; m.textContent = 'DWELL ' + v; }
    });
  };

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      if (e.isIntersecting) {
        // resume from whatever the CSS transition has cooled to — no snap-back
        const now = parseFloat(getComputedStyle(el).getPropertyValue('--heat')) || 0;
        heat.set(el, now);
        live.add(el);
        if (!timer) timer = setInterval(tick, TICK);
      } else if (live.delete(el)) {
        const h = heat.get(el) || 0;
        heat.set(el, 0);
        el.style.setProperty('--heat-dur', (h * COOL).toFixed(2) + 's'); // constant 1/60s rate
        el.style.setProperty('--heat', '0');
      }
    }
  }, { rootMargin: '-42% 0px -42% 42%', threshold: 0 });

  nodes.forEach(el => io.observe(el));
})();
```

*(Correct the observer options to `rootMargin: '-42% 0px -42% 0px'` — the trailing `42%` above is a typo; the 16%-tall band around the viewport midline is what defines "lingering here".)*

## Perf & motion budget

Ambient loop slots used: **zero of three**. Nothing is scheduled at rest — the `setInterval` is created lazily on the first entering section and `clearInterval`'d the instant `live` empties, so a settled page runs no timers, no `requestAnimationFrame`, no observers firing. One interval serves the whole page at 4 Hz (not one per section), and it only writes when it is charging. The 60-second cool is a declarative transition on a registered custom property: the browser owns the interpolation, it terminates by construction, and the only painted output is `--heat`-derived gradient alpha inside `contain: paint`, so repaint is bounded to the cooling surface's own box. The meter bar is `transform:scaleX()` — compositor, no layout.

**Phone (`pointer: coarse`)**: the script returns before constructing any observer; CSS forces `--heat:0`, kills the transition, and keeps a static 28%-alpha cyan rail so the surface still reads as an instrument. Zero animations, by law. **`prefers-reduced-motion: reduce`**: identical static end-state — full cold, fixed rail, `DWELL` readout `display:none`. **Hidden tab**: browsers throttle the interval, so heat simply stops climbing; the CSS transition keeps its wall-clock schedule and sections are already cooler when you return.

## Why it surprises

Every attention-tracking UI in existence is a *progress bar* — monotonic, permanent, a receipt. This one forgets. It's the first doc component that models the reader as a heat source with a thermal mass, so the feedback inverts: instead of rewarding you for finishing, it records that you *stopped*, and then quietly decays the evidence. The surprise lands on the scroll-back — a section you read ninety seconds ago is still faintly, measurably warmer than the one you skipped, which means the page now knows something about you that you can't reconstruct from the scrollbar. And it costs the motion budget nothing to say it.


---

## Spark 4 — keystroke sonar palette

## Intent

The palette stops being a filter over a list and becomes a sounding chamber. Every keystroke drops a stone into it: a thin neon wavefront leaves the caret, expands past the results, and fades into the ink. The three nearest rows answer back a beat later — each one flaring a bracketed `PING 148` chip that fades to a dim standby. The user feels *heard* rather than processed: the ring's reach is not decorative, it is computed from the interval since the previous keystroke, so fast confident typing throws wide overlapping shockwaves while a hesitant single letter barely ripples. Speed becomes a visible physical quantity, and the ping number is the actual measured cadence printed in milliseconds — the hand's tempo rendered as HUD telemetry.

## Implementation

```html
<div class="dn-palette" style="--dn-src:#00f0ff">
  <div class="dn-field">
    <span class="dn-mirror" aria-hidden="true"></span>
    <input class="dn-input" placeholder="Jump to file, node, command…">
  </div>
  <div class="dn-sonar" aria-hidden="true"></div>
  <ul class="dn-results">
    <li aria-selected="true">palette/keystroke.ts <b class="dn-ping">PING 214</b></li>
    <li>sonar/ring.ts <b class="dn-ping">PING 176</b></li>
    <li>render/echo.ts <b class="dn-ping">PING 138</b></li>
  </ul>
</div>
```

```css
/* ── KEYSTROKE SONAR PALETTE ───────────────────────────────────────── */
.dn-palette{--dn-src:#00f0ff;position:fixed;left:50%;top:13vh;translate:-50% 0;
  width:min(560px,92vw);background:#05070e;border:1px solid #16233a;color:#c9d8ec;
  font:400 12.5px/1 'JetBrains Mono',ui-monospace,monospace;
  box-shadow:0 30px 80px -30px #000,inset 0 0 0 1px #0b1220}
.dn-palette::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
  background:repeating-linear-gradient(0deg,#0b1a2e 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.dn-field{position:relative;display:flex;align-items:center;height:46px;padding:0 14px;
  border-bottom:1px solid #16233a;
  clip-path:polygon(0 0,100% 0,100% 100%,11px 100%,0 calc(100% - 11px))}/* the one notch */
.dn-field:focus-within::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:
   linear-gradient(var(--dn-src),var(--dn-src)) 0 0/10px 1px no-repeat,
   linear-gradient(var(--dn-src),var(--dn-src)) 0 0/1px 10px no-repeat,
   linear-gradient(var(--dn-src),var(--dn-src)) 100% 0/10px 1px no-repeat,
   linear-gradient(var(--dn-src),var(--dn-src)) 100% 0/1px 10px no-repeat,
   linear-gradient(var(--dn-src),var(--dn-src)) 100% 100%/10px 1px no-repeat,
   linear-gradient(var(--dn-src),var(--dn-src)) 100% 100%/1px 10px no-repeat}
.dn-input,.dn-mirror{font:400 15px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.02em}
.dn-input{flex:1;min-width:0;border:0;padding:0;background:none;color:#eaf4ff;
  caret-color:var(--dn-src);outline:0}
.dn-mirror{position:absolute;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none}
.dn-sonar{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:3}
.dn-ring{position:absolute;display:block;width:96px;height:96px;border-radius:50%;/*wavefront*/
  border:2px solid var(--dn-src);box-shadow:0 0 16px -5px var(--dn-src);will-change:transform,opacity}
.dn-results{list-style:none;margin:0;padding:6px 0;max-height:44vh;overflow:auto}
.dn-results li{display:flex;align-items:center;height:34px;padding:0 14px;color:#8ea6c6}
.dn-results li[aria-selected="true"]{color:#eaf4ff;box-shadow:inset 2px 0 0 var(--dn-src);
  background:linear-gradient(90deg,rgba(0,240,255,.14),transparent 72%)}
.dn-ping{margin-left:auto;padding:2px 6px;border:1px solid currentColor;opacity:.32;
  font-size:10px;letter-spacing:.16em;color:var(--dn-src)}
```

```js
(() => {
  const pal = document.querySelector('.dn-palette'), field = pal.querySelector('.dn-field');
  const input = pal.querySelector('.dn-input'), mirror = pal.querySelector('.dn-mirror');
  const sonar = pal.querySelector('.dn-sonar'), rows = [...pal.querySelectorAll('.dn-results li')];
  const calm = matchMedia('(prefers-reduced-motion: reduce)'), phone = matchMedia('(max-width:640px)');
  const loud = () => !calm.matches && !phone.matches;   // PERF LAW gate — single source of truth
  const R = 48;                                          // base ring radius px (96px box)
  let last = -1e9;

  const caret = () => {                                  // measured, never guessed
    mirror.textContent = input.value.slice(0, input.selectionStart ?? 0);
    const f = field.getBoundingClientRect(), p = pal.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(field).paddingLeft);
    return { x: f.left - p.left + pad + mirror.getBoundingClientRect().width - input.scrollLeft,
             y: f.top  - p.top + field.clientHeight / 2 };
  };

  const ring = (x, y, power) => {                        // spread r → scale r/R, compositor-only
    if (sonar.childElementCount > 2) sonar.firstElementChild.remove();   // 3-ring budget
    const el = document.createElement('i'); el.className = 'dn-ring';
    el.style.left = x + 'px'; el.style.top = y + 'px'; sonar.append(el);
    const reach = 44 + 34 * power;                       // px radius, 44…78
    el.animate([{ transform: 'translate(-50%,-50%) scale(.25)', opacity: .9 },
                { transform: `translate(-50%,-50%) scale(${(reach / R).toFixed(2)})`, opacity: 0 }],
      { duration: 480 + 160 * power, easing: 'cubic-bezier(.16,.84,.3,1)' })
      .finished.finally(() => el.remove());               // self-GC, no timers held
  };

  const echo = (row, i, power) => {
    const chip = row.querySelector('.dn-ping');
    chip.textContent = 'PING ' + String(Math.max(12, Math.round(214 - power * 96 - i * 38))).padStart(3, '0');
    chip.style.opacity = 1;                               // static end-state for phone / calm
    if (!loud()) return;
    const d = 60 + i * 44 + power * 40;                   // row distance → echo delay (ms)
    chip.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 200, delay: d, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
    clearTimeout(chip._t);
    chip._t = setTimeout(() => { chip.style.opacity = ''; }, 900 + d);
  };

  input.addEventListener('input', () => {
    const t = performance.now();
    const power = Math.min(1, Math.max(0, 1 - (t - last) / 420));  // fast strokes = long reach
    last = t;
    const { x, y } = caret();
    if (loud()) ring(x, y, power);
    rows.slice(0, 3).forEach((row, i) => echo(row, i, power));
  });

  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); pal.hidden = !pal.hidden; if (!pal.hidden) input.focus();
    }
  });
})();
```

## Perf & motion budget

**Loop slot used: none.** The sonar is event-driven, so it takes zero of the three desktop ambient loop slots — those stay free for the grid drift, the


---

## Spark 5 — circuit-trace loader

## Intent

Waiting becomes *watching a signal travel*. The page doesn't spin — it routes. A single neon trace leaves the left edge of the viewport, runs along the circuit's own 44px grid, cuts two 45° chamfers, drops a via at each corner that ignites *exactly* as the drawing head reaches it (arc-length delay, not a fixed stagger), and terminates one pixel short of the content slot. Then the trace disintegrates into a dotted scatter while the content wipes in from that same left-hand edge — so the content feels physically *delivered* by the trace rather than uncovered behind it. The user never sees a spinner; they see a signal arriving.

## Implementation

```html
<!-- #dn-loader MUST be a preceding sibling of the slot for the clip-path cascade -->
<div id="dn-loader" aria-hidden="true"><svg id="dn-trace" xmlns="http://www.w3.org/2000/svg"></svg></div>
<main data-dn-slot>…</main>
```

```css
:root{--dn-ink:#05070e;--dn-src:#35e6ff}
#dn-loader{position:fixed;inset:0;z-index:9999;background:var(--dn-ink);contain:strict;transition:background-color .3s linear}
#dn-loader::after{content:"";position:absolute;inset:0;opacity:.55;pointer-events:none;
  background:linear-gradient(#0d1730 1px,transparent 1px) 0 0/100% 44px,
             linear-gradient(90deg,#0d1730 1px,transparent 1px) 0 0/44px 100%}
#dn-loader svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#dn-trace path{fill:none;stroke:var(--dn-src);stroke-width:2.5;stroke-linecap:square;stroke-linejoin:miter;
  filter:drop-shadow(0 0 5px var(--dn-src))}
#dn-trace .via{fill:var(--dn-ink);stroke:var(--dn-src);stroke-width:2;opacity:0;transition:opacity .24s ease-out}
#dn-trace .core{fill:var(--dn-src);opacity:0;transition:opacity .24s ease-out}
#dn-trace .bloom{fill:none;stroke:var(--dn-src);stroke-width:2;opacity:0;transform-box:fill-box;transform-origin:center}
#dn-loader.dn-out{background-color:transparent}
#dn-loader.dn-out::after{opacity:0;transition:opacity .3s linear}
#dn-loader.dn-out path{stroke-dasharray:2 12;stroke-width:1.2;opacity:0}
#dn-loader.dn-out .via,#dn-loader.dn-out .core{opacity:0!important}
#dn-loader ~ [data-dn-slot]{clip-path:inset(0 100% 0 0);transition:clip-path .46s cubic-bezier(.2,.9,.1,1)}
#dn-loader.dn-out ~ [data-dn-slot]{clip-path:inset(0 0 0 0)}
@media (prefers-reduced-motion:reduce),(max-width:640px),(pointer:coarse){
  #dn-loader{display:none}
  #dn-loader ~ [data-dn-slot]{clip-path:none;transition:none}
}
```

```js
(()=>{
const NS='http://www.w3.org/2000/svg';
const mk=(t,a={})=>{const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);return n;};
const host=document.getElementById('dn-loader'),svg=document.getElementById('dn-trace');
const slot=document.querySelector('[data-dn-slot]');
if(!host||!svg)return;
if(matchMedia('(prefers-reduced-motion:reduce),(max-width:640px),(pointer:coarse)').matches)return;
const DRAW=1150,CH=18;                                    // draw ms · chamfer px

const r=slot?slot.getBoundingClientRect():{left:innerWidth/2-190,top:innerHeight/2-100,width:380,height:200};
const ty=Math.round(r.top+r.height*.5),y0=Math.round(innerHeight*.68);
const x1=Math.max(24,Math.round(Math.min(innerWidth*.17,r.left-140))),ym=Math.round((y0+ty)/2);
const x2=Math.max(x1+70,Math.round(r.left-90)),tx=Math.round(r.left-1);
const pts=[[-6,y0],[x1,y0],[x1,ym],[x2,ym],[x2,ty],[tx,ty]];

const d=[`M${pts[0][0]} ${pts[0][1]}`],vias=[];let acc=0;
for(let i=1;i<pts.length-1;i++){
  const [ax,ay]=pts[i-1],[bx,by]=pts[i],[cx,cy]=pts[i+1];
  const l1=Math.hypot(bx-ax,by-ay)||1,l2=Math.hypot(cx-bx,cy-by)||1,k=Math.min(CH,l1/2,l2/2);
  const p1=[bx+(ax-bx)/l1*k,by+(ay-by)/l1*k],p2=[bx+(cx-bx)/l2*k,by+(cy-by)/l2*k];
  d.push(`L${p1[0]} ${p1[1]}`,`L${p2[0]} ${p2[1]}`);
  acc+=l1;vias.push({pt:[(p1[0]+p2[0])/2,(p1[1]+p2[1])/2],at:acc-k/2});   // via on the 45° cut
}
const end=pts[pts.length-1];d.push(`L${end[0]} ${end[1]}`);

const p=mk('path',{d:d.join('')});svg.appendChild(p);
const L=p.getTotalLength();
p.setAttribute('stroke-dasharray',`${L} ${L}`);          // attribute, so .dn-out can win the cascade
p.setAttribute('stroke-dashoffset',L);
p.style.transition=`stroke-dashoffset ${DRAW}ms cubic-bezier(.45,.05,.2,1),`+
  `stroke-dasharray .38s ease-in,stroke-width .38s ease-in,opacity .38s ease-in .1s`;

vias.forEach(v=>{
  const ring=mk('circle',{class:'via',cx:v.pt[0],cy:v.pt[1],r:6.5});
  const core=mk('circle',{class:'core',cx:v.pt[0],cy:v.pt[1],r:2.2});
  svg.append(ring,core);
  const t=Math.max(0,v.at/L)*DRAW;
  ring.style.transitionDelay=t+'ms';core.style.transitionDelay=(t+70)+'ms';
  requestAnimationFrame(()=>{ring.style.opacity=1;core.style.opacity=1;});
});

requestAnimationFrame(()=>p.setAttribute('stroke-dashoffset',0));
setTimeout(()=>{
  host.classList.add('dn-out');
  const b=mk('circle',{class:'bloom',cx:end[0],cy:end[1],r:3});svg.appendChild(b);
  b.animate([{transform:'scale(1)',opacity:1},{transform:'scale(16)',opacity:0}],
            {duration:520,easing:'cubic-bezier(.2,.9,.1,1)',fill:'forwards'});
  setTimeout(()=>host.remove(),900);
},DRAW+60);
})();
```

## Perf & motion budget

**Loop slot: zero of three.** This is a one-shot, self-terminating route — it builds one `<path>`, four via pairs, one bloom, then calls `host.remove()` and returns the compositor to the page. No `requestAnimationFrame` loop, no idle work after ~1.66s.

**Phone:** the media query is evaluated *before* JS runs, so `#dn-loader` is `display:none` and the slot's `clip-path` is `none` — zero animation frames, zero `getBoundingClientRect`/`getTotalLength` layout thrash, zero SVG nodes created (the JS guard bails). Content paints on the first frame. `contain:strict` on the overlay keeps any residual paint scoped.

**Reduced motion:** identical end-state, declared declaratively in CSS — the loader never renders, the slot is never clipped, so there is no one-frame black flash that a JS-only collapse would produce. The `dn-out` dissolve (`stroke-dasharray: L L → 2 12`, interpolable because both are two-value lists) simply never runs.

**Ship-safe:** if JS dies, the slot stays clipped — add `<noscript><style>#dn-loader{display:none}#dn-loader~[data-dn-slot]{clip-path:none}</style></noscript>`. The `drop-shadow` filter costs one raster pass per frame of a single 2.5px stroke for 1.15s; swap to a duplicate 1px-offset path if you're targeting low-end integrated GPUs.

## Why it surprises

Spinners are honest about being fake. This isn't: the geometry is *computed from the target element's actual bounding box*, so the trace genuinely routes to where the content will be — resize the window and it re-plans like a real autorouter. The vias don't blink on a timer, they ignite at `arcLength/DRAW`, which means they read as **propagation** rather than decoration: the head passes, the pad lights. Then the payoff — the dissolve uses `stroke-dasharray` interpolation (a full-length dash collapsing to `2 12`), so the trace *shatters into its own copper* instead of fading, and the content wipes in on the exact same left-to-right vector. The eye's expectation that the line and the content are the same event is met, which is the one thing a progress indicator almost never manages.


---

## Spark 6 — constellation breadcrumb

## Intent

The breadcrumb is the least-loved pixel on any documentation page — a row of grey slashes you scroll past. Here it becomes the dock's ceiling chart: four diamonds strung on a dotted meridian, stepping up and down like real star positions, quietly claiming that the hierarchy *is* the geometry. The user notices it peripherally on arrival — a line drawing itself across the top of the viewport — and then discovers it responds: hover "spark" and that one star ignites in its own hue, its label takes the color, and a 1px meridian drops from the diamond toward the ceiling floor before the clip-path cuts it off. Nothing moves unless touched. It feels like a HUD that was always watching, not a nav that was added.

## Implementation

```html
<nav class="dn-crumbs" aria-label="Breadcrumb">
  <svg class="dn-crumbs__sky" preserveAspectRatio="none" aria-hidden="true"></svg>
  <ol class="dn-crumbs__list">
    <li><a class="dn-star" href="/"            style="--dn-src:#22e6ff"><i></i><span>root</span></a></li>
    <li><a class="dn-star" href="/sig"         style="--dn-src:#ff2fd0"><i></i><span>signals</span></a></li>
    <li><a class="dn-star" href="/sig/spark"   style="--dn-src:#7c5cff"><i></i><span>spark</span></a></li>
    <li><a class="dn-star" href="/sig/spark/6" style="--dn-src:#ffe94a" aria-current="page"><i></i><span>06 · constellation</span></a></li>
  </ol>
</nav>
```

```css
.dn-crumbs{position:fixed;inset:0 0 auto;height:52px;z-index:60;display:flex;align-items:center;
  padding:0 22px 0 26px;border-bottom:1px solid #132038;
  background:repeating-linear-gradient(0deg,#ffffff05 0 1px,#0000 1px 3px),
             linear-gradient(#05070e,#05070e 72%,#05070e00);
  clip-path:polygon(0 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px))}
.dn-crumbs__sky{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.dn-crumbs__sky polyline{fill:none;stroke:#22e6ff;stroke-opacity:.35;stroke-width:1;
  stroke-dasharray:1 5;stroke-linecap:round;stroke-linejoin:round}
.dn-crumbs__list{position:relative;z-index:1;display:flex;align-items:center;gap:36px;
  margin:0;padding:0;list-style:none}
.dn-star{display:flex;align-items:center;gap:9px;color:#7d8fb0;text-decoration:none;
  font:500 10px/1 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.16em;
  text-transform:uppercase;transition:color .16s}
.dn-star i{position:relative;flex:none;width:7px;height:7px;background:#1a2740;outline:1px solid #16223a;
  transform:rotate(45deg);transition:background .16s,outline-color .16s,box-shadow .16s,transform .16s}
.dn-crumbs__list li:nth-child(odd)  .dn-star i{margin-block-end:9px}
.dn-crumbs__list li:nth-child(even) .dn-star i{margin-block-start:9px}
.dn-star i::after{content:'';position:absolute;left:50%;top:100%;width:1px;height:26px;
  background:linear-gradient(var(--dn-src),#0000);transform:rotate(-45deg);transform-origin:top center;
  opacity:0;transition:opacity .2s}
.dn-star:hover,.dn-star:focus-visible{color:var(--dn-src);outline:none}
.dn-star:hover i,.dn-star:focus-visible i{background:var(--dn-src);outline-color:var(--dn-src);
  box-shadow:0 0 12px 1px color-mix(in srgb,var(--dn-src) 60%,#0000);transform:rotate(45deg) scale(1.45)}
.dn-star:hover i::after,.dn-star:focus-visible i::after{opacity:1}
.dn-star[aria-current] i{background:var(--dn-src);outline-color:var(--dn-src)}
@keyframes dn-twinkle{0%,100%{box-shadow:0 0 5px 0 var(--dn-src)}
  50%{box-shadow:0 0 16px 3px var(--dn-src);transform:rotate(45deg) scale(1.2)}}
@media (min-width:641px) and (prefers-reduced-motion:no-preference){
  .dn-star[aria-current] i{animation:dn-twinkle 4.8s ease-in-out infinite}}
@media (max-width:640px){.dn-crumbs__list{gap:20px}
  .dn-star span{display:none}.dn-star[aria-current] span{display:inline}}
@media (prefers-reduced-motion:reduce){
  .dn-crumbs *{animation:none!important;transition:none!important}}
```

```js
(() => {
  const nav  = document.querySelector('.dn-crumbs');
  const sky  = nav.querySelector('.dn-crumbs__sky');
  const gems = [...nav.querySelectorAll('.dn-star i')];
  const NS   = 'http://www.w3.org/2000/svg';
  let line, queued = 0;

  function draw() {                                  // one layout read, one write
    queued = 0;
    const box = nav.getBoundingClientRect();
    line = line || sky.appendChild(document.createElementNS(NS, 'polyline'));
    sky.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    line.setAttribute('points', gems.map(g => {
      const r = g.getBoundingClientRect();           // rotated bbox — centre is exact
      return `${(r.left - box.left + r.width / 2).toFixed(1)},` +
             `${(r.top - box.top + r.height / 2).toFixed(1)}`;
    }).join(' '));
  }

  const queue = () => { queued ||= requestAnimationFrame(draw); };

  new ResizeObserver(queue).observe(nav);
  addEventListener('resize', queue, { passive: true });
  document.fonts?.ready.then(queue);                 // labels change widths after webfont swap
  queue();
})();
```

## Perf & motion budget

**Loop slot 2 of 3.** The only ambient animation on this surface is `dn-twinkle` on the terminal star (4.8s, `box-shadow` + `transform` only, gated behind `min-width:641px` *and* `prefers-reduced-motion:no-preference`). The dotted constellation line is **static** — `stroke-dasharray:1 5` is a pattern, not an animated dash-offset, so there is no marching-ants loop. Hover ignition is a 160–200ms transition on `background-color`, `outline-color`, `box-shadow`, `transform`, `opacity` — all compositor-friendly, zero reflow. The meridian reveals via `opacity` only, never `height`.

**Phones:** the `min-width:641px` guard means **zero animations** — the current star renders at its static lit end-state, labels collapse to just the active crumb (`gap:20px` keeps the four diamonds a legible constellation), and taps resolve instantly through `:focus-visible`. Nothing listens to scroll; `draw()` fires only on `ResizeObserver` and webfont settle, coalesced into a single `requestAnimationFrame` so there's at most one layout read + one attribute write per resize — the parallax-free guarantee is structural, not defended.

**Reduced motion:** everything collapses to a static end-state — terminal star at `box-shadow:0 0 5px 0 var(--dn-src)`, polyline fully plotted and still, meridian appearing instantly at full opacity on focus.

## Why it surprises

Because a breadcrumb is the one component every design system agrees should be boring, and this one has *topology*. The zigzag is the trick: by giving odd crumbs `margin-block-end:9px` and even crumbs `margin-block-start:9px`, the polyline the JS plots through their centers is never a ruler-straight rule — it's a genuine 2–4px constellation step, which is what makes the eye read "chart" instead of "slash-separated list". Then the hue payload arrives: each ancestor carries its own `--dn-src`, so hovering backwards through the trail plays a chord of cyan → magenta → violet → yellow rather than one uniform highlight, and the meridian gradient drops from the diamond until `clip-path` severs it at the ceiling floor — the notch on the left edge quietly explaining why the light stops there. It's ~35 lines of CSS and 26 of JS doing something no breadcrumb is supposed to be able to do: make you hover it on purpose.


---

## Spark 7 — pressure-gauge status

## Intent

You feel a machine holding pressure, not a progress bar filling up. The needle parks at **40** when everything is green — deliberately below the halfway mark, because on a pressure vessel "full" means "about to burst." Zones sit dim until they're live, so the eye reads the lit band, not the arc. When the build goes red the needle doesn't settle anywhere: it slams past the redline at 92% and then *cannot hold still*, shivering ±1.8° with an off-beat rhythm that never resolves into a loop you can tune out. The whole panel's hue shifts with it — cyan-green → electric yellow → magenta — because the state owns the light source, not a separate label.

## Implementation

```html
<div class="dn-gauge" data-state="pass" role="meter" tabindex="0"
     aria-label="build status" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40">
  <svg viewBox="0 0 200 160" aria-hidden="true">
    <path class="dn-track" d="M37.65 148A72 72 0 1 1 162.35 148"/>
    <path class="dn-zone dn-zone--ok"   pathLength="100" d="M37.65 148A72 72 0 1 1 162.35 148"/>
    <path class="dn-zone dn-zone--warn" pathLength="100" d="M37.65 148A72 72 0 1 1 162.35 148"/>
    <path class="dn-zone dn-zone--bad"  pathLength="100" d="M37.65 148A72 72 0 1 1 162.35 148"/>
    <g class="dn-needle"><g class="dn-jitter">
      <path class="dn-blade" d="M100 50 L104.5 102 L100 112 L95.5 102 Z"/>
      <circle class="dn-hub" cx="100" cy="112" r="5"/>
    </g></g>
  </svg>
  <p class="dn-read"><span class="dn-val">040</span><span class="dn-unit">%</span></p>
</div>

<style>
.dn-gauge{--h:#2bff9c;position:relative;width:min(330px,86vw);padding:14px 16px 10px;
  font:400 12px/1 "JetBrains Mono",ui-monospace,monospace;color:#8fa6c4;outline:none;
  background:
    radial-gradient(140% 96% at 50% 118%,color-mix(in srgb,var(--h) 15%,transparent),transparent 62%),
    repeating-linear-gradient(0deg,rgba(34,224,255,.06) 0 1px,transparent 1px 4px),
    #05070e;
  border:1px solid color-mix(in srgb,var(--h) 30%,#0d1626);
  clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,0 100%)}
.dn-gauge[data-state="warn"]{--h:#ffd400}
.dn-gauge[data-state="fail"]{--h:#ff2d6f}
.dn-gauge svg{display:block;width:100%;height:auto;overflow:visible}
.dn-track,.dn-zone{fill:none;stroke-width:9;stroke-linecap:butt}
.dn-track{stroke:#14213a}
.dn-zone{opacity:.22;transition:opacity .25s,filter .25s}
.dn-zone--ok{--z:#2bff9c;stroke:var(--z);stroke-dasharray:16 84;stroke-dashoffset:-32}
.dn-zone--warn{--z:#ffd400;stroke:var(--z);stroke-dasharray:26 74;stroke-dashoffset:-52}
.dn-zone--bad{--z:#ff2d6f;stroke:var(--z);stroke-dasharray:18 82;stroke-dashoffset:-82}
.dn-gauge[data-state="pass"] .dn-zone--ok,
.dn-gauge[data-state="warn"] .dn-zone--warn,
.dn-gauge[data-state="fail"] .dn-zone--bad{opacity:1;filter:drop-shadow(0 0 6px var(--z))}
.dn-needle,.dn-jitter{transform-box:view-box;transform-origin:100px 112px}
.dn-needle{transition:transform .55s cubic-bezier(.18,1.08,.26,1)}
.dn-blade{fill:var(--h);filter:drop-shadow(0 0 5px var(--h))}
.dn-hub{fill:#05070e;stroke:var(--h);stroke-width:2}
.dn-gauge[data-state="fail"] .dn-jitter{animation:dn-jit .42s infinite}
@keyframes dn-jit{
  0%,100%{transform:rotate(0) translate(0,0)}
  18%{transform:rotate(1.5deg) translate(.7px,-.3px)}
  37%{transform:rotate(-1.2deg) translate(-.6px,.4px)}
  58%{transform:rotate(1deg) translate(.4px,.2px)}
  79%{transform:rotate(-1.8deg) translate(-.5px,-.3px)}}
.dn-read{margin:-20px 0 2px;text-align:center;letter-spacing:.1em}
.dn-val{font-size:22px;color:var(--h);text-shadow:0 0 12px color-mix(in srgb,var(--h) 55%,transparent)}
.dn-unit{font-size:10px;opacity:.6;margin-left:2px}
.dn-gauge::after{content:"";position:absolute;inset:6px;border:1px solid var(--h);opacity:0;
  pointer-events:none;transition:opacity .15s;
  clip-path:polygon(0 0,18px 0,18px 18px,calc(100% - 18px) 18px,calc(100% - 18px) 0,100% 0,
    100% 100%,calc(100% - 18px) 100%,calc(100% - 18px) calc(100% - 18px),
    18px calc(100% - 18px),18px 100%,0 100%)}
.dn-gauge:focus-visible::after{opacity:.85}
@media (max-width:720px),(hover:none){
  .dn-needle,.dn-jitter,.dn-zone{transition:none!important;animation:none!important}}
@media (prefers-reduced-motion:reduce){
  .dn-gauge *,.dn-gauge::after{transition:none!important;animation:none!important}}
</style>

<script>
(() => {
  const el = document.querySelector('.dn-gauge');
  const needle = el.querySelector('.dn-needle');
  const out = el.querySelector('.dn-val');
  const LUT = { pass:[40,'nominal'], warn:[66,'degraded'], fail:[92,'overpressure'] };
  const order = ['pass','warn','fail'];
  const set = s => {
    if (!(s in LUT)) s = 'pass';
    const [v, word] = LUT[s];
    const deg = -120 + 2.4 * Math.min(100, Math.max(0, v));  // −120°…+120°
    el.dataset.state = s;
    needle.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    out.textContent = String(v).padStart(3, '0');
    el.setAttribute('aria-valuenow', v);
    el.setAttribute('aria-valuetext', `${v} percent — ${word}`);
  };
  el.addEventListener('click', () => set(order[(order.indexOf(el.dataset.state) + 1) % 3]));
  el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
  });
  window.dnGauge = set;   // dnGauge('fail') from your test runner
  set('pass');
})();
</script>
```

Arc geometry: pivot `(100,112)`, radius `72`, sweep `−120°→+120°` (240°). Zone bands are the *same* path with `pathLength="100"`, so `stroke-dasharray:16 84; stroke-dashoffset:-32` paints exactly 32→48 (green, centred on 40). Needle math is a single affine map: `deg = −120 + 2.4 × value`.

## Perf & motion budget

- **Loop slot:** zero ambient loops in `pass` and `warn`. The `fail` state spends **slot 1 of 3** on `dn-jit` — and it is strictly state-gated, so a healthy page runs this component at 0% continuous cost. Needle transit is a one-shot 550 ms `cubic-bezier(.18,1.08,.26,1)` (slight overshoot = mechanical settle, not a loop).
- **Phones:** `(max-width:720px),(hover:none)` kills all transitions and animations. The needle *jumps* to the angle. State still reads because `--h`, the lit zone, and the `drop-shadow` glow are static paint, not motion.
- **Reduced motion:** identical collapse — needle is at final angle, jitter removed, active band stays lit at `opacity:1`. The end-state is a fully legible red gauge, not a dead one. No `will-change`, no JS rAF, no layout thrash: the only animated properties are `transform` and `opacity`.

## Why it surprises

Every status widget in the world treats "good" as "full" — 100%, all bars green, maximum fill. This one treats good as **40%**, because it's modelled on a pressure vessel where headroom *is* the safety margin. The first time someone sees the needle sitting low with everything green, they misread it as a failing build — and that misread is the lesson: the gauge measures load, not completion. The second surprise is the failure mode: red doesn't just recolour, it becomes *unstable*. The jitter (±1.8° / 420 ms with a non-symmetric keyframe distribution and sub-pixel translation on a different period than the rotation) means the needle never returns to the same spot on screen, so peripheral vision never filters it as a repeating loop — exactly how a real overpressurised dial refuses to be ignored.

---

## Ledger

| slice | sparks | tokens (salvo) | note |
| --- | --- | --- | --- |
| 1/7 (re-landed after the wipe) | 7/7 | 72,893 original burn | spec rebuilt from the session ledger |
| 2/7 | 7/7 | 99,709 | this document |
| 3/7–7/7 | — | — | remaining (Nov ÷ 7 plan) |
