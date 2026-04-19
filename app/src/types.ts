// ---- JSON schema types ----

export interface NetworkJson {
  name: string
  description: string
  simulation: SimulationParams
  lines: LineJson[]
  stops: StopJson[]
  junctions: JunctionJson[]
  segments: SegmentJson[]
  interchanges: string[]
  terminii: string[]
}

export interface SimulationParams {
  'segment-travel-time-seconds': number
  'dwell-time-seconds': number
  'turnaround-time-seconds': number
}

export interface LineJson {
  id: string
  stops: string[]
  terminii: string[]
  'headway-seconds': number
  'max-trains': number
  colour: string
}

export interface StopJson {
  id: string
  lines: string[]
  platforms: number
}

export interface JunctionJson {
  id: string
  connects: string[]
}

export interface SegmentJson {
  endpoints: [string, string]
  lines: string[]
  tracks: number
}

// ---- Derived / sim types ----

export interface Segment {
  key: string
  endpoints: [string, string]
  lines: string[]
  tracks: number
}

export interface SegmentLeg {
  fromStop: string
  toStop: string
  segments: string[]
}

export interface Line {
  id: string
  stops: string[]
  terminii: [string, string]
  headwaySeconds: number
  maxTrains: number
  colour: string
  route: SegmentLeg[]
}

// ---- Train state machine ----
//
// A "section" is the run of consecutive single-platform stops (platforms === 1)
// between two passing loops (platforms >= 2) or terminii. Before entering a
// section, the train atomically reserves ALL segment keys in it. It carries
// those reservations in `remaining` / `sectionPending` as it traverses
// stop-by-stop, without re-reserving or deadlock risk.

export type TrainPosition =
  | {
      kind: 'at-stop'
      stopId: string
      timeRemaining: number
      mustTurn: boolean
      // Pre-reserved segment keys for the rest of the current section.
      // Empty when the train is at a passing loop / terminus (section start).
      sectionPending: string[]
    }
  | {
      kind: 'in-segment'
      segKey: string        // segment currently being traversed
      remaining: string[]   // subsequent pre-reserved segment keys (not yet entered)
      fromNodeId: string
      toNodeId: string
      progress: number      // 0..1
    }

export interface Train {
  id: string
  lineId: string
  colour: string
  stopsInOrder: string[]
  currentStopIndex: number
  position: TrainPosition
  waiting: boolean   // true when blocked waiting for a segment or platform
}

export interface SimState {
  simTime: number
  speed: number
  trains: Map<string, Train>
  segmentOccupancy: Map<string, number>
  stopOccupancy: Map<string, number>
  spawnSchedule: Map<string, number>
  selectedTrainId: string | null
  selectedStopId: string | null
}
