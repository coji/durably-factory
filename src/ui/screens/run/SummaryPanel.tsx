import { formatCount } from '../../../engine/format'
import type { LoopReport } from '../../../engine/report'
import { Field } from '../../components/KeyValue'
import { Panel } from '../../components/Layout'
import {
  CALIBRATION_KEYS,
  CALIBRATION_NAME,
  COMMON,
  DETAIL,
} from '../../glossary'
import { triageName } from '../../labels'

/** Whether the run's token total covers every call, as the summary says. */
export function tokensComplete(report: LoopReport): boolean {
  return report.summary.tokensComplete
}

/** The shadow triage judgment and what it measured, for the evidence. */
export function TriagePanel({ report: r }: { report: LoopReport }) {
  if (!r.triage) return null
  return (
    <Panel title={DETAIL.triage}>
      <div className="text-fg-2 flex flex-col gap-1">
        <p className="text-fg text-sm">
          {triageName(r.triage.judgment)}
          {COMMON.separator}
          {r.triage.reason}
        </p>
        <p className="text-xs">{DETAIL.triageShadow}</p>
        <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CALIBRATION_KEYS.map((key) => (
            <Field key={key} label={CALIBRATION_NAME[key]}>
              {formatCount(r.triage?.calibration?.[key])}
            </Field>
          ))}
        </dl>
      </div>
    </Panel>
  )
}
