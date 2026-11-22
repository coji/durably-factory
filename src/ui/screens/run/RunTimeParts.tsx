import type { RunLane, TimePart } from '../../../engine/flow'
import { RUN_RETRO } from '../../glossary'
import type { RunDetailResponse } from '../../server'

export const WAITS = ['human-wait', 'slot-wait', 'between']

/** One row: this run's time and the average, as numbers and as a bar. */
export interface Row {
  part: string
  ms: number | null
  average: number | undefined
  lane?: RunLane
}

/**
 * The rows in pipeline order: the lanes the run entered, then the waits.
 * Once the run is over, the parts it never went through stay as rows with
 * a dash, so a skipped stage reads against the average too.
 */
export function rowsOf(
  data: RunDetailResponse,
  average: TimePart[] | null,
): Row[] {
  const avg = new Map((average ?? []).map((t) => [t.part, t.perTaskMs]))
  const over = data.time !== null
  const rows: Row[] = data.lanes.map((lane) => ({
    part: lane.part,
    ms: lane.wallMs,
    average: avg.get(lane.part),
    lane,
  }))
  const waits = new Map((data.time ?? []).map((t) => [t.part, t.ms]))
  for (const t of average ?? [])
    if (over && !WAITS.includes(t.part) && !rows.some((r) => r.part === t.part))
      rows.push({ part: t.part, ms: null, average: t.perTaskMs })
  const order = (p: string) =>
    (average ?? []).findIndex((t) => t.part === p) +
    (WAITS.includes(p) ? 1000 : 0)
  rows.sort((x, y) => {
    const a = data.lanes.findIndex((l) => l.part === x.part)
    const b = data.lanes.findIndex((l) => l.part === y.part)
    return a >= 0 && b >= 0 ? a - b : order(x.part) - order(y.part)
  })
  for (const part of WAITS) {
    const ms = waits.get(part) ?? null
    if (ms !== null || (over && avg.has(part)))
      rows.push({ part, ms, average: avg.get(part) })
  }
  return rows
}

/** The bar for this run and a dark tick for the average, on one scale. */
export function Bar({ row, max }: { row: Row; max: number }) {
  const wait = WAITS.includes(row.part)
  return (
    <div className="relative h-4">
      {row.ms ? (
        <div
          aria-hidden
          className={`absolute inset-y-0.5 left-0 rounded-xs ${wait ? 'bar-hatch-wait' : 'bg-chart-1'}`}
          style={{ width: `${(row.ms / max) * 100}%` }}
        />
      ) : null}
      {row.average !== undefined ? (
        <div
          aria-hidden
          className="bg-fg absolute inset-y-0 w-0.5 -translate-x-1/2"
          style={{ left: `${(row.average / max) * 100}%` }}
        />
      ) : null}
    </div>
  )
}

export function Legend() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden
          className="bg-chart-1 inline-block h-2.5 w-4 rounded-xs"
        />
        {RUN_RETRO.thisRun}
      </span>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden className="bg-fg inline-block h-3 w-0.5" />
        {RUN_RETRO.average}
      </span>
    </span>
  )
}
