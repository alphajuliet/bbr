import type { Network } from './network'
import type { SimState, Train } from './types'

const SPEED_VALUES = [0, 0.5, 1, 2, 5, 10, 20]

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

const BLOCK_ALERT_THRESHOLD = 180  // sim-seconds before a blocked train triggers an alert

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

  // Blocked-train alerts
  const alertsEl = document.getElementById('alerts')!
  const blocked = Array.from(state.trains.values()).filter(t =>
    t.waiting && t.waitingSince !== null &&
    state.simTime - t.waitingSince >= BLOCK_ALERT_THRESHOLD
  )
  alertsEl.innerHTML = blocked.map(t => {
    const waited = Math.floor(state.simTime - t.waitingSince!)
    const loc = t.position.kind === 'at-stop' ? t.position.stopId : `${t.position.fromNodeId} → ${t.position.toNodeId}`
    return `<div class="alert">
      <span class="alert-dot" style="background:${t.colour}"></span>
      ${t.lineId.toUpperCase()} blocked at ${loc} for ${Math.floor(waited / 60)}m ${waited % 60}s
    </div>`
  }).join('')
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
        : train.waiting
          ? 'Waiting — section blocked'
          : 'Departing...'
  } else if (pos.kind === 'in-segment') {
    location = `${pos.fromNodeId} → ${pos.toNodeId}`
    const nextStop = train.stopsInOrder[train.currentStopIndex + 1] ?? '?'
    const leg = findLeg(network, train.lineId,
      train.stopsInOrder[train.currentStopIndex], nextStop)
    const segIdx = leg?.indexOf(pos.segKey) ?? 0
    const segsLeft = leg ? leg.length - segIdx - pos.progress : 1 - pos.progress
    eta = train.waiting
      ? `Waiting — platform full at ${nextStop}`
      : `${Math.max(0, segsLeft * segmentTravelTime).toFixed(0)}s to ${nextStop}`
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

  const present: Train[] = []
  const arrivals: Array<{ lineId: string; colour: string; eta: number }> = []

  for (const train of state.trains.values()) {
    if (train.position.kind === 'at-stop' && train.position.stopId === stopId) {
      present.push(train)
    } else {
      const eta = computeETA(train, stopId, network)
      if (eta !== null) arrivals.push({ lineId: train.lineId, colour: train.colour, eta })
    }
  }
  arrivals.sort((a, b) => a.eta - b.eta)

  const platformRows = present.map(train => {
    const pos = train.position as Extract<typeof train.position, { kind: 'at-stop' }>
    const dest = train.stopsInOrder[train.stopsInOrder.length - 1]
    const status = pos.mustTurn
      ? `Turning (${pos.timeRemaining.toFixed(0)}s)`
      : pos.timeRemaining > 0
        ? `Departs in ${pos.timeRemaining.toFixed(0)}s`
        : train.waiting ? 'Waiting — blocked' : 'Departing...'
    return `
      <div class="arrival at-platform">
        <span class="dot" style="background:${train.colour}"></span>
        <span><span class="line-chip" style="background:${train.colour}">${train.lineId.toUpperCase()}</span> to ${dest}</span>
        <span class="status-note">${status}</span>
      </div>`
  }).join('')

  const arrivalRows = arrivals.slice(0, 5).map(a => `
    <div class="arrival">
      <span class="dot" style="background:${a.colour}"></span>
      ${a.lineId.toUpperCase()} — ${a.eta < 5 ? 'arriving' : a.eta.toFixed(0) + 's'}
    </div>
  `).join('')

  const platformSection = present.length > 0
    ? `<div class="section-label">At platform</div>${platformRows}`
    : ''
  const arrivalSection = `<div class="section-label">Upcoming</div>${arrivalRows || '<div class="arrival">No trains en route</div>'}`

  return `
    <h3>${stopId}</h3>
    <div class="field">Lines: <span>${stop.lines.map(l => `<span class="line-chip" style="background:${network.lines.get(l)?.colour}">${l.toUpperCase()}</span>`).join(' ')}</span></div>
    <div class="field">Platforms: <span>${stop.platforms}</span></div>
    <div id="arrivals-list">${platformSection}${arrivalSection}</div>
  `
}

function findLeg(network: Network, lineId: string, from: string, to: string): string[] | null {
  const route = network.lines.get(lineId)?.route
  const r = route?.find(
    l => (l.fromStop === from && l.toStop === to) || (l.fromStop === to && l.toStop === from)
  )
  return r?.segments ?? null
}

function computeETA(train: Train, targetStopId: string, network: Network): number | null {
  const { segmentTravelTime, dwellTime } = network.simParams
  const pos = train.position

  let t: number
  let startIdx: number

  if (pos.kind === 'at-stop') {
    if (pos.stopId === targetStopId) return 0
    t = Math.max(0, pos.timeRemaining)
    startIdx = train.currentStopIndex + 1
  } else if (pos.kind === 'in-segment') {
    const nextStop = train.stopsInOrder[train.currentStopIndex + 1]
    const leg = findLeg(network, train.lineId, train.stopsInOrder[train.currentStopIndex], nextStop)
    const segIdx = leg?.indexOf(pos.segKey) ?? 0
    const segsLeft = leg ? leg.length - segIdx - pos.progress : 1 - pos.progress
    t = Math.max(0, segsLeft * segmentTravelTime)
    startIdx = train.currentStopIndex + 1
    if (train.stopsInOrder[startIdx] === targetStopId) return t
    t += dwellTime
    startIdx++
  } else {
    return null
  }

  for (let i = startIdx; i < train.stopsInOrder.length; i++) {
    const sid = train.stopsInOrder[i]
    const prev = train.stopsInOrder[i - 1]
    const leg = findLeg(network, train.lineId, prev, sid)
    t += (leg?.length ?? 1) * segmentTravelTime
    if (sid === targetStopId) return t
    t += dwellTime
  }

  return null
}
