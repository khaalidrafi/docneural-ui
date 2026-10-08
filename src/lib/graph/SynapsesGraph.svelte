<script lang="ts">
  // SynapsesGraph — the "synapses" hero view, driven by the REAL
  // org-roam-lite-ui graph engine (Layer 2 of the embed playbook): we mount
  // orui's own GraphView against orui's own observable store, and feed that
  // store from synapt's static graph.json instead of Emacs's WebSocket.
  //
  // Why the genuine component instead of synapt's port: upstream keeps
  // improving the canvas (theme-token repaints, focus tweens, warmup
  // tuning); aliasing `orui/*` (see vite.config) means we inherit every
  // fix with zero port work.
  //
  // Bridge rules, in order of consequence:
  //  - FILTERS: synapt's tag chips are INCLUSIVE ("show docs carrying one of
  //    these tags"), orui's store filter only excludes. So instead of
  //    mapping the filter across, we swap whole snapshots: the effect reads
  //    `store.visible` (filteredGraph over query+tags) and re-applies.
  //    GraphView reuses its engine-side node objects BY ID across syncs, so
  //    the physics (positions, velocities) survive every keystroke — only
  //    hidden nodes leave the canvas.
  //  - SELECTION: forwarded through the store's focus-request channel, the
  //    same one Emacs `follow` uses. A plain pan (no `fit`), because the
  //    user never wants a click to also yank the zoom level.
  import GraphView from 'orui/graph/GraphView.svelte'
  import { createGraphStore } from 'orui/state/graphStore'
  import type { OrgRoamNode } from 'orui/api'
  import { loadEngine, toRoam } from './roamBridge'
  import type { SynaptStore } from '../core/store.svelte'

  let {
    store,
    onNodeClick
  }: {
    store: SynaptStore
    onNodeClick: (id: string) => void
  } = $props()

  const roam = createGraphStore()

  // Data, query or tags moved -> swap the snapshot the canvas sees.
  $effect(() => {
    roam.applyGraphdata(toRoam(store.visible))
  })

  // A selection made anywhere (rail, palette, reader) pans the camera.
  // Fresh request object per run is the contract: GraphView acts on focus
  // IDENTITY and ignores repeats, so old selections do not re-tween.
  $effect(() => {
    const sel = store.selected
    if (sel) roam.setFocus({ id: sel.id })
  })

  function click(node: OrgRoamNode): void {
    onNodeClick(node.id)
  }
</script>

<div class="roam-wrap">
  <!-- loadEngine comes from roamBridge so the import resolves from SYNAPT's
       node_modules (Vite resolves bare specifiers relative to the importing
       file, and GraphView.svelte lives in the sibling orui checkout). -->
  <GraphView store={roam} onNodeClick={click} {loadEngine} />
</div>

<style>
  .roam-wrap {
    position: absolute;
    inset: 0;
    /* Map the site theme onto orui's canvas tokens. GraphView polls the
       container's COMPUTED style twice a second, so these literal rgba()
       values (canvas fillStyle cannot parse var()/color-mix(), which is why
       --sy-graph-link carries the resolved color per theme in synapt.css)
       repaint the wires when the site's theme toggle flips. */
    --orui-link-color: var(--sy-graph-link);
  }
</style>
