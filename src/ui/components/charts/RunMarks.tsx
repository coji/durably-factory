import type { ControlRun } from '../../../engine/control'
import { FACTORY } from '../../glossary'

/**
 * Each run of points on one side of the mean, drawn as a bar in a strip
 * under the chart's week labels, spanning those points, with its words
 * beside it: the level moved there, even if no point crossed a limit. The
 * strip holds no mark, so a lead time near zero never meets a run.
 */
export function RunMarks({
  runs,
  ids,
  x,
  baseY,
  layer,
}: {
  runs: ControlRun[]
  /** The delivered tasks' ids in chart order, to place each run. */
  ids: string[]
  x: (i: number) => number
  /** The run strip's line, under the week labels. */
  baseY: number
  layer: 'bar' | 'label'
}) {
  return (
    <>
      {runs.map((r) => {
        const from = ids.indexOf(r.fromId)
        const to = ids.indexOf(r.toId)
        if (from < 0 || to < 0) return null
        const y = baseY
        return layer === 'bar' ? (
          <line
            key={r.fromId}
            x1={x(from)}
            x2={x(to)}
            y1={y}
            y2={y}
            className="stroke-limit"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.6}
          />
        ) : (
          <text
            key={r.fromId}
            x={(x(from) + x(to)) / 2}
            y={y + 14}
            textAnchor="middle"
            className="chart-label fill-limit-text text-xs font-semibold"
          >
            {FACTORY.controlRun(
              r.side === 'above' ? FACTORY.above : FACTORY.below,
              String(r.length),
            )}
          </text>
        )
      })}
    </>
  )
}
