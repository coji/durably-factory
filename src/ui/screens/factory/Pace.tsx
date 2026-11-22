import { formatCount, formatDuration } from '../../../engine/format'
import { Icon } from '../../components/Icon'
import { CHART, FACTORY } from '../../glossary'
import type { FlowResponse } from '../../server'

/**
 * A headline figure: the digits large, the units (件, 時間, 分) at body
 * size beside them, so "1時間37分" reads as two numbers, not one word.
 */
function Figure({ text }: { text: string }) {
  return (
    <p className="font-figure mt-1 text-3xl leading-none font-bold whitespace-nowrap tabular-nums">
      {text.split(/(\d[\d.,]*)/).map((part, i) =>
        /^\d/.test(part) ? (
          <span key={i}>{part}</span>
        ) : part ? (
          <span key={i} className="mx-0.5 text-base font-medium">
            {part}
          </span>
        ) : null,
      )}
    </p>
  )
}

/** Within a tenth of last week, a lead time reads as the same. */
const SAME = 0.1

/**
 * Which way a number moved against last week, in words and an arrow, on a
 * light chip so the colour of a worse week reads on the blue block.
 */
function Change({
  better,
  up,
  text,
}: {
  better: boolean | null
  /** The number went up; the arrow follows the number, the colour the verdict. */
  up: boolean
  text: string
}) {
  const tone =
    better === null ? 'text-fg-2' : better ? 'text-brand' : 'text-failed'
  return (
    <span
      className={`bg-raised mt-2 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums ${tone}`}
    >
      {better === null ? null : <Icon name={up ? 'up' : 'down'} />}
      {text}
    </span>
  )
}

function deliveredChange(change: number, previous: number | null) {
  if (change === 0)
    return {
      better: null,
      up: false,
      text: previous === 0 ? FACTORY.bothZero : FACTORY.sameAsLastWeek,
    }
  return change > 0
    ? {
        better: true,
        up: true,
        text: FACTORY.moreThanLastWeek(formatCount(change)),
      }
    : {
        better: false,
        up: false,
        text: FACTORY.fewerThanLastWeek(formatCount(-change)),
      }
}

function leadTimeChange(ratio: number) {
  if (Math.abs(ratio - 1) < SAME)
    return { better: null, up: false, text: FACTORY.sameAsLastWeek }
  return ratio > 1
    ? {
        better: false,
        up: true,
        text: FACTORY.slowerThanLastWeek(ratio.toFixed(1)),
      }
    : {
        better: true,
        up: false,
        text: FACTORY.fasterThanLastWeek(ratio.toFixed(1)),
      }
}

/** The pace of the factory: this week against the weeks before. */
export function Pace({
  flow,
  decision,
  stopped,
  tasksHref,
}: {
  flow: FlowResponse | null
  decision: number
  stopped: number
  tasksHref: string
}) {
  const pace = flow?.pace
  const avg = pace?.averageDelivered
  return (
    <section
      aria-labelledby="pace-title"
      className="bg-highlight text-on-highlight span-2 flex flex-col gap-5 rounded-lg px-6 pt-5 pb-6"
    >
      <h2 id="pace-title" className="sr-only">
        {CHART.pace}
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <p className="text-on-highlight-2 text-sm">{FACTORY.delivered}</p>
          <Figure
            text={
              pace
                ? `${formatCount(pace.delivered)}${FACTORY.deliveredUnit}`
                : '–'
            }
          />
          {pace?.deliveredChange != null ? (
            <Change
              {...deliveredChange(pace.deliveredChange, pace.previousDelivered)}
            />
          ) : null}
          <p className="text-on-highlight-2 mt-2 text-xs tabular-nums">
            {pace?.previousDelivered != null
              ? FACTORY.vsLastWeek(formatCount(pace.previousDelivered))
              : null}
            {avg != null ? (
              <>
                <br />
                {FACTORY.vsAverage(avg.toFixed(1))}
              </>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-on-highlight-2 text-sm">{FACTORY.leadTime}</p>
          <Figure
            text={
              pace?.leadTimeMedianMs != null
                ? formatDuration(pace.leadTimeMedianMs)
                : '–'
            }
          />
          {pace?.leadTimeRatio != null ? (
            <Change {...leadTimeChange(pace.leadTimeRatio)} />
          ) : null}
          <p className="text-on-highlight-2 mt-2 text-xs tabular-nums">
            {pace && pace.leadTimeMedianMs == null
              ? FACTORY.noDeliveredYet
              : FACTORY.leadTimeNote}
            {pace?.previousLeadTimeMedianMs != null ? (
              <>
                <br />
                {FACTORY.vsLastWeekTime(
                  formatDuration(pace.previousLeadTimeMedianMs),
                )}
              </>
            ) : null}
          </p>
        </div>
      </div>
      <a
        href={tasksHref}
        className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-(--highlight-inset) px-4 py-3 whitespace-nowrap no-underline hover:bg-(--highlight-inset-hover)"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-sm">{FACTORY.decision}</span>
          <span className="font-figure text-2xl font-bold tabular-nums">
            {formatCount(decision)}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-sm">{FACTORY.stopped}</span>
          <span className="font-figure text-2xl font-bold tabular-nums">
            {formatCount(stopped)}
          </span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs">
          {FACTORY.openList}
          <Icon name="right" />
        </span>
      </a>
    </section>
  )
}
