import type { LoopReport } from '../../../engine/report'
import { RunLink } from '../../components/RunLink'
import { Ago } from '../../components/Time'
import { BASELINE, RUN_NAME } from '../../glossary'
import type { RunRef } from '../../server'

/**
 * Where the baseline verdict came from: the check run here, or another
 * run's passing result used in its place, with that run and when its check
 * completed. Nothing while the baseline has no verdict.
 */
export function BaselineSource({
  baseline,
  source,
  now,
}: {
  baseline: LoopReport['baseline']
  /** The reused run's name, from the detail response; null if it no longer exists. */
  source: RunRef | null
  now: string
}) {
  if (!baseline || baseline.passed === null) return null
  const from = baseline.reusedFrom
  if (!from) return <p className="text-fg-2 text-xs">{BASELINE.measured}</p>
  return (
    <div className="text-fg-2 flex flex-col gap-1 text-xs">
      <p>{BASELINE.reused}</p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <dt>{BASELINE.source}</dt>
          <dd className="min-w-0">
            <RunLink id={from.runId} name={source?.name ?? RUN_NAME.previous} />
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt>{BASELINE.checkedAt}</dt>
          <dd>
            <Ago iso={from.checkedAt} now={now} />
          </dd>
        </div>
      </dl>
      {baseline.logMissing ? <p>{BASELINE.logMissing}</p> : null}
    </div>
  )
}
