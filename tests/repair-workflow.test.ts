import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { automaticRetries } from '../src/automatic-retry.js'
import { createAgentDurably } from '../src/durably.js'
import { buildReport } from '../src/engine/build-report.js'
import { runChild } from '../src/engine/child.js'
import { reportToMarkdown } from '../src/engine/report.js'
import { promptHash } from '../src/factory/prompt-policy.js'
import type { FactorySetup, TestProbeRecord } from '../src/factory/types.js'
import {
  buildRepairInput,
  startableRecheck,
  startableRepair,
  readRepairFiles,
} from '../src/trigger-input.js'

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

describe('failure recovery and scoped rechecks', { timeout: 180000 }, () => {
  for (const [kind, script] of [
    ['timeout', 'setTimeout(() => {}, 30000)'],
    [
      'setup',
      'console.error("install failed: dependency unavailable"); process.exit(1)',
    ],
    ['test', 'console.error("not ok 1 - assertion failed"); process.exit(1)'],
    ['unknown', 'console.error("unrecognised failure"); process.exit(1)'],
  ] as const) {
    it(`records ${kind} and preserves repair budget for environmental failures`, async () => {
      const b = await box()
      try {
        const run = await b.durably.jobs.agentLoop.trigger({
          ...b.input,
          maxIterations: 3,
          checkTimeoutMs: kind === 'timeout' ? 20 : 10000,
          fakeScenario: {
            ...b.input.fakeScenario,
            changes: { 'check.mjs': script },
          },
        })
        b.start()
        const done = await b.settled(run.id)
        assert.equal(done.status, 'completed', done.error ?? '')
        const report = await buildReport(b.durably, run.id)
        assert.equal(report.failure?.checkFailure, kind)
        assert.match(
          reportToMarkdown(report),
          new RegExp(`check failed \\(${kind}\\)`),
        )
        const output = done.output as { iterations: number }
        assert.equal(
          output.iterations,
          ['timeout', 'setup'].includes(kind) ? 1 : 3,
        )
        if (['timeout', 'setup'].includes(kind))
          assert.match(report.failure!.humanCheck, /suspected environment/)
      } finally {
        await b.close()
      }
    })
  }

  for (const [reason, providerError] of [
    ['provider-capacity', 'Selected model is at capacity'],
    ['provider-capacity', 'Rate limit exceeded (429)'],
    ['review-incomplete', null],
  ] as const) {
    it(`automatically retriggers ${providerError ?? reason} once, records its parent and survives another scan`, async () => {
      const b = await box()
      try {
        const run = await b.durably.jobs.agentLoop.trigger({
          ...b.input,
          automaticRetryLimit: 1,
          fakeScenario:
            reason === 'provider-capacity'
              ? { providerError }
              : {
                  ...b.input.fakeScenario,
                  reviewSequence: ['invalid', 'invalid'],
                },
        })
        b.start()
        assert.equal((await b.settled(run.id)).status, 'failed')
        const deadline = Date.now() + 20000
        let children: Awaited<ReturnType<typeof b.durably.getRuns>> = []
        while (Date.now() < deadline) {
          children = (await b.durably.getRuns()).filter(
            (r) =>
              (r.input as { retryOf?: { runId: string } }).retryOf?.runId ===
              run.id,
          )
          if (children.length) break
          // sleep-ok(poll): wait for the worker's automatic follow-up to be stored
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        assert.equal(children.length, 1)
        const child = children[0]!
        assert.equal((await b.settled(child.id)).status, 'failed')
        const report = await buildReport(b.durably, child.id)
        assert.deepEqual(report.retryOf, {
          runId: run.id,
          rootRunId: run.id,
          attempt: 1,
          reason,
        })
        assert.match(
          reportToMarkdown(report),
          new RegExp(`retry of: ${run.id}`),
        )
        const recovery = automaticRetries(
          b.durably,
          () => false,
          () => {},
        )
        try {
          await recovery.scan()
          await recovery.scan()
        } finally {
          await recovery.stop()
        }
        assert.equal((await b.durably.getRuns()).length, 2)
      } finally {
        await b.close()
      }
    })
  }

  it('does not retry a different unknown provider error', async () => {
    const b = await box()
    try {
      const run = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        automaticRetryLimit: 1,
        fakeScenario: { providerError: 'connection lost after request' },
      })
      b.start()
      await b.settled(run.id)
      const recovery = automaticRetries(
        b.durably,
        () => false,
        () => {},
      )
      try {
        await recovery.scan()
      } finally {
        await recovery.stop()
      }
      assert.equal((await b.durably.getRuns()).length, 1)
      assert.equal(
        (await buildReport(b.durably, run.id)).failure?.retryable,
        false,
      )
    } finally {
      await b.close()
    }
  })

  it('keeps scope trusted for repair and review, then rechecks exactly that candidate without code calls or findings', async () => {
    const b = await box()
    try {
      const parent = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        fakeScenario: {
          ...b.input.fakeScenario,
          scopeRequirement: 'spec §3 browser dashboard',
        },
      })
      b.start()
      const done = await b.settled(parent.id)
      assert.equal(
        (done.output as { conclusion: string }).conclusion,
        'review-cap-reached',
      )
      const path = join(b.home, 'scope.md')
      const scope =
        'Excluded requirement: spec §3 browser dashboard. Sandbox: no browser, Docker or network.'
      await writeFile(path, scope)
      const files = await readRepairFiles({
        run: parent.id,
        'scope-file': path,
      })
      const built = buildRepairInput(
        done,
        await b.setup(parent.id),
        {
          ...files,
          findings: {
            content: 'F1: Keep the decimal addition fix.',
            ref: { path: '/tmp/findings.md' },
          },
        },
        {
          ...b.input.fakeScenario,
          scopeRequirement: 'spec §3 browser dashboard',
        },
      )
      const repair = await b.durably.jobs.agentLoop.trigger(built.input, {
        idempotencyKey: built.idempotencyKey,
        labels: built.labels,
      })
      const repaired = await b.settled(repair.id)
      assert.equal(
        (repaired.output as { conclusion: string }).conclusion,
        'approved',
        repaired.error ?? '',
      )
      const report = await buildReport(b.durably, repair.id)
      assert.equal(report.inputs.scope?.content, scope)
      assert.match(reportToMarkdown(report), /Repair scope \(trusted\)/)
      assert.equal(
        report.reviews.every((r) => r.decision === 'pass'),
        true,
      )
      const check = await startableRecheck(b.durably, repair.id)
      const recheck = await b.durably.jobs.agentLoop.trigger(check.input, {
        idempotencyKey: check.idempotencyKey,
        labels: check.labels,
      })
      const checked = await b.settled(recheck.id)
      assert.equal(checked.status, 'completed', checked.error ?? '')
      assert.equal(
        (checked.output as { conclusion: string }).conclusion,
        'approved',
      )
      assert.equal(
        (checked.output as { candidate: { commit: string } }).candidate.commit,
        (repaired.output as { candidate: { commit: string } }).candidate.commit,
      )
      const steps = await b.durably.storage.getSteps(recheck.id)
      assert.equal(
        steps.some((s) => s.name.includes(':code:')),
        false,
      )
      assert.equal((check.input as { repairOf?: unknown }).repairOf, undefined)
      const recheckedReport = await buildReport(b.durably, recheck.id)
      assert.equal(recheckedReport.recheckOf?.runId, repair.id)
      assert.equal(recheckedReport.inputs.findings, null)
      const again = await b.durably.jobs.agentLoop.trigger(check.input, {
        idempotencyKey: check.idempotencyKey,
        labels: check.labels,
      })
      assert.equal(again.id, recheck.id)
      const cli = await runChild(
        join(packageRoot, 'node_modules/.bin/tsx'),
        [
          join(packageRoot, 'src/cli.ts'),
          'recheck',
          '--run',
          repair.id,
          '--no-auto-worker',
        ],
        {
          cwd: b.home,
          env: { ...process.env, HOME: b.home },
          timeoutMs: 10000,
        },
      )
      assert.equal(cli.code, 0, cli.stderr)
      assert.match(cli.stdout, new RegExp(recheck.id))
      assert.match(cli.stdout, /already rechecked as/)
      const moved = await runChild(
        'git',
        [
          'update-ref',
          `refs/heads/${check.input.recheckOf.candidateBranch}`,
          b.base,
        ],
        { cwd: b.repo, timeoutMs: 10000 },
      )
      assert.equal(moved.code, 0, moved.stderr)
      await assert.rejects(
        startableRecheck(b.durably, repair.id),
        /candidate branch .* moved/,
      )
    } finally {
      await b.close()
    }
  })
})

