/** Prompt wording is pinned by setup, so deploying new text cannot change old runs. */
export const INSTRUCTIONS_VERSION = 'local-factory.v7'
export type PromptVersion = 1 | 2 | 3
export function promptVersionOf(instructionsVersion: string): PromptVersion {
  if (instructionsVersion === 'local-factory.v7') return 3
  return instructionsVersion === 'local-factory.v6' ? 2 : 1
}
