import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { resumeUncertainRun } from '../src/actions.js'
import {
  acquireWorkerLock,
  createAgentDurably,
  LEASE_MS,
  reclaimWorkerLeases,
} from '../src/durably.js'
import { buildReport } from '../src/engine/build-report.js'
import { runChild } from '../src/engine/child.js'
import { classifyRun } from '../src/engine/failure-reasons.js'
import { lastLeaseRenewal } from '../src/engine/status.js'
import type { FactorySetup } from '../src/factory/types.js'

async function until(test: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 30000
  while (!(await test())) {
    if (Date.now() > deadline) throw new Error(`timed out: ${label}`)
    // sleep-ok(poll): inspect the isolated run until its persisted stage starts
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'factory-sleep-'))
  const repo = join(root, 'repo')
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(repo, 'package.json'), '{"type":"module"}\n')
  await writeFile(
    join(repo, 'src/calc.js'),
    'export function add(a,b) { return Math.trunc(a) + Math.trunc(b) }\n',
  )
  await writeFile(
    join(repo, 'check.mjs'),
    [
      "import { add } from './src/calc.js'",
      "import { existsSync, writeFileSync } from 'node:fs'",
      // A fixed second candidate holds verification, while both parallel reviews finish.
      'if (add(1.5, 2.5) === 4) {',
      "  writeFileSync('../checking', '')",
      // sleep-ok(poll): the regression test releases its isolated check gate
      "  while (!existsSync('../release')) await new Promise(r => setTimeout(r, 25))",
      '} else process.exit(1)',
    ].join('\n'),
  )
  for (const args of [
    ['init', '--initial-branch=main'],
    ['config', 'user.name', 'test'],
    ['config', 'user.email', 'test@localhost'],
    ['add', '-A'],
    ['commit', '-m', 'base'],
  ]) {
    const result = await runChild('git', args, { cwd: repo, timeoutMs: 10000 })
    assert.equal(result.code, 0, result.stderr)
  }
  const durably = createAgentDurably({
    stateRoot: join(root, '.local', 'state', 'durably-factory'),
  })
  await durably.migrate()
  const input = {
    provider: 'fake' as const,
    context: 'reuse' as const,
    maxIterations: 2,
    autoApprove: true,
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
    fakeScenario: { failIterations: 1 },
  }
  const setup = async (id: string) =>
    (await durably.storage.getCompletedStep(id, 'setup'))
      ?.output as FactorySetup
  return { root, repo, durably, input, setup }
}

