import * as d3 from 'd3'
import type { Network } from './network'

export type Positions = Map<string, { id: string; x: number; y: number }>

export function computeLayout(network: Network, width: number, height: number): Positions {
  type N = d3.SimulationNodeDatum & { id: string }
  type L = d3.SimulationLinkDatum<N>

  const ids = [
    ...network.json.stops.map(s => s.id),
    ...network.json.junctions.map(j => j.id),
  ]
  const nodes: N[] = ids.map(id => ({ id }))
  const idxOf = new Map(nodes.map((n, i) => [n.id, i]))

  const links: L[] = Array.from(network.segmentByKey.values()).map(seg => ({
    source: idxOf.get(seg.endpoints[0])!,
    target: idxOf.get(seg.endpoints[1])!,
  }))

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink<N, L>(links).id((_, i) => i).distance(80))
    .force('charge', d3.forceManyBody<N>().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .stop()

  for (let i = 0; i < 300; i++) sim.tick()

  const positions: Positions = new Map()
  for (const n of nodes) {
    positions.set(n.id, { id: n.id, x: n.x ?? 0, y: n.y ?? 0 })
  }
  return positions
}
