/**
 * Later review rounds block only on earlier blockers and on the repair
 * (ADR-0062): the prompts of round 1 and of later rounds, code and spec, in
 * every review form; the state that remembers the earlier round; the
 * findings mark; the report count; and the config version.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { laterRoundNonBlockersOf } from '../src/engine/build-report.js'
import type { LoopReport } from '../src/engine/report.js'
import { wholeChangeReviewReport } from '../src/engine/reviewer-presentation.js'
import type { CandidateChanges } from '../src/engine/types.js'
import { configVersionOf } from '../src/engine/versions.js'
import {
  INSTRUCTIONS_VERSION,
  promptVersionOf,
} from '../src/factory/prompt-version.js'
import {
  LOCAL_INSTRUCTIONS_INPUT,
  localInstructions,
  earlierBlockersOf,
  NO_EARLIER_FINDINGS_BLOCKERS,
  parseFindingsOutput,
  reviewLocations,
  reviewPrompt,
  specReviewLocations,
  specReviewPrompt,
  type ReviewRoundScope,
  type SpecRoundScope,
} from '../src/factory/prompts.js'
import { reduce } from '../src/factory/reducer.js'
import { reviewInputOf, reviewRoundScopeOf } from '../src/factory/stages.js'
import { initialState, type FactorySetup } from '../src/factory/types.js'

const changes: CandidateChanges = {
  diffPath: '/c/changes.diff',
  changedFilesPath: '/c/changed-files.txt',
  files: 2,
  additions: 3,
  deletions: 1,
}
const repairChanges: CandidateChanges = {
  diffPath: '/c/repair-from-candidate-1-aaa.diff',
  changedFilesPath: '/c/repair-from-candidate-1-aaa-changed-files.txt',
  files: 1,
  additions: 2,
  deletions: 1,
}
const task = [{ label: 'TASK' as const, content: 'do it' }]
const first: ReviewRoundScope = { round: 'first' }
const later: ReviewRoundScope = {
  round: 'later',
  earlierBlockers: 'review-a:\n- blocker: totals are wrong',
  earlierCandidate: 'candidate-1-aaa',
  repairChanges,
}
const specLater: SpecRoundScope = {
  round: 'later',
  earlierBlockers: 'a:\n- blocker: no acceptance criteria',
  previousSpecPath: '/run/spec-revisions/round-2-previous.md',
  revisionDiffPath: '/run/spec-revisions/round-2.diff',
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const code = (
  output: 'verdict' | 'findings-json',
  roundScope: ReviewRoundScope | null,
  extra: Parameters<typeof reviewPrompt>[6] = {},
  fromFindings: Parameters<typeof reviewPrompt>[5] = null,
) =>
  reviewPrompt(
    'correctness',
    'trusted',
    ['rule a'],
    task,
    changes,
    fromFindings,
    {
      promptVersion: 4,
      output,
      roundScope,
      ...extra,
    },
  )
const spec = (
  output: 'verdict' | 'findings-json',
  roundScope: SpecRoundScope | null,
  extra: Partial<Parameters<typeof specReviewPrompt>[0]> = {},
) =>
  specReviewPrompt({
    promptVersion: 4,
    name: 'a',
    worktree: '/w',
    specPath: '/s/spec.md',
    reviewTemplate: null,
    untrusted: task,
    output,
    roundScope,
    ...extra,
  })

describe('later-round review prompts (ADR-0062)', () => {
  it('pins v8, and keeps the v7 bytes for "whole" and for a v7 replay', () => {
    assert.equal(INSTRUCTIONS_VERSION, 'local-factory.v8')
    assert.equal(promptVersionOf('local-factory.v8'), 4)
    assert.equal(promptVersionOf('local-factory.v7'), 3)
    // Captured from the preceding committed implementation, before this edit.
    const v7 = {
      verdict:
        '0060035233359f45bf6d0d445280eb3205793a4aa1b384e2fd74aeb8dd3dbc39',
      findings:
        'a48f61162d1886abc735ee7b2be19052f6869c3d9c4024603a7e1088b39f711b',
      spec: 'b57d8fc228dd19f13a0305242173351dabc56d9391fa7d426bbb6594a298a6a1',
    }
    for (const promptVersion of [3, 4] as const) {
      assert.equal(
        sha(
          reviewPrompt(
            'correctness',
            'trusted',
            ['rule a'],
            task,
            changes,
            null,
            {
              promptVersion,
            },
          ),
        ),
        v7.verdict,
      )
      assert.equal(
        sha(
          reviewPrompt(
            'edge-cases',
            'trusted',
            ['rule a'],
            task,
            changes,
            'review-cap-reached',
            { promptVersion, output: 'findings-json', blockerThreshold: 5 },
          ),
        ),
        v7.findings,
      )
      assert.equal(
        sha(
          specReviewPrompt({
            promptVersion,
            name: 'a',
            worktree: '/w',
            specPath: '/s/spec.md',
            reviewTemplate: null,
            untrusted: task,
            output: 'findings-json',
          }),
        ),
        v7.spec,
      )
    }
  })

  it('tells round 1 of code and spec review to report every blocker now', () => {
    for (const output of ['verdict', 'findings-json'] as const) {
      assert.match(
        code(output, first),
        /first review round of this change\. Report every blocker you find in this round/,
      )
      assert.match(
        spec(output, { round: 'first' }),
        /first review round of this spec\. Report every blocker you find in this round/,
      )
      for (const prompt of [
        code(output, first),
        spec(output, { round: 'first' }),
      ]) {
        assert.doesNotMatch(prompt, /later review round:/)
        assert.doesNotMatch(prompt, /EARLIER_BLOCKERS/)
      }
      // "whole" gets neither line: its stated reason would be false.
      assert.doesNotMatch(code(output, null), /Report every blocker you find/)
      assert.doesNotMatch(spec(output, null), /Report every blocker you find/)
    }
  })

  it('limits a later code round to the three reasons, with the earlier blockers and the repair diff, in every review form', () => {
    for (const output of ['verdict', 'findings-json'] as const) {
      const prompt = code(output, later)
      assert.match(
        prompt,
        /This is a later review round: this candidate repairs candidate-1-aaa/,
      )
      assert.match(prompt, /Read the whole change as before/)
      assert.match(
        prompt,
        /1\. a blocker in EARLIER_BLOCKERS that this candidate does not fix;/,
      )
      assert.match(
        prompt,
        /2\. a defect the repair introduced, wherever it shows;/,
      )
      assert.match(prompt, /3\. a problem inside the repair's diff\./)
      assert.match(
        prompt,
        /<<<UNTRUSTED EARLIER_BLOCKERS [0-9a-f]{16}>>>\nreview-a:\n- blocker: totals are wrong\n<<<END UNTRUSTED EARLIER_BLOCKERS/,
      )
      assert.match(
        prompt,
        /REPAIR CHANGES \(written by the factory from candidate-1-aaa to this candidate commit\):/,
      )
      assert.match(
        prompt,
        /- Repair diff: \/c\/repair-from-candidate-1-aaa\.diff/,
      )
      assert.match(
        prompt,
        /- Repair changed file list: \/c\/repair-from-candidate-1-aaa-changed-files\.txt/,
      )
      assert.doesNotMatch(prompt, /first review round/)
      // A replacement work policy removes the rules, never this one.
      const replaced = code(output, later, {
        policy: {
          mode: 'replace',
          path: '/p.md',
          content: 'Our own review policy.',
          sha256: 'x',
        },
      })
      assert.doesNotMatch(replaced, /- rule a/)
      assert.match(replaced, /1\. a blocker in EARLIER_BLOCKERS/)
      // The local-instructions and command forms carry the same context.
      assert.equal(reviewInputOf(true, null, prompt), LOCAL_INSTRUCTIONS_INPUT)
      assert.ok(localInstructions(prompt).includes(prompt))
      assert.ok(reviewInputOf(false, 'run review', prompt).endsWith(prompt))
    }
    assert.match(
      code('findings-json', later),
      /Add "laterRoundException": "outside-repair" to each non-blocker that is one only because of this rule/,
    )
    assert.doesNotMatch(code('verdict', later), /laterRoundException/)
    assert.match(
      code('verdict', later),
      /answer needsChanges only for one of the reasons above, and list every other problem in NOTES, marked as not blocking/,
    )
    // A command reviewer's locations file names the repair diff too.
    const locations = reviewLocations({
      worktree: '/w',
      changes,
      snapshots: { baseDir: '/b', headDir: '/h' },
      repairChanges,
    })
    assert.match(
      locations,
      /- Repair diff: \/c\/repair-from-candidate-1-aaa\.diff/,
    )
    assert.doesNotMatch(
      reviewLocations({
        worktree: '/w',
        changes,
        snapshots: { baseDir: '/b', headDir: '/h' },
      }),
      /Repair diff/,
    )
  })

  it('rewords a review-cap-reached repair base for a later round, and keeps it for round 1', () => {
    const scoped = code('findings-json', later, {}, 'review-cap-reached')
    assert.match(
      scoped,
      /the later-round rule in CHECK decides which findings may block/,
    )
    assert.doesNotMatch(scoped, /so judge the candidate as a whole/)
    assert.match(
      code('findings-json', first, {}, 'review-cap-reached'),
      /so judge the candidate as a whole/,
    )
  })

  it('limits a later spec round to an unaddressed earlier blocker or a problem the revision introduced', () => {
    for (const output of ['verdict', 'findings-json'] as const) {
      const prompt = spec(output, specLater)
      assert.match(
        prompt,
        /- Spec version the earlier round reviewed \(read-only\): \/run\/spec-revisions\/round-2-previous\.md/,
      )
      assert.match(
        prompt,
        /- Revision diff, from that version to this spec file \(read-only\): \/run\/spec-revisions\/round-2\.diff/,
      )
      assert.match(
        prompt,
        /1\. a blocker in EARLIER_BLOCKERS that the revision does not address;/,
      )
      assert.match(prompt, /2\. a problem the revision introduced/)
      assert.match(
        prompt,
        /<<<UNTRUSTED EARLIER_BLOCKERS [0-9a-f]{16}>>>\na:\n- blocker: no acceptance criteria/,
      )
      const replaced = spec(output, specLater, {
        policy: {
          mode: 'replace',
          path: '/p.md',
          content: 'Our own spec policy.',
          sha256: 'x',
        },
      })
      assert.match(replaced, /1\. a blocker in EARLIER_BLOCKERS/)
      assert.ok(localInstructions(prompt).includes(prompt))
    }
    assert.match(
      spec('findings-json', specLater),
      /"laterRoundException": "outside-repair"/,
    )
    assert.doesNotMatch(spec('verdict', specLater), /laterRoundException/)
    const locations = specReviewLocations({
      worktree: '/w',
      specPath: '/s/spec.md',
      roundScope: specLater,
    })
    assert.match(locations, /round-2-previous\.md/)
    assert.match(locations, /round-2\.diff/)
  })

  it('keeps the mark on a non-blocker only, and drops an unknown value without failing the reply', () => {
    const parsed = parseFindingsOutput(
      [
        'PLAN: check',
        '```json',
        JSON.stringify([
          {
            severity: 'non-blocker',
            title: 'a',
            body: 'b',
            laterRoundException: 'outside-repair',
          },
          {
            severity: 'non-blocker',
            title: 'c',
            body: 'd',
            laterRoundException: 'other',
          },
          {
            severity: 'blocker',
            title: 'e',
            body: 'f',
            laterRoundException: 'outside-repair',
          },
        ]),
        '```',
        'REVIEW_STATUS: COMPLETE',
      ].join('\n'),
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok || !parsed.findings) throw new Error('findings expected')
    assert.deepEqual(
      parsed.findings.nonBlocker.map((f) => f.laterRoundException),
      ['outside-repair', undefined],
    )
    assert.equal(parsed.findings.blocker[0]?.laterRoundException, undefined)
  })
})

function profile(role: string) {
  return {
    id: `fake:m:low:${role}`,
    provider: 'fake' as const,
    requestedModel: 'm',
    requestedEffort: 'low',
    effectiveModel: 'm',
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
  instructionsVersion: 'local-factory.v8',
  configVersion: 'cfg-test',
  profiles: {
    code: profile('code'),
    correctness: profile('correctness'),
    'edge-cases': profile('edge-cases'),
  },
  maxIterations: 3,
  agentTimeoutMs: 1,
  autoApprove: false,
  reviewLaterRounds: 'scoped',
  review: {
    correctness: { command: null, context: 'prompt', output: 'findings-json' },
  },
}
const cand = (n: number) => ({
  id: `candidate-${n}`,
  snapshotDir: `/tmp/candidate-${n}`,
  sourceHash: `source-${n}`,
  acceptanceHash: 'acceptance',
  changes,
})

describe('which round a code review is (ADR-0062)', () => {
  const target = (calls: string[]) => ({
    repairChanges: async (from: { id: string }, to: { id: string }) => {
      calls.push(`${from.id}->${to.id}`)
      return repairChanges
    },
  })

  it('keeps the last blocked round across a repair and a failed check, and diffs from its candidate', async () => {
    let state = initialState(setup)
    const calls: string[] = []
    state = reduce(state, {
      type: 'code.completed',
      role: 'implement',
      candidate: cand(1),
      session: null,
    })
    assert.deepEqual(await reviewRoundScopeOf(state, cand(1), target(calls)), {
      round: 'first',
    })
    state = reduce(state, {
      type: 'verify.completed',
      targetId: 'candidate-1',
      passed: true,
      stdout: 'ok',
      exitCode: 0,
    })
    state = reduce(state, {
      type: 'review.completed',
      targetId: 'candidate-1',
      reviews: [
        {
          lens: 'correctness',
          decision: 'needsChanges',
          notes: '- blocker: totals',
        },
        { lens: 'edge-cases', decision: 'pass', notes: 'ok' },
      ],
    })
    // The same candidate again is a first round.
    assert.deepEqual(await reviewRoundScopeOf(state, cand(1), target(calls)), {
      round: 'first',
    })
    state = reduce(state, {
      type: 'code.completed',
      role: 'repair',
      candidate: cand(2),
      session: null,
    })
    state = reduce(state, {
      type: 'verify.completed',
      targetId: 'candidate-2',
      passed: false,
      stdout: 'fail',
      exitCode: 1,
    })
    state = reduce(state, {
      type: 'code.completed',
      role: 'repair',
      candidate: cand(3),
      session: null,
    })
    const scope = await reviewRoundScopeOf(state, cand(3), target(calls))
    assert.deepEqual(scope, {
      round: 'later',
      earlierBlockers: 'review-a:\n- blocker: totals',
      earlierCandidate: 'candidate-1',
      repairChanges,
    })
    assert.deepEqual(calls, ['candidate-1->candidate-3'])
    // A passing round does not replace the blocked one.
    state = reduce(state, {
      type: 'verify.completed',
      targetId: 'candidate-3',
      passed: true,
      stdout: 'ok',
      exitCode: 0,
    })
    state = reduce(state, {
      type: 'review.completed',
      targetId: 'candidate-3',
      reviews: [
        { lens: 'correctness', decision: 'pass', notes: 'ok' },
        { lens: 'edge-cases', decision: 'pass', notes: 'ok' },
      ],
    })
    assert.equal(state.blockedRound?.candidate.id, 'candidate-1')
  })

  it("leaves a verdict review's notes out of EARLIER_BLOCKERS", async () => {
    let state = initialState(setup)
    state = reduce(state, {
      type: 'code.completed',
      role: 'implement',
      candidate: cand(1),
      session: null,
    })
    state = reduce(state, {
      type: 'verify.completed',
      targetId: 'candidate-1',
      passed: true,
      stdout: 'ok',
      exitCode: 0,
    })
    state = reduce(state, {
      type: 'review.completed',
      targetId: 'candidate-1',
      reviews: [
        { lens: 'correctness', decision: 'pass', notes: 'ok' },
        {
          lens: 'edge-cases',
          decision: 'needsChanges',
          notes: 'one capped line, advice included',
        },
      ],
    })
    state = reduce(state, {
      type: 'code.completed',
      role: 'repair',
      candidate: cand(2),
      session: null,
    })
    const scope = await reviewRoundScopeOf(state, cand(2), target([]))
    assert.equal(scope?.round, 'later')
    assert.equal(
      scope?.round === 'later' ? scope.earlierBlockers : null,
      NO_EARLIER_FINDINGS_BLOCKERS,
    )
    assert.equal(
      earlierBlockersOf(
        [
          { lens: 'correctness', decision: 'needsChanges', notes: '- a' },
          { lens: 'edge-cases', decision: 'needsChanges', notes: 'b' },
          { lens: 'correctness', decision: 'pass', notes: 'c' },
        ],
        (lens) => lens === 'correctness',
      ),
      'review-a:\n- a',
    )
  })

  it('is null for "whole" and a run set up before the setting', async () => {
    const { reviewLaterRounds: _, ...before } = setup
    for (const s of [
      { ...setup, reviewLaterRounds: 'whole' as const },
      before,
    ]) {
      const state = initialState(s)
      assert.equal(await reviewRoundScopeOf(state, cand(1), target([])), null)
    }
  })

  it("continues a review-cap-reached parent's last round in a repair run's first review", async () => {
    const state = initialState({
      ...setup,
      repairOf: {
        runId: 'parent',
        candidateCommit: 'c'.repeat(40),
        parentConclusion: 'review-cap-reached',
        parentBlockers: '# Review findings\n- totals',
      },
    })
    assert.deepEqual(await reviewRoundScopeOf(state, cand(1), target([])), {
      round: 'later',
      earlierBlockers: '# Review findings\n- totals',
      earlierCandidate: `commit ${'c'.repeat(40)}, the last candidate of factory run parent`,
      repairChanges: changes,
    })
    // Without the parent's blockers, the first review is round 1.
    const plain = initialState({
      ...setup,
      repairOf: {
        runId: 'parent',
        candidateCommit: 'c'.repeat(40),
        parentConclusion: 'approved',
      },
    })
    assert.deepEqual(await reviewRoundScopeOf(plain, cand(1), target([])), {
      round: 'first',
    })
  })
})

describe('later-round report and version (ADR-0062)', () => {
  it('counts the marked non-blockers by stage, round and reviewer', () => {
    const finding = (laterRoundException?: 'outside-repair') => ({
      severity: 'non-blocker' as const,
      title: 't',
      body: 'b',
      ...(laterRoundException ? { laterRoundException } : {}),
    })
    const review = (
      lens: string,
      nonBlocker: ReturnType<typeof finding>[],
    ) => ({
      lens,
      decision: 'pass' as const,
      notes: 'ok',
      findings: {
        blocker: [],
        nonBlocker,
        counts: { blocker: 0, nonBlocker: nonBlocker.length },
      },
    })
    const rows = laterRoundNonBlockersOf([
      {
        stage: 'code',
        rounds: [
          {
            round: 1,
            sequence: 1,
            candidate: null,
            reviews: [review('correctness', [finding()])],
          },
          // Discarded beside a failed check: not a round the state counts.
          {
            round: 2,
            sequence: 2,
            candidate: null,
            status: 'discarded',
            reviews: [review('correctness', [finding('outside-repair')])],
          },
          {
            round: 2,
            sequence: 2,
            candidate: null,
            reviews: [
              review('correctness', [
                finding('outside-repair'),
                finding('outside-repair'),
                finding(),
              ]),
              review('edge-cases', [finding()]),
            ],
          },
        ],
      },
      {
        stage: 'spec',
        rounds: [
          {
            round: 2,
            sequence: 2,
            candidate: null,
            reviews: [review('a', [finding('outside-repair')])],
          },
        ],
      },
    ] as Parameters<typeof laterRoundNonBlockersOf>[0])
    assert.deepEqual(rows, [
      { stage: 'code', round: 2, lens: 'correctness', count: 2 },
      { stage: 'spec', round: 2, lens: 'a', count: 1 },
    ])
    const report = wholeChangeReviewReport(
      {
        laterRoundNonBlockers: rows,
        reviewLaterRounds: 'scoped',
        reviews: [],
        reviewRounds: [],
        roleUsage: [],
        preflight: null,
        reviewHighlights: {
          lastPasses: [],
          earlier: { verdicts: [] },
          left: { verdicts: [] },
          open: { verdicts: [] },
        },
      } as unknown as LoopReport,
      'local-factory.v8',
    )
    assert.deepEqual(
      report.laterRoundNonBlockers?.map((r) => r.lens),
      ['review-a', 'a'],
    )
  })

  it('hashes "scoped" only, so a "whole" run keeps its version', () => {
    const base = {
      contextMode: 'reuse' as const,
      instructionsVersion: 'local-factory.v8',
      maxIterations: 2,
      target: 'repo:true',
      agentTimeoutMs: 1,
      checkTimeoutMs: 1,
      agentIdleTimeoutMs: 1,
      code: profile('code'),
      correctness: profile('correctness'),
      edgeCases: profile('edge-cases'),
    } as Parameters<typeof configVersionOf>[0]
    assert.equal(
      configVersionOf(base),
      configVersionOf({ ...base, reviewLaterRounds: 'whole' }),
    )
    assert.notEqual(
      configVersionOf(base),
      configVersionOf({ ...base, reviewLaterRounds: 'scoped' }),
    )
  })
})
