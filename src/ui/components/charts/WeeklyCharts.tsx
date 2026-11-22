import { useId } from 'react'

import type { FlowWeek } from '../../../engine/flow'
import {
  formatCount,
  formatDuration,
  formatTick,
  formatWeek,
} from '../../../engine/format'
import { CHART, RETRO } from '../../glossary'
import { niceAxis, timeAxis, useWidth } from './scale'
import { frame, HEIGHT, Legend, PAD, WeekLabels, YAxis } from './WeeklyAxes'

/**
 * Tasks that left the factory each week: delivered at the base, rejected
 * and stopped stacked on it, the delivered count written on its bar. The
 * current week is still running and says so.
 */
export function ThroughputChart({ weeks }: { weeks: FlowWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const hatch = `hatch-stop${useId().replace(/:/g, '')}`
  const axis = niceAxis(Math.max(1, ...weeks.map((w) => w.finished)))
  const { plotH, band, cx } = frame(width, weeks.length)
  const y = (v: number) => PAD.top + plotH - (v / axis.max) * plotH
  const barW = Math.min(44, band * 0.6)
  const summary = weeks
    .map((w) =>
      CHART.weekCounts(
        formatWeek(w.week),
        formatCount(w.delivered),
        formatCount(w.rejected),
        formatCount(w.stopped),
      ),
    )
    .join(CHART.sentence('', ''))
  return (
    <div ref={ref}>
      <Legend
        items={[
          { label: RETRO.legendDelivered, swatch: 'bg-chart-1' },
          {
            label: RETRO.legendRejected,
            swatch: 'bg-chart-3 border border-chart-1',
          },
          { label: RETRO.legendStopped, swatch: 'bar-hatch-stop' },
        ]}
      />
      <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
        <YAxis
          ticks={axis.ticks}
          y={y}
          width={width}
          label={(v) => formatCount(v)}
        />
        {weeks.map((w, i) => {
          const x = cx(i) - barW / 2
          const segs = [
            { n: w.delivered, cls: 'fill-chart-1' },
            { n: w.rejected, cls: 'fill-chart-3 stroke-chart-1' },
            { n: w.stopped, cls: 'stroke-stop', fill: `url(#${hatch})` },
          ]
          let base = 0
          return (
            <g key={w.week}>
              {segs.map((s, j) => {
                if (s.n === 0) return null
                const top = y(base + s.n)
                const h = y(base) - top
                base += s.n
                return (
                  <rect
                    key={j}
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    className={s.cls}
                    fill={s.fill}
                    strokeWidth={1}
                  />
                )
              })}
              {w.delivered > 0 ? (
                <text
                  x={cx(i)}
                  y={y(w.delivered) + 14}
                  textAnchor="middle"
                  className="fill-on-highlight text-xs font-semibold tabular-nums"
                >
                  {formatCount(w.delivered)}
                </text>
              ) : null}
            </g>
          )
        })}
        <defs>
          <pattern
            id={hatch}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="fill-raised" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              className="stroke-stop"
              strokeWidth="3"
            />
          </pattern>
        </defs>
        <WeekLabels weeks={weeks} cx={cx} />
      </svg>
    </div>
  )
}

/**
 * Each week's delivered lead times: the median as a mark, the range from
 * the quickest to the slowest as a line, from an axis at 0.
 */
export function LeadTimeChart({ weeks }: { weeks: FlowWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const axis = timeAxis(
    Math.max(60_000, ...weeks.map((w) => w.leadTimeMs.max ?? 0)),
  )
  const { plotH, cx } = frame(width, weeks.length)
  const y = (v: number) => PAD.top + plotH - (v / axis.max) * plotH
  const known = weeks.flatMap((w, i) =>
    w.leadTimeMs.median !== null ? [{ w, i }] : [],
  )
  const summary = weeks
    .map((w) =>
      CHART.weekMedian(formatWeek(w.week), formatDuration(w.leadTimeMs.median)),
    )
    .join(CHART.sentence('', ''))
  return (
    <div ref={ref}>
      <Legend
        items={[
          { label: CHART.median, swatch: 'bg-chart-1 rounded-full' },
          {
            label: CHART.range,
            swatch: 'bg-chart-3 border border-chart-1 !h-1.5',
          },
        ]}
      />
      <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
        <YAxis ticks={axis.ticks} y={y} width={width} label={formatTick} />
        {known.map(({ w, i }) => (
          <line
            key={`r${w.week}`}
            x1={cx(i)}
            x2={cx(i)}
            y1={y(w.leadTimeMs.min ?? 0)}
            y2={y(w.leadTimeMs.max ?? 0)}
            className="stroke-chart-3"
            strokeWidth={6}
            strokeLinecap="round"
          />
        ))}
        {known.map(({ w, i }) => (
          <line
            key={`o${w.week}`}
            x1={cx(i)}
            x2={cx(i)}
            y1={y(w.leadTimeMs.min ?? 0)}
            y2={y(w.leadTimeMs.max ?? 0)}
            className="stroke-chart-1"
            strokeWidth={1}
          />
        ))}
        <polyline
          points={known
            .map(({ w, i }) => `${cx(i)},${y(w.leadTimeMs.median ?? 0)}`)
            .join(' ')}
          fill="none"
          className="stroke-chart-1"
          strokeWidth={2}
        />
        {known.map(({ w, i }) => (
          <g key={w.week}>
            <circle
              cx={cx(i)}
              cy={y(w.leadTimeMs.median ?? 0)}
              r={4.5}
              className="fill-chart-1 stroke-raised"
              strokeWidth={2}
            />
            <text
              x={cx(i) + 8}
              y={y(w.leadTimeMs.median ?? 0) - 8}
              className="chart-label fill-fg text-xs font-semibold tabular-nums"
            >
              {formatDuration(w.leadTimeMs.median)}
            </text>
          </g>
        ))}
        <WeekLabels weeks={weeks} cx={cx} />
      </svg>
    </div>
  )
}
