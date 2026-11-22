import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  controlLimits,
  flowOf,
  flowToMarkdown,
  laneOf,
  runLanes,
  runWaits,
  runTimeParts,
  type FlowRun,
} from '../src/engine/flow.js'
import type { LoopReport } from '../src/engine/report.js'

const DAY = 86_400_000
// A Wednesday at noon, local time.
const now = new Date(2026, 8, 30, 12).getTime()
const iso = (ms: number) => new Date(ms).toISOString()

function run(
  id: string,
  completed: number | null,
  over: {
    parent?: string
    outcome?: 'delivered' | 'rejected' | 'stopped'
    failure?: string | null
    conclusion?: string
    fake?: boolean
    leadTimeMs?: number | null
    costUsd?: number | null
    humanWaitMs?: number | null
    stages?: Record<string, number>
    visits?: Record<string, number>
    roles?: {
      provider: string | null
      invocations: number
      totalTokens: number | null
      costUsd: number | null
    }[]
  } = {},
): FlowRun {
  const outcome = over.outcome ?? 'delivered'
  const report = {
    runId: id,
    fake: over.fake ?? false,
    input: {},
    summary: {
      success: outcome === 'delivered',
      conclusion:
        over.conclusion ??
        (outcome === 'delivered'
          ? 'approved'
          : outcome === 'rejected'
            ? 'rejected'
            : 'review-cap-reached'),
      leadTimeMs: over.leadTimeMs === undefined ? 600_000 : over.leadTimeMs,
      workMs: 100_000,
      humanWaitMs: over.humanWaitMs === undefined ? 0 : over.humanWaitMs,
      costUsd: over.costUsd === undefined ? 2 : over.costUsd,
    },
    delivery: outcome === 'delivered' ? { kind: 'patch' } : null,
    failure:
      outcome === 'stopped' && over.failure !== null
        ? { kind: over.failure ?? 'review-cap-reached' }
        : null,
    waits: [],
    stageTimings: Object.entries(over.stages ?? {}).map(([stage, ms]) => ({
      stage,
      elapsedMs: ms,
      wallElapsedMs: ms,
      complete: true,
    })),
    stageVisits: Object.entries(over.visits ?? {}).map(([stage, visits]) => ({
      stage,
      visits,
      reworked: Math.max(0, visits - 1),
    })),
    roleUsage: over.roles ?? [],
  } as unknown as LoopReport
  return {
    id,
    parentId: over.parent ?? null,
    createdAt: iso((completed ?? now) - 3_600_000),
    status: completed === null ? 'leased' : 'completed',
    completedAt: completed === null ? null : iso(completed),
    report,
    name: `task ${id}`,
    repo: 'shop-app',
  }
}

