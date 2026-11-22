import type { ControlLimits } from '../../../engine/control'
import { formatDuration, formatTick } from '../../../engine/format'
import { FACTORY } from '../../glossary'
import { timeAxis } from './scale'

const HEIGHT = 110
const TOP = 10
const BOTTOM = 8

/**
 * The Rs chart under the X chart, on its horizontal scale: how far each
 * task's lead time moved from the one before. A range above its upper
 * limit is a sudden change, a stop-coloured mark, even when the X chart
 * stayed inside its limits.
 */
export function RangeChart({
  control,
  x,
  width,
  left,
  plotW,
  narrow,
}: {
  control: ControlLimits
  /** The X chart's position of the i-th delivered task. */
  x: (i: number) => number
  width: number
  left: number
  plotW: number
  narrow: boolean
}) {
  const max = Math.max(control.rangeUpperMs, ...control.ranges.map((r) => r.ms))
  const axis = timeAxis(max * 1.04, 2)
  const plotH = HEIGHT - TOP - BOTTOM
  const y = (ms: number) => TOP + plotH - (ms / axis.max) * plotH
  const labelX = left + plotW + 8
  const big = control.ranges.filter((r) => r.ms > control.rangeUpperMs).length
  return (
    <>
      <p className="text-fg-2 mt-3 text-xs">
        {FACTORY.rangeTitle}
        {big > 0 ? (
          <span className="text-failed ml-2 font-semibold">
            {FACTORY.rangeAbove(String(big))}
          </span>
        ) : null}
      </p>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${FACTORY.rangeTitle} ${FACTORY.controlMean(formatDuration(control.rangeMeanMs))} ${FACTORY.controlUpper(formatDuration(control.rangeUpperMs))}`}
        className="block overflow-visible"
      >
        {axis.ticks.map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={left + plotW}
              y1={y(t)}
              y2={y(t)}
              className={
                t === 0 ? 'stroke-(--chart-axis)' : 'stroke-(--chart-grid)'
              }
              shapeRendering="crispEdges"
            />
            <text
              x={left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-fg-2 text-xs tabular-nums"
            >
              {formatTick(t)}
            </text>
          </g>
        ))}
        {control.ranges.map((r, k) => {
          const out = r.ms > control.rangeUpperMs
          return (
            <line
              key={r.id}
              x1={x(k + 1)}
              x2={x(k + 1)}
              y1={y(0)}
              y2={y(r.ms)}
              className={out ? 'stroke-stop' : 'stroke-chart-1'}
              strokeWidth={out ? 2.5 : 1.5}
            />
          )
        })}
        <line
          x1={left}
          x2={left + plotW}
          y1={y(control.rangeMeanMs)}
          y2={y(control.rangeMeanMs)}
          className="stroke-brand"
          strokeWidth={1}
        />
        <line
          x1={left}
          x2={left + plotW}
          y1={y(control.rangeUpperMs)}
          y2={y(control.rangeUpperMs)}
          className="stroke-limit"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        {narrow ? null : (
          <>
            <text
              x={labelX}
              y={y(control.rangeMeanMs)}
              dy="0.32em"
              className="chart-label fill-brand text-xs font-semibold tabular-nums"
            >
              {FACTORY.controlMean(formatDuration(control.rangeMeanMs))}
            </text>
            <text
              x={labelX}
              y={y(control.rangeUpperMs)}
              dy="0.32em"
              className="chart-label fill-limit-text text-xs font-semibold tabular-nums"
            >
              {FACTORY.controlUpper(formatDuration(control.rangeUpperMs))}
            </text>
          </>
        )}
      </svg>
      {narrow ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs font-semibold tabular-nums">
          <span className="text-brand">
            {FACTORY.controlMean(formatDuration(control.rangeMeanMs))}
          </span>
          <span className="text-limit-text">
            {FACTORY.controlUpper(formatDuration(control.rangeUpperMs))}
          </span>
        </p>
      ) : null}
    </>
  )
}
