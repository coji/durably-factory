import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'

import { CodexProvider } from '../src/engine/providers/codex.js'
import type { AgentRole } from '../src/engine/providers/types.js'
import { configVersionOf } from '../src/engine/versions.js'

it(
  'applies Codex network opt-ins to new and resumed coding turns only',
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'factory-network-'))
    try {
      const cli = join(root, 'codex.mjs')
      await copyFile(
        new URL('./fixtures/codex-network.mjs', import.meta.url),
        cli,
      )
      const provider = new CodexProvider(cli)
      for (const [role, networkAccess, resume, enabled] of [
        ['implement', undefined, false, false],
        ['implement', false, false, false],
        ['implement', true, false, true],
        ['repair', true, true, true],
        ['repair', undefined, true, false],
        ['review-a', true, false, false],
        ['review-b', true, false, false],
        ['triage', true, false, false],
        ['preflight', true, false, false],
        ['spec-author', true, false, false],
        ['spec-fix', true, false, false],
        ['spec-review', true, false, false],
      ] as [AgentRole, boolean | undefined, boolean, boolean][]) {
        const result = await provider.call({
          role,
          networkAccess,
          workdir: root,
          prompt: 'OK',
          timeoutMs: 5000,
          requestedModel: null,
          requestedEffort: null,
          sessionId: resume ? 'thread-test' : null,
          ...(['spec-author', 'spec-fix'].includes(role)
            ? {
                specWrite: {
                  writableFile: join(root, 'spec.md'),
                  readableDirs: [],
                },
              }
            : {}),
        })
        assert.equal(result.text, 'OK')
        const requests = (await readFile(join(root, 'requests.jsonl'), 'utf8'))
          .trim()
          .split('\n')
          .map(
            (line) =>
              JSON.parse(line) as {
                method: string
                params: Record<string, unknown>
              },
          )
        const thread = requests
          .reverse()
          .find(
            (r) => r.method === (resume ? 'thread/resume' : 'thread/start'),
          )!
        const turn = requests.find((r) => r.method === 'turn/start')!
        const readOnly = [
          'review-a',
          'review-b',
          'triage',
          'preflight',
          'spec-review',
        ].includes(role)
        assert.equal(
          thread.params.sandbox,
          readOnly ? 'read-only' : 'workspace-write',
        )
        assert.deepEqual(
          thread.params.config,
          enabled
            ? { sandbox_workspace_write: { network_access: true } }
            : undefined,
        )
        assert.deepEqual(
          turn.params.sandboxPolicy,
          enabled
            ? { type: 'workspaceWrite', networkAccess: true }
            : { type: readOnly ? 'readOnly' : 'workspaceWrite' },
        )
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

it('preserves the prior configVersion when off and hashes enabled roles in canonical order', () => {
  const profile = {
    provider: 'fake',
    requestedModel: null,
    requestedEffort: null,
    effectiveModel: null,
    effectiveEffort: null,
  }
  const base = {
    contextMode: 'reuse',
    instructionsVersion: 'local-factory.v3',
    maxIterations: 2,
    target: 'repo:pnpm validate',
    agentTimeoutMs: 1800000,
    agentIdleTimeoutMs: 900000,
    checkTimeoutMs: 900000,
    code: profile,
    correctness: profile,
    edgeCases: profile,
  }
  assert.equal(configVersionOf(base), '26517c19576d6602')
  assert.equal(
    configVersionOf({ ...base, sandbox: { network: [] } }),
    configVersionOf(base),
  )
  const versions = [undefined, ['code'], ['repair'], ['code', 'repair']].map(
    (network) =>
      configVersionOf({
        ...base,
        ...(network
          ? { sandbox: { network: network as ('code' | 'repair')[] } }
          : {}),
      }),
  )
  assert.equal(new Set(versions).size, 4)
  assert.equal(
    configVersionOf({ ...base, sandbox: { network: ['repair', 'code'] } }),
    versions[3],
  )
})
