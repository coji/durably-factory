import type { Task } from '../../../engine/status'
import { LIST_HEAD } from '../../glossary'

export type TaskSort = 'newest' | 'leadTime' | 'cost'

const ORDER: TaskSort[] = ['newest', 'leadTime', 'cost']

/**
 * `tasks` in the order chosen: as the engine gave them (newest first), or
 * by the task's total lead time or cost, longest first, unknown last.
 */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  if (sort === 'newest') return tasks
  const key = (t: Task) =>
    sort === 'leadTime' ? t.total.leadTimeMs : t.total.costUsd
  return [...tasks].sort((x, y) => (key(y) ?? -1) - (key(x) ?? -1))
}

/** The order of a list, as a select beside its heading. */
export function SortSelect({
  sort,
  onSort,
}: {
  sort: TaskSort
  onSort: (sort: TaskSort) => void
}) {
  return (
    <label className="text-fg-2 inline-flex items-center gap-2 text-xs">
      {LIST_HEAD.sort}
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value as TaskSort)}
        className="border-line-strong bg-raised text-fg min-h-8 rounded-md border px-2 text-xs"
      >
        {ORDER.map((o) => (
          <option key={o} value={o}>
            {LIST_HEAD.order[o]}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * What the numbers at the end of each row are, over their columns. Only
 * where the columns are fixed; on a narrow screen each number says what it
 * is in its own words.
 */
export function MetaHead() {
  return (
    <div aria-hidden className="hidden justify-end px-4 pb-1 md:flex">
      <span className="task-meta text-fg-3 text-xs">
        <span>{LIST_HEAD.runs}</span>
        <span>{LIST_HEAD.leadTime}</span>
        <span>{LIST_HEAD.cost}</span>
        <span>{LIST_HEAD.ago}</span>
      </span>
    </div>
  )
}
