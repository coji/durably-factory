/** Prompt wording is pinned by setup, so deploying new text cannot change old runs. */
export const INSTRUCTIONS_VERSION = 'local-factory.v9'
export type PromptVersion = 1 | 2 | 3 | 4 | 5
export function promptVersionOf(instructionsVersion: string): PromptVersion {
  if (instructionsVersion === 'local-factory.v9') return 5
  if (instructionsVersion === 'local-factory.v8') return 4
  if (instructionsVersion === 'local-factory.v7') return 3
  return instructionsVersion === 'local-factory.v6' ? 2 : 1
}
/** The prompt version a run set up now records. */
export const INSTRUCTIONS_PROMPT_VERSION: PromptVersion =
  promptVersionOf(INSTRUCTIONS_VERSION)
