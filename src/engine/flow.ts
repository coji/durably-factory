/**
 * The factory's flow over a window of finished tasks, read the way a
 * production line is read (The Goal): how many tasks it delivered each
 * week, how long each took from trigger to its end, where that time went,
 * and why the tasks that did not ship stopped.
 *
 * A task is a first run and its repair runs, as `groupTasks` groups them;
 * its time and cost add up all its runs, as the trend does, so the gaps
 * between runs never count. Throughput counts the tasks whose newest run was
 * approved and delivered: a merge happens outside the factory and is not
 * recorded. Unknown values are left out of a statistic and counted in
 * `unknown`, never taken for 0.
 */
import {
  DAY_MS,
  finishedTasks,
  localDate,
  mondayOf,
  stat,
  TREND_DAYS,
  type Stat,
  type TrendRun,
} from './compare.js'
import {
  controlLimits,
  RUN_LENGTH,
  type AboveWeek,
  type ControlLimits,
} from './control.js'
import { formatters } from './format.js'
import { FLOW_LANES, laneOf, partRank, type FlowLane } from './lanes.js'

export { FLOW_LANES, laneOf, partRank, type FlowLane } from './lanes.js'
import { STAGE_ORDER, type LoopReport } from './report.js'
import { sumKnown } from './status.js'

export { controlLimits, type AboveWeek, type ControlLimits }

/** A run the flow reads, with the names the page shows for its task. */
export interface FlowRun extends TrendRun {
  /** The task's name, from the run's stored input. */
  name: string
  /** The repository's short name. */
  repo: string
}

/**
 * How a task left the factory: delivered (approved and handed over),
 * rejected by a person, or stopped short of a decision.
 */
export type FlowOutcome = 'delivered' | 'rejected' | 'stopped'

export interface FlowTask {
  /** The first run's id: the task's id. */
  id: string
  /** The newest run, where its end and its outcome come from. */
  latestRunId: string
  name: string
  repo: string
  finishedAt: string
  /** The Monday of the week it finished, local time, as `YYYY-MM-DD`. */
  week: string
  outcome: FlowOutcome
  /**
   * Why a stopped task stopped: the newest run's failure kind, else its
   * conclusion, else its status. Null for a delivered or rejected one.
   */
  stopKind: string | null
  runs: number
  leadTimeMs: number | null
  /** Measured work of every stage, parallel calls counted each. */
  workMs: number | null
  /** Waiting on a person: approval and spec decisions. */
  humanWaitMs: number | null
  /** After a decision, waiting for a worker to pick the run up again. */
  slotWaitMs: number | null
  costUsd: number | null
}

export interface FlowWeek {
  /** The week's Monday, local time, as `YYYY-MM-DD`. */
  week: string
  finished: number
  delivered: number
  rejected: number
  stopped: number
  /** Delivered tasks with no repair run. */
  firstPass: number
  /** Over the delivered tasks only. */
  leadTimeMs: Stat
  /** Over every finished task: what the week spent. */
  costUsd: number | null
  costUnknown: number
  /** Tokens by provider over every finished task of the week. */
  providers: ProviderUsage[]
}

export interface ProviderUsage {
  /** Null when the run did not record one. */
  provider: string | null
  invocations: number
  /** Null when any counted call reported none. */
  totalTokens: number | null
  costUsd: number | null
}

export interface StopReason {
  kind: string
  tasks: number
  /** The newest finished first. */
  taskIds: string[]
}

/**
 * Where the window's time went, each part summed over every task with a
 * known lead time: a lane's stage wall times (parallel calls counted once), the
 * waits on a person and for a worker, and the rest of the lead time, spent
 * between steps.
 */
export interface TimePart {
  /** A lane (`FLOW_LANES`), `human-wait`, `slot-wait` or `between`. */
  part: string
  totalMs: number
  /** Tasks the part had any time in. */
  tasks: number
  /** `totalMs` over every counted task: the part's share of one task. */
  perTaskMs: number
}

export interface StageRework {
  stage: string
  /** Tasks that entered the stage. */
  tasks: number
  /** Of those, tasks that entered it more than once. */
  reworked: number
  /** Entries per task that entered it. */
  visits: Stat
}

