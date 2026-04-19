import type { Network } from './network'
import type { Train, SimState } from './types'
import { getLegSegments, otherEndpoint } from './network'

let _trainIdCounter = 0

export function createSimState(network: Network): SimState {
  const state: SimState = {
    simTime: 0,
    speed: 1,
    trains: new Map(),
    segmentOccupancy: new Map(),
    stopOccupancy: new Map(),
    spawnSchedule: new Map(),
    selectedTrainId: null,
    selectedStopId: null,
  }

  for (const line of network.lines.values()) {
    // Place one train at each terminus immediately with a random departure delay (0–10 min)
    spawnTrain(network, state, line.id, 0, Math.random() * 600)
    spawnTrain(network, state, line.id, 1, Math.random() * 600)

    // Ongoing schedule starts after one full headway; fires only if below maxTrains
    state.spawnSchedule.set(`${line.id}:0`, line.headwaySeconds)
    state.spawnSchedule.set(`${line.id}:1`, line.headwaySeconds)
  }

  return state
}

function acquireStop(state: SimState, id: string, capacity: number): boolean {
  const n = state.stopOccupancy.get(id) ?? 0
  if (n >= capacity) return false
  state.stopOccupancy.set(id, n + 1)
  return true
}

function releaseStop(state: SimState, id: string): void {
  state.stopOccupancy.set(id, Math.max(0, (state.stopOccupancy.get(id) ?? 1) - 1))
}

function releaseSegment(state: SimState, key: string): void {
  state.segmentOccupancy.set(key, Math.max(0, (state.segmentOccupancy.get(key) ?? 1) - 1))
}

// Collect every segment key from stopsInOrder[fromIdx] forward, stopping once
// we reach a stop with platforms >= 2 (a passing loop / terminus). The result
// is the full "section" the train must lock before entering.
function computeSectionSegs(
  network: Network,
  lineId: string,
  stopsInOrder: string[],
  fromIdx: number,
): string[] {
  const segs: string[] = []
  let i = fromIdx
  while (i + 1 < stopsInOrder.length) {
    segs.push(...getLegSegments(network, lineId, stopsInOrder[i], stopsInOrder[i + 1]))
    i++
    const next = network.stopById.get(stopsInOrder[i])
    if (!next || next.platforms >= 2) break
  }
  return segs
}

// Atomically check all segment capacities, then acquire them all.
// Returns false (without acquiring anything) if any segment is full.
function reserveAll(state: SimState, network: Network, segs: string[]): boolean {
  for (const sk of segs) {
    const n = state.segmentOccupancy.get(sk) ?? 0
    if (n >= network.segmentByKey.get(sk)!.tracks) return false
  }
  for (const sk of segs) {
    state.segmentOccupancy.set(sk, (state.segmentOccupancy.get(sk) ?? 0) + 1)
  }
  return true
}

function countTrainsOnLine(state: SimState, lineId: string): number {
  let n = 0
  for (const t of state.trains.values()) if (t.lineId === lineId) n++
  return n
}

function spawnTrain(network: Network, state: SimState, lineId: string, terminusIdx: 0 | 1, dwell = 0): void {
  const line = network.lines.get(lineId)!
  if (countTrainsOnLine(state, lineId) >= line.maxTrains) return

  const terminusId = line.terminii[terminusIdx]
  const stopData = network.stopById.get(terminusId)!
  if (!acquireStop(state, terminusId, stopData.platforms)) return

  const stopsInOrder = terminusIdx === 0 ? [...line.stops] : [...line.stops].reverse()
  state.trains.set(`t${++_trainIdCounter}`, {
    id: `t${_trainIdCounter}`,
    lineId,
    colour: line.colour,
    stopsInOrder,
    currentStopIndex: 0,
    position: { kind: 'at-stop', stopId: terminusId, timeRemaining: dwell, mustTurn: false, sectionPending: [] },
    waiting: false,
    waitingSince: null,
  })
}

