/**
 * The factory's lanes and the order of a lead time's parts, free of Node,
 * so the server and the page sort and name them the same way.
 */

/**
 * The factory's lanes, in pipeline order: what the pages group stages by,
 * so the floor, the time breakdown and a run read in the same seven words.
 */
export const FLOW_LANES = [
  'prepare',
  'spec',
  'code',
  'verify',
  'review',
  'approve',
  'finish',
] as const
export type FlowLane = (typeof FLOW_LANES)[number]

const LANE_OF: Record<string, FlowLane> = {
  setup: 'prepare',
  preflight: 'prepare',
  baseline: 'prepare',
  spec: 'spec',
  'spec-review': 'spec',
  'spec-check': 'spec',
  'spec-wait': 'spec',
  triage: 'code',
  policy: 'code',
  code: 'code',
  verify: 'verify',
  recheck: 'verify',
  review: 'review',
  approve: 'approve',
  finish: 'finish',
  stop: 'finish',
}

/** The lane a stage belongs to; a stage this table does not know, `prepare`. */
export function laneOf(stage: string): FlowLane {
  return LANE_OF[stage] ?? 'prepare'
}

/** A lead time's parts in reading order: the lanes, then the waits. */
export const PART_ORDER: string[] = [
  ...FLOW_LANES,
  'human-wait',
  'slot-wait',
  'between',
]

export function partRank(part: string): number {
  const i = PART_ORDER.indexOf(part)
  return i < 0 ? PART_ORDER.length : i
}