describe('flowOf', () => {
  it('counts delivered, rejected and stopped tasks by the week their newest run finished', () => {
    const f = flowOf(
      [
        run('a', now - 1 * DAY),
        run('b', now - 2 * DAY, { outcome: 'rejected' }),
        run('c', now - 8 * DAY, {
          outcome: 'stopped',
          failure: 'verification-failed',
        }),
        run('d', now - 9 * DAY),
        // Repaired: one task, counted by its repair, delivered.
        run('e', now - 10 * DAY, { outcome: 'stopped' }),
        run('e2', now - 3 * DAY, { parent: 'e' }),
        // Open, fake, and before the window: none of them counts.
        run('open', null),
        run('fake', now - DAY, { fake: true }),
        run('old', now - 40 * DAY),
      ],
      { now },
    )
    assert.deepEqual(
      f.tasks.map((t) => [t.id, t.outcome, t.runs]),
      [
        ['d', 'delivered', 1],
        ['c', 'stopped', 1],
        ['e', 'delivered', 2],
        ['b', 'rejected', 1],
        ['a', 'delivered', 1],
      ],
    )
    assert.equal(f.fakeExcluded, 1)
    const current = f.weeks.at(-1)!
    const previous = f.weeks.at(-2)!
    assert.equal(current.week, '2026-09-28')
    assert.deepEqual(
      [
        current.finished,
        current.delivered,
        current.rejected,
        current.firstPass,
      ],
      [2, 1, 1, 1],
    )
    // The repaired task finished on Sunday, in the week before.
    assert.deepEqual(
      [
        previous.finished,
        previous.delivered,
        previous.stopped,
        previous.firstPass,
      ],
      [3, 2, 1, 1],
    )
    assert.equal(f.pace.delivered, 1)
    assert.equal(f.pace.previousDelivered, 2)
    assert.equal(f.pace.deliveredChange, -1)
    assert.equal(f.pace.leadTimeRatio, 600_000 / 900_000)
    // The repaired task's lead time is both runs' sum, never the gap between.
    assert.equal(f.tasks.find((t) => t.id === 'e')?.leadTimeMs, 1_200_000)
    assert.deepEqual(f.stops, [
      { kind: 'verification-failed', tasks: 1, taskIds: ['c'] },
    ])
  })

  it('keeps unknown lead times and costs out of the numbers, never as 0', () => {
    const f = flowOf(
      [
        run('a', now - DAY, { leadTimeMs: null, costUsd: null }),
        run('b', now - DAY, { leadTimeMs: 300_000, costUsd: 3 }),
      ],
      { now },
    )
    const week = f.weeks.at(-1)!
    assert.deepEqual(
      [week.leadTimeMs.n, week.leadTimeMs.unknown, week.leadTimeMs.median],
      [1, 1, 300_000],
    )
    assert.deepEqual([week.costUsd, week.costUnknown], [3, 1])
    assert.equal(f.timeTasks, 1)
  })

  it('splits the lead time into stage walls, waits and the time between steps', () => {
    const f = flowOf(
      [
        run('a', now - DAY, {
          leadTimeMs: 1_000,
          humanWaitMs: 200,
          stages: { code: 300, review: 400 },
          visits: { code: 2, review: 1 },
        }),
        run('b', now - DAY, {
          leadTimeMs: 500,
          stages: { code: 500 },
          visits: { code: 1 },
        }),
      ],
      { now },
    )
    assert.deepEqual(
      f.time.map((t) => [t.part, t.totalMs, t.tasks, t.perTaskMs]),
      [
        ['code', 800, 2, 400],
        ['review', 400, 1, 200],
        ['human-wait', 200, 1, 100],
        ['between', 100, 1, 50],
      ],
    )
    assert.deepEqual(f.constraint, {
      lane: 'code',
      perTaskMs: 400,
      share: 400 / 750,
    })
    assert.deepEqual(
      f.rework.map((r) => [r.stage, r.tasks, r.reworked]),
      [
        ['code', 2, 1],
        ['review', 1, 0],
      ],
    )
  })

  it('adds tokens by provider and leaves a total unknown when any call reported none', () => {
    const f = flowOf(
      [
        run('a', now - DAY, {
          roles: [
            { provider: 'codex', invocations: 2, totalTokens: 100, costUsd: 1 },
            {
              provider: 'claude',
              invocations: 1,
              totalTokens: null,
              costUsd: 2,
            },
          ],
        }),
        run('b', now - DAY, {
          roles: [
            {
              provider: 'codex',
              invocations: 1,
              totalTokens: 50,
              costUsd: 0.5,
            },
            { provider: 'claude', invocations: 0, totalTokens: 0, costUsd: 0 },
          ],
        }),
      ],
      { now },
    )
    assert.deepEqual(f.providers, [
      { provider: 'codex', invocations: 3, totalTokens: 150, costUsd: 1.5 },
      { provider: 'claude', invocations: 1, totalTokens: null, costUsd: 2 },
    ])
  })
})

describe('flowToMarkdown', () => {
  it('prints the week, the constraint, the control chart and the stops', () => {
    const md = flowToMarkdown(
      flowOf(
        [
          run('a', now - DAY, {
            stages: { verify: 500_000 },
            leadTimeMs: 600_000,
          }),
          run('b', now - DAY, {
            stages: { verify: 400_000 },
            leadTimeMs: 600_000,
          }),
          run('c', now - DAY, {
            outcome: 'stopped',
            failure: 'verification-failed',
          }),
        ],
        { now },
      ),
    )
    assert.match(md, /- delivered: 2 /)
    assert.match(md, /- constraint: verify, /)
    assert.match(md, /- delivered tasks: 2; mean 10m/)
    assert.match(md, /\| verification-failed \| 1 \| 100% \|/)
  })
})

describe('runTimeParts', () => {
  it('groups stages by lane and leaves a run with an unknown wait out', () => {
    const r = run('a', now - DAY, {
      leadTimeMs: 2_000,
      humanWaitMs: 100,
      stages: { spec: 300, 'spec-review': 200, code: 600, verify: 400 },
    })
    assert.deepEqual(runTimeParts(r.report), [
      { part: 'spec', ms: 500 },
      { part: 'code', ms: 600 },
      { part: 'verify', ms: 400 },
      { part: 'human-wait', ms: 100 },
      { part: 'between', ms: 400 },
    ])
    const unknown = run('b', now - DAY, { humanWaitMs: null })
    assert.equal(runTimeParts(unknown.report), null)
    assert.equal(laneOf('baseline'), 'prepare')
    assert.equal(laneOf('recheck'), 'verify')
  })
})

