import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { classifyFailure } from '../src/engine/failure-reasons.js'
import type { AgentProvider } from '../src/engine/providers/types.js'
import {
  decisionNeededLines,
  parseCodeResponse,
} from '../src/factory/code-response.js'
import { FactoryEventSchema } from '../src/factory/events.js'
import { decide } from '../src/factory/policy.js'
import { promptHash } from '../src/factory/prompt-policy.js'
import {
  asksForDecisions,
  INSTRUCTIONS_VERSION,
  promptVersionOf,
} from '../src/factory/prompt-version.js'
import { codePrompt, DECISION_NEEDED_LINE } from '../src/factory/prompts.js'
import { reduce } from '../src/factory/reducer.js'
import { codeStage } from '../src/factory/stages.js'
import { initialState, type FactorySetup } from '../src/factory/types.js'

function profile(role: string) {
  return {
    id: `fake:model:low:${role}`,
    provider: 'fake' as const,
    requestedModel: 'model',
    requestedEffort: 'low',
    effectiveModel: 'fake-model',
    effectiveEffort: 'low',
  }
}

const setup: FactorySetup = {
  fake: true,
  contextMode: 'reuse',
  target: {
    kind: 'subject',
    workdir: '/tmp/work',
    baselineDir: '/tmp/baseline',
    baselineHash: 'baseline',
    acceptanceDir: '/tmp/acceptance',
    acceptanceHash: 'acceptance',
    candidatesDir: '/tmp/candidates',
    testTimeoutMs: 1,
  },
  checkpointsDir: '/tmp/checkpoints',
  instructionsVersion: INSTRUCTIONS_VERSION,
  configVersion: 'cfg-test',
  profiles: {
    code: profile('code'),
    correctness: profile('correctness'),
    'edge-cases': profile('edge-cases'),
  },
  maxIterations: 2,
  agentTimeoutMs: 1,
  autoApprove: false,
}

const candidate = {
  id: 'candidate-1',
  snapshotDir: '/tmp/candidate-1',
  sourceHash: 'source-1',
  acceptanceHash: 'acceptance',
}

