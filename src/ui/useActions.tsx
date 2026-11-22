/**
 * The page's actions: one POST per action with the page token, each
 * outcome kept as a notice until it is closed or the page changes.
 */
import { Fragment, useCallback, useRef, useState } from 'react'

import {
  ActionNotice,
  type Act,
  type ActionResult,
} from './components/ActionNotice'
import {
  BulkNotice,
  BulkProgress,
  sendEach,
  seriesOutcome,
  type BulkAct,
  type BulkItem,
  type ItemAnswer,
  type BulkRequest,
  type SeriesResult,
} from './components/BulkNotice'
import {
  noticesOn,
  withNotice,
  withoutNotice,
  type NoticeEntry,
  type NoticeOutcome,
} from './notices'

/** The header `server.ts` reads the page's token from. */
const TOKEN_HEADER = 'x-loop-ui-token'

/** One POST to an action's path; the server's answer, or its refusal. */
async function post(
  token: string,
  runId: string,
  action: string,
  body: unknown,
): Promise<ActionResult & SeriesResult> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [TOKEN_HEADER]: token,
    },
    body: JSON.stringify(body ?? {}),
  })
  const answer = (await res.json()) as ActionResult &
    SeriesResult & { error?: string }
  if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`)
  return answer
}

/**
 * One item of a bulk action, as `seriesOutcome` reads its answer, or why
 * the request failed. A task's `archive-series` that could not archive
 * every stop counts as failed, with the CLI's own reasons, and keeps the
 * runs it did archive.
 */
async function postItem(
  token: string,
  action: BulkRequest['action'],
  item: BulkItem,
): Promise<ItemAnswer> {
  try {
    return seriesOutcome(await post(token, item.runId, action, {}))
  } catch (error) {
    return { archived: [], warnings: [], error: (error as Error).message }
  }
}

/**
 * Send actions with the page's token, one POST each, and keep what each
 * came to until it is closed or the page changes (`withNotice`). A bulk
 * action sends its items one after another, as the CLI does them, and its
 * own notice shows how many have their answer until the last one does.
 */
export function useActions(token: string, page: string) {
  const [entries, setEntries] = useState<NoticeEntry[]>([])
  const lastId = useRef(0)
  const show = useCallback(
    (id: number, outcome: NoticeOutcome) =>
      setEntries((now) => withNotice(now, { id, page, outcome })),
    [page],
  )
  const close = useCallback(
    (id: number) => setEntries((now) => withoutNotice(now, id)),
    [],
  )
  const act = useCallback<Act>(
    async (request) => {
      const id = ++lastId.current
      try {
        const result = await post(
          token,
          request.runId,
          request.action,
          request.body,
        )
        show(id, { kind: 'one', outcome: { request, result } })
        return true
      } catch (error) {
        show(id, {
          kind: 'one',
          outcome: { request, error: (error as Error).message },
        })
        return false
      }
    },
    [token, show],
  )
  // `id` is the notice it shows in: a new one, or the one whose undo it is.
  const send = useCallback(
    async (request: BulkRequest, id: number) => {
      const total = request.items.length
      const progress = (done: number) =>
        show(id, { kind: 'progress', action: request.action, done, total })
      progress(0)
      const outcome = await sendEach(
        request,
        (item) => postItem(token, request.action, item),
        progress,
      )
      show(id, { kind: 'bulk', outcome })
    },
    [token, show],
  )
  const actMany = useCallback<BulkAct>(
    (request) => send(request, ++lastId.current),
    [send],
  )
  const shown = noticesOn(entries, page).map(({ id, outcome }) => (
    <Fragment key={id}>
      {outcome.kind === 'one' ? (
        <ActionNotice outcome={outcome.outcome} onDismiss={() => close(id)} />
      ) : outcome.kind === 'progress' ? (
        <BulkProgress
          action={outcome.action}
          done={outcome.done}
          total={outcome.total}
        />
      ) : (
        <BulkNotice
          outcome={outcome.outcome}
          onUndo={(request) => void send(request, id)}
          onDismiss={() => close(id)}
        />
      )}
    </Fragment>
  ))
  const notice =
    shown.length > 0 ? <div className="flex flex-col gap-3">{shown}</div> : null
  return { act, actMany, notice }
}
