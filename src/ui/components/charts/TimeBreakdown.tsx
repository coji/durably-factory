import type { TimePart } from '../../../engine/flow'
import { formatDuration, formatPercent } from '../../../engine/format'
import { CHART, FACTORY, LANE_NAME, TIME_PART_NAME } from '../../glossary'
import { stageName } from '../../labels'

/** A part under this share of the lead time folds into the last row. */
const MIN_SHARE = 0.01

export function timePartName(part: string): string {
  return (
    TIME_PART_NAME[part] ??
    (LANE_NAME as Record<string, string>)[part] ??
    stageName(part)
  )
}

const isWait = (part: string) => part in TIME_PART_NAME

/**
 * Where one task's lead time goes on average, part by part in pipeline
 * order: each stage's wall time, then the waits. The longest stage is the
 * constraint the page names, in the limit colour and in words; waits are
 * hatched, so they read as time nothing moved, also in grey.
 */
export function TimeBreakdown({ time }: { time: TimePart[] }) {
  const total = time.reduce((sum, t) => sum + t.perTaskMs, 0)
  if (total <= 0)
    return (
      <p className="text-fg-2 py-8 text-center text-sm">{FACTORY.timeEmpty}</p>
    )
  // A wait is never folded: where time stood still is the point of the view.
  const big = time.filter(
    (t) => isWait(t.part) || t.perTaskMs / total >= MIN_SHARE,
  )
  const small = time.filter(
    (t) => !isWait(t.part) && t.perTaskMs / total < MIN_SHARE,
  )
  const smallMs = small.reduce((sum, t) => sum + t.perTaskMs, 0)
  const rows = [
    ...big.map((t) => ({
      key: t.part,
      label: timePartName(t.part),
      ms: t.perTaskMs,
    })),
    ...(smallMs > 0
      ? [
          {
            key: 'rest',
            label: CHART.restParts(String(small.length)),
            ms: smallMs,
          },
        ]
      : []),
  ]
  const longest = big
    .filter((t) => !isWait(t.part))
    .reduce<TimePart | null>(
      (a, t) => (a && a.perTaskMs >= t.perTaskMs ? a : t),
      null,
    )
  const max = Math.max(...rows.map((r) => r.ms))
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{FACTORY.time}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{CHART.part}</th>
          <th scope="col">{CHART.time}</th>
          <th scope="col">{CHART.share}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const hot = r.key === longest?.part
          const wait = isWait(r.key)
          return (
            <tr key={r.key} className="time-row">
              <th
                scope="row"
                className={`py-1 pr-3 text-left font-normal whitespace-nowrap ${hot ? 'text-limit-text font-semibold' : ''}`}
              >
                {r.label}
                {hot ? (
                  <span className="bg-limit-bg text-limit-text mt-0.5 block w-max rounded-sm px-1.5 py-0.5 text-xs font-semibold sm:mt-0 sm:ml-2 sm:inline">
                    {FACTORY.timeLongest}
                  </span>
                ) : null}
              </th>
              <td className="w-full py-1">
                <div
                  aria-hidden
                  className={`h-3.5 rounded-xs ${hot ? 'bg-limit' : wait ? 'bar-hatch-wait' : r.key === 'rest' ? 'bg-chart-3 border-chart-1 border' : 'bg-chart-1'}`}
                  style={{ width: `${Math.max(0.5, (r.ms / max) * 100)}%` }}
                />
              </td>
              <td className="py-1 pl-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {formatDuration(r.ms)}
              </td>
              <td className="text-fg-2 py-1 pl-3 text-right whitespace-nowrap tabular-nums">
                {formatPercent(r.ms / total)}
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-line border-t">
          <th scope="row" className="pt-2 pr-3 text-left font-semibold">
            {CHART.total}
          </th>
          <td />
          <td className="pt-2 pl-3 text-right font-semibold whitespace-nowrap tabular-nums">
            {formatDuration(total)}
          </td>
          <td className="text-fg-2 pt-2 pl-3 text-right tabular-nums">
            {formatPercent(1)}
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