export function tickSim(state: SimState, network: Network, dtWall: number): void {
  if (state.speed === 0) return
  const dt = dtWall * state.speed
  state.simTime += dt

  for (const [key, nextTime] of state.spawnSchedule) {
    if (state.simTime >= nextTime) {
      const colonIdx = key.lastIndexOf(':')
      const lineId = key.slice(0, colonIdx)
      const tIdx = parseInt(key.slice(colonIdx + 1)) as 0 | 1
      spawnTrain(network, state, lineId, tIdx)
      state.spawnSchedule.set(key, nextTime + network.lines.get(lineId)!.headwaySeconds)
    }
  }

  for (const train of state.trains.values()) {
    advanceTrain(train, state, network, dt)
  }
}

function advanceTrain(train: Train, state: SimState, network: Network, dt: number): void {
  const { segmentTravelTime, dwellTime, turnaroundTime } = network.simParams
  const pos = train.position

  if (pos.kind === 'at-stop') {
    if (pos.timeRemaining > 0) {
      pos.timeRemaining = Math.max(0, pos.timeRemaining - dt)
      train.waiting = false; train.waitingSince = null
      return
    }
    if (pos.mustTurn) {
      train.stopsInOrder = [...train.stopsInOrder].reverse()
      train.currentStopIndex = 0
      pos.mustTurn = false
      pos.sectionPending = []
      train.waiting = false; train.waitingSince = null
    }

    const nextStopId = train.stopsInOrder[train.currentStopIndex + 1]
    if (!nextStopId) return

    let allSegs: string[]
    if (pos.sectionPending.length > 0) {
      // Mid-section: segments are already reserved from when we entered the section
      allSegs = pos.sectionPending
      train.waiting = false; train.waitingSince = null
    } else {
      // At a passing loop or terminus: compute and atomically reserve the full next section
      const sectionSegs = computeSectionSegs(
        network, train.lineId, train.stopsInOrder, train.currentStopIndex)
      if (!reserveAll(state, network, sectionSegs)) {
        if (!train.waiting) { train.waiting = true; train.waitingSince = state.simTime }
        return  // section blocked — wait
      }
      train.waiting = false; train.waitingSince = null
      allSegs = sectionSegs
    }

    const [firstSeg, ...remaining] = allSegs
    releaseStop(state, pos.stopId)
    train.position = {
      kind: 'in-segment',
      segKey: firstSeg,
      remaining,
      fromNodeId: pos.stopId,
      toNodeId: otherEndpoint(firstSeg, pos.stopId, network),
      progress: 0,
    }
    return
  }

  if (pos.kind === 'in-segment') {
    pos.progress += dt / segmentTravelTime
    if (pos.progress < 1) return

    const overflow = (pos.progress - 1) * segmentTravelTime
    const arrivedAt = pos.toNodeId

    if (!network.stopById.has(arrivedAt)) {
      // Junction node: advance to next segment (already reserved — no blocking possible)
      const [nextSeg, ...newRemaining] = pos.remaining
      releaseSegment(state, pos.segKey)
      pos.segKey = nextSeg
      pos.remaining = newRemaining
      pos.fromNodeId = arrivedAt
      pos.toNodeId = otherEndpoint(nextSeg, arrivedAt, network)
      pos.progress = overflow > 0 ? overflow / segmentTravelTime : 0
      train.waiting = false; train.waitingSince = null
    } else {
      // Stop: acquire a platform slot
      const stopData = network.stopById.get(arrivedAt)!
      if (!acquireStop(state, arrivedAt, stopData.platforms)) {
        pos.progress = 0.999  // platform full — hold the last section segment and wait
        if (!train.waiting) { train.waiting = true; train.waitingSince = state.simTime }
        return
      }
      train.waiting = false; train.waitingSince = null
      releaseSegment(state, pos.segKey)
      train.currentStopIndex++
      const isTerminus = train.currentStopIndex === train.stopsInOrder.length - 1
      const jitter = (Math.random() - 0.5) * dwellTime * 0.3
      train.position = {
        kind: 'at-stop',
        stopId: arrivedAt,
        timeRemaining: isTerminus ? turnaroundTime : Math.max(0, dwellTime - overflow + jitter),
        mustTurn: isTerminus,
        // Carry forward remaining reserved segment keys.
        // pos.remaining is empty at a section end (passing loop / terminus),
        // non-empty at an intermediate single-platform stop.
        sectionPending: pos.remaining,
      }
    }
  }
}
