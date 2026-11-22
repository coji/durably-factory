import { ControlChart } from '../../components/charts/ControlChart'
import { ParetoChart } from '../../components/charts/ParetoChart'
import { TimeBreakdown } from '../../components/charts/TimeBreakdown'
import { ReworkChart, TokenChart } from '../../components/charts/UsageCharts'
import {
  LeadTimeChart,
  ThroughputChart,
} from '../../components/charts/WeeklyCharts'
import { DESIGN } from '../../glossary'
import { Floor } from '../factory/Floor'
import {
  FLOOR_BUSY,
  FLOOR_IDLE,
  FLOW_ABOVE_WEEKS,
  FLOW_CONTROL,
  FLOW_SHIFT_CONTROL,
  FLOW_SHIFT_TASKS,
  FLOW_STOPS,
  FLOW_TASKS,
  FLOW_TIME,
  FLOW_WEEKS,
} from './flow-fixtures'
import { State } from './Specimen'

const S = DESIGN.chart

export function FloorStates() {
  return (
    <>
      <State label={S.floorBusy}>
        <Floor
          floor={FLOOR_BUSY}
          time={FLOW_TIME}
          constraint={{ lane: 'code', perTaskMs: 18 * 60_000, share: 0.32 }}
        />
      </State>
      <State label={S.floorIdle}>
        <Floor floor={FLOOR_IDLE} time={null} constraint={null} />
      </State>
    </>
  )
}

export function ControlStates() {
  return (
    <>
      <State label={S.controlAbove}>
        <ControlChart
          tasks={FLOW_TASKS}
          control={FLOW_CONTROL}
          aboveWeeks={FLOW_ABOVE_WEEKS}
        />
      </State>
      <State label={S.controlRun}>
        <ControlChart tasks={FLOW_SHIFT_TASKS} control={FLOW_SHIFT_CONTROL} />
      </State>
      <State label={S.controlFew}>
        <ControlChart tasks={FLOW_TASKS.slice(0, 1)} control={null} />
      </State>
    </>
  )
}

export function ParetoStates() {
  return (
    <>
      <State label={S.paretoMany}>
        <ParetoChart stops={FLOW_STOPS} />
      </State>
      <State label={S.paretoNone}>
        <ParetoChart stops={[]} />
      </State>
    </>
  )
}

export function TimeStates() {
  return (
    <State label={S.timeLongest}>
      <TimeBreakdown time={FLOW_TIME} />
    </State>
  )
}

export function WeeklyStates() {
  return (
    <>
      <State label={S.throughput}>
        <ThroughputChart weeks={FLOW_WEEKS} />
      </State>
      <State label={S.leadTime}>
        <LeadTimeChart weeks={FLOW_WEEKS} />
      </State>
      <State label={S.tokens}>
        <TokenChart weeks={FLOW_WEEKS} />
      </State>
      <State label={S.rework}>
        <ReworkChart
          rework={[
            {
              stage: 'code',
              tasks: 40,
              reworked: 12,
              visits: { n: 40, unknown: 0, median: 1, min: 1, max: 4 },
            },
            {
              stage: 'verify',
              tasks: 40,
              reworked: 19,
              visits: { n: 40, unknown: 0, median: 1, min: 1, max: 5 },
            },
            {
              stage: 'review',
              tasks: 38,
              reworked: 9,
              visits: { n: 38, unknown: 0, median: 1, min: 1, max: 3 },
            },
          ]}
        />
      </State>
    </>
  )
}
