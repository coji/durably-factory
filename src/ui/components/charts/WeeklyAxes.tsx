import type { FlowWeek } from '../../../engine/flow'
import { formatWeek } from '../../../engine/format'
import { CHART } from '../../glossary'

/** The weekly charts' shared frame: size, padding, axis and week labels. */
export const HEIGHT = 220
export const PAD = { top: 16, right: 12, bottom: 28, left: 52 }

export function frame(width: number, n: number) {
  const plotW = Math.max(80, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, n)
  return { plotW, plotH, band, cx: (i: number) => PAD.left + band * (i + 0.5) }
}

export function YAxis({
  ticks,
  y,
  width,
  label,
}: {
  ticks: number[]
  y: (v: number) => number
  width: number
  label: (v: number) => string
}) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(t)}
            y2={y(t)}
            className={
              t === 0 ? 'stroke-(--chart-axis)' : 'stroke-(--chart-grid)'
            }
            shapeRendering="crispEdges"
          />
          <text
            x={PAD.left - 8}
            y={y(t)}
            dy="0.32em"
            textAnchor="end"
            className="fill-fg-2 text-xs tabular-nums"
          >
            {label(t)}
          </text>
        </g>
      ))}
    </>
  )
}

export function WeekLabels({
  weeks,
  cx,
}: {
  weeks: FlowWeek[]
  cx: (i: number) => number
}) {
  return (
    <>
      {weeks.map((w, i) => (
        <text
          key={w.week}
          x={cx(i)}
          y={HEIGHT - 8}
          textAnchor="middle"
          className="fill-fg-2 text-xs tabular-nums"
        >
          {i === weeks.length - 1 ? CHART.thisWeek : formatWeek(w.week)}
        </text>
      ))}
    </>
  )
}

export function Legend({
  items,
}: {
  items: { label: string; swatch: string }[]
}) {
  return (
    <ul className="text-fg-2 mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block size-3 rounded-xs ${i.swatch}`}
          />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
