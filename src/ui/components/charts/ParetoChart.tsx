import type { StopReason } from '../../../engine/flow'
import { formatCount, formatPercent } from '../../../engine/format'
import { CHART, FACTORY, STOP_NAME } from '../../glossary'
import { niceAxis, useWidth } from './scale'

/** Reasons drawn as their own bar; the rest fold into one. */
const SHOWN = 5
const ROW = 30
const SHARE_W = 76

export function stopName(kind: string): string {
  return (STOP_NAME as Record<string, string>)[kind] ?? kind
}

/**
 * Why tasks stopped, most first: a bar per reason with its count beside
 * it, and the cumulative share as a line of square marks, so the few
 * reasons behind most stops stand out. Horizontal, so a long reason name
 * reads whole.
 */
export function ParetoChart({ stops }: { stops: StopReason[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(360)
  if (stops.length === 0)
    return (
      <div ref={ref}>
        <p className="text-fg-2 py-12 text-center text-sm">
          {FACTORY.stopsEmpty}
        </p>
      </div>
    )
  const head = stops.slice(0, SHOWN)
  const rest = stops.slice(SHOWN)
  const rows = [
    ...head.map((s) => ({ key: s.kind, label: stopName(s.kind), n: s.tasks })),
    ...(rest.length > 0
      ? [
          {
            key: 'rest',
            label: CHART.restReasons(String(rest.length)),
            n: rest.reduce((sum, s) => sum + s.tasks, 0),
          },
        ]
      : []),
  ]
  const total = rows.reduce((sum, r) => sum + r.n, 0)
  let run = 0
  const shares = rows.map((r) => (run += r.n) / total)
  const labelW = Math.min(170, Math.max(128, width * 0.4))
  // The right column holds the cumulative share of each row.
  const plotW = Math.max(60, width - labelW - SHARE_W)
  const axis = niceAxis(rows[0]?.n ?? 1, 3)
  const height = rows.length * ROW + 34
  const bx = (n: number) => labelW + (n / axis.max) * plotW
  const sx = (share: number) => labelW + share * plotW
  const summary = CHART.sentence(
    FACTORY.stops,
    CHART.list(
      ...rows.map((r) => CHART.reasonCount(r.label, formatCount(r.n))),
    ),
  )
  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" aria-label={summary}>
        <line
          x1={sx(0.8)}
          x2={sx(0.8)}
          y1={2}
          y2={rows.length * ROW + 6}
          className="stroke-limit"
          strokeDasharray="3 3"
          shapeRendering="crispEdges"
        />
        {rows.map((r, i) => {
          const top = 6 + i * ROW
          return (
            <g key={r.key}>
              <text
                x={labelW - 8}
                y={top + 10}
                dy="0.32em"
                textAnchor="end"
                className="fill-fg text-xs"
              >
                {r.label}
              </text>
              <rect
                x={labelW}
                y={top + 2}
                width={Math.max(1, bx(r.n) - labelW)}
                height={16}
                className={
                  r.key === 'rest'
                    ? 'fill-chart-3 stroke-chart-1'
                    : 'fill-chart-1'
                }
              />
              <text
                x={bx(r.n) + 6}
                y={top + 10}
                dy="0.32em"
                className="chart-label fill-fg text-xs font-semibold tabular-nums"
              >
                {formatCount(r.n)}
              </text>
            </g>
          )
        })}
        <polyline
          points={shares
            .map((s, i) => `${sx(s)},${6 + i * ROW + 10}`)
            .join(' ')}
          fill="none"
          className="stroke-limit"
          strokeWidth={1.5}
        />
        {shares.map((s, i) => (
          <rect
            key={i}
            x={sx(s) - 3.5}
            y={6 + i * ROW + 10 - 3.5}
            width={7}
            height={7}
            className="fill-raised stroke-limit"
            strokeWidth={1.5}
          />
        ))}
        <line
          x1={labelW}
          x2={labelW}
          y1={2}
          y2={rows.length * ROW + 6}
          className="stroke-(--chart-axis)"
          shapeRendering="crispEdges"
        />
        <text
          x={sx(0.8)}
          y={height - 6}
          textAnchor="middle"
          className="fill-limit-text text-xs tabular-nums"
        >
          {FACTORY.stopsPareto}
        </text>
        {shares.map((s, i) => (
          <text
            key={`share${i}`}
            x={width - 4}
            y={6 + i * ROW + 10}
            dy="0.32em"
            textAnchor="end"
            className={`fill-limit-text text-xs tabular-nums ${s <= 0.8 ? 'font-semibold' : ''}`}
          >
            {formatPercent(s)}
          </text>
        ))}
        <text
          x={width - 4}
          y={height - 6}
          textAnchor="end"
          className="fill-limit-text text-xs"
        >
          {FACTORY.stopsCumulative}
        </text>
        <text
          x={labelW}
          y={height - 6}
          className="fill-fg-2 text-xs tabular-nums"
        >
          0
        </text>
      </svg>
    </div>
  )
}
