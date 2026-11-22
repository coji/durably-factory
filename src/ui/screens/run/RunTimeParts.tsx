import type { RunLane, TimePart } from '../../../engine/flow'
import { partRank } from '../../../engine/lanes'
import { RUN_RETRO } from '../../glossary'
import type { RunDetailResponse } from '../../server'

export const WAITS = ['human-wait', 'slot-wait', 'between']

/** One row: this run's time and the average, as numbers and as a bar. */
export interface Row {
  part: string
  /** This run's time; null when unknown, or when `skipped`. */
  ms: number | null
  average: number | undefined
  /** An ended run never went through this part; the average still shows. */
  skipped?: boolean
  lane?: RunLane
}

/**
 * The rows in pipeline order (`partRank`): the lanes the run entered, then
 * its waits. Once the run is over (`over`), the parts it never went through
 * stay as rows, so a skipped stage reads against the average too, and an
 * unknown wait says so; while it runs, only what it has so far.
 */
export function rowsOf(
  data: Pick<RunDetailResponse, 'lanes' | 'waits'>,
  average: TimePart[] | null,
  over: boolean,
): Row[] {
  const avg = new Map((average ?? []).map((t) => [t.part, t.perTaskMs]))
  const rows: Row[] = data.lanes.map((lane) => ({
    part: lane.part,
    ms: lane.wallMs,
    average: avg.get(lane.part),
    lane,
  }))
  for (const w of data.waits)
    if (w.ms !== null || over)
      rows.push({ part: w.part, ms: w.ms, average: avg.get(w.part) })
  if (over)
    for (const t of average ?? [])
      if (!rows.some((r) => r.part === t.part))
        rows.push({
          part: t.part,
          ms: null,
          average: t.perTaskMs,
          skipped: true,
        })
  return rows.sort((x, y) => partRank(x.part) - partRank(y.part))
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