describe('DECISION NEEDED lines (ADR-0067)', () => {
  it('reads each line under NOTES, as a list item or in bold, and skips fenced examples and blank ones', () => {
    const notes = [
      'left F8 unchanged',
      'DECISION NEEDED: may src/legacy.js change? The spec keeps it out of scope.',
      '- DECISION NEEDED: should negative inputs round too?',
      '**DECISION NEEDED:** which of the two inventories is right?',
      'DECISION NEEDED：全角のコロンでも読む',
      '```',
      'DECISION NEEDED: a quoted example',
      '```',
      'DECISION NEEDED:',
      'DECISION NEEDED: —',
      'decision needed: lowercase prose is not the line',
      'no DECISION NEEDED: here, it does not start the line',
    ].join('\n')
    assert.deepEqual(decisionNeededLines(notes), [
      'may src/legacy.js change? The spec keeps it out of scope.',
      'should negative inputs round too?',
      'which of the two inventories is right?',
      '全角のコロンでも読む',
    ])
    assert.deepEqual(decisionNeededLines(null), [])
    assert.deepEqual(decisionNeededLines('all done'), [])
  })

  it('leaves CHECK lines and finding treatments as they were read before', () => {
    const response = parseCodeResponse({
      text: [
        'Updated.',
        'NOTES:',
        'DECISION NEEDED: may src/legacy.js change?',
        'CHECK C1: pass — lint clean',
        'F1: not changed — blocked by the decision above',
      ].join('\n'),
      role: 'repair',
      iteration: 2,
      correction: false,
      commands: [['pnpm', 'lint']],
      findings: [{ id: 'F1', text: 'legacy rounding', disposition: null }],
    })
    assert.deepEqual(
      response.checks.map((c) => [c.id, c.status, c.detail]),
      [['C1', 'pass', 'lint clean']],
    )
    assert.deepEqual(response.treatments, [
      {
        id: 'F1',
        status: 'not-changed',
        detail: 'blocked by the decision above',
      },
    ])
    assert.deepEqual(response.missing, [])
  })

  it('pins the line to local-factory.v10, and keeps it out of earlier prompts', () => {
    assert.equal(INSTRUCTIONS_VERSION, 'local-factory.v10')
    assert.equal(promptVersionOf('local-factory.v10'), 6)
    assert.equal(promptVersionOf('local-factory.v9'), 5)
    assert.equal(asksForDecisions(6), true)
    assert.equal(asksForDecisions(5), false)
    const prompt = (promptVersion: 5 | 6, role: 'implement' | 'repair') =>
      codePrompt({
        role,
        iteration: role === 'implement' ? 1 : 2,
        repairNotes: [],
        task: 'Fix add().',
        rules: ['Edit src only.'],
        promptVersion,
      })
    for (const role of ['implement', 'repair'] as const) {
      assert.ok(prompt(6, role).includes(DECISION_NEEDED_LINE), role)
      assert.ok(!prompt(5, role).includes('DECISION NEEDED'), role)
    }
    // Also with a work policy that replaces the default rules.
    assert.ok(
      codePrompt({
        role: 'implement',
        iteration: 1,
        repairNotes: [],
        task: 'Fix add().',
        rules: [],
        policy: {
          mode: 'replace',
          path: 'policy.md',
          content: 'Only this policy.',
          sha256: promptHash('Only this policy.'),
        },
        promptVersion: 6,
      }).includes(DECISION_NEEDED_LINE),
    )
  })

  it('stops before verify once a candidate carries decisions, and verifies one without', () => {
    const event = FactoryEventSchema.parse({
      type: 'code.completed',
      role: 'implement',
      candidate,
      session: null,
      implementerNotes: 'DECISION NEEDED: may legacy.js change?',
      decisionNeeded: ['may legacy.js change?'],
    })
    const stopped = reduce(initialState(setup), event)
    assert.deepEqual(stopped.decisionNeeded, ['may legacy.js change?'])
    assert.deepEqual(decide(stopped), {
      stage: 'stop',
      reason: 'the implementer asked for an owner decision',
    })
    const plain = reduce(initialState(setup), {
      type: 'code.completed',
      role: 'implement',
      candidate,
      session: null,
      implementerNotes: 'left F8 unchanged',
    })
    assert.equal(plain.decisionNeeded, undefined)
    assert.equal(decide(plain).stage, 'verify')
    // A later candidate never inherits an earlier one's decisions.
    const next = reduce(stopped, {
      type: 'code.completed',
      role: 'repair',
      candidate: { ...candidate, id: 'candidate-2' },
      session: null,
    })
    assert.equal(next.decisionNeeded, undefined)
    assert.equal(decide(next).stage, 'verify')
  })

  it('names the decisions and the repair with a context file as the next step', () => {
    const failure = classifyFailure({
      runId: 'run-1',
      status: 'completed',
      output: {
        conclusion: 'decision-needed',
        decisionNeeded: ['may legacy.js change?\nIt is out of scope.'],
      },
      error: null,
      uncertain: [],
    })
    assert.equal(failure?.kind, 'decision-needed')
    assert.equal(failure?.retryable, true)
    assert.deepEqual(failure?.details, [
      'decision needed: may legacy.js change? | It is out of scope.',
    ])
    assert.ok(
      failure?.next.some((line) =>
        line.includes('repair --run run-1 --context-file <file>'),
      ),
    )
  })
})

