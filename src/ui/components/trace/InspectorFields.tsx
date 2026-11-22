import {
  formatCost,
  formatCount,
  formatDuration,
  formatTokens,
  UNKNOWN,
} from '../../../engine/format'
import type { ReportCandidate } from '../../../engine/report'
import {
  COMMON,
  INTERRUPTION_NAME,
  TIMEOUT_KIND_NAME,
  TRACE,
} from '../../glossary'
import { stageName } from '../../labels'
import type { TraceNode, TraceProfile } from '../../server'
import { InlineField, PartialTag } from '../KeyValue'
import { exactTime, Code, Num } from '../Time'
import { liveTimes } from './model'

export function UsageFields({
  u,
}: {
  u: {
    invocations: number
    totalTokens: number | null
    costUsd: number | null
    complete: boolean
    inputTokens?: number | null
    outputTokens?: number | null
  }
}) {
  const tag = (v: number | null | undefined) =>
    v == null || u.complete ? null : <PartialTag title={COMMON.partialUsage} />
  return (
    <>
      <InlineField label={TRACE.invocations}>
        <Num>{formatCount(u.invocations)}</Num>
      </InlineField>
      <InlineField label={TRACE.totalTokens}>
        <Num>{formatTokens(u.totalTokens)}</Num>
        {tag(u.totalTokens)}
      </InlineField>
      {u.inputTokens !== undefined ? (
        <InlineField label={TRACE.inputOutput}>
          <Num>
            {formatTokens(u.inputTokens)} / {formatTokens(u.outputTokens)}
          </Num>
          {tag(u.inputTokens ?? u.outputTokens)}
        </InlineField>
      ) : null}
      <InlineField label={TRACE.cost}>
        <span title={COMMON.costNote}>
          <Num>{formatCost(u.costUsd)}</Num>
        </span>
      </InlineField>
    </>
  )
}

/** A time from the run's start; the exact time on hover. */
function Offset({ ms, iso }: { ms: number | null; iso: string | null }) {
  return (
    <span title={exactTime(iso)} className="tabular-nums">
      {ms === null ? UNKNOWN : `+${formatDuration(ms)}`}
    </span>
  )
}

/** Stage, pass, attempts, and the row's times. */
export function TimingFields({
  node: n,
  elapsed,
  leadTimeMs,
}: {
  node: TraceNode
  elapsed: number
  leadTimeMs: number | null
}) {
  const t = liveTimes(n, elapsed)
  const attempts =
    n.kind === 'attempt' || n.kind === 'run' || n.wait ? null : (
      <InlineField label={TRACE.attempts}>
        <Num>{n.attempts}</Num>
      </InlineField>
    )
  // A finished run's time is the report's lead time, to the millisecond.
  const duration = n.kind === 'run' && !n.open ? leadTimeMs : t.duration
  return (
    <>
      {n.stage ? (
        <InlineField label={TRACE.stage}>{stageName(n.stage)}</InlineField>
      ) : null}
      {n.iteration !== null && n.kind !== 'iteration' ? (
        <InlineField label={TRACE.iteration}>
          {COMMON.nth(n.iteration)}
        </InlineField>
      ) : null}
      {attempts}
      <InlineField label={TRACE.start}>
        <Offset ms={t.start} iso={n.startedAt} />
      </InlineField>
      <InlineField label={TRACE.end}>
        {n.open ? TRACE.notEnded : <Offset ms={t.end} iso={n.endedAt} />}
      </InlineField>
      <InlineField label={n.open ? TRACE.elapsed : TRACE.time}>
        <Num>{formatDuration(duration)}</Num>
      </InlineField>
      {n.interruptionReason ? (
        <InlineField label={TRACE.interruption}>
          {INTERRUPTION_NAME[n.interruptionReason] ?? n.interruptionReason}
        </InlineField>
      ) : null}
      {n.timedOut ? (
        <>
          <InlineField label={TRACE.timedOut}>
            {TIMEOUT_KIND_NAME[n.timedOut.kind]}
          </InlineField>
          <InlineField label={TRACE.timeoutLimit}>
            <Num>{formatDuration(n.timedOut.limitMs)}</Num>
          </InlineField>
        </>
      ) : null}
    </>
  )
}

export function ProfileFields({ profile: p }: { profile: TraceProfile }) {
  return (
    <>
      <InlineField label={TRACE.provider}>{p.provider ?? UNKNOWN}</InlineField>
      <InlineField label={TRACE.model}>
        <Code>{p.model ?? COMMON.defaultSetting}</Code>
      </InlineField>
      <InlineField label={TRACE.effort}>
        <Code>{p.effort ?? COMMON.defaultSetting}</Code>
      </InlineField>
      {p.reportedModel && p.reportedModel !== p.model ? (
        <InlineField label={TRACE.reportedModel}>
          <Code>{p.reportedModel}</Code>
        </InlineField>
      ) : null}
    </>
  )
}

export function CandidateFields({
  candidate: c,
}: {
  candidate: ReportCandidate
}) {
  return (
    <>
      {c.timedOut ? (
        <InlineField label={TRACE.candidateOrigin}>
          {TRACE.timedOutWork}
        </InlineField>
      ) : null}
      <InlineField label={TRACE.branch}>
        <Code>{c.branch ?? COMMON.none}</Code>
      </InlineField>
      <InlineField label={TRACE.commit}>
        <Code>{c.commit?.slice(0, 12) ?? COMMON.none}</Code>
      </InlineField>
      {c.changes ? (
        <>
          <InlineField label={TRACE.files}>
            <Num>{formatCount(c.changes.files)}</Num>
          </InlineField>
          <InlineField label={TRACE.additions}>
            <Num>{formatCount(c.changes.additions)}</Num>
          </InlineField>
          <InlineField label={TRACE.deletions}>
            <Num>{formatCount(c.changes.deletions)}</Num>
          </InlineField>
        </>
      ) : null}
    </>
  )
}

export function WaitFields({
  node: n,
  wait: w,
  elapsed,
}: {
  node: TraceNode
  wait: NonNullable<TraceNode['wait']>
  elapsed: number
}) {
  const state = n.open
    ? TRACE.waitOpen
    : w.outcome === 'timeout'
      ? TRACE.waitTimeout
      : w.outcome === 'signal'
        ? TRACE.waitSignal
        : UNKNOWN
  return (
    <>
      <InlineField label={TRACE.approval}>{state}</InlineField>
      <InlineField label={TRACE.humanWait}>
        <Num>
          {formatDuration(
            n.open ? liveTimes(n, elapsed).duration : w.inputWaitMs,
          )}
        </Num>
      </InlineField>
    </>
  )
}
