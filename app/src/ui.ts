import type { Network } from './network'
import type { SimState, Train } from './types'

const SPEED_VALUES = [0, 0.5, 1, 2, 5, 10]

export function initUI(state: SimState): void {
  const playBtn = document.getElementById('play-btn')!
  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement
  const speedLabel = document.getElementById('speed-label')!

  speedSlider.value = '2'
  state.speed = 1

  speedSlider.addEventListener('input', () => {
    const idx = parseInt(speedSlider.value)
    state.speed = SPEED_VALUES[idx]
    speedLabel.textContent = `${state.speed}×`
    playBtn.textContent = state.speed === 0 ? '▶' : '❚❚'
  })

  playBtn.addEventListener('click', () => {
    if (state.speed === 0) {
      const idx = Math.max(1, parseInt(speedSlider.value))
      speedSlider.value = String(idx)
      state.speed = SPEED_VALUES[idx]
      speedLabel.textContent = `${state.speed}×`
      playBtn.textContent = '❚❚'
    } else {
      state.speed = 0
      speedLabel.textContent = '0×'
      playBtn.textContent = '▶'
    }
  })
}

export function updateUI(state: SimState, network: Network): void {
  // Sim clock
  const total = Math.floor(state.simTime)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const clock = document.getElementById('sim-clock')!
  clock.textContent = h > 0
    ? `${h}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`

  const panel = document.getElementById('panel')!
  if (state.selectedTrainId) {
    const train = state.trains.get(state.selectedTrainId)
    if (!train) {
      state.selectedTrainId = null
      panel.classList.remove('visible')
      return
    }
    panel.classList.add('visible')
    panel.innerHTML = trainPanel(train, network)
  } else if (state.selectedStopId) {
    if (!network.stopById.has(state.selectedStopId)) {
      state.selectedStopId = null
      panel.classList.remove('visible')
      return
    }
    panel.classList.add('visible')
    panel.innerHTML = arrivalsPanel(state.selectedStopId, state, network)
  } else {
    panel.classList.remove('visible')
  }
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function trainPanel(train: Train, network: Network): string {
  const line = network.lines.get(train.lineId)!
  const dest = train.stopsInOrder[train.stopsInOrder.length - 1]
  const { segmentTravelTime } = network.simParams
  const pos = train.position

  let location = ''
  let eta = ''

  if (pos.kind === 'at-stop') {
    location = pos.stopId
    eta = pos.mustTurn
      ? `Turning (${pos.timeRemaining.toFixed(0)}s)`
      : pos.timeRemaining > 0
        ? `Departs in ${pos.timeRemaining.toFixed(0)}s`
        : 'Departing...'
  } else if (pos.kind === 'in-segment') {
    location = `${pos.fromNodeId} → ${pos.toNodeId}`
    const remainingSegs = pos.legSegs.length - pos.segIdx - pos.progress
    eta = `${(remainingSegs * segmentTravelTime).toFixed(0)}s to next stop`
  }

  return `
    <h3>Train ${train.id}</h3>
    <div class="field">Line: <span><span class="line-chip" style="background:${line.colour}">${line.id.toUpperCase()}</span></span></div>
    <div class="field">Direction: <span>${dest}</span></div>
    <div class="field">Location: <span>${location}</span></div>
    <div class="field">Status: <span>${eta}</span></div>
  `
}

function arrivalsPanel(stopId: string, state: SimState, network: Network): string {
  const stop = network.stopById.get(stopId)!

  const arrivals: Array<{ lineId: string; colour: string; eta: number }> = []
  for (const train of state.trains.values()) {
    const eta = computeETA(train, stopId, network)
    if (eta !== null) {
      arrivals.push({ lineId: train.lineId, colour: train.colour, eta })
    }
  }
  arrivals.sort((a, b) => a.eta - b.eta)

  const rows = arrivals.slice(0, 5).map(a => `
    <div class="arrival">
      <span class="dot" style="background:${a.colour}"></span>
      ${a.lineId.toUpperCase()} — ${a.eta < 5 ? 'arriving' : a.eta.toFixed(0) + 's'}
    </div>
  `).join('')

  return `
    <h3>${stopId}</h3>
    <div class="field">Lines: <span>${stop.lines.map(l => `<span class="line-chip" style="background:${network.lines.get(l)?.colour}">${l.toUpperCase()}</span>`).join(' ')}</span></div>
    <div class="field">Platforms: <span>${stop.platforms}</span></div>
    <div id="arrivals-list">${rows || '<div class="arrival">No trains en route</div>'}</div>
  `
}

function computeETA(train: Train, targetStopId: string, network: Network): number | null {
  const { segmentTravelTime, dwellTime } = network.simParams
  const pos = train.position

  // Time already spent heading to the next stop, and which stop index that is
  let timeToCurrentStop = 0
  let startIdx: number

  if (pos.kind === 'at-stop') {
    if (pos.stopId === targetStopId) return 0
    timeToCurrentStop = Math.max(0, pos.timeRemaining)
    startIdx = train.currentStopIndex
  } else if (pos.kind === 'in-segment') {
    // Remaining time to reach the next stop in the leg
    const remainingSegs = pos.legSegs.length - pos.segIdx - pos.progress
    timeToCurrentStop = remainingSegs * segmentTravelTime
    startIdx = train.currentStopIndex + 1  // we're in transit to this stop index
    if (train.stopsInOrder[startIdx] === targetStopId) return timeToCurrentStop
    startIdx = startIdx  // will iterate from startIdx+1 below
  } else {
    return null
  }

  let t = timeToCurrentStop
  const start = pos.kind === 'at-stop' ? startIdx + 1 : startIdx + 1

  for (let i = start; i < train.stopsInOrder.length; i++) {
    const sid = train.stopsInOrder[i]
    const prev = train.stopsInOrder[i - 1]
    const leg = network.lines.get(train.lineId)!.route.find(
      r => (r.fromStop === prev && r.toStop === sid) || (r.fromStop === sid && r.toStop === prev)
    )
    t += (leg?.segments.length ?? 1) * segmentTravelTime
    if (sid === targetStopId) return t
    t += dwellTime
  }

  return null
}