describe('sleep and abandoned worker recovery', { timeout: 90000 }, () => {
  it('keeps a five-minute sleep within the lease and reports the real last renewal', () => {
    assert.equal(LEASE_MS, 600000)
    const renewed = Date.now()
    const run = {
      status: 'leased' as const,
      leaseExpiresAt: new Date(renewed + LEASE_MS).toISOString(),
    }
    assert.equal(
      lastLeaseRenewal(run, renewed + 300000, LEASE_MS),
      new Date(renewed).toISOString(),
    )
  })

  for (const parallelReview of [false, true]) {
    it(`replays verification of the repaired candidate (parallelReview=${parallelReview})`, async () => {
      const box = await fixture()
      const { durably } = box
      let execution: Promise<boolean> | undefined
      try {
        const run = await durably.jobs.agentLoop.trigger({
          ...box.input,
          target: { ...box.input.target, parallelReview },
        })
        execution = durably.processOne()
        const work = join(durably.stateRoot, 'runs', run.id)
        await until(
          async () => existsSync(join(work, 'checking')),
          'repaired candidate is checking',
        )
        if (parallelReview)
          await until(
            async () =>
              (await durably.storage.getSteps(run.id)).filter((s) =>
                /^stage:3:review:(correctness|edge-cases)$/.test(s.name),
              ).length === 2,
            'both repaired candidate reviews complete',
          )
        const stepsBefore = await durably.storage.getSteps(run.id)
        const codeBefore = stepsBefore.filter((s) =>
          s.name.endsWith(':code:agent'),
        )
        assert.equal(codeBefore.length, 2)
        // Simulate a sleep beyond the tolerance. Renewal observes the expired
        // lease, aborts the check and leaves it replayable rather than failed.
        await durably.storage.updateRun(run.id, {
          leaseExpiresAt: new Date(0).toISOString(),
        })
        await execution
        assert.equal((await durably.getRun(run.id))?.status, 'leased')
        await writeFile(join(work, 'release'), '')
        await durably.processOne()
        const final = await durably.getRun(run.id)
        assert.equal(final?.status, 'completed', final?.error ?? '')
        assert.equal(
          (final!.output as { conclusion: string }).conclusion,
          'approved',
        )
        const steps = await durably.storage.getSteps(run.id)
        assert.equal(
          steps.filter((s) => s.name.endsWith(':code:agent')).length,
          2,
        )
        const attempts = await durably.getStepAttempts(run.id)
        assert.ok(
          attempts.some(
            (a) =>
              a.stepName === 'stage:3:verify:acceptance' &&
              a.interruptionReason === 'lease-lost',
          ),
        )
        assert.equal(
          attempts.filter((a) => a.stepName === 'stage:3:verify:acceptance')
            .length,
          2,
        )
        for (const lens of ['correctness', 'edge-cases']) {
          if (parallelReview)
            assert.equal(
              attempts.filter((a) => a.stepName === `stage:3:review:${lens}`)
                .length,
              1,
            )
        }
      } finally {
        await writeFile(
          join(
            durably.stateRoot,
            'runs',
            (await durably.getRuns())[0]!.id,
            'release',
          ),
          '',
        ).catch(() => {})
        await execution
        await durably.db.destroy()
        await rm(box.root, { recursive: true, force: true })
      }
    })
  }

  for (const spec of [false, true]) {
    it(`requires explicit acknowledgment to resend an unknown ${spec ? 'spec author' : 'implementation'} call`, async () => {
      const box = await fixture()
      const { durably } = box
      const profile = {
        provider: 'fake' as const,
        requestedModel: null,
        requestedEffort: null,
      }
      let execution: Promise<boolean> | undefined
      try {
        const run = await durably.jobs.agentLoop.trigger({
          ...box.input,
          ...(spec
            ? {
                spec: {
                  author: profile,
                  fix: null,
                  reviewers: [{ name: 'design', profile, invocation: null }],
                  maxRounds: 1,
                  template: null,
                  reviewTemplate: null,
                  templateFiles: { template: null, reviewTemplate: null },
                },
              }
            : {}),
          fakeScenario: {
            failIterations: 0,
            latencyMs: { min: 2000, max: 2000 },
          },
        })
        execution = durably.processOne()
        const name = spec ? 'spec:author' : 'stage:0:code:agent'
        await until(
          async () =>
            (await durably.getStepAttempts(run.id)).some(
              (a) =>
                a.stepName === name &&
                (a.metadata as { invocationStartedAt?: string } | null)
                  ?.invocationStartedAt,
            ),
          'agent call is sent',
        )
        await durably.storage.updateRun(run.id, {
          leaseExpiresAt: new Date(0).toISOString(),
        })
        await execution
        await durably.processOne()
        const stopped = await durably.getRun(run.id)
        assert.equal(stopped?.status, 'failed')
        assert.equal(
          (await classifyRun(durably, stopped!))?.kind,
          'uncertain-invocation',
        )
        const setup = await box.setup(run.id)
        const before = await readdir(setup.checkpointsDir)
        await assert.rejects(
          resumeUncertainRun(durably, run.id, false),
          /acknowledge-uncertain/,
        )
        const lock = acquireWorkerLock(durably.stateRoot)
        assert.ok(lock.acquired)
        try {
          await assert.rejects(
            resumeUncertainRun(durably, run.id, true),
            /stop the live worker/,
          )
        } finally {
          lock.release()
        }
        assert.deepEqual(await readdir(setup.checkpointsDir), before)
        if (spec) {
          // Exercise the real CLI, with an isolated HOME and auto-start off.
          const result = await runChild(
            process.execPath,
            [
              '--import',
              'tsx',
              fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
              'resume',
              '--run',
              run.id,
              '--acknowledge-uncertain',
              '--no-auto-worker',
            ],
            {
              cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
              env: { ...process.env, HOME: box.root },
              timeoutMs: 10000,
            },
          )
          assert.equal(result.code, 0, result.stderr)
          assert.match(result.stdout, /owner acknowledged resending/)
        } else await resumeUncertainRun(durably, run.id, true)
        assert.equal((await durably.getRun(run.id))?.status, 'pending')
        assert.equal((await buildReport(durably, run.id)).runElapsedMs, null)
        assert.ok(
          (await readdir(setup.checkpointsDir)).some((p) =>
            p.includes('.acknowledged-'),
          ),
        )
        await writeFile(join(durably.stateRoot, 'runs', run.id, 'release'), '')
        await durably.processOne()
        const final = await durably.getRun(run.id)
        assert.equal(final?.status, 'completed', final?.error ?? '')
        assert.equal(
          (final!.output as { conclusion: string }).conclusion,
          'approved',
        )
        await assert.rejects(
          resumeUncertainRun(durably, run.id, true),
          /not failed/,
        )
      } finally {
        await execution
        await durably.db.destroy()
        await rm(box.root, { recursive: true, force: true })
      }
    })
  }

  it('reclaims a future lease only with the held lock for its own state root', async () => {
    const box = await fixture()
    const { durably } = box
    try {
      const run = await durably.jobs.agentLoop.trigger(box.input)
      const now = new Date().toISOString()
      const leased = await durably.storage.claimNext(
        'dead-worker',
        now,
        LEASE_MS,
      )
      assert.equal(leased?.id, run.id)
      const lock = acquireWorkerLock(durably.stateRoot)
      assert.ok(lock.acquired)
      try {
        assert.equal(acquireWorkerLock(durably.stateRoot).acquired, false)
        const other = acquireWorkerLock(join(box.root, 'other'))
        assert.ok(other.acquired)
        try {
          await assert.rejects(
            reclaimWorkerLeases(durably, other),
            /this state root/,
          )
        } finally {
          other.release()
        }
        assert.deepEqual(await reclaimWorkerLeases(durably, lock), [run.id])
        const next = await durably.storage.claimNext(
          'new-worker',
          new Date().toISOString(),
          LEASE_MS,
        )
        assert.equal(next?.id, run.id)
        assert.equal(next?.leaseGeneration, leased!.leaseGeneration + 1)
      } finally {
        lock.release()
      }
      await assert.rejects(
        reclaimWorkerLeases(durably, lock),
        /held worker lock/,
      )
    } finally {
      await durably.db.destroy()
      await rm(box.root, { recursive: true, force: true })
    }
  })
})
