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
  colour: string
  route: SegmentLeg[]
}

// ---- Train state machine ----

export type TrainPosition =
  | { kind: 'at-stop'; stopId: string; timeRemaining: number; mustTurn: boolean }
  | { kind: 'in-segment'; legSegs: string[]; segIdx: number; fromNodeId: string; toNodeId: string; progress: number }

export interface Train {
  id: string
  lineId: string
  colour: string
  stopsInOrder: string[]
  currentStopIndex: number
  position: TrainPosition
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