export interface FlowPace {
  /** Delivered in the current week so far. */
  delivered: number
  /** Delivered in the week before. */
  previousDelivered: number | null
  /** Mean of the four weeks before the current one, those in the window. */
  averageDelivered: number | null
  leadTimeMedianMs: number | null
  previousLeadTimeMedianMs: number | null
  /** `delivered - previousDelivered`; null without a week before. */
  deliveredChange: number | null
  /** This week's median over last week's; null without both. */
  leadTimeRatio: number | null
}

/** The lane that took the most of a task's time: the constraint to work on. */
export interface FlowConstraint {
  lane: FlowLane
  perTaskMs: number
  /** Of the whole lead time, waits included. */
  share: number
}

export interface Flow {
  days: number
  includeFake: boolean
  /** Tasks in the window left out as fake. */
  fakeExcluded: number
  /** Mondays from the window's start to the current week, oldest first. */
  weeks: FlowWeek[]
  pace: FlowPace
  /** Finished tasks, oldest finish first: the control chart's order. */
  tasks: FlowTask[]
  control: ControlLimits | null
  /** Weeks with two or more delivered tasks above the limit, oldest first. */
  aboveWeeks: AboveWeek[]
  /** Most tasks first. */
  stops: StopReason[]
  /** Pipeline order, then the waits, then the time between steps. */
  time: TimePart[]
  /** Counted tasks: those with a known lead time. */
  timeTasks: number
  /** The lane in `time` with the most time; null without any. */
  constraint: FlowConstraint | null
  rework: StageRework[]
  providers: ProviderUsage[]
}

type Task = ReturnType<typeof finishedTasks<FlowRun>>[number]

const delivered = (r: LoopReport) => r.summary.success && r.delivery !== null

function outcomeOf(latest: LoopReport): FlowOutcome {
  if (delivered(latest)) return 'delivered'
  if (latest.summary.conclusion === 'rejected') return 'rejected'
  return 'stopped'
}

function stopKindOf(run: FlowRun): string {
  return run.report.failure?.kind ?? run.report.summary.conclusion ?? run.status
}

function slotWaitOf(r: LoopReport): number | null {
  return sumKnown(r.waits.map((w) => w.executionSlotWaitMs))
}

function flowTask(t: Task): FlowTask {
  const sum = (pick: (r: FlowRun) => number | null) =>
    sumKnown(t.runs.map(pick))
  const outcome = outcomeOf(t.latest.report)
  return {
    id: t.root.id,
    latestRunId: t.latest.id,
    name: t.root.name,
    repo: t.root.repo,
    finishedAt: new Date(t.at).toISOString(),
    week: localDate(mondayOf(t.at)),
    outcome,
    stopKind: outcome === 'stopped' ? stopKindOf(t.latest) : null,
    runs: t.runs.length,
    leadTimeMs: sum((r) => r.report.summary.leadTimeMs),
    workMs: sum((r) => r.report.summary.workMs),
    humanWaitMs: sum((r) => r.report.summary.humanWaitMs),
    slotWaitMs: sum((r) => slotWaitOf(r.report)),
    costUsd: sum((r) => r.report.summary.costUsd),
  }
}

function providerUsage(runs: FlowRun[]): ProviderUsage[] {
  const by = new Map<string, ProviderUsage>()
  for (const run of runs)
    for (const role of run.report.roleUsage) {
      if (role.invocations === 0) continue
      const key = role.provider ?? ''
      const now = by.get(key) ?? {
        provider: role.provider,
        invocations: 0,
        totalTokens: 0,
        costUsd: 0,
      }
      now.invocations += role.invocations
      now.totalTokens =
        now.totalTokens === null || role.totalTokens === null
          ? null
          : now.totalTokens + role.totalTokens
      now.costUsd =
        now.costUsd === null || role.costUsd === null
          ? null
          : now.costUsd + role.costUsd
      by.set(key, now)
    }
  return [...by.values()].sort(
    (x, y) =>
      y.invocations - x.invocations ||
      (x.provider ?? '').localeCompare(y.provider ?? ''),
  )
}

