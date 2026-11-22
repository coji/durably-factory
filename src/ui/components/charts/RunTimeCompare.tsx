import type { RunTimePart, TimePart } from '../../../engine/flow'
import { formatDuration } from '../../../engine/format'
import { RUN_RETRO } from '../../glossary'
import { timePartName } from './TimeBreakdown'

const WAITS = ['human-wait', 'slot-wait', 'between']

/**
 * One run's lead time, part by part, against the 30-day average of a
 * task: a bar for this run, a dark tick for the average on the same scale,
 * both as numbers too. The part this run spent most in is named with a
 * tag; orange stays for the factory's limit and constraint. Waits are
 * hatched.
 */
export function RunTimeCompare({
  time,
  average,
}: {
  time: RunTimePart[]
  average: TimePart[] | null
}) {
  const avg = new Map((average ?? []).map((t) => [t.part, t.perTaskMs]))
  const mine = new Map(time.map((t) => [t.part, t.ms]))
  const order = [
    ...time.map((t) => t.part),
    ...(average ?? []).map((t) => t.part).filter((p) => !mine.has(p)),
  ]
  const rank = (p: string) => {
    const i = [...time, ...(average ?? [])].findIndex((t) => t.part === p)
    return WAITS.includes(p) ? 100 + WAITS.indexOf(p) : i
  }
  const parts = [...new Set(order)].sort((x, y) => rank(x) - rank(y))
  const max = Math.max(1, ...time.map((t) => t.ms), ...avg.values())
  const longest = time
    .filter((t) => !WAITS.includes(t.part))
    .reduce<RunTimePart | null>((a, t) => (a && a.ms >= t.ms ? a : t), null)
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{RUN_RETRO.title}</caption>
      <thead>
        <tr className="text-fg-2 text-xs">
          <th scope="col" className="pb-1 text-left font-normal">
            {RUN_RETRO.part}
          </th>
          <th scope="col" className="pb-1 text-left font-normal">
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="bg-chart-1 inline-block h-2.5 w-4 rounded-xs"
                />
                {RUN_RETRO.thisRun}
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="bg-fg inline-block h-3 w-0.5" />
                {RUN_RETRO.average}
              </span>
            </span>
          </th>
          <th
            scope="col"
            className="pb-1 pl-3 text-right font-normal whitespace-nowrap"
          >
            {RUN_RETRO.thisRun}
          </th>
          <th
            scope="col"
            className="pb-1 pl-3 text-right font-normal whitespace-nowrap"
          >
            {RUN_RETRO.average}
          </th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => {
          const ms = mine.get(p) ?? 0
          const a = avg.get(p)
          const hot = p === longest?.part
          const wait = WAITS.includes(p)
          return (
            <tr key={p}>
              <th
                scope="row"
                className={`py-1 pr-3 text-left whitespace-nowrap ${hot ? 'font-semibold' : 'font-normal'}`}
              >
                {timePartName(p)}
                {hot ? (
                  <span className="bg-sunken text-fg-2 ml-2 rounded-sm px-1.5 py-0.5 text-xs font-semibold">
                    {RUN_RETRO.longest}
                  </span>
                ) : null}
              </th>
              <td className="w-full py-1">
                <div className="relative h-4">
                  <div
                    aria-hidden
                    className={`absolute inset-y-0.5 left-0 rounded-xs ${wait ? 'bar-hatch-wait' : 'bg-chart-1'}`}
                    style={{ width: `${(ms / max) * 100}%` }}
                  />
                  {a !== undefined ? (
                    <div
                      aria-hidden
                      className="bg-fg absolute inset-y-0 w-0.5 -translate-x-1/2"
                      style={{ left: `${(a / max) * 100}%` }}
                    />
                  ) : null}
                </div>
              </td>
              <td className="py-1 pl-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {ms > 0 ? formatDuration(ms) : '–'}
              </td>
              <td className="text-fg-2 py-1 pl-3 text-right whitespace-nowrap tabular-nums">
                {a !== undefined ? formatDuration(a) : '–'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
