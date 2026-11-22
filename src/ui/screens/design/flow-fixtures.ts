/**
 * A month of a factory, made up for the design page: lead times in finish
 * order with a few above the limit, stop reasons, a time breakdown, weeks
 * and the floor now. Not any real run.
 */
import { controlLimits } from '../../../engine/control'
import type { FlowTask, FlowWeek } from '../../../engine/flow'
import type { FloorLane } from '../../server'

const MIN = 60_000
const WEEKS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']
const LEADS = [
  34, 41, 28, 52, 38, 45, 31, 60, 36, 44, 29, 48, 39, 55, 33, 42, 47, 30, 51,
  37, 46, 35, 43, 58, 40, 49, 32, 140, 44, 38, 53, 41, 36, 62, 45, 39, 165, 48,
  43, 57, 50, 46, 41, 55, 152, 49,
]

export const FLOW_TASKS: FlowTask[] = LEADS.map((m, i) => ({
  id: `task-${i}`,
  latestRunId: `run-${i}`,
  name: m > 120 ? `見本: 時間のかかったタスク ${i}` : `見本のタスク ${i}`,
  repo: 'shop-app',
  finishedAt: new Date(
    Date.UTC(2026, 8, 7, 9) + i * 9 * 3_600_000,
  ).toISOString(),
  week: WEEKS[Math.min(3, Math.floor(i / 12))] as string,
  outcome: 'delivered',
  stopKind: null,
  runs: 1,
  leadTimeMs: m * MIN,
  workMs: m * MIN,
  humanWaitMs: 0,
  slotWaitMs: 0,
  costUsd: 2,
}))

export const FLOW_CONTROL = controlLimits(
  FLOW_TASKS.map((t) => ({ id: t.id, ms: t.leadTimeMs ?? 0 })),
)

/**
 * A level shift: 24 quick tasks, then 12 slower ones, all inside the
 * limits, so only the run rule calls it out.
 */
const SHIFT = [
  ...Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 24 : 34) + (i % 3)),
  ...Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 46 : 58) - (i % 3)),
]

export const FLOW_SHIFT_TASKS: FlowTask[] = SHIFT.map((m, i) => ({
  ...(FLOW_TASKS[i] as FlowTask),
  id: `shift-${i}`,
  name: `見本のタスク ${i}`,
  week: WEEKS[Math.min(3, Math.floor(i / 9))] as string,
  leadTimeMs: m * MIN,
}))

export const FLOW_SHIFT_CONTROL = controlLimits(
  FLOW_SHIFT_TASKS.map((t) => ({ id: t.id, ms: t.leadTimeMs ?? 0 })),
)

/** The fixture's last week holds two of the three lead times above it. */
export const FLOW_ABOVE_WEEKS = [{ week: '2026-09-28', tasks: 2 }]

export const FLOW_STOPS = [
  { kind: 'review-cap-reached', tasks: 9, taskIds: [] },
  { kind: 'verification-failed', tasks: 7, taskIds: [] },
  { kind: 'uncertain-invocation', tasks: 4, taskIds: [] },
  { kind: 'spec-check-failed', tasks: 2, taskIds: [] },
  { kind: 'cancelled', tasks: 1, taskIds: [] },
]

export const FLOW_TIME = [
  { part: 'prepare', perTaskMs: 0.6 * MIN },
  { part: 'spec', perTaskMs: 8 * MIN },
  { part: 'code', perTaskMs: 18 * MIN },
  { part: 'verify', perTaskMs: 11 * MIN },
  { part: 'review', perTaskMs: 9 * MIN },
  { part: 'human-wait', perTaskMs: 6 * MIN },
  { part: 'between', perTaskMs: 3 * MIN },
].map((t) => ({ ...t, totalMs: t.perTaskMs * 40, tasks: 40 }))

const stat = (median: number, min: number, max: number) => ({
  n: 10,
  unknown: 0,
  median: median * MIN,
  min: min * MIN,
  max: max * MIN,
})

export const FLOW_WEEKS: FlowWeek[] = WEEKS.map((week, i) => ({
  week,
  finished: [14, 18, 15, 9][i] as number,
  delivered: [10, 13, 12, 7][i] as number,
  rejected: [1, 1, 0, 1][i] as number,
  stopped: [3, 4, 3, 1][i] as number,
  firstPass: [6, 8, 9, 5][i] as number,
  leadTimeMs: stat(
    [42, 39, 47, 44][i] as number,
    28,
    [60, 140, 165, 152][i] as number,
  ),
  costUsd: [48, 61, 55, 30][i] as number,
  costUnknown: 0,
  providers: [
    {
      provider: 'claude',
      invocations: 40,
      totalTokens: ([38, 52, 47, 21][i] ?? 0) * 1e6,
      costUsd: 30,
    },
    {
      provider: 'codex',
      invocations: 60,
      totalTokens: i === 1 ? null : ([64, 0, 71, 40][i] ?? 0) * 1e6,
      costUsd: 20,
    },
  ],
}))

const lane = (
  name: FloorLane['lane'],
  running: number,
  waiting: number,
  queued: number,
  longest: number | null,
): FloorLane => ({
  lane: name,
  running,
  waiting,
  queued,
  longestStepMs: longest === null ? null : longest * MIN,
  runIds: [],
})

export const FLOOR_BUSY: FloorLane[] = [
  lane('prepare', 0, 0, 1, null),
  lane('spec', 1, 1, 0, 6),
  lane('code', 2, 0, 0, 18),
  lane('verify', 1, 0, 0, 3),
  lane('review', 2, 0, 2, 9),
  lane('approve', 0, 1, 0, null),
  lane('finish', 0, 0, 0, null),
]

export const FLOOR_IDLE: FloorLane[] = FLOOR_BUSY.map((l) =>
  lane(l.lane, 0, 0, 0, null),
)