function weekOf(
  week: string,
  tasks: Task[],
  rows: Map<string, FlowTask>,
): FlowWeek {
  const flows = tasks.flatMap((t) => rows.get(t.root.id) ?? [])
  const done = flows.filter((f) => f.outcome === 'delivered')
  const costs = flows.map((f) => f.costUsd)
  const known = costs.filter((c): c is number => c !== null)
  return {
    week,
    finished: flows.length,
    delivered: done.length,
    rejected: flows.filter((f) => f.outcome === 'rejected').length,
    stopped: flows.filter((f) => f.outcome === 'stopped').length,
    firstPass: done.filter((f) => f.runs === 1).length,
    leadTimeMs: stat(done.map((f) => f.leadTimeMs)),
    costUsd: known.length > 0 ? known.reduce((s, c) => s + c, 0) : null,
    costUnknown: costs.length - known.length,
    providers: providerUsage(tasks.flatMap((t) => t.runs)),
  }
}

/** One part of a lead time: a lane's wall time, a wait, or the rest. */
export interface RunTimePart {
  part: string
  ms: number
}

/**
 * Where one run's lead time went: each lane's stage wall times (parallel
 * calls once), the waits on a person and for a worker, and the rest, between
 * steps. Null while the lead time or a wait is unknown. The parts never
 * add up to more than the lead time: what the stages claim past it is
 * left out of `between`, which is never negative.
 */
export function runTimeParts(report: LoopReport): RunTimePart[] | null {
  const lead = report.summary.leadTimeMs
  const human = report.summary.humanWaitMs
  const slot = slotWaitOf(report)
  if (lead === null || human === null || slot === null) return null
  const parts = new Map<string, number>()
  for (const s of report.stageTimings) {
    const ms = s.wallElapsedMs ?? s.elapsedMs
    if (ms === null || ms === undefined || ms <= 0) continue
    const lane = laneOf(s.stage)
    parts.set(lane, (parts.get(lane) ?? 0) + ms)
  }
  const used = [...parts.values()].reduce((sum, ms) => sum + ms, 0)
  const out = [...parts].map(([part, ms]) => ({ part, ms }))
  if (human > 0) out.push({ part: 'human-wait', ms: human })
  if (slot > 0) out.push({ part: 'slot-wait', ms: slot })
  const between = lead - used - human - slot
  if (between > 0) out.push({ part: 'between', ms: between })
  return out.sort((x, y) => partRank(x.part) - partRank(y.part))
}

/** One lane of one run: its stages' wall time, work, and cost together. */
export interface RunLane {
  part: FlowLane
  /**
   * The lane's clock time: the stages' wall times added up, the spec lane's
   * overlapping stages once (`specWallMs`). Null while no attempt in the
   * lane has a measured time, such as the first stage still running.
   */
  wallMs: number | null
  /** The stages' measured work; parallel calls each count. Null when unmeasured. */
  workMs: number | null
  /** False when an attempt in the lane has no measured time. */
  complete: boolean
  /** Whether any stage of the lane called a model. */
  called: boolean
  /** The calls' cost; null when one of them has no price. */
  costUsd: number | null
}

/**
 * A run's time and cost by lane, in pipeline order, for the lanes it
 * entered so far: the run page's one table of where the time and money
 * went. Known while the run is still going, unlike `runTimeParts`.
 */
export function runLanes(report: LoopReport): RunLane[] {
  const lanes = new Map<FlowLane, RunLane & { measured: boolean }>()
  const laneFor = (stage: string) => {
    const part = laneOf(stage)
    let lane = lanes.get(part)
    if (!lane) {
      lane = {
        part,
        wallMs: 0,
        workMs: 0,
        complete: true,
        called: false,
        costUsd: 0,
        measured: false,
      }
      lanes.set(part, lane)
    }
    return lane
  }
  for (const s of report.stageTimings) {
    // A stage that took no time, like a stop, adds an empty row and nothing else.
    const took = (s.wallElapsedMs ?? 0) > 0 || (s.elapsedMs ?? 0) > 0
    if (!took && s.complete) continue
    const lane = laneFor(s.stage)
    const wall = s.wallElapsedMs ?? s.elapsedMs
    if (wall != null) {
      lane.wallMs = (lane.wallMs ?? 0) + wall
      lane.measured = true
    }
    lane.workMs =
      lane.workMs === null || s.elapsedMs == null
        ? null
        : lane.workMs + s.elapsedMs
    if (!s.complete) lane.complete = false
  }
  for (const u of report.stageUsage) {
    const lane = laneFor(u.stage)
    lane.called = true
    lane.costUsd =
      lane.costUsd === null || u.costUsd === null
        ? null
        : lane.costUsd + u.costUsd
  }
  const spec = lanes.get('spec')
  if (spec && report.specWallMs != null) {
    spec.wallMs = report.specWallMs
    spec.measured = true
  }
  return [...lanes.values()]
    .map(({ measured, ...lane }) => ({
      ...lane,
      wallMs: measured ? lane.wallMs : null,
    }))
    .sort((x, y) => partRank(x.part) - partRank(y.part))
}

