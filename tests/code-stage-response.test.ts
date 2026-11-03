import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import type {
  AgentCallOptions,
  AgentProvider,
} from '../src/engine/providers/types.js'
import { promptHash } from '../src/factory/prompt-policy.js'
import { codeStage } from '../src/factory/stages.js'
import { initialState, type FactorySetup } from '../src/factory/types.js'

describe('durable repair response correction', () => {
  const cases = (['reuse', 'fresh'] as const).flatMap((contextMode) =>
    [true, false].flatMap((tracked) =>
      [false, true].flatMap((separateRepair) =>
        ([1, 2] as const).map((promptVersion) => ({
          contextMode,
          tracked,
          separateRepair,
          promptVersion,
          policyMode: undefined as 'append' | 'replace' | undefined,
        })),
      ),
    ),
  )
  cases.push(
    ...(['append', 'replace'] as const).map((policyMode) => ({
      contextMode: 'reuse' as const,
      tracked: true,
      separateRepair: false,
      promptVersion: 2 as const,
      policyMode,
    })),
  )
  for (const {
    contextMode,
    tracked,
    separateRepair,
    promptVersion,
    policyMode,
  } of cases) {
    it(`${policyMode ?? 'default'}/v${promptVersion}/${contextMode}/${separateRepair ? 'separate' : 'shared'}: ${tracked ? 'replays the correction without another call or seal' : 'does not add a correction to a legacy setup'}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'factory-code-response-'))
      const profile = {
        id: 'p',
        provider: 'fake' as const,
        requestedModel: null,
        requestedEffort: 'low',
        effectiveModel: 'fake-model',
        effectiveEffort: 'low',
      }
      const setup: FactorySetup = {
        fake: true,
        ...(policyMode
          ? {
              prompts: {
                repair: {
                  mode: policyMode,
                  path: '/repair.md',
                  content: 'CUSTOM REPAIR',
                  sha256: promptHash('CUSTOM REPAIR'),
                },
              },
            }
          : {}),
        contextMode,
        target: {
          kind: 'repo',
          repoPath: root,
          workdir: root,
          baseCommit: 'base',
          branch: 'branch',
          checkCommand: ['true'],
          checkTimeoutMs: 5000,
          setupCommand: null,
          task: 'repair',
          spec: null,
          dispositions: null,
          issue: null,
          publish: false,
          deliveryDir: root,
          ...(tracked ? { codeResponseVersion: 1 } : {}),
        },
        ...(separateRepair
          ? {
              repair: {
                ...profile,
                id: 'repair',
                requestedModel: 'repair-model',
                effectiveModel: 'repair-model',
              },
            }
          : {}),
        profiles: {
          code: profile,
          correctness: profile,
          'edge-cases': profile,
        },
        repairOf: {
          runId: 'parent',
          candidateCommit: 'base',
          parentConclusion: 'approved',
        },
        checkpointsDir: root,
        instructionsVersion:
          promptVersion === 2 ? 'local-factory.v6' : 'local-factory.v5',
        configVersion: 'test',
        maxIterations: 1,
        agentTimeoutMs: 5000,
        autoApprove: true,
      }
      const calls: AgentCallOptions[] = []
      const provider: AgentProvider = {
        name: 'fake',
        fake: true,
        cliPath: null,
        partialUsage: false,
        resolveExecution: (options) => ({
          model: options.requestedModel ?? 'fake-model',
          effort: 'low',
        }),
        checkAvailability: async () => ({
          verdict: 'available',
          method: 'stub',
          detail: 'stub',
        }),
        rejectionReason: () => null,
        call: async (options) => {
          calls.push(options)
          return {
            text:
              calls.length === 1
                ? 'NOTES:\nF1: fixed calc.js:1'
                : 'NOTES:\nF1: fixed calc.js:1\nF2: not changed — compatibility retained',
            session: { id: options.sessionId ?? `session-${calls.length}` },
            resolvedModel: options.requestedModel ?? 'fake-model',
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
      let seals = 0
      const target = {
        workdir: root,
        taskBrief: () => 'repair',
        implementationRules: (options?: { policy?: boolean }) =>
          options?.policy === false
            ? ['CORE CONTRACT']
            : ['CORE CONTRACT', 'DEFAULT POLICY'],
        ownerContext: () => null,
        untrustedInputs: () => [
          {
            label: 'FINDINGS',
            content: 'F1: Fix decimal boundary\nF2: Retain compatibility',
          },
        ],
        seal: async () => {
          seals++
          return {
            id: 'candidate',
            snapshotDir: root,
            sourceHash: 'h',
            acceptanceHash: 'h',
          }
        },
      }
      const args = {
        step: step as never,
        state: initialState(setup),
        decision: {
          stage: 'code' as const,
          role: 'repair' as const,
          reason: 'test',
        },
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
      }
      const first = await codeStage(args)
      const replay = await codeStage(args)
      assert.deepEqual(replay, first)
      assert.equal(seals, 1)
      if (policyMode) {
        for (const call of calls) {
          assert.match(call.prompt, /CUSTOM REPAIR/)
          assert.match(call.prompt, /CORE CONTRACT/)
          assert.equal(
            call.prompt.includes('DEFAULT POLICY'),
            policyMode === 'append',
          )
        }
      }
      assert.equal(calls.length, tracked ? 2 : 1)
      assert.equal(
        calls[0].prompt.includes('This is an unattended factory run.'),
        promptVersion === 2,
      )
      if (tracked) {
        assert.match(calls[0].prompt, /Always include NOTES/)
        assert.match(
          calls[1].prompt,
          /omitted or malformed the treatments for: F2/,
        )
        assert.equal(
          calls[1].sessionId ?? null,
          contextMode === 'reuse' ? 'session-1' : null,
        )
      } else {
        assert.equal(
          [...outputs.keys()].some((name) => name.includes(':response')),
          false,
        )
      }
    })
  }
})
