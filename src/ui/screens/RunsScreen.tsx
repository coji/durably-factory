import type { Act } from '../components/ActionNotice'
import type { BulkAct } from '../components/BulkNotice'
import { EmptyState } from '../components/EmptyState'
import { Section } from '../components/Layout'
import { RepoFilter } from '../components/RepoFilter'
import { LIST } from '../glossary'
import type { RunsResponse } from '../server'
import { DoneTasks } from './list/DoneTasks'
import { SECTION_ID } from './list/Overview'
import { StopTasks } from './list/StopTasks'
import { Tasks } from './list/Tasks'

/**
 * The tasks a person decides on, the ones a worker has, the ones that
 * stopped in the recent days, the older stops closed, and the finished
 * ones, in the order the engine gave them; each part counts its own. A first run and its repairs are one row.
 * Decisions and running tasks open, since they change and ask to be
 * watched; stopped ones stay closed, each with why on its row, unless
 * another run of the task is still open or asks for a person. Archived
 * tasks are among the finished ones. With runs of more than one
 * repository, a switch above narrows all of it to one.
 */
export function RunsScreen({
  data,
  act,
  actMany,
}: {
  data: RunsResponse
  act: Act
  /** Archive several stopped tasks at once; without it, none are chosen. */
  actMany?: BulkAct
}) {
  if (!data.exists)
    return (
      <EmptyState>
        {LIST.noDbBefore} <span className="font-code">{data.db}</span>{' '}
        {LIST.noDbAfter}
      </EmptyState>
    )
  const rows = new Map(data.runs.map((r) => [r.id, r]))
  const decision = data.tasks.filter((t) => t.attention === 'decision')
  // A stop past the recent days stays archivable in a closed part of its
  // own; only the recent ones are counted and shown in the stop colour.
  const oldIds = new Set(data.oldStops)
  const stops = data.tasks.filter((t) => t.attention === 'stop')
  const stop = stops.filter((t) => !oldIds.has(t.id))
  const oldStop = stops.filter((t) => oldIds.has(t.id))
  const active = data.tasks.filter((t) => t.attention === 'active')
  const done = data.tasks.filter((t) => t.attention === 'done')
  return (
    <>
      <RepoFilter page="runs" scope={data} />
      {decision.length === 0 && stop.length === 0 ? (
        <p className="text-fg-2 mb-6 text-sm">{LIST.attentionEmpty}</p>
      ) : null}
      {decision.length > 0 ? (
        <Section
          id={SECTION_ID.decision}
          title={LIST.decision}
          count={decision.length}
        >
          <Tasks tasks={decision} rows={rows} now={data.now} act={act} open />
        </Section>
      ) : null}
      <Section id={SECTION_ID.active} title={LIST.active} count={active.length}>
        <Tasks
          tasks={active}
          rows={rows}
          now={data.now}
          empty={LIST.activeEmpty}
          act={act}
          open
        />
      </Section>
      {stop.length > 0 ? (
        <StopTasks
          tasks={stop}
          rows={rows}
          now={data.now}
          act={act}
          actMany={actMany}
          days={data.recentStopDays}
        />
      ) : null}
      {oldStop.length > 0 ? (
        <StopTasks
          tasks={oldStop}
          rows={rows}
          now={data.now}
          act={act}
          actMany={actMany}
          days={data.recentStopDays}
          old
        />
      ) : null}
      <DoneTasks tasks={done} rows={rows} now={data.now} act={act} />
    </>
  )
}