/** One wait of a run, or the time between its steps; null when not known. */
export interface RunWait {
  part: 'human-wait' | 'slot-wait' | 'between'
  ms: number | null
}

/**
 * Where a run's lead time went outside its lanes: the wait on a person and
 * for a worker, each as soon as it is known on its own, and the time
 * between steps once the lead time and both waits are. A wait that is 0
 * is left out.
 */
export function runWaits(report: LoopReport): RunWait[] {
  const human = report.summary.humanWaitMs
  const slot = slotWaitOf(report)
  const parts = runTimeParts(report)
  const between = parts?.find((p) => p.part === 'between')?.ms ?? null
  const out: RunWait[] = []
  if (human !== 0) out.push({ part: 'human-wait', ms: human })
  if (slot !== 0) out.push({ part: 'slot-wait', ms: slot })
  if (parts === null || between !== null)
    out.push({ part: 'between', ms: between })
  return out
}

function timeParts(tasks: Task[]) {
  const totals = new Map<string, { totalMs: number; tasks: number }>()
  let counted = 0
  for (const t of tasks) {
    const runs = t.runs.map((r) => runTimeParts(r.report))
    if (runs.some((r) => r === null)) continue
    counted++
    const mine = new Map<string, number>()
    for (const run of runs)
      for (const { part, ms } of run ?? [])
        mine.set(part, (mine.get(part) ?? 0) + ms)
    for (const [part, ms] of mine) {
      const now = totals.get(part) ?? { totalMs: 0, tasks: 0 }
      totals.set(part, { totalMs: now.totalMs + ms, tasks: now.tasks + 1 })
    }
  }
  const time = [...totals]
    .map(([part, v]) => ({
      part,
      totalMs: v.totalMs,
      tasks: v.tasks,
      perTaskMs: counted > 0 ? v.totalMs / counted : 0,
    }))
    .sort(
      (x, y) =>
        partRank(x.part) - partRank(y.part) || x.part.localeCompare(y.part),
    )
  return { time, counted }
}

function reworkOf(tasks: Task[]): StageRework[] {
  const by = new Map<string, number[]>()
  for (const t of tasks) {
    const visits = new Map<string, number>()
    for (const run of t.runs)
      for (const v of run.report.stageVisits)
        visits.set(v.stage, (visits.get(v.stage) ?? 0) + v.visits)
    for (const [stage, n] of visits)
      if (n > 0) by.set(stage, [...(by.get(stage) ?? []), n])
  }
  const rank = (s: string) => {
    const i = STAGE_ORDER.indexOf(s)
    return i < 0 ? STAGE_ORDER.length : i
  }
  return [...by]
    .map(([stage, list]) => ({
      stage,
      tasks: list.length,
      reworked: list.filter((n) => n > 1).length,
      visits: stat(list),
    }))
    .sort((x, y) => rank(x.stage) - rank(y.stage))
}

function mean(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((s, v) => s + v, 0) / values.length
    : null
}

/**
 * The flow of the tasks whose newest run finished in the `days` before
 * `now`, fake tasks left out unless `includeFake`. Pass every run of those
 * tasks (`trendRunIds` names them), each with its report and names.
 */
