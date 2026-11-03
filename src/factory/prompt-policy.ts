/** Owner-supplied work policies, read once at trigger and never from a worker. */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { z } from 'zod'

import { readInputFile } from './input-file.js'
import { contextTextProblem, MAX_CONTEXT_BYTES } from './target.js'

export const PROMPT_ROLES = [
  'implement',
  'repair',
  'correctness',
  'edge-cases',
  'triage',
  'spec-author',
  'spec-fix',
  'spec-review',
] as const
export type PromptRole = (typeof PROMPT_ROLES)[number]

function roleMap<T extends z.ZodType>(entry: T) {
  return z
    .object({
      implement: entry.optional(),
      repair: entry.optional(),
      correctness: entry.optional(),
      'edge-cases': entry.optional(),
      triage: entry.optional(),
      'spec-author': entry.optional(),
      'spec-fix': entry.optional(),
      'spec-review': entry.optional(),
    })
    .strict()
}
const mode = z.enum(['append', 'replace'])
export const promptFilesSchema = roleMap(
  z
    .object({
      file: z.string().trim().min(1),
      mode: mode.default('append'),
    })
    .strict(),
)
export const promptPolicySchema = z
  .object({
    mode,
    path: z.string().min(1),
    content: z.string().superRefine((text, ctx) => {
      const problem = contextTextProblem(text)
      if (problem)
        ctx.addIssue({ code: 'custom', message: `prompt ${problem}` })
    }),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((policy) => policy.sha256 === promptHash(policy.content), {
    message: 'prompt SHA-256 does not match its stored content',
    path: ['sha256'],
  })
export const promptPoliciesSchema = roleMap(promptPolicySchema)
export type PromptPolicy = z.infer<typeof promptPolicySchema>
export type PromptPolicies = z.infer<typeof promptPoliciesSchema>

export function promptHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Content and mode define execution identity; a different file path does not. */
export function promptPolicyKey(policies: PromptPolicies | undefined | null) {
  const entries = PROMPT_ROLES.flatMap((role) => {
    const policy = policies?.[role]
    return policy
      ? [[role, { mode: policy.mode, content: policy.content }]]
      : []
  })
  return entries.length ? Object.fromEntries(entries) : null
}

export async function readPromptPolicies(
  files: z.infer<typeof promptFilesSchema> | undefined,
  from: string,
): Promise<PromptPolicies | undefined> {
  if (!files || Object.keys(files).length === 0) return undefined
  const policies: PromptPolicies = {}
  const snapshots = new Map<string, Awaited<ReturnType<typeof readInputFile>>>()
  for (const role of PROMPT_ROLES) {
    const configured = files[role]
    if (!configured) continue
    const path = resolve(from, configured.file)
    const input =
      snapshots.get(path) ??
      (await readInputFile(path, {
        name: `prompts.${role}.file`,
        maxBytes: MAX_CONTEXT_BYTES,
      }))
    snapshots.set(path, input)
    policies[role] = {
      mode: configured.mode,
      path: input.ref.path,
      content: input.content,
      sha256: promptHash(input.content),
    }
  }
  return policies
}