describe('controlLimits', () => {
  it('sets the upper limit at the mean plus 2.66 mean moving ranges', () => {
    const limits = controlLimits([
      { id: 'a', ms: 10 },
      { id: 'b', ms: 12 },
      { id: 'c', ms: 11 },
      { id: 'd', ms: 13 },
      { id: 'e', ms: 40 },
    ])
    // Mean 17.2; moving ranges 2, 1, 2, 27: mean 8.
    assert.equal(limits?.meanMs, 17.2)
    assert.equal(limits?.upperMs, 17.2 + 2.66 * 8)
    assert.equal(limits?.lowerMs, 0)
    assert.deepEqual(limits?.above, ['e'])
    assert.deepEqual(
      limits?.ranges.map((r) => [r.id, r.ms]),
      [
        ['b', 2],
        ['c', 1],
        ['d', 2],
        ['e', 27],
      ],
    )
    assert.equal(limits?.rangeMeanMs, 8)
    assert.equal(limits?.rangeUpperMs, 3.267 * 8)
  })

  it('names the weeks with two or more tasks above the limit', () => {
    const steady = Array.from({ length: 20 }, (_, i) =>
      run(`s${i}`, now - (20 - i) * 3_600_000 - 10 * DAY, {
        leadTimeMs: 600_000,
      }),
    )
    const late = [
      run('x1', now - 2 * 3_600_000, { leadTimeMs: 60_000_000 }),
      run('x2', now - 3_600_000, { leadTimeMs: 60_000_000 }),
    ]
    const f = flowOf([...steady, ...late], { now })
    assert.deepEqual(f.aboveWeeks, [{ week: '2026-09-28', tasks: 2 }])
  })

  it('marks nine or more values in a row on one side of the mean', () => {
    const values = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `lo${i}`, ms: 10 })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `hi${i}`, ms: 30 })),
      { id: 'mid', ms: 10 },
    ]
    assert.deepEqual(controlLimits(values)?.runs, [
      { side: 'below', fromId: 'lo0', toId: 'lo9', length: 10 },
      { side: 'above', fromId: 'hi0', toId: 'hi8', length: 9 },
    ])
  })

  it('has no limits under two values', () => {
    assert.equal(controlLimits([{ id: 'a', ms: 1 }]), null)
  })
})

describe('runLanes', () => {
  it('adds stages up by lane with their work and cost, and leaves empty stages out', () => {
    const report = {
      stageTimings: [
        {
          stage: 'preflight',
          elapsedMs: 50,
          wallElapsedMs: 50,
          complete: true,
        },
        { stage: 'code', elapsedMs: 600, wallElapsedMs: 600, complete: true },
        {
          stage: 'review',
          elapsedMs: 900,
          wallElapsedMs: 500,
          complete: false,
        },
        { stage: 'verify', elapsedMs: 400, wallElapsedMs: 400, complete: true },
        { stage: 'stop', elapsedMs: 0, wallElapsedMs: 0, complete: true },
      ],
      stageUsage: [
        { stage: 'code', costUsd: 1.5 },
        { stage: 'review', costUsd: 0.5 },
        { stage: 'review', costUsd: null },
      ],
    } as unknown as LoopReport
    assert.deepEqual(runLanes(report), [
      {
        part: 'prepare',
        wallMs: 50,
        workMs: 50,
        complete: true,
        called: false,
        costUsd: 0,
      },
      {
        part: 'code',
        wallMs: 600,
        workMs: 600,
        complete: true,
        called: true,
        costUsd: 1.5,
      },
      {
        part: 'verify',
        wallMs: 400,
        workMs: 400,
        complete: true,
        called: false,
        costUsd: 0,
      },
      {
        part: 'review',
        wallMs: 500,
        workMs: 900,
        complete: false,
        called: true,
        costUsd: null,
      },
    ])
  })
})

describe('runLanes and runWaits on partial records', () => {
  it('leaves a lane with no measured time unknown, and takes the spec lane once', () => {
    const report = {
      stageTimings: [
        {
          stage: 'preflight',
          elapsedMs: null,
          wallElapsedMs: null,
          complete: false,
        },
        { stage: 'spec', elapsedMs: 300, wallElapsedMs: 300, complete: true },
        {
          stage: 'spec-review',
          elapsedMs: 400,
          wallElapsedMs: 200,
          complete: true,
        },
      ],
      stageUsage: [],
      specWallMs: 420,
    } as unknown as LoopReport
    const lanes = runLanes(report)
    assert.equal(lanes[0]?.part, 'prepare')
    assert.equal(lanes[0]?.wallMs, null)
    assert.equal(lanes[0]?.workMs, null)
    assert.equal(lanes[1]?.part, 'spec')
    assert.equal(lanes[1]?.wallMs, 420)
  })

  it('keeps a known wait on a person when another part is unknown', () => {
    const r = run('a', now - DAY, { humanWaitMs: 3_600_000 })
    const report = {
      ...r.report,
      waits: [{ executionSlotWaitMs: null }],
    } as unknown as LoopReport
    assert.deepEqual(runWaits(report), [
      { part: 'human-wait', ms: 3_600_000 },
      { part: 'slot-wait', ms: null },
      { part: 'between', ms: null },
    ])
  })
})