it(
  'builds default repair findings from a failed recheck without asking for a findings file',
  { timeout: 60000 },
  async () => {
    const b = await box()
    try {
      const parent = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        fakeScenario: {
          ...b.input.fakeScenario,
          changes: {
            'check.mjs':
              "import { existsSync } from 'node:fs'; if (existsSync(process.env.HOME + '/check-fails')) { console.error('not ok 1 - environment flag'); process.exit(1) }",
          },
        },
      })
      b.start()
      const done = await b.settled(parent.id)
      assert.equal(
        (done.output as { conclusion: string }).conclusion,
        'approved',
      )
      await writeFile(join(b.home, 'check-fails'), 'fail')
      const built = await startableRecheck(b.durably, parent.id)
      const recheck = await b.durably.jobs.agentLoop.trigger(built.input, {
        idempotencyKey: built.idempotencyKey,
        labels: built.labels,
      })
      const checked = await b.settled(recheck.id)
      assert.equal(
        (checked.output as { conclusion: string }).conclusion,
        'verification-failed',
      )
      const repair = await startableRepair(b.durably, recheck.id, {
        findings: null,
        dispositions: null,
      })
      assert.match(
        repair.input.repairOf.findings,
        /not ok 1 - environment flag/,
      )
      assert.equal(repair.input.repairOf.runId, recheck.id)
      assert.equal(
        repair.input.target.baseRef,
        built.input.recheckOf.candidateCommit,
      )
    } finally {
      await b.close()
    }
  },
)