export function flowOf(
  runs: FlowRun[],
  options: { now: number; days?: number; includeFake?: boolean },
): Flow {
  const days = options.days ?? TREND_DAYS
  const includeFake = options.includeFake ?? false
  const done = finishedTasks(runs, { now: options.now, days }).sort(
    (x, y) => x.at - y.at,
  )
  const counted = done.filter((t) => includeFake || !t.root.report.fake)
  const rows = new Map(counted.map((t) => [t.root.id, flowTask(t)]))
  const tasks = counted.flatMap((t) => rows.get(t.root.id) ?? [])

  const weekKeys: string[] = []
  for (
    const d = mondayOf(options.now - (days - 1) * DAY_MS);
    d.getTime() <= options.now;
    d.setDate(d.getDate() + 7)
  )
    weekKeys.push(localDate(d))
  const weeks = weekKeys.map((week) =>
    weekOf(
      week,
      counted.filter((t) => localDate(mondayOf(t.at)) === week),
      rows,
    ),
  )

  const current = weeks.at(-1)
  const previous = weeks.at(-2)
  const before = weeks.slice(0, -1).slice(-4)
  const pace: FlowPace = {
    delivered: current?.delivered ?? 0,
    previousDelivered: previous?.delivered ?? null,
    averageDelivered: mean(before.map((w) => w.delivered)),
    leadTimeMedianMs: current?.leadTimeMs.median ?? null,
    previousLeadTimeMedianMs: previous?.leadTimeMs.median ?? null,
    deliveredChange: previous
      ? (current?.delivered ?? 0) - previous.delivered
      : null,
    leadTimeRatio:
      current?.leadTimeMs.median != null && previous?.leadTimeMs.median
        ? current.leadTimeMs.median / previous.leadTimeMs.median
        : null,
  }

  const control = controlLimits(
    tasks.flatMap((t) =>
      t.outcome === 'delivered' && t.leadTimeMs !== null
        ? [{ id: t.id, ms: t.leadTimeMs }]
        : [],
    ),
  )

  const aboveSet = new Set(control?.above ?? [])
  const aboveCount = new Map<string, number>()
  for (const t of tasks)
    if (aboveSet.has(t.id))
      aboveCount.set(t.week, (aboveCount.get(t.week) ?? 0) + 1)
  const aboveWeeks = weekKeys.flatMap((week) => {
    const n = aboveCount.get(week) ?? 0
    return n >= 2 ? [{ week, tasks: n }] : []
  })

  const stopsBy = new Map<string, string[]>()
  for (const t of [...tasks].reverse())
    if (t.stopKind !== null)
      stopsBy.set(t.stopKind, [...(stopsBy.get(t.stopKind) ?? []), t.id])
  const stops = [...stopsBy]
    .map(([kind, taskIds]) => ({ kind, tasks: taskIds.length, taskIds }))
    .sort((x, y) => y.tasks - x.tasks || x.kind.localeCompare(y.kind))

  const { time, counted: timeTasks } = timeParts(counted)
  const whole = time.reduce((sum, t) => sum + t.perTaskMs, 0)
  const top = time
    .filter((t): t is TimePart & { part: FlowLane } =>
      (FLOW_LANES as readonly string[]).includes(t.part),
    )
    .reduce<(TimePart & { part: FlowLane }) | null>(
      (a, t) => (a && a.perTaskMs >= t.perTaskMs ? a : t),
      null,
    )
  const constraint: FlowConstraint | null =
    top && whole > 0
      ? {
          lane: top.part,
          perTaskMs: top.perTaskMs,
          share: top.perTaskMs / whole,
        }
      : null

  return {
    days,
    includeFake,
    fakeExcluded: done.length - counted.length,
    weeks,
    pace,
    tasks,
    control,
    aboveWeeks,
    stops,
    time,
    timeTasks,
    constraint,
    rework: reworkOf(counted),
    providers: providerUsage(counted.flatMap((t) => t.runs)),
  }
}

const {
  formatCost: costEn,
  formatCount: countEn,
  formatDuration: durationEn,
  formatPercent: percentEn,
  formatTokens: tokensEn,
  formatWeek: weekEn,
} = formatters('en')

/**
 * The flow as Markdown, the numbers the web UI's factory and review pages
 * draw: `compare --flow`.
 */
