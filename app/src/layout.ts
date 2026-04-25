import * as d3 from 'd3'
import type { Network } from './network'

export type Positions = Map<string, { id: string; x: number; y: number }>

const SVG_W = 1190.55
const SVG_H = 841.89
const PADDING = 40

function allNodesHavePositions(network: Network): boolean {
  return (
    network.json.stops.every(s => s.x != null && s.y != null) &&
    network.json.junctions.every(j => j.x != null && j.y != null)
  )
}

export function computeLayout(network: Network, width: number, height: number): Positions {
  if (allNodesHavePositions(network)) {
    const scaleX = (width - PADDING * 2) / SVG_W
    const scaleY = (height - PADDING * 2) / SVG_H
    const positions: Positions = new Map()
    for (const s of network.json.stops) {
      positions.set(s.id, { id: s.id, x: PADDING + s.x! * scaleX, y: PADDING + s.y! * scaleY })
    }
    for (const j of network.json.junctions) {
      positions.set(j.id, { id: j.id, x: PADDING + j.x! * scaleX, y: PADDING + j.y! * scaleY })
    }
    return positions
  }

  // Fallback: force-directed layout (used when x/y are absent)
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
    .force('link', d3.forceLink<N, L>(links).id((_, i) => i).distance(50))
    .force('charge', d3.forceManyBody<N>().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .stop()

  for (let i = 0; i < 300; i++) sim.tick()

  const positions: Positions = new Map()
  for (const n of nodes) {
    positions.set(n.id, { id: n.id, x: n.x ?? 0, y: n.y ?? 0 })
  }
  return positions
}
