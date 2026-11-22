/**
 * The control chart's statistics, with no Node APIs, so the page and its
 * design fixtures can use them as the engine does.
 */

/**
 * Limits of an individuals (X) and moving range chart over the delivered
 * tasks' lead times in the order they finished: the mean, and the mean
 * plus 2.66 times the mean moving range. Null with fewer than two tasks.
 */
export interface ControlLimits {
  n: number
  meanMs: number
  upperMs: number
  /** Zero when the formula falls below it; a lead time is never negative. */
  lowerMs: number
  /** Delivered tasks above `upperMs`, by id. */
  above: string[]
  /**
   * The moving ranges, |x(i) - x(i-1)|, each by the later task's id: the
   * Rs chart under the X chart. One fewer than the values.
   */
  ranges: { id: string; ms: number }[]
  /** The mean moving range: the Rs chart's centre line. */
  rangeMeanMs: number
  /** 3.267 times the mean moving range: the Rs chart's upper limit. */
  rangeUpperMs: number
  /**
   * Stretches of `RUN_LENGTH` or more values in a row on one side of the
   * mean (JIS Z 9020-2 rule 2): the level moved, even with every value
   * inside the limits. Each by the ids of its first and last value.
   */
  runs: ControlRun[]
}

/** A run of values on one side of the mean, as the chart marks it. */
export interface ControlRun {
  side: 'above' | 'below'
  fromId: string
  toId: string
  length: number
}

/** Values in a row on one side of the mean that make a run. */
export const RUN_LENGTH = 9

function runsOf(values: { id: string; ms: number }[], mean: number) {
  const runs: ControlRun[] = []
  let start = 0
  const sideOf = (ms: number) =>
    ms > mean ? 'above' : ms < mean ? 'below' : null
  for (let i = 1; i <= values.length; i++) {
    const a = values[start]
    const b = values[i]
    const side = a ? sideOf(a.ms) : null
    if (b && side !== null && sideOf(b.ms) === side) continue
    const length = i - start
    const last = values[i - 1]
    if (a && last && side !== null && length >= RUN_LENGTH)
      runs.push({ side, fromId: a.id, toId: last.id, length })
    start = i
  }
  return runs
}

/** A week with tasks above the upper limit, for a note on the chart. */
export interface AboveWeek {
  week: string
  tasks: number
}

/** X-mR limits over `values` in their order; null under two values. */
export function controlLimits(
  values: { id: string; ms: number }[],
): ControlLimits | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v.ms, 0) / values.length
  const ranges = values.slice(1).map((v, i) => ({
    id: v.id,
    ms: Math.abs(v.ms - (values[i]?.ms ?? v.ms)),
  }))
  const mr = ranges.reduce((s, r) => s + r.ms, 0) / ranges.length
  const upper = mean + 2.66 * mr
  return {
    n: values.length,
    meanMs: mean,
    upperMs: upper,
    lowerMs: Math.max(0, mean - 2.66 * mr),
    above: values.filter((v) => v.ms > upper).map((v) => v.id),
    ranges,
    rangeMeanMs: mr,
    rangeUpperMs: 3.267 * mr,
    runs: runsOf(values, mean),
  }
}