export function flowToMarkdown(f: Flow): string {
  const lines: string[] = ['# Factory flow', '']
  lines.push(
    `Tasks whose newest run finished in the last ${f.days} days. Throughput counts tasks approved and delivered; a merge is not recorded. ${f.includeFake ? 'Fake-provider tasks included.' : `Fake-provider tasks left out: ${f.fakeExcluded}.`}`,
    '',
  )
  const p = f.pace
  lines.push('## This week', '')
  lines.push(
    `- delivered: ${countEn(p.delivered)} (last week ${countEn(p.previousDelivered)}, mean of the 4 weeks before ${p.averageDelivered === null ? 'unknown' : p.averageDelivered.toFixed(1)})`,
    `- lead time median: ${durationEn(p.leadTimeMedianMs)} (last week ${durationEn(p.previousLeadTimeMedianMs)}${p.leadTimeRatio === null ? '' : `, ${p.leadTimeRatio.toFixed(2)}x`})`,
  )
  if (f.constraint)
    lines.push(
      `- constraint: ${f.constraint.lane}, ${durationEn(f.constraint.perTaskMs)} per task (${percentEn(f.constraint.share)} of the lead time)`,
    )
  lines.push('', '## Weeks', '')
  lines.push(
    '| week | finished | delivered | rejected | stopped | first pass | lead time median | cost | tokens by provider |',
    '|---|---|---|---|---|---|---|---|---|',
  )
  for (const w of f.weeks)
    lines.push(
      `| ${weekEn(w.week)} | ${w.finished} | ${w.delivered} | ${w.rejected} | ${w.stopped} | ${w.firstPass} | ${durationEn(w.leadTimeMs.median)} | ${costEn(w.costUsd)}${w.costUnknown > 0 ? ` (${w.costUnknown} unknown)` : ''} | ${w.providers.map((v) => `${v.provider ?? 'unknown'} ${tokensEn(v.totalTokens)}`).join(', ') || '-'} |`,
    )
  lines.push('', '## Lead time control chart', '')
  if (f.control) {
    const c = f.control
    lines.push(
      `- delivered tasks: ${c.n}; mean ${durationEn(c.meanMs)}; upper limit ${durationEn(c.upperMs)} (mean + 2.66 x mean moving range)`,
      `- moving range: mean ${durationEn(c.rangeMeanMs)}; upper limit ${durationEn(c.rangeUpperMs)} (3.267 x mean); above it: ${c.ranges.filter((r) => r.ms > c.rangeUpperMs).length}`,
      `- runs of ${RUN_LENGTH} or more on one side of the mean: ${c.runs.length === 0 ? 'none' : c.runs.map((r) => `${r.length} ${r.side}`).join(', ')}`,
      `- above the upper limit: ${c.above.length}${f.aboveWeeks.length > 0 ? `; clustered in ${f.aboveWeeks.map((a) => `${weekEn(a.week)} (${a.tasks})`).join(', ')}` : ''}`,
    )
    const byId = new Map(f.tasks.map((t) => [t.id, t]))
    for (const id of c.above) {
      const t = byId.get(id)
      if (t)
        lines.push(
          `  - ${t.name} (${t.latestRunId}): ${durationEn(t.leadTimeMs)}`,
        )
    }
  } else lines.push('Fewer than two delivered tasks.')
  lines.push('', '## Why tasks stopped', '')
  if (f.stops.length === 0) lines.push('No task stopped.')
  else {
    const total = f.stops.reduce((s, r) => s + r.tasks, 0)
    let run = 0
    lines.push('| reason | tasks | cumulative |', '|---|---|---|')
    for (const s of f.stops) {
      run += s.tasks
      lines.push(`| ${s.kind} | ${s.tasks} | ${percentEn(run / total)} |`)
    }
  }
  lines.push(
    '',
    `## Where a task's time goes (mean of ${f.timeTasks} tasks)`,
    '',
  )
  const whole = f.time.reduce((s, t) => s + t.perTaskMs, 0)
  lines.push('| part | per task | share |', '|---|---|---|')
  for (const t of f.time)
    lines.push(
      `| ${t.part} | ${durationEn(t.perTaskMs)} | ${percentEn(whole > 0 ? t.perTaskMs / whole : null)} |`,
    )
  lines.push('', '## Rework', '')
  lines.push('| stage | tasks | entered again |', '|---|---|---|')
  for (const r of f.rework)
    lines.push(`| ${r.stage} | ${r.tasks} | ${r.reworked} |`)
  lines.push('')
  return lines.join('\n')
}
