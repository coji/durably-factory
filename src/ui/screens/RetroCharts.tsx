import { formatCount } from '../../engine/format'
import { Card } from '../components/Card'
import { TimeBreakdown } from '../components/charts/TimeBreakdown'
import { ReworkChart, TokenChart } from '../components/charts/UsageCharts'
import {
  LeadTimeChart,
  ThroughputChart,
} from '../components/charts/WeeklyCharts'
import { FakeSwitch } from '../components/FakeSwitch'
import { FACTORY, RETRO } from '../glossary'
import { withFake, withRepo } from '../route'
import type { FlowResponse } from '../server'
import { usePolled } from '../usePolled'

const FLOW_REFRESH_MS = 30_000

/**
 * The last 30 days week by week, for reading whether the factory got
 * faster and where it spent: throughput, lead time, tokens by provider,
 * the stages tasks had to go through again, and where a task's time goes.
 */
export function RetroCharts({
  repo,
  fake,
  onFake,
}: {
  repo?: string
  fake: boolean
  onFake: (fake: boolean) => void
}) {
  const polled = usePolled<FlowResponse>(
    withFake(withRepo('/api/flow', repo), fake),
    FLOW_REFRESH_MS,
  )
  const flow = polled.data
  if (!flow)
    return <p className="text-fg-2 py-8 text-sm">{FACTORY.flowLoading}</p>
  const onlyFake = flow.tasks.length === 0 && flow.fakeExcluded > 0
  const toggle = (
    <FakeSwitch
      fake={fake}
      onFake={onFake}
      onlyFake={onlyFake}
      fakeExcluded={flow.fakeExcluded}
    />
  )
  if (flow.tasks.length === 0) return toggle
  return (
    <>
      {toggle}
      {/* Each row pairs charts of about one height, so no row leaves a hole. */}
      <div className="factory-grid mb-8">
        <Card
          title={RETRO.throughput}
          kind={RETRO.throughputNote}
          className="span-3"
        >
          <ThroughputChart weeks={flow.weeks} />
        </Card>
        <Card
          title={RETRO.leadTime}
          kind={RETRO.leadTimeNote}
          className="span-3"
        >
          <LeadTimeChart weeks={flow.weeks} />
        </Card>
        <Card title={RETRO.usage} kind={RETRO.usageNote} className="span-3">
          <TokenChart weeks={flow.weeks} />
        </Card>
        <Card
          title={FACTORY.time}
          kind={FACTORY.timeNote(formatCount(flow.timeTasks))}
          className="span-3"
        >
          <TimeBreakdown time={flow.time} />
        </Card>
        <Card title={RETRO.rework} kind={RETRO.reworkNote} className="span-6">
          <ReworkChart rework={flow.rework} />
        </Card>
      </div>
    </>
  )
}
