/* Minimal ambient types for d3-force-3d, which force-graph pulls in
   transitively (its forceLayout is forceSimulation().force('link',
   forceLink()).force('charge', forceManyBody())…) but does not re-export and
   which ships no declarations of its own.

   Only the surface the physics tests touch is declared: a simulation node, the
   simulation handle with the chainable force() installer and one tick(). The
   tests assert on the resulting node positions, so nothing here needs to be
   precise about d3's internals — only precise enough that a caller cannot
   silently misuse the two forces under test. */
declare module 'd3-force-3d' {
  export interface SimulationNode {
    index?: number
    x: number
    y: number
    z?: number
    vx: number
    vy: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
  }

  export interface Simulation<N extends SimulationNode> {
    tick(iterations?: number): this
    stop(): this
    force(name: string, force: Force<N> | null): this
    nodes(): N[]
    alpha(alpha: number): this
    alphaDecay(decay: number): this
    velocityDecay(decay: number): this
    distanceMax(distance: number): this
    on(typenames: string, listener: () => void): this
  }

  export type Force<N extends SimulationNode> = {
    (alpha: number): void
    initialize?: (nodes: N[], random: () => number) => void
  }

  export function forceSimulation<N extends SimulationNode>(nodes?: N[]): Simulation<N>

  export interface ManyBody<N extends SimulationNode> extends Force<N> {
    strength(strength: number | ((node: N, i: number, nodes: N[]) => number)): this
    distanceMax(distance: number): this
  }

  export function forceManyBody<N extends SimulationNode>(): ManyBody<N>
}
