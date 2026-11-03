/** Prompt wording is pinned by setup, so deploying new text cannot change old runs. */
export const INSTRUCTIONS_VERSION = 'local-factory.v6'
export type PromptVersion = 1 | 2
export function promptVersionOf(instructionsVersion: string): PromptVersion {
  return instructionsVersion === 'local-factory.v6' ? 2 : 1
}
