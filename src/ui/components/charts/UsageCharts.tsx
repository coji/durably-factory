import { useId } from 'react'

import type { FlowWeek, StageRework } from '../../../engine/flow'
import {
  formatCount,
  formatPercent,
  formatTokens,
  formatWeek,
} from '../../../engine/format'
import { CHART, RETRO, RUN_RETRO } from '../../glossary'
import { stageName } from '../../labels'
import { niceAxis, useWidth } from './scale'
import { frame, HEIGHT, Legend, PAD, WeekLabels, YAxis } from './WeeklyAxes'

/** Providers in a fixed order and fill, so a colour means one provider. */
/**
 * Providers in a fixed order, each told apart by more than its colour:
 * solid, hatched with an outline, and pale with an outline.
 */
const PROVIDER_LOOK = ['solid', 'hatch', 'pale'] as const
const PROVIDER_SWATCH = {
  solid: 'bg-chart-1',
  hatch: 'bar-hatch-provider',
  pale: 'bg-chart-3 border border-chart-1',
}

/**
 * Tokens each week, a bar per provider side by side. A week where some
 * call reported none is drawn hollow with what was known, and says so.
 */
export function TokenChart({ weeks }: { weeks: FlowWeek[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const hatch = `hatch-provider${useId().replace(/:/g, '')}`
  const look = (j: number) => PROVIDER_LOOK[j % PROVIDER_LOOK.length] ?? 'solid'
  const providers = [
    ...new Set(
      weeks.flatMap((w) =>
        w.providers.map((p) => p.provider ?? CHART.unknownProvider),
      ),
    ),
  ].sort()
  const max = Math.max(
    1,
    ...weeks.flatMap((w) => w.providers.map((p) => p.totalTokens ?? 0)),
  )
  const axis = niceAxis(max)
  const { plotH, band, cx } = frame(width, weeks.length)
  const y = (v: number) => PAD.top + plotH - (v / axis.max) * plotH
  const barW = Math.min(22, (band * 0.7) / Math.max(1, providers.length))
  return (
    <div ref={ref}>
      <Legend
        items={[
          ...providers.map((p, i) => ({
            label: p,
            swatch: PROVIDER_SWATCH[look(i)],
          })),
          {
            label: RETRO.legendUnknown,
            swatch: 'border border-dashed border-fg-2',
          },
        ]}
      />
      <svg width={width} height={HEIGHT} role="img" aria-label={RETRO.usage}>
        <YAxis
          ticks={axis.ticks}
          y={y}
          width={width}
          label={(v) => formatTokens(v)}
        />
        {weeks.map((w, i) =>
          providers.map((name, j) => {
            const p = w.providers.find(
              (q) => (q.provider ?? CHART.unknownProvider) === name,
            )
            if (!p) return null
            const x = cx(i) - (barW * providers.length) / 2 + j * barW
            const unknown = p.totalTokens === null
            const v = p.totalTokens ?? 0
            return (
              <g key={`${w.week}-${name}`}>
                <title>{`${formatWeek(w.week)} ${name}: ${unknown ? CHART.unknownTokens : formatTokens(v)}`}</title>
                <rect
                  x={x + 1}
                  y={unknown ? PAD.top + plotH - 6 : y(v)}
                  width={barW - 2}
                  height={unknown ? 6 : Math.max(1, y(0) - y(v))}
                  className={
                    unknown
                      ? 'stroke-fg-2 fill-none'
                      : look(j) === 'solid'
                        ? 'fill-chart-1'
                        : look(j) === 'hatch'
                          ? 'stroke-chart-1'
                          : 'fill-chart-3 stroke-chart-1'
                  }
                  fill={
                    !unknown && look(j) === 'hatch'
                      ? `url(#${hatch})`
                      : undefined
                  }
                  strokeDasharray={unknown ? '2 2' : undefined}
                />
              </g>
            )
          }),
        )}
        <defs>
          <pattern
            id={hatch}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" className="fill-raised" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              className="stroke-chart-1"
              strokeWidth="2.5"
            />
          </pattern>
        </defs>
        <WeekLabels weeks={weeks} cx={cx} />
      </svg>
    </div>
  )
}

/** Share of the tasks that entered a stage and had to enter it again. */
const REWORK_STAGES = ['spec', 'spec-review', 'code', 'verify', 'review']

export function ReworkChart({ rework }: { rework: StageRework[] }) {
  const rows = rework.filter(
    (r) => REWORK_STAGES.includes(r.stage) && r.tasks >= 3,
  )
  if (rows.length === 0)
    return <p className="text-fg-2 py-8 text-center text-sm">{CHART.noData}</p>
  const worst = rows.reduce((a, r) =>
    r.reworked / r.tasks > a.reworked / a.tasks ? r : a,
  ).stage
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{RETRO.rework}</caption>
      <tbody>
        {rows.map((r) => {
          const share = r.reworked / r.tasks
          return (
            <tr key={r.stage}>
              <th
                scope="row"
                className="py-1 pr-3 text-left font-normal whitespace-nowrap"
              >
                {stageName(r.stage)}
                {r.stage === worst ? (
                  <span className="bg-sunken text-fg-2 mt-0.5 block w-max rounded-sm px-1.5 py-0.5 text-xs font-semibold sm:mt-0 sm:ml-2 sm:inline">
                    {RUN_RETRO.reworkMost}
                  </span>
                ) : null}
              </th>
              <td className="w-full py-1">
                <div className="bg-sunken h-3.5 rounded-xs">
                  <div
                    className="bg-chart-1 h-full rounded-xs"
                    style={{ width: `${Math.max(0.5, share * 100)}%` }}
                  />
                </div>
              </td>
              <td className="py-1 pl-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {formatPercent(share)}
              </td>
              <td className="text-fg-2 py-1 pl-3 text-right text-xs whitespace-nowrap tabular-nums">
                {CHART.ofTasks(formatCount(r.reworked), formatCount(r.tasks))}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
