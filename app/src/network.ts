import type { NetworkJson, Segment, Line, SegmentLeg, StopJson, JunctionJson } from './types'

export interface Network {
  json: NetworkJson
  stopById: Map<string, StopJson>
  junctionById: Map<string, JunctionJson>
  segmentByKey: Map<string, Segment>
  adjacency: Map<string, Array<{ segmentKey: string; otherNodeId: string; lines: string[] }>>
  lines: Map<string, Line>
  simParams: { segmentTravelTime: number; dwellTime: number; turnaroundTime: number }
}

export function makeSegKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export function buildNetwork(json: NetworkJson): Network {
  const stopById = new Map(json.stops.map(s => [s.id, s]))
  const junctionById = new Map(json.junctions.map(j => [j.id, j]))

  for (const j of json.junctions) {
    if (stopById.has(j.id)) throw new Error(`Junction id '${j.id}' conflicts with a stop id`)
  }

  const segmentByKey = new Map<string, Segment>()
  const adjacency = new Map<string, Array<{ segmentKey: string; otherNodeId: string; lines: string[] }>>()

  for (const seg of json.segments) {
    const [a, b] = seg.endpoints as [string, string]
    const key = makeSegKey(a, b)
    segmentByKey.set(key, { key, endpoints: [a, b], lines: seg.lines, tracks: seg.tracks })
    if (!adjacency.has(a)) adjacency.set(a, [])
    if (!adjacency.has(b)) adjacency.set(b, [])
    adjacency.get(a)!.push({ segmentKey: key, otherNodeId: b, lines: seg.lines })
    adjacency.get(b)!.push({ segmentKey: key, otherNodeId: a, lines: seg.lines })
  }

  function findSegmentPath(lineId: string, fromStop: string, toStop: string): string[] {
    type QState = { nodeId: string; path: string[] }
    const visited = new Set([fromStop])
    const queue: QState[] = [{ nodeId: fromStop, path: [] }]

    while (queue.length) {
      const { nodeId, path } = queue.shift()!
      for (const { segmentKey, otherNodeId, lines } of adjacency.get(nodeId) ?? []) {
        if (!lines.includes(lineId) || visited.has(otherNodeId)) continue
        const newPath = [...path, segmentKey]
        if (otherNodeId === toStop) return newPath
        if (stopById.has(otherNodeId)) continue  // don't route through other stops
        visited.add(otherNodeId)
        queue.push({ nodeId: otherNodeId, path: newPath })
      }
    }
    throw new Error(`No path for line ${lineId}: ${fromStop} → ${toStop}`)
  }

  const lines = new Map<string, Line>()
  for (const lj of json.lines) {
    const route: SegmentLeg[] = []
    for (let i = 0; i < lj.stops.length - 1; i++) {
      route.push({
        fromStop: lj.stops[i],
        toStop: lj.stops[i + 1],
        segments: findSegmentPath(lj.id, lj.stops[i], lj.stops[i + 1]),
      })
    }
    lines.set(lj.id, {
      id: lj.id,
      stops: lj.stops,
      terminii: [lj.terminii[0], lj.terminii[1]] as [string, string],
      headwaySeconds: lj['headway-seconds'],
      maxTrains: lj['max-trains'],
      colour: lj.colour,
      route,
    })
  }

  return {
    json,
    stopById,
    junctionById,
    segmentByKey,
    adjacency,
    lines,
    simParams: {
      segmentTravelTime: json.simulation['segment-travel-time-seconds'],
      dwellTime: json.simulation['dwell-time-seconds'],
      turnaroundTime: json.simulation['turnaround-time-seconds'],
    },
  }
}

export function getLegSegments(network: Network, lineId: string, fromStop: string, toStop: string): string[] {
  const line = network.lines.get(lineId)!
  const fwd = line.route.find(r => r.fromStop === fromStop && r.toStop === toStop)
  if (fwd) return fwd.segments
  const rev = line.route.find(r => r.fromStop === toStop && r.toStop === fromStop)
  if (rev) return [...rev.segments].reverse()
  throw new Error(`No leg on line ${lineId}: ${fromStop} ↔ ${toStop}`)
}

export function otherEndpoint(segKey: string, fromNodeId: string, network: Network): string {
  const seg = network.segmentByKey.get(segKey)!
  return seg.endpoints[0] === fromNodeId ? seg.endpoints[1] : seg.endpoints[0]
}
