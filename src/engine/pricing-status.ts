import type { AttemptRow } from './report.js'

/** Read the stored diagnosis, so a later catalog update cannot rewrite history. */
export function unpricedModelsOf(attempts: AttemptRow[]): string[] {
  return [
    ...new Set(attempts.flatMap((a) => a.measurement?.unpricedModels ?? [])),
  ].sort()
}
