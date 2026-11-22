import type { AboveWeek, ControlLimits, FlowTask } from '../../../engine/flow'
import {
  formatCount,
  formatDuration,
  formatTick,
  formatWeek,
} from '../../../engine/format'
import { CHART, FACTORY } from '../../glossary'
import { runHref } from '../RunLink'
import { RangeChart } from './RangeChart'
import { RunMarks } from './RunMarks'
import { timeAxis, useWidth } from './scale'

const HEIGHT = 260
const PAD = { top: 18, right: 112, bottom: 30, left: 52 }
/** Tasks above the limit that get their name beside the mark. */
const NAMED = 3
/** The room a week label needs under the axis. */
const LABEL_W = 52
/** Under this width the limit labels move inside the plot. */
const NARROW = 520
/** The strip under the week labels that holds the run marks. */
const RUN_STRIP = 34

function shortName(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/**
 * An individuals control chart of the delivered tasks' lead times, in the
 * order they finished: a point per task, the mean, and the upper limit.
 * A task above the limit is a red triangle, the newest named beside it, and
 * every mark opens the task's newest run. The weeks are marked under the
 * axis, so a change of level shows where it began.
 */
export function ControlChart({
  tasks,
  control,
  aboveWeeks = [],
}: {
  tasks: FlowTask[]
  control: ControlLimits | null
  /** Weeks where tasks above the limit cluster, noted at the top. */
  aboveWeeks?: AboveWeek[]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const points = tasks.filter(
    (t): t is FlowTask & { leadTimeMs: number } =>
      t.outcome === 'delivered' && t.leadTimeMs !== null,
  )
  if (!control || points.length < 2)
    return (
      <div ref={ref}>
        <p className="text-fg-2 py-12 text-center text-sm">
          {FACTORY.controlTooFew}
        </p>
      </div>
    )
  const above = new Set(control.above)
  const maxMs = Math.max(control.upperMs, ...points.map((p) => p.leadTimeMs))
  const axis = timeAxis(maxMs * 1.04)
  // Narrow, the limit labels move to a line under the plot.
  const narrow = width < NARROW
  const plotW = Math.max(120, width - PAD.left - (narrow ? PAD.top : PAD.right))
  const labelX = PAD.left + plotW + 8
  const plotH = HEIGHT - PAD.top - PAD.bottom
  // A run gets its own strip under the week labels, clear of every mark.
  const runStrip = control.runs.length > 0 ? RUN_STRIP : 0
  const x = (i: number) =>
    PAD.left +
    (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (ms: number) => PAD.top + plotH - (ms / axis.max) * plotH
  const named = new Set(
    points
      .filter((p) => above.has(p.id))
      .slice(-NAMED)
      .map((p) => p.id),
  )
  // The first point of each week, for its boundary and label.
  const weekStarts = points.flatMap((p, i) =>
    i === 0 || points[i - 1]?.week !== p.week ? [{ i, week: p.week }] : [],
  )
  const summary = CHART.sentence(
    FACTORY.control,
    CHART.list(
      FACTORY.controlMean(formatDuration(control.meanMs)),
      FACTORY.controlUpper(formatDuration(control.upperMs)),
    ),
    above.size > 0
      ? FACTORY.controlAbove(String(above.size))
      : FACTORY.controlNone,
  )
  return (
    <div ref={ref}>
      <svg
        width={width}
        height={HEIGHT + runStrip}
        role="group"
        aria-label={summary}
        className="block overflow-visible"
      >
        {axis.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
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
              {formatTick(t)}
            </text>
          </g>
        ))}
        {weekStarts.map(({ i, week }, k) => {
          const wx = i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2
          const next = weekStarts[k + 1]
          const nextX = next ? (x(next.i - 1) + x(next.i)) / 2 : Infinity
          // A week too narrow for its label keeps its boundary, not its words.
          const labelled = nextX - wx >= LABEL_W
          const cluster = aboveWeeks.find((a) => a.week === week)
          return (
            <g key={week}>
              {cluster ? (
                <rect
                  x={wx}
                  y={PAD.top}
                  width={Math.max(0, Math.min(nextX, PAD.left + plotW) - wx)}
                  height={plotH}
                  className="fill-failed-bg"
                  opacity={0.7}
                />
              ) : null}
              {cluster ? (
                <text
                  x={wx + 4 > PAD.left + plotW / 2 ? PAD.left + plotW : wx + 4}
                  y={PAD.top - 6}
                  textAnchor={wx + 4 > PAD.left + plotW / 2 ? 'end' : 'start'}
                  className="chart-label fill-failed text-xs font-semibold"
                >
                  {FACTORY.aboveWeek(formatWeek(week), String(cluster.tasks))}
                </text>
              ) : null}
              {i > 0 ? (
                <line
                  x1={wx}
                  x2={wx}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  className="stroke-(--chart-grid)"
                  strokeDasharray="2 3"
                  shapeRendering="crispEdges"
                />
              ) : null}
              {labelled ? (
                <text
                  x={wx + 4}
                  y={HEIGHT - 8}
                  className="fill-fg-2 text-xs tabular-nums"
                >
                  {formatWeek(week)}
                </text>
              ) : null}
            </g>
          )
        })}
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={y(control.meanMs)}
          y2={y(control.meanMs)}
          className="stroke-brand"
          strokeWidth={1.5}
        />
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={y(control.upperMs)}
          y2={y(control.upperMs)}
          className="stroke-limit"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <RunMarks
          runs={control.runs}
          ids={points.map((p) => p.id)}
          x={x}
          baseY={HEIGHT + RUN_STRIP - 18}
          layer="bar"
        />
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.leadTimeMs)}`).join(' ')}
          fill="none"
          className="stroke-chart-3"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const px = x(i)
          const py = y(p.leadTimeMs)
          const out = above.has(p.id)
          const title = `${p.name}\n${formatDuration(p.leadTimeMs)} · ${new Date(p.finishedAt).toLocaleDateString('ja-JP')}`
          return (
            <a
              key={p.id}
              href={runHref(p.latestRunId)}
              aria-label={title}
              className="chart-mark"
            >
              <title>{title}</title>
              {out ? (
                <path
                  d={`M${px} ${py - 6} L${px + 6} ${py + 4} L${px - 6} ${py + 4} Z`}
                  className="fill-stop"
                />
              ) : (
                <circle cx={px} cy={py} r={3.5} className="fill-chart-1" />
              )}
              <circle cx={px} cy={py} r={9} fill="transparent" />
              {named.has(p.id) ? (
                <text
                  x={px - 8}
                  y={py}
                  dy="0.32em"
                  textAnchor="end"
                  className="chart-label fill-failed text-xs font-semibold"
                >
                  {shortName(p.name)}
                </text>
              ) : null}
            </a>
          )
        })}
        <RunMarks
          runs={control.runs}
          ids={points.map((p) => p.id)}
          x={x}
          baseY={HEIGHT + RUN_STRIP - 18}
          layer="label"
        />
        {narrow ? null : (
          <>
            <text
              x={labelX}
              y={y(control.meanMs)}
              dy="0.32em"

              className="chart-label fill-brand text-xs font-semibold tabular-nums"
            >
              {FACTORY.controlMean(formatDuration(control.meanMs))}
            </text>
            <text
              x={labelX}
              y={y(control.upperMs)}
              dy="0.32em"

              className="chart-label fill-limit-text text-xs font-semibold tabular-nums"
            >
              {FACTORY.controlUpper(formatDuration(control.upperMs))}
            </text>
          </>
        )}
      </svg>
      {narrow ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs font-semibold tabular-nums">
          <span className="text-brand">
            {FACTORY.controlMean(formatDuration(control.meanMs))}
          </span>
          <span className="text-limit-text">
            {FACTORY.controlUpper(formatDuration(control.upperMs))}
          </span>
        </p>
      ) : null}
      {above.size > named.size ? (
        <p className="text-failed mt-1 text-xs font-semibold">
          {FACTORY.controlOthers(formatCount(above.size - named.size))}
        </p>
      ) : null}
      <RangeChart
        control={control}
        x={x}
        width={width}
        left={PAD.left}
        plotW={plotW}
        narrow={narrow}
      />
    </div>
  )
}