it(
  'honours a disabled automatic retry policy despite an explicit capacity error',
  { timeout: 60000 },
  async () => {
    const b = await box()
    try {
      const run = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        automaticRetryLimit: 0,
        fakeScenario: { providerError: 'Selected model is at capacity' },
      })
      b.start()
      await b.settled(run.id)
      const recovery = automaticRetries(
        b.durably,
        () => false,
        () => {},
      )
      try {
        await recovery.scan()
      } finally {
        await recovery.stop()
      }
      assert.equal((await b.durably.getRuns()).length, 1)
    } finally {
      await b.close()
    }
  },
)

it(
  'rechecks when unused triage, implementation and repair profiles are no longer available',
  { timeout: 60000 },
  async () => {
    const b = await box()
    try {
      const profile = {
        provider: 'fake' as const,
        requestedModel: null,
        requestedEffort: null,
      }
      const parent = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        profiles: {
          code: profile,
          correctness: profile,
          'edge-cases': profile,
          triage: { ...profile, requestedModel: 'triage-ok' },
        },
      })
      b.start()
      assert.equal((await b.settled(parent.id)).status, 'completed')
      const built = await startableRecheck(b.durably, parent.id)
      const profiles = built.input.recheckOf.profiles
      profiles.triage = {
        ...profiles.code,
        requestedModel: 'unlisted-triage-now-unavailable',
      }
      profiles.code = {
        ...profiles.code,
        requestedModel: 'unlisted-code-now-unavailable',
      }
      profiles.repair = {
        ...profiles.code,
        requestedModel: 'unlisted-repair-now-unavailable',
      }
      const next = await b.durably.jobs.agentLoop.trigger(built.input, {
        idempotencyKey: built.idempotencyKey,
        labels: built.labels,
      })
      const done = await b.settled(next.id)
      assert.equal(done.status, 'completed', done.error ?? '')
      assert.equal(
        (done.output as { conclusion: string }).conclusion,
        'approved',
      )
      const report = await buildReport(b.durably, next.id)
      assert.equal(
        report.preflight?.checks.some((c) =>
          c.roles.some((r) => ['code', 'repair', 'triage'].includes(r)),
        ),
        false,
      )
    } finally {
      await b.close()
    }
  },
)

it(
  'runs with stored policies after their source disappears, preserving them through repair and recheck',
  { timeout: 60000 },
  async () => {
    const b = await box()
    try {
      const path = join(b.home, 'policy.md')
      await writeFile(path, 'OWNER POLICY ORIGINAL')
      const prompts = {
        implement: {
          mode: 'replace' as const,
          path,
          content: 'OWNER POLICY ORIGINAL',
          sha256: promptHash('OWNER POLICY ORIGINAL'),
        },
      }
      const parent = await b.durably.jobs.agentLoop.trigger({
        ...b.input,
        prompts,
      })
      await writeFile(path, 'OWNER POLICY EDITED')
      b.start()
      const done = await b.settled(parent.id)
      assert.equal(
        (done.output as { conclusion: string }).conclusion,
        'approved',
        done.error ?? '',
      )
      const setup = await b.setup(parent.id)
      assert.deepEqual(setup.prompts, prompts)
      const repair = buildRepairInput(done, setup, {
        findings: {
          content: 'Keep totals unchanged.',
          ref: { path: '/findings.md' },
        },
        dispositions: null,
      })
      assert.deepEqual(repair.input.prompts, prompts)
      const check = await startableRecheck(b.durably, parent.id)
      assert.deepEqual(check.input.prompts, prompts)
      assert.equal(
        (await buildReport(b.durably, parent.id)).prompts?.implement?.content,
        'OWNER POLICY ORIGINAL',
      )
    } finally {
      await b.close()
    }
  },
)
