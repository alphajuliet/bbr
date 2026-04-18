import networkJson from '../../data/bbr-network.json'
import type { NetworkJson } from './types'
import { buildNetwork } from './network'
import { computeLayout } from './layout'
import { createSimState, tickSim } from './sim'
import { initRender, renderFrame } from './render'
import { initUI, updateUI } from './ui'

function main(): void {
  const network = buildNetwork(networkJson as unknown as NetworkJson)

  const svgEl = document.getElementById('network-svg') as unknown as SVGSVGElement
  const W = window.innerWidth
  const H = window.innerHeight

  const positions = computeLayout(network, W, H)
  const state = createSimState(network)

  const ctx = initRender(
    svgEl,
    network,
    positions,
    (trainId) => { state.selectedTrainId = trainId; state.selectedStopId = null },
    (stopId) => { state.selectedStopId = stopId; state.selectedTrainId = null },
    () => { state.selectedTrainId = null; state.selectedStopId = null },
  )

  initUI(state)

  let lastTs: number | null = null

  function loop(ts: number): void {
    const dt = lastTs === null ? 0 : Math.min((ts - lastTs) / 1000, 0.1)
    lastTs = ts
    tickSim(state, network, dt)
    renderFrame(ctx, network, state, positions)
    updateUI(state, network)
    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

main()
