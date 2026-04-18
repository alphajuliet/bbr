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

  // Stagger the two terminus directions by half a headway
  for (const line of network.lines.values()) {
    state.spawnSchedule.set(`${line.id}:0`, 0)
    state.spawnSchedule.set(`${line.id}:1`, line.headwaySeconds / 2)
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

function acquireSegment(state: SimState, key: string, capacity: number): boolean {
  const n = state.segmentOccupancy.get(key) ?? 0
  if (n >= capacity) return false
  state.segmentOccupancy.set(key, n + 1)
  return true
}

function releaseSegment(state: SimState, key: string): void {
  state.segmentOccupancy.set(key, Math.max(0, (state.segmentOccupancy.get(key) ?? 1) - 1))
}

function spawnTrain(network: Network, state: SimState, lineId: string, terminusIdx: 0 | 1): void {
  const line = network.lines.get(lineId)!
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
    position: { kind: 'at-stop', stopId: terminusId, timeRemaining: 0, mustTurn: false },
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
      return
    }
    if (pos.mustTurn) {
      train.stopsInOrder = [...train.stopsInOrder].reverse()
      train.currentStopIndex = 0
      pos.mustTurn = false
    }

    const nextStopId = train.stopsInOrder[train.currentStopIndex + 1]
    if (!nextStopId) return

    const legSegs = getLegSegments(network, train.lineId,
      train.stopsInOrder[train.currentStopIndex], nextStopId)
    const firstSegKey = legSegs[0]
    if (!acquireSegment(state, firstSegKey, network.segmentByKey.get(firstSegKey)!.tracks)) return

    releaseStop(state, pos.stopId)
    const toNode = otherEndpoint(firstSegKey, pos.stopId, network)
    train.position = { kind: 'in-segment', legSegs, segIdx: 0, fromNodeId: pos.stopId, toNodeId: toNode, progress: 0 }
    return
  }

  if (pos.kind === 'in-segment') {
    pos.progress += dt / segmentTravelTime
    if (pos.progress < 1) return

    const overflow = (pos.progress - 1) * segmentTravelTime
    const arrivedAt = pos.toNodeId

    if (pos.segIdx + 1 < pos.legSegs.length) {
      // Arrived at a junction — try to acquire next sub-segment
      const nextSegKey = pos.legSegs[pos.segIdx + 1]
      if (!acquireSegment(state, nextSegKey, network.segmentByKey.get(nextSegKey)!.tracks)) {
        pos.progress = 0.999
        return
      }
      releaseSegment(state, pos.legSegs[pos.segIdx])
      pos.fromNodeId = arrivedAt
      pos.toNodeId = otherEndpoint(nextSegKey, arrivedAt, network)
      pos.segIdx++
      pos.progress = overflow > 0 ? overflow / segmentTravelTime : 0
    } else {
      // Arrived at next stop
      const stopData = network.stopById.get(arrivedAt)!
      if (!acquireStop(state, arrivedAt, stopData.platforms)) {
        pos.progress = 0.999
        return
      }
      releaseSegment(state, pos.legSegs[pos.segIdx])
      train.currentStopIndex++

      const isTerminus = train.currentStopIndex === train.stopsInOrder.length - 1
      train.position = {
        kind: 'at-stop',
        stopId: arrivedAt,
        timeRemaining: isTerminus ? turnaroundTime : Math.max(0, dwellTime - overflow),
        mustTurn: isTerminus,
      }
    }
  }
}
