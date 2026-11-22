import type { FlowConstraint, TimePart } from '../../../engine/flow'
import {
  formatCount,
  formatDuration,
  formatPercent,
} from '../../../engine/format'
import { Card } from '../../components/Card'
import { FACTORY, LANE_NAME } from '../../glossary'
import type { FloorLane } from '../../server'

/**
 * The open tasks in each lane now, and under each lane the time a task
 * spends there on average over 30 days. The lane that takes the most of
 * that time is the constraint: it is tinted and named, whether or not a
 * task is in it now, since that is where faster work moves the flow.
 */
export function Floor({
  floor,
  time,
  constraint,
}: {
  floor: FloorLane[]
  /** The 30-day breakdown; null while it loads. */
  time: TimePart[] | null
  constraint: FlowConstraint | null
}) {
  const counts = floor.map((l) => l.running + l.waiting + l.queued)
  const total = counts.reduce((s, c) => s + c, 0)
  const perTask = new Map((time ?? []).map((t) => [t.part, t.perTaskMs]))
  return (
    <Card
      title={FACTORY.floor}
      kind={FACTORY.floorNote}
      className="span-4"
      foot={
        constraint
          ? FACTORY.floorConstraint(
              LANE_NAME[constraint.lane],
              formatPercent(constraint.share),
            )
          : null
      }
    >
      {total === 0 ? (
        <p className="text-fg-2 mb-2 text-sm">{FACTORY.floorEmpty}</p>
      ) : null}
      <ol className="floor-lanes border-line overflow-hidden rounded-md border">
        {floor.map((lane, i) => {
          const n = counts[i] ?? 0
          const hot = constraint?.lane === lane.lane
          const avg = perTask.get(lane.lane)
          const parts = [
            lane.running > 0
              ? FACTORY.floorRunning(formatCount(lane.running))
              : null,
            lane.waiting > 0
              ? FACTORY.floorWaiting(formatCount(lane.waiting))
              : null,
            lane.queued > 0
              ? FACTORY.floorQueued(formatCount(lane.queued))
              : null,
            lane.longestStepMs != null
              ? FACTORY.floorLongest(formatDuration(lane.longestStepMs))
              : null,
          ].filter((p): p is string => p !== null)
          return (
            <li
              key={lane.lane}
              className={`border-line flex min-h-32 flex-col border-l px-3 py-3 first:border-l-0 ${hot ? 'bg-limit-bg' : ''}`}
            >
              <span
                className={`text-sm ${hot ? 'text-limit-text font-semibold' : 'text-fg-2'}`}
              >
                {LANE_NAME[lane.lane]}
              </span>
              <span
                className={`font-figure mt-1 text-2xl leading-tight font-bold tabular-nums ${n === 0 ? 'text-fg-3' : lane.waiting > 0 ? 'text-waiting' : 'text-fg'}`}
              >
                {formatCount(n)}
              </span>
              <span className="text-fg-2 text-xs leading-5">
                {hot ? (
                  <span className="text-limit-text block font-semibold">
                    {FACTORY.floorHot}
                  </span>
                ) : null}
                {parts.map((p) => (
                  <span key={p} className="block tabular-nums">
                    {p}
                  </span>
                ))}
              </span>
              <span
                className={`border-line mt-auto border-t pt-2 text-xs tabular-nums ${hot ? 'text-limit-text font-semibold' : 'text-fg-2'}`}
              >
                {FACTORY.floorAverage}
                <span className="block text-sm">
                  {avg !== undefined ? formatDuration(avg) : '–'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
