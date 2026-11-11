/** Bounded live smoke: subscription-authenticated Claude CLI, no factory worker/DB. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

import { generateText } from 'ai'
import { claudeCode, type SDKMessage } from 'ai-sdk-provider-claude-code'

import { ClaudeProvider } from '../src/engine/providers/claude.js'
import type { AttemptMeasurement } from '../src/engine/providers/types.js'
import { runAgentCall } from '../src/engine/runner.js'
import type { SessionRef } from '../src/engine/types.js'
import {
  reviewPrompt,
  localInstructions,
  parseFindingsOutput,
} from '../src/factory/prompts.js'

if (process.argv[2] !== '--run' || !process.argv[3])
  throw new Error(
    'Usage: pnpm exec tsx scripts/smoke-review-session.ts --run <new-output-directory>',
  )
const root = resolve(process.argv[3])
// Refuse an old output directory: an uncertain live call must not be resent.
await mkdir(root)
const head = join(root, 'candidate')
const base = join(root, 'base')
await mkdir(head)
await mkdir(base)
await writeFile(join(head, 'package.json'), JSON.stringify({ type: 'module' }))
const source = (add: string, mul: string) =>
  `export const add = (a, b) => ${add};\nexport const mul = (a, b) => ${mul};\n`
const fixed = source('a + b', 'a * b')
await writeFile(
  join(base, 'math.js'),
  source('Math.trunc(a) + Math.trunc(b)', 'a * b'),
)
await writeFile(
  join(head, 'math.test.js'),
  "import assert from 'node:assert/strict';\nimport { add, mul } from './math.js';\nassert.equal(add(0.1, 0.2), 0.30000000000000004);\nassert.equal(mul(-2, 3), -6);\n",
)
let tools = new Set<string>()
const provider = new ClaudeProvider({
  claudeCode: Object.assign(
    (
      model: Parameters<typeof claudeCode>[0],
      settings: Parameters<typeof claudeCode>[1],
    ) =>
      claudeCode(model, {
        ...settings,
        onSdkMessage: (message: SDKMessage) => {
          if (message.type === 'assistant') {
            for (const block of message.message.content)
              if (block.type === 'tool_use' && block.name === 'Agent')
                tools.add(block.id)
          }
          settings?.onSdkMessage?.(message)
        },
      }),
    claudeCode,
  ),
  generateText,
})
const requested = {
  requestedModel: 'claude-opus-5-5',
  requestedEffort: 'medium',
}
const execution = provider.resolveExecution(requested)
const rows: {
  name: string
  decision: string
  findings: unknown
  measurement: AttemptMeasurement
  subagentCalls: number
}[] = []
const nativeIdOf = (value: SessionRef | null) => value?.nativeId ?? null
let session: SessionRef | null = null
const finalSessions = new Set<string>()
const hash = async () =>
  createHash('sha256')
    .update(await readFile(join(head, 'math.js')))
    .digest('hex')
for (const [index, name] of [
  'bug-add',
  'fix-add-regress-mul',
  'fix-both',
  'fresh-final-a',
  'fresh-final-b',
].entries()) {
  const final = index >= 3
  const reviewer = index === 4 ? ('review-b' as const) : ('review-a' as const)
  const workdir = join(root, final ? name : 'reviewer-a')
  await mkdir(join(workdir, '.claude', 'commands'), { recursive: true })
  await writeFile(
    join(workdir, '.claude', 'commands', 'code-review.md'),
    'Follow the read-only review contract in CLAUDE.local.md. Read the current candidate files. Ask one Agent subagent to independently check arithmetic edge cases, wait for it, then return the required findings JSON and completion marker.\n',
  )
  await writeFile(
    join(head, 'math.js'),
    index === 0
      ? source('Math.trunc(a) + Math.trunc(b)', 'a * b')
      : index === 1
        ? source('a + b', 'Math.abs(a * b)')
        : fixed,
  )
  const before = await hash()
  const prompt = reviewPrompt(
    index === 4 ? 'edge-cases' : 'correctness',
    `Current candidate ${name}. Candidate directory: ${head}. Read ${head}/math.js and ${head}/math.test.js by absolute path. Base directory: ${base}. Read the current files again. Earlier paths, findings and source content are stale evidence. Both functions must implement exact JavaScript addition and multiplication, including decimals and negative numbers.`,
    ['Review math.js and math.test.js in the candidate directory.'],
    [],
    null,
    null,
    {
      output: 'findings-json',
      promptVersion: 3,
      snapshots: { baseDir: base, headDir: head },
      candidateTree: head,
    },
  )
  await writeFile(join(workdir, 'CLAUDE.local.md'), localInstructions(prompt))
  tools = new Set()
  let measurement: AttemptMeasurement | undefined
  const outcome = await runAgentCall(
    new AbortController().signal,
    {
      id: randomUUID(),
      setMetadata: async (value: unknown) => {
        measurement = value as AttemptMeasurement
      },
      log: { info: () => {} },
    } as never,
    {
      provider,
      providerName: 'claude',
      ...requested,
      effectiveModel: execution.model,
      effectiveEffort: execution.effort,
      role: reviewer,
      stage: `review:${reviewer}`,
      iteration: Math.min(index + 1, 3),
      reviewRound: index + 1,
      prompt: '/code-review',
      workdir,
      review: {
        command: true,
        context: 'local-instructions',
        output: 'findings-json',
        readableDirs: [head, base],
        retainSession: !final,
      },
      timeoutMs: 90000,
      idleTimeoutMs: 60000,
      checkpointsDir: join(root, 'checkpoints'),
      operationKey: name,
      session: final ? null : session,
      requireSession: !final,
      sessionHandling: final || !session ? 'fresh' : 'continued',
      sessionReason: final
        ? 'fresh final smoke confirmation'
        : session
          ? 'continue the same reviewer'
          : 'first review',
      reviewPass: final ? 'final' : 'iterative',
    },
  )
  if (!final && session && outcome.sessionId !== nativeIdOf(session))
    throw new Error('the reviewer session was not resumed')
  if (final) {
    if (
      !outcome.sessionId ||
      outcome.sessionId === nativeIdOf(session) ||
      finalSessions.has(outcome.sessionId)
    )
      throw new Error('final confirmation did not start an independent session')
    finalSessions.add(outcome.sessionId)
  }
  if ((await hash()) !== before) throw new Error(`candidate changed: ${name}`)
  const parsed = parseFindingsOutput(outcome.text)
  if (!parsed.ok) throw new Error(`${name}: incomplete findings`)
  if (!measurement) throw new Error('missing invocation measurement')
  rows.push({
    name,
    decision: parsed.decision,
    findings: parsed.findings,
    measurement,
    subagentCalls: tools.size,
  })
  await writeFile(
    join(root, 'results.json'),
    JSON.stringify({ root, rows, status: 'running' }, null, 2),
  )
  if (
    (index < 2 && parsed.decision !== 'needsChanges') ||
    (index >= 2 && parsed.decision !== 'pass')
  )
    throw new Error(
      `${name}: unexpected decision ${parsed.decision}; inspect results, do not retry the same directory`,
    )
  if (!final && outcome.sessionId)
    session = {
      provider: 'claude',
      nativeId: outcome.sessionId,
      profileId: 'smoke-reviewer-a',
      model: execution.model,
      cwd: workdir,
      instructionsVersion: 'local-factory.v7',
      ...(outcome.sessionUsage ? { usage: outcome.sessionUsage } : {}),
    }
}
const result = {
  status: 'completed',
  rows,
  totalMeasuredCostUsd: rows.every(
    (row) => row.measurement.costUsdEstimate !== null,
  )
    ? rows.reduce((sum, row) => sum + (row.measurement.costUsdEstimate ?? 0), 0)
    : null,
  totalMeasuredElapsedMs: rows.reduce(
    (sum, row) => sum + (row.measurement.elapsedMs ?? 0),
    0,
  ),
  limitation:
    'Small arithmetic fixture with a project-local /code-review command; this is a wiring/retention smoke, not evidence of equal review quality or the performance of another plugin implementation.',
}
await writeFile(join(root, 'results.json'), JSON.stringify(result, null, 2))
console.log(
  JSON.stringify({
    status: result.status,
    output: join(root, 'results.json'),
    totalMeasuredCostUsd: result.totalMeasuredCostUsd,
    totalMeasuredElapsedMs: result.totalMeasuredElapsedMs,
  }),
)
