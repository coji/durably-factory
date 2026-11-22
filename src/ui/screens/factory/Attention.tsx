import { formatCount } from '../../../engine/format'
import { Card } from '../../components/Card'
import { stopName } from '../../components/charts/ParetoChart'
import { Icon } from '../../components/Icon'
import { useRunHref } from '../../components/RunLink'
import { kindStatus, type Tone } from '../../components/status'
import { StatusBadge } from '../../components/StatusBadge'
import { Ago } from '../../components/Time'
import { CHART, LIST } from '../../glossary'
import type { RunRow, RunsResponse } from '../../server'

/** A task that needs a person, with why, as a link to its run. */
function AttentionRow({ row, now }: { row: RunRow; now: string }) {
  const href = useRunHref()
  const kind = row.diagnosis.kind
  const failure = row.diagnosis.failure?.kind
  const status: { label: string; tone: Tone } =
    kind === 'stopped' && failure
      ? { label: stopName(failure), tone: 'failed' }
      : kindStatus(kind)
  return (
    <li className="border-line flex flex-col gap-1 border-t py-2.5 first:border-t-0">
      <div className="flex items-center gap-2">
        <StatusBadge label={status.label} tone={status.tone} />
        <span className="text-fg-2 ml-auto text-xs tabular-nums">
          <Ago iso={row.createdAt} now={now} />
        </span>
      </div>
      <a
        href={href(row.id)}
        className="text-fg line-clamp-2 text-sm hover:underline"
      >
        {row.name}
      </a>
    </li>
  )
}

export function Attention({
  data,
  tasksHref,
}: {
  data: RunsResponse
  tasksHref: string
}) {
  const rows = new Map(data.runs.map((r) => [r.id, r]))
  const old = new Set(data.oldStops)
  const list = data.tasks
    .filter(
      (t) =>
        t.attention === 'decision' ||
        (t.attention === 'stop' && !old.has(t.id)),
    )
    .flatMap((t) => rows.get(t.representative) ?? [])
  const shown = list.slice(0, 5)
  return (
    <Card
      title={CHART.attention}
      kind={CHART.attentionKind(formatCount(list.length))}
      foot={
        list.length > shown.length ? (
          <a
            href={tasksHref}
            className="text-brand inline-flex items-center gap-1 hover:underline"
          >
            {CHART.attentionMore(formatCount(list.length - shown.length))}
            <Icon name="right" />
          </a>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <p className="text-fg-2 text-sm">{LIST.attentionEmpty}</p>
      ) : (
        <ul>
          {shown.map((r) => (
            <AttentionRow key={r.id} row={r} now={data.now} />
          ))}
        </ul>
      )}
    </Card>
  )
}
