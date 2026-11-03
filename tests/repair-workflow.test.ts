import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createAgentDurably } from '../src/durably.js'
import { buildReport } from '../src/engine/build-report.js'
import { runChild } from '../src/engine/child.js'
import { reportToMarkdown } from '../src/engine/report.js'
import type { FactorySetup, TestProbeRecord } from '../src/factory/types.js'
import { buildRepairInput } from '../src/trigger-input.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const regression = [
  "import { test } from 'node:test'",
  "import assert from 'node:assert/strict'",
  "import { add } from '../src/calc.js'",
  "test('decimal addition', () => assert.equal(add(1.5, 2.5), 4))",
  '',
].join('\n')

async function box() {
  const home = await mkdtemp(join(tmpdir(), 'factory-repair-workflow-'))
  const repo = join(home, 'repo')
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(repo, 'package.json'), '{"type":"module"}\n')
  await writeFile(
    join(repo, 'src/calc.js'),
    'export function add(a, b) { return Math.trunc(a) + Math.trunc(b) }\n',
  )
  await writeFile(
    join(repo, 'check.mjs'),
    "import assert from 'node:assert/strict'; import { add } from './src/calc.js'; assert.equal(add(1.5, 2.5), 4)\n",
  )
  for (const args of [
    ['init', '--initial-branch=main'],
    ['config', 'user.name', 'test'],
    ['config', 'user.email', 'test@localhost'],
    ['add', '-A'],
    ['commit', '-m', 'seed'],
  ]) {
    const result = await runChild('git', args, { cwd: repo, timeoutMs: 10000 })
    assert.equal(result.code, 0, result.stderr)
  }
  const base = (
    await runChild('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      timeoutMs: 10000,
    })
  ).stdout.trim()
  const stateRoot = join(home, '.local', 'state', 'local-agent-loop')
  const durably = createAgentDurably({ stateRoot })
  await durably.migrate()
  let worker: ChildProcess | null = null
  let log = ''
  const start = () => {
    worker = spawn(
      join(packageRoot, 'node_modules', '.bin', 'tsx'),
      [join(packageRoot, 'src/cli.ts'), 'worker'],
      {
        cwd: home,
        env: {
          ...process.env,
          HOME: home,
          FAKE_FAIL_FIRST: '0',
          FAKE_REVIEW_SEQUENCE: 'pass,pass',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    for (const stream of [worker.stdout, worker.stderr])
      stream?.on('data', (data: Buffer) => {
        log = (log + data.toString()).slice(-8000)
      })
  }
  const input = {
    provider: 'fake' as const,
    context: 'reuse' as const,
    maxIterations: 1,
    target: {
      kind: 'repo' as const,
      repoPath: repo,
      baseRef: 'HEAD',
      task: 'Fix decimal addition',
      spec: null,
      dispositions: null,
      inputFiles: { task: null, spec: null, dispositions: null },
      issue: null,
      checkCommand: ['node', 'check.mjs'],
      setupCommand: null,
      publish: false,
    },
    fakeScenario: {
      failIterations: 0,
      reviewSequence: ['pass', 'pass'] as 'pass'[],
    },
  }
  const settled = async (id: string) => {
    const end = Date.now() + 60000
    while (Date.now() < end) {
      const run = await durably.getRun(id)
      if (run && ['completed', 'failed', 'cancelled'].includes(run.status))
        return run
      // sleep-ok(poll): wait for the isolated worker's persisted terminal state
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`worker did not settle ${id}: ${log}`)
  }
  const setup = async (id: string) =>
    (await durably.storage.getCompletedStep(id, 'setup'))
      ?.output as unknown as FactorySetup
  return {
    home,
    repo,
    base,
    durably,
    start,
    input,
    settled,
    setup,
    close: async () => {
      if (worker && worker.exitCode === null && worker.signalCode === null) {
        worker.kill('SIGTERM')
        await once(worker, 'exit')
      }
      await durably.db.destroy()
    },
  }
}

describe('repair workflow evidence', { timeout: 180000 }, () => {
  it('keeps self-check results as claims while the fixed check independently verifies the candidate', async () => {
    const b = await box()
    try {
      const run = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        target: {
          ...b.input.target,
          selfCheck: [
            ['node', 'check.mjs'],
            ['node', 'local-only.mjs'],
          ],
        },
        fakeScenario: {
          ...b.input.fakeScenario,
          codeReplies: [
            'Implemented.\nNOTES:\nCHECK C1: pass — decimal assertion passed\nCHECK C2: not-run — requires localhost',
          ],
        },
      })
      b.start()
      const done = await b.settled(run.id)
      assert.equal(done.status, 'completed', done.error ?? '')
      const report = await buildReport(b.durably, run.id)
      assert.deepEqual(
        report.codeResponses?.[0].checks.map((c) => c.status),
        ['pass', 'not-run'],
      )
      assert.equal(report.codeResponses?.[0].source, 'self-reported')
      assert.match(
        reportToMarkdown(report),
        /implementer claims, not factory-run verification/,
      )
      assert.match(reportToMarkdown(report), /requires localhost/)
      assert.equal(report.summary.success, true)
    } finally {
      await b.close()
    }
  })

  it('probes a repair test against the original feature base, not the already-fixed parent', async () => {
    const b = await box()
    try {
      const testProbe = [
        { glob: 'test/*.test.js', command: ['node', '--test', '{files}'] },
      ]
      const parent = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        target: { ...b.input.target, testProbe },
        fakeScenario: {
          ...b.input.fakeScenario,
          changes: { 'test/regression.test.js': regression },
        },
      })
      b.start()
      const parentRun = await b.settled(parent.id)
      assert.equal(parentRun.status, 'completed', parentRun.error ?? '')
      const parentSetup = await b.setup(parent.id)
      assert.equal(parentSetup.target.kind, 'repo')
      if (parentSetup.target.kind !== 'repo')
        throw new Error('repo target required')
      assert.equal(parentSetup.target.featureBase, b.base)
      assert.equal(parentSetup.target.baseCommit, b.base)
      const childInput = buildRepairInput(
        parentRun,
        parentSetup,
        {
          findings: {
            content: 'F1: Cover negative decimals too',
            ref: { path: '/findings.md' },
          },
          dispositions: null,
        },
        {
          ...b.input.fakeScenario,
          changes: {
            'test/regression.test.js': `${regression}test('negative decimals', () => assert.equal(add(-1.5, 2.5), 1))\n`,
          },
        },
      )
      assert.equal(childInput.input.target.featureBase, b.base)
      assert.notEqual(childInput.input.target.baseRef, b.base)
      const child = await b.durably.jobs.agentLoop.trigger(childInput.input, {
        labels: childInput.labels,
      })
      const childRun = await b.settled(child.id)
      assert.equal(childRun.status, 'completed', childRun.error ?? '')
      const report = await buildReport(b.durably, child.id)
      assert.equal(report.featureBase, b.base)
      assert.equal(report.testProbes?.[0].failedOnBase, 1)
      const probe = (await b.durably.storage.getSteps(child.id)).find((s) =>
        s.name.endsWith(':test-probe'),
      )?.output as unknown as TestProbeRecord
      const file = probe.files[0]
      assert.ok(file.base.ran && file.candidate.ran)
      if (!file.base.ran || !file.candidate.ran)
        throw new Error('both sides must run')
      assert.notEqual(file.base.exitCode, 0)
      assert.equal(file.candidate.exitCode, 0)
      assert.match(probe.context.content, new RegExp(b.base))
      const grandchild = buildRepairInput(childRun, await b.setup(child.id), {
        findings: {
          content: 'F1: document behavior',
          ref: { path: '/next.md' },
        },
        dispositions: null,
      })
      assert.equal(grandchild.input.target.featureBase, b.base)
    } finally {
      await b.close()
    }
  })

  for (const complete of [true, false]) {
    it(
      complete
        ? 'corrects missing treatments once before sealing and review'
        : 'stops before sealing or review when treatments are still missing after the correction',
      async () => {
        const b = await box()
        try {
          const parent = await b.durably.jobs.agentLoop.trigger(b.input)
          b.start()
          const parentRun = await b.settled(parent.id)
          assert.equal(parentRun.status, 'completed', parentRun.error ?? '')
          const childInput = buildRepairInput(
            parentRun,
            await b.setup(parent.id),
            {
              findings: {
                content: 'F1: Clarify behavior\nF2: Remove compatibility API',
                ref: { path: '/findings.md' },
              },
              dispositions: {
                content: 'F2: deferred — compatibility stays for now',
                ref: { path: '/dispositions.md' },
              },
            },
            {
              ...b.input.fakeScenario,
              changes: { 'NOTES.md': 'Compatibility retained.\n' },
              codeReplies: ['Updated.\nNOTES:\nF1: fixed NOTES.md:1'],
              codeCorrections: [
                complete
                  ? 'Updated.\nNOTES:\nF1: fixed NOTES.md:1\nF2: not changed — deferred compatibility change'
                  : 'Updated.\nNOTES:\nF1: fixed NOTES.md:1',
              ],
            },
          )
          const child = await b.durably.jobs.agentLoop.trigger(
            childInput.input,
            { labels: childInput.labels },
          )
          const done = await b.settled(child.id)
          assert.equal(
            done.status,
            complete ? 'completed' : 'failed',
            done.error ?? '',
          )
          const report = await buildReport(b.durably, child.id)
          assert.equal(report.codeResponses?.length, 2)
          assert.deepEqual(report.codeResponses?.[0].missing, ['F2'])
          assert.equal(report.codeResponses?.[1].correction, true)
          assert.equal(
            report.codeResponses?.[1].findings[1].disposition,
            'deferred',
          )
          const steps = await b.durably.storage.getSteps(child.id)
          assert.equal(
            steps.filter(
              (s) =>
                /:agent(?::response-retry)?$/.test(s.name) &&
                s.name.includes(':code:'),
            ).length,
            2,
          )
          if (complete) {
            assert.deepEqual(report.codeResponses?.[1].missing, [])
            assert.match(reportToMarkdown(report), /F2: not-changed/)
          } else {
            assert.match(done.error ?? '', /incomplete-finding-treatments/)
            assert.equal(
              steps.some((s) => s.name.endsWith(':candidate')),
              false,
            )
            assert.equal(
              steps.some((s) => /:(verify|review):/.test(s.name)),
              false,
            )
          }
        } finally {
          await b.close()
        }
      },
    )
  }
})
