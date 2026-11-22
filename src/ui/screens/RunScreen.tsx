import type { Act } from '../components/ActionNotice'
import { CopyAnnouncer, CopyButton, useCopy } from '../components/copy'
import { Collapsible, Panel } from '../components/Layout'
import { StageTrack } from '../components/StageTrack'
import { StatusBadge } from '../components/StatusBadge'
import {
  ArchivedMark,
  RepoMark,
  SupersededMark,
} from '../components/SupersededMark'
import { TaskLineage } from '../components/TaskLineage'
import { runState } from '../components/TaskRow'
import { Ago } from '../components/Time'
import { TraceView } from '../components/trace/TraceView'
import { COMMON, COPY, DETAIL } from '../glossary'
import type { RunDetailResponse } from '../server'
import { RecordPanels } from './run/RecordPanels'
import { ReviewHighlightsPanel, ReviewsPanel } from './run/ReviewsPanel'
import { RunTime } from './run/RunTime'
import { SpecPanel } from './run/SpecPanel'
import { StatusPanel } from './run/StatusPanel'
import { tokensComplete, TriagePanel } from './run/SummaryPanel'
import { UsagePanels } from './run/UsagePanels'

/**
 * The run's one state, its repository, when it started, its ID, the other
 * runs of its task and its stages. The state is said once: how it ended, or
 * where it is.
 */
function RunHeader({ data }: { data: RunDetailResponse }) {
  const r = data.report
  // A run a later approved repair made moot reads as the list and the
  // task's runs read it: in the quiet tone, with the word that says why.
  const superseded =
    data.lineage.find((l) => l.id === r.runId)?.superseded ?? false
  const state = runState({
    status: r.status,
    kind: data.diagnosis.kind,
    conclusion: r.summary.conclusion,
    superseded,
    archived: data.archived,
  })
  const { copied, copy } = useCopy()
  const ahead = !['finished', 'stopped'].includes(data.diagnosis.kind)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge label={state.label} tone={state.tone} />
        <RepoMark name={data.repo.name} path={data.repo.path ?? undefined} />
        {superseded ? <SupersededMark /> : null}
        {data.archived ? <ArchivedMark /> : null}
        <span className="text-fg-2 text-sm">
          <Ago
            iso={data.createdAt}
            now={data.now}
            prefix={`${COMMON.started} `}
          />
        </span>
        <code className="font-code text-fg-2 text-xs break-all">{r.runId}</code>
        <CopyButton
          text={r.runId}
          label={COPY.runId}
          copied={copied}
          onCopy={copy}
        />
        <CopyAnnouncer copied={copied} />
        {r.fake ? (
          <span className="text-fg-2 text-xs">{DETAIL.fake}</span>
        ) : null}
      </div>
      <TaskLineage runs={data.lineage} current={r.runId} now={data.now} />
      {/* A finished or stopped run's stages are in the trace below; the
          strip stays only while stages are still ahead. */}
      {ahead ? <StageTrack pipeline={data.pipeline} /> : null}
    </div>
  )
}

/**
 * Everything under the run's name, which the polled page renders as the h1,
 * in the order a person reads it and stops: the conclusion and next step,
 * what the reviews fixed and left, where the time and money went against
 * the factory's average, the stages over time, and the evidence, closed.
 */
export function RunScreen({
  data,
  act,
}: {
  data: RunDetailResponse
  act: Act
}) {
  const r = data.report
  const totals = {
    leadTimeMs: r.summary.leadTimeMs,
    invocations: r.summary.llmInvocations,
    totalTokens: r.summary.totalTokens,
    costUsd: r.summary.costUsd,
    complete: tokensComplete(r),
  }
  return (
    <div className="flex flex-col gap-4">
      <RunHeader data={data} />
      <StatusPanel data={data} act={act} />
      <ReviewHighlightsPanel h={r.reviewHighlights} />
      <RunTime data={data} />
      <Panel title={DETAIL.trace}>
        <TraceView
          trace={data.trace}
          totals={totals}
          serverNow={data.now}
          runId={r.runId}
        />
      </Panel>
      <Collapsible title={DETAIL.evidence} note={DETAIL.evidenceNote} bare>
        <SpecPanel report={r} />
        <ReviewsPanel report={r} />
        <UsagePanels report={r} />
        <TriagePanel report={r} />
        <RecordPanels report={r} />
      </Collapsible>
    </div>
  )
}
