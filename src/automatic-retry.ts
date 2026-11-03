/** Bounded follow-up runs; the normal retrigger path owns identity and input. */
import { existsSync } from 'node:fs'

import { retriggerRun } from './actions.js'
import type { AgentLoopDurably } from './durably.js'
import { classifyRun } from './engine/failure-reasons.js'
import type { AgentLoopInput } from './factory/job.js'
import { archiveMarkerOf } from './factory/layout.js'

export function automaticRetries(
  durably: AgentLoopDurably,
  stopping: () => boolean,
  log: (line: string) => void,
) {
  const seen = new Set<string>()
  let queue = Promise.resolve()
  const scan = () => {
    queue = queue
      .then(async () => {
        if (stopping()) return
        const runs = await durably.getRuns({
          jobName: durably.jobs.agentLoop.name,
          status: 'failed',
        })
        for (const run of runs) {
          if (stopping()) return
          if (seen.has(run.id)) continue
          const input = run.input as AgentLoopInput
          // Only inputs that opted in when triggered; never restart legacy history.
          const setup =
            input.automaticRetryLimit === undefined
              ? ((await durably.storage.getCompletedStep(run.id, 'setup'))
                  ?.output as { automaticRetryLimit?: number } | null)
              : null
          const limit =
            input.automaticRetryLimit ?? setup?.automaticRetryLimit ?? 0
          if (
            !limit ||
            (input.retryOf?.attempt ?? 0) >= limit ||
            existsSync(archiveMarkerOf(durably.stateRoot, run.id))
          ) {
            seen.add(run.id)
            continue
          }
          const failure = await classifyRun(durably, run)
          if (failure?.automaticRetry && !stopping()) {
            const next = await retriggerRun(
              durably,
              run.id,
              failure.automaticRetry,
            )
            log(
              `[automatic-retry] ${run.id} -> ${next.runId} (${failure.automaticRetry}, ${next.disposition})`,
            )
          }
          seen.add(run.id)
        }
      })
      .catch((error: unknown) => {
        if (!stopping())
          log(
            `[automatic-retry] scan failed; retrying later: ${error instanceof Error ? error.message : String(error)}`,
          )
      })
    return queue
  }
  const timer = setInterval(() => {
    void scan()
  }, 1000)
  return {
    scan,
    stop: async () => {
      clearInterval(timer)
      await queue
    },
  }
}
