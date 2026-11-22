import { formatCount } from '../../engine/format'
import { Card } from '../components/Card'
import { ControlChart } from '../components/charts/ControlChart'
import { ParetoChart } from '../components/charts/ParetoChart'
import { TimeBreakdown } from '../components/charts/TimeBreakdown'
import { EmptyState } from '../components/EmptyState'
import { FakeSwitch } from '../components/FakeSwitch'
import { Chevron } from '../components/Layout'
import { RepoFilter } from '../components/RepoFilter'
import { clockFormat } from '../components/Time'
import { FACTORY, LIST } from '../glossary'
import { pageHref, withFake, withRepo } from '../route'
import type { FlowResponse, RunsResponse } from '../server'
import { usePolled } from '../usePolled'
import { Attention } from './factory/Attention'
import { Floor } from './factory/Floor'
import { Pace } from './factory/Pace'

/** The flow is read again every 30 seconds; it moves only as tasks end. */
const FLOW_REFRESH_MS = 30_000

/**
 * The factory at a glance, from the whole to its parts: this week's pace
 * and what waits on a person, the tasks in each stage now, then the last
 * 30 days as a QC report: lead times on a control chart, stops on a Pareto
 * chart, and where a task's time goes.
 */
export function FactoryScreen({
  data,
  repo,
  fake,
  onFake,
}: {
  data: RunsResponse
  repo?: string
  /** Fake tasks counted too; the choice is the page's, kept across pages. */
  fake: boolean
  onFake: (fake: boolean) => void
}) {
  const url = withFake(withRepo('/api/flow', repo), fake)
  const polled = usePolled<FlowResponse>(url, FLOW_REFRESH_MS)
  const flow = polled.data
  if (!data.exists)
    return (
      <EmptyState>
        {LIST.noDbBefore} <span className="font-code">{data.db}</span>{' '}
        {LIST.noDbAfter}
      </EmptyState>
    )
  const tasksHref = pageHref('runs', repo)
  const decision = data.tasks.filter((t) => t.attention === 'decision').length
  // Recent stops only, as the task list counts them.
  const old = new Set(data.oldStops)
  const stopped = data.tasks.filter(
    (t) => t.attention === 'stop' && !old.has(t.id),
  ).length
  const days = String(flow?.days ?? 30)
  const delivered =
    flow?.tasks.filter((t) => t.outcome === 'delivered').length ?? 0
  const onlyFake = flow && flow.tasks.length === 0 && flow.fakeExcluded > 0
  return (
    <div className="flex flex-col gap-4">
      <RepoFilter page="factory" scope={data} />
      <FakeSwitch
        fake={fake}
        onFake={onFake}
        onlyFake={!!onlyFake}
        fakeExcluded={flow?.fakeExcluded ?? 0}
      />
      <div className="factory-grid">
        <Pace
          flow={flow}
          decision={decision}
          stopped={stopped}
          tasksHref={tasksHref}
        />
        <Floor
          floor={data.floor}
          time={flow?.time ?? null}
          constraint={flow?.constraint ?? null}
        />
      </div>
      <div className="factory-columns">
        <div className="factory-stack">
          <Card
            title={FACTORY.control}
            kind={`${FACTORY.controlKind} · ${FACTORY.controlNote(formatCount(delivered), days)}`}
            foot={flow?.control ? FACTORY.controlHelp : null}
          >
            {flow ? (
              <ControlChart
                tasks={flow.tasks}
                control={flow.control}
                aboveWeeks={flow.aboveWeeks}
              />
            ) : (
              <p className="text-fg-2 py-12 text-center text-sm">
                {FACTORY.flowLoading}
              </p>
            )}
          </Card>
          <Card
            title={FACTORY.time}
            kind={FACTORY.timeNote(formatCount(flow?.timeTasks ?? 0))}
          >
            {flow ? (
              <TimeBreakdown time={flow.time} />
            ) : (
              <p className="text-fg-2 py-8 text-center text-sm">
                {FACTORY.flowLoading}
              </p>
            )}
          </Card>
        </div>
        <div className="factory-stack">
          <Card
            title={FACTORY.stops}
            kind={`${FACTORY.stopsKind} · ${FACTORY.days(days)}`}
          >
            {flow ? (
              <ParetoChart stops={flow.stops} />
            ) : (
              <p className="text-fg-2 py-12 text-center text-sm">
                {FACTORY.flowLoading}
              </p>
            )}
          </Card>
          <Attention data={data} tasksHref={tasksHref} />
        </div>
      </div>
      <details className="group text-fg-2 text-xs">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
          <Chevron />
          {FACTORY.definition}
          {flow
            ? ` · ${FACTORY.dataAsOf(clockFormat.format(new Date(flow.now)))}`
            : ''}
        </summary>
        <p className="mt-2 max-w-[70ch] leading-relaxed">
          {FACTORY.definitionBody}
        </p>
      </details>
    </div>
  )
}
