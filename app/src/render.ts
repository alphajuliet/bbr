import * as d3 from 'd3'
import type { Network } from './network'
import type { SimState, Train } from './types'
import type { Positions } from './layout'

export interface RenderContext {
  trainLayer: d3.Selection<SVGGElement, unknown, null, undefined>
}

const LINE_OFFSET = 3.5
const TRAIN_R = 5

export function initRender(
  svgEl: SVGSVGElement,
  network: Network,
  positions: Positions,
  onTrainClick: (id: string) => void,
  onStopClick: (id: string) => void,
  onBgClick: () => void,
): RenderContext {
  const svg = d3.select(svgEl)

  const g = svg.append('g').attr('class', 'graph')
  svg.call(
    d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 5])
      .on('zoom', e => g.attr('transform', e.transform)),
  )
  svg.on('click', (e: MouseEvent) => { if (e.target === svgEl) onBgClick() })

  const segLayer = g.append('g').attr('class', 'segments')
  const nodeLayer = g.append('g').attr('class', 'nodes')
  const trainLayer = g.append('g').attr('class', 'trains')

  // Segments — draw one stroke per line, offset perpendicular to segment direction
  for (const seg of network.segmentByKey.values()) {
    const p0 = positions.get(seg.endpoints[0])!
    const p1 = positions.get(seg.endpoints[1])!
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const n = seg.lines.length

    seg.lines.forEach((lineId, i) => {
      const line = network.lines.get(lineId)!
      const off = (i - (n - 1) / 2) * LINE_OFFSET
      segLayer.append('line')
        .attr('x1', p0.x + nx * off).attr('y1', p0.y + ny * off)
        .attr('x2', p1.x + nx * off).attr('y2', p1.y + ny * off)
        .attr('stroke', line.colour)
        .attr('stroke-width', 3.0)
        .attr('stroke-opacity', 0.75)
        .attr('stroke-linecap', 'round')
    })
  }

  // Stop nodes
  for (const stop of network.json.stops) {
    const pos = positions.get(stop.id)!
    const isInterchange = network.json.interchanges.includes(stop.id)
    const isTerminus = network.json.terminii.includes(stop.id)
    const r = isInterchange ? 7 : isTerminus ? 5 : 4
    const sw = isInterchange ? 2.5 : isTerminus ? 2 : 1.5

    nodeLayer.append('circle')
      .attr('cx', pos.x).attr('cy', pos.y).attr('r', r)
      .attr('fill', '#111827')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', sw)
      .attr('cursor', 'pointer')
      .on('click', (e: MouseEvent) => { e.stopPropagation(); onStopClick(stop.id) })

    nodeLayer.append('text')
      .attr('x', pos.x).attr('y', pos.y - r - 3)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11pt')
      .attr('fill', '#9ca3af')
      .attr('pointer-events', 'none')
      .text(stop.label ?? stop.id)
  }

  // Junction nodes with labels
  for (const junc of network.json.junctions) {
    const pos = positions.get(junc.id)!
    nodeLayer.append('circle')
      .attr('cx', pos.x).attr('cy', pos.y).attr('r', 2)
      .attr('fill', '#60a5fa')
    nodeLayer.append('text')
      .attr('x', pos.x).attr('y', pos.y - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#60a5fa')
      .attr('pointer-events', 'none')
      .text(junc.id)
  }

  return { trainLayer }
}

export function renderFrame(
  ctx: RenderContext,
  network: Network,
  state: SimState,
  positions: Positions,
): void {
  const trains = Array.from(state.trains.values())

  ctx.trainLayer
    .selectAll<SVGCircleElement, Train>('circle')
    .data(trains, d => d.id)
    .join(
      enter => enter.append('circle')
        .attr('r', TRAIN_R)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('cursor', 'pointer')
        .on('click', (e: MouseEvent, d: Train) => { e.stopPropagation(); state.selectedTrainId = d.id; state.selectedStopId = null }),
      update => update,
      exit => exit.remove(),
    )
    .attr('fill', d => d.colour)
    .attr('cx', d => trainX(d, positions))
    .attr('cy', d => trainY(d, positions))
    .attr('opacity', d => d.waiting ? 0.5 : d.id === state.selectedTrainId ? 1 : 0.85)
    .attr('stroke', d => d.waiting ? '#facc15' : '#fff')
    .attr('stroke-width', d => d.waiting ? 2 : 1)
    .attr('stroke-dasharray', d => d.waiting ? '3 2' : null)
}

function trainCoords(train: Train, positions: Positions): { x: number; y: number } {
  const pos = train.position
  if (pos.kind === 'at-stop') {
    return positions.get(pos.stopId) ?? { x: 0, y: 0 }
  }
  if (pos.kind === 'in-segment') {
    const from = positions.get(pos.fromNodeId) ?? { x: 0, y: 0 }
    const to = positions.get(pos.toNodeId) ?? { x: 0, y: 0 }
    const t = Math.min(1, Math.max(0, pos.progress))
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
  return { x: 0, y: 0 }
}

function trainX(train: Train, positions: Positions): number { return trainCoords(train, positions).x }
function trainY(train: Train, positions: Positions): number { return trainCoords(train, positions).y }
