import { useContext } from 'react'

import {
  formatCost,
  formatDuration,
  formatTokens,
  formatCount,
} from '../../../engine/format'
import { unpricedModelsOf } from '../../../engine/pricing-status'
import type { AttemptRow } from '../../../engine/report'
import { Card } from '../../components/Card'
import { timePartName } from '../../components/charts/TimeBreakdown'
import { PartialTag } from '../../components/KeyValue'
import { RepoContext } from '../../components/RunLink'
import { COMMON, DETAIL, RUN_RETRO } from '../../glossary'
import { withRepo } from '../../route'
import type { FlowResponse, RunDetailResponse } from '../../server'
import { usePolled } from '../../usePolled'
import { BaselineSource } from './BaselineSource'
import { Bar, Legend, rowsOf, type Row } from './RunTimeParts'

const NUM = 'py-1 pl-3 text-right whitespace-nowrap tabular-nums'
const WIDE = 'hidden sm:table-cell'

/**
 * Where this run's time and money went, in one table: each lane's clock
 * time beside a task's 30-day average, its work and its cost, then the
 * waits, then the lead time against the delivered tasks' mean. The lane
 * this run spent most in is named; orange stays for the factory's limit.
 */
export function RunTime({ data }: { data: RunDetailResponse }) {
  const repo = useContext(RepoContext)
  const flow = usePolled<FlowResponse>(withRepo('/api/flow', repo), 60_000).data
  const r = data.report
  const s = r.summary
  const control = flow?.control ?? null
  const rows = rowsOf(data, flow?.time ?? null)
  const max = Math.max(
    1,
    ...rows.map((x) => Math.max(x.ms ?? 0, x.average ?? 0)),
  )
  const longest = rows
    .filter((x) => x.lane)
    .reduce<Row | null>(
      (a, x) => (a && (a.ms ?? 0) >= (x.ms ?? 0) ? a : x),
      null,
    )
  const running = data.diagnosis.kind === 'running'
  const over = ['finished', 'stopped'].includes(data.diagnosis.kind)
  const lead = s.leadTimeMs
  const above = lead !== null && control !== null && lead > control.upperMs
  const dashes = data.lanes.some((l) => !l.called)
  return (
    <Card
      title={RUN_RETRO.title}
      kind={RUN_RETRO.kind}
      tools={
        control && lead !== null ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="text-fg-2 tabular-nums">
              {RUN_RETRO.upper(formatDuration(control.upperMs))}
            </span>
            {above ? (
              <span className="bg-failed-bg text-failed rounded-sm px-1.5 py-0.5 font-semibold">
                {RUN_RETRO.aboveUpper}
              </span>
            ) : null}
          </p>
        ) : null
      }
      foot={
        <div className="flex flex-col gap-1">
          <p className="text-fg tabular-nums">
            {RUN_RETRO.facts(
              formatTokens(s.totalTokens),
              formatCount(s.repairs),
            )}
            {s.totalTokens == null || s.tokensComplete ? null : (
              <PartialTag title={COMMON.partialUsage} />
            )}
          </p>
          <p>{RUN_RETRO.note}</p>
          {dashes ? <p>{RUN_RETRO.noCostNote}</p> : null}
          {running ? <p>{RUN_RETRO.runningNote}</p> : null}
          <PricingNotice attempts={r.attempts} />
          <BaselineSource
            baseline={r.baseline}
            source={data.baselineSource}
            now={data.now}
          />
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-fg-2 text-sm">{RUN_RETRO.empty}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{RUN_RETRO.title}</caption>
          <thead>
            <tr className="text-fg-2 text-xs">
              <th scope="col" className="pb-1 text-left font-normal">
                {RUN_RETRO.part}
              </th>
              <th scope="col" className={`pb-1 text-left font-normal ${WIDE}`}>
                <Legend />
              </th>
              <th scope="col" className={`${NUM} pb-1 font-normal`}>
                {RUN_RETRO.thisRun}
              </th>
              <th scope="col" className={`${NUM} pb-1 font-normal`}>
                {RUN_RETRO.average}
              </th>
              <th scope="col" className={`${NUM} pb-1 font-normal ${WIDE}`}>
                {RUN_RETRO.work}
              </th>
              <th
                scope="col"
                className={`${NUM} pb-1 font-normal`}
                title={COMMON.costNote}
              >
                {RUN_RETRO.cost}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hot = row.part === longest?.part && rows.length > 1
              const lane = row.lane
              const skipped = row.ms === null
              return (
                <tr
                  key={row.part}
                  className={skipped ? 'text-fg-3' : undefined}
                >
                  <th
                    scope="row"
                    className={`py-1 pr-3 text-left sm:whitespace-nowrap ${hot ? 'font-semibold' : 'font-normal'}`}
                  >
                    {timePartName(row.part)}
                    {hot ? (
                      <span className="bg-sunken text-fg-2 mt-0.5 block w-fit rounded-sm px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap sm:mt-0 sm:ml-2 sm:inline">
                        {RUN_RETRO.longest}
                      </span>
                    ) : null}
                  </th>
                  <td className={`w-full py-1 ${WIDE}`}>
                    <Bar row={row} max={max} />
                  </td>
                  <td className={`${NUM} ${skipped ? '' : 'font-semibold'}`}>
                    {skipped ? DETAIL.noCost : formatDuration(row.ms)}
                  </td>
                  <td className={`${NUM} text-fg-2`}>
                    {row.average !== undefined
                      ? formatDuration(row.average)
                      : DETAIL.noCost}
                  </td>
                  <td className={`${NUM} ${WIDE}`}>
                    {lane ? (
                      <>
                        {formatDuration(lane.workMs)}
                        {lane.complete ? null : (
                          <PartialTag title={COMMON.partialTiming} />
                        )}
                      </>
                    ) : null}
                  </td>
                  <td className={NUM}>
                    {lane
                      ? lane.called
                        ? formatCost(lane.costUsd)
                        : DETAIL.noCost
                      : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-line border-t">
              <th
                scope="row"
                className="pt-2 pr-3 text-left font-semibold whitespace-nowrap"
              >
                {RUN_RETRO.total}
              </th>
              <td className={`pt-2 ${WIDE}`} />
              {lead !== null ? (
                <td
                  className={`${NUM} font-figure pt-2 text-base font-bold ${above ? 'text-failed' : ''}`}
                >
                  {formatDuration(lead)}
                </td>
              ) : (
                <td className={`${NUM} text-fg-2 pt-2`}>
                  {over ? formatDuration(null) : RUN_RETRO.notOver}
                </td>
              )}
              <td
                className={`${NUM} text-fg-2 pt-2`}
                title={RUN_RETRO.totalAverageTitle}
              >
                {control ? formatDuration(control.meanMs) : DETAIL.noCost}
              </td>
              <td className={`${NUM} pt-2 ${WIDE}`}>
                {formatDuration(r.stageTotalMs)}
              </td>
              <td className={`${NUM} pt-2 font-semibold`}>
                {formatCost(s.costUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  )
}

/** The reason a measured call has no cost, under the cost column. */
export function PricingNotice({ attempts }: { attempts: AttemptRow[] }) {
  const models = unpricedModelsOf(attempts)
  return models.length > 0 ? (
    <p className="break-words">{DETAIL.unpricedModels(models)}</p>
  ) : null
}