describe('the code stage and DECISION NEEDED lines (ADR-0067)', () => {
  for (const instructionsVersion of ['local-factory.v10', 'local-factory.v9'])
    it(`${instructionsVersion === INSTRUCTIONS_VERSION ? 'stores' : 'ignores'} the lines of a reply on a run pinned to ${instructionsVersion}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'factory-decision-stage-'))
      const profile = {
        id: 'p',
        provider: 'fake' as const,
        requestedModel: null,
        requestedEffort: 'low',
        effectiveModel: 'fake-model',
        effectiveEffort: 'low',
      }
      const repoSetup: FactorySetup = {
        fake: true,
        contextMode: 'fresh',
        target: {
          kind: 'repo',
          repoPath: root,
          workdir: root,
          baseCommit: 'base',
          branch: 'branch',
          checkCommand: ['true'],
          checkTimeoutMs: 5000,
          setupCommand: null,
          task: 'implement',
          spec: null,
          dispositions: null,
          issue: null,
          publish: false,
          deliveryDir: root,
        },
        profiles: {
          code: profile,
          correctness: profile,
          'edge-cases': profile,
        },
        checkpointsDir: root,
        instructionsVersion,
        configVersion: 'test',
        maxIterations: 2,
        agentTimeoutMs: 5000,
        autoApprove: true,
      }
      const prompts: string[] = []
      const provider: AgentProvider = {
        name: 'fake',
        fake: true,
        cliPath: null,
        partialUsage: false,
        resolveExecution: () => ({ model: 'fake-model', effort: 'low' }),
        checkAvailability: async () => ({
          verdict: 'available',
          method: 'stub',
          detail: 'stub',
        }),
        rejectionReason: () => null,
        call: async (options) => {
          prompts.push(options.prompt)
          return {
            text: 'Changed calc.js.\nNOTES:\nDECISION NEEDED: may legacy.js change?',
            session: { id: 'session-1' },
            resolvedModel: 'fake-model',
            resolvedEffort: 'low',
            reportedModel: 'fake-model',
            reportedEffort: 'low',
            usage: null,
            elapsedMs: 1,
          }
        },
      }
      const outputs = new Map<string, unknown>()
      const step = {
        runId: 'r',
        run: async (
          name: string,
          fn: (signal: AbortSignal, attempt: unknown) => Promise<unknown>,
        ) => {
          if (!outputs.has(name))
            outputs.set(
              name,
              await fn(new AbortController().signal, {
                id: name,
                setMetadata: async () => {},
              }),
            )
          return structuredClone(outputs.get(name))
        },
      }
      const target = {
        workdir: root,
        taskBrief: () => 'implement',
        implementationRules: () => ['CORE CONTRACT'],
        ownerContext: () => null,
        untrustedInputs: () => [],
        seal: async () => ({
          id: 'candidate',
          snapshotDir: root,
          sourceHash: 'h',
          acceptanceHash: 'h',
        }),
      }
      // The same partial stubs as code-stage-response.test.ts: the stage
      // reads only the members given here.
      const event = await codeStage({
        step: step as never,
        state: initialState(repoSetup),
        decision: { stage: 'code', role: 'implement', reason: 'test' },
        key: 'stage:0:code',
        services: {
          providers: {
            code: provider,
            repair: provider,
            correctness: provider,
            'edge-cases': provider,
          },
          target: target as never,
          createTarget: () => target as never,
        },
      })
      const pinned = instructionsVersion === INSTRUCTIONS_VERSION
      assert.equal(prompts[0]?.includes(DECISION_NEEDED_LINE), pinned)
      const stored = outputs.get('stage:0:code:candidate') as {
        decisionNeeded?: string[]
      }
      assert.ok(event.type === 'code.completed')
      if (pinned) {
        assert.deepEqual(stored.decisionNeeded, ['may legacy.js change?'])
        assert.deepEqual(event.decisionNeeded, ['may legacy.js change?'])
        assert.equal(
          decide(reduce(initialState(repoSetup), event)).stage,
          'stop',
        )
      } else {
        // An older run replays as it was: the words alone stop nothing.
        assert.equal(stored.decisionNeeded, undefined)
        assert.equal(event.decisionNeeded, undefined)
        assert.equal(
          decide(reduce(initialState(repoSetup), event)).stage,
          'verify',
        )
      }
    })
})
