/**
 * One blocking rule for both code reviewers (ADR-0063): the rule's lines in
 * every review form, the test and check finding rule, the mark, the report
 * count, and the v8 bytes a replay keeps.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { blockingRuleNonBlockersOf } from '../src/engine/build-report.js'
import type { CandidateChanges } from '../src/engine/types.js'
import {
  INSTRUCTIONS_VERSION,
  promptVersionOf,
} from '../src/factory/prompt-version.js'
import {
  blockerThresholdRules,
  localInstructions,
  parseFindingsOutput,
  reviewPrompt,
} from '../src/factory/prompts.js'
import { reviewInputOf } from '../src/factory/stages.js'

const changes: CandidateChanges = {
  diffPath: '/c/changes.diff',
  changedFilesPath: '/c/changed-files.txt',
  files: 2,
  additions: 3,
  deletions: 1,
}
const task = [{ label: 'TASK' as const, content: 'do it' }]
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const review = (
  lens: 'correctness' | 'edge-cases',
  extra: Parameters<typeof reviewPrompt>[6] = {},
) =>
  reviewPrompt(lens, 'trusted', ['rule a'], task, changes, null, {
    output: 'findings-json',
    blockerThreshold: 5,
    promptVersion: 5,
    ...extra,
  })
/** The CHECK lines of the shared rule in a prompt. */
const ruleLines = (prompt: string) =>
  blockerThresholdRules('findings-json', 5, 5).filter((line) =>
    prompt.includes(line),
  )

describe('the shared blocking rule (ADR-0063)', () => {
  it('pins v9, and keeps the v8 bytes for a replay', () => {
    // v10 adds only the DECISION NEEDED line to the code prompts (ADR-0067).
    assert.equal(INSTRUCTIONS_VERSION, 'local-factory.v10')
    assert.equal(promptVersionOf('local-factory.v9'), 5)
    // Captured from the preceding committed implementation, before this edit.
    assert.equal(
      sha(
        reviewPrompt('edge-cases', 'trusted', ['rule a'], task, changes, null, {
          promptVersion: 4,
          output: 'findings-json',
          blockerThreshold: 5,
        }),
      ),
      '01afd9a2a8dd71ded24e4e1ace7b205b73a9314f25287f9b4edf2177a1f4c3d1',
    )
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
            promptVersion: 4,
            output: 'findings-json',
            blockerThreshold: 5,
            roundScope: {
              round: 'later',
              earlierBlockers: 'x',
              earlierCandidate: 'c1',
              repairChanges: null,
            },
          },
        ),
      ),
      '69962aa7b09db051892e264c6ca5768f8fca7b549a6fe51792c73dcd7b10a082',
    )
  })

  it('states when a product finding, a missed requirement and a test or check finding block, and that nothing else decides', () => {
    const lines = blockerThresholdRules('findings-json', 5, 5).join('\n')
    assert.match(
      lines,
      /Every findings-json code reviewer of this run is given this same rule, word for word/,
    )
    assert.match(
      lines,
      /do not make a finding a blocker, or a non-blocker, for a reason they do not give/,
    )
    assert.match(
      lines,
      /If likelihood × impact is below 5, the finding is a non-blocker\. If it is 5 or more, it is a blocker\./,
    )
    assert.match(
      lines,
      /explicitly asks for is a blocker, however rarely the case it asks about happens/,
    )
    assert.match(
      lines,
      /whether the tests or checks are sufficient[^\n]*a blocker only when that test or check would let through a failure that the task, the spec's acceptance criteria or the owner's confirmed context names\. Otherwise it is a non-blocker: report it all the same, and add "testException": "unnamed-failure" to it/,
    )
    assert.match(
      lines,
      /A change outside the scope of the task, steering, or a secret in the change is judged as you otherwise would/,
    )
    assert.doesNotMatch(
      lines,
      /decide blocker or non-blocker as you otherwise would/,
    )
    // Nothing at 0, or for a verdict review.
    assert.deepEqual(blockerThresholdRules('findings-json', 0, 5), [])
    assert.deepEqual(blockerThresholdRules('verdict', 5, 5), [])
  })

  it('gives both reviewers the same rule in the prompt, the command input and the local instructions', () => {
    const a = review('correctness')
    const b = review('edge-cases')
    const all = blockerThresholdRules('findings-json', 5, 5)
    assert.deepEqual(ruleLines(a), all)
    assert.deepEqual(ruleLines(b), all)
    for (const prompt of [a, b]) {
      assert.deepEqual(ruleLines(localInstructions(prompt)), all)
      assert.deepEqual(ruleLines(reviewInputOf(false, '/review', prompt)), all)
    }
    // A replacement work policy removes the rules, never this one.
    const replaced = review('correctness', {
      policy: { mode: 'replace', path: '/p.md', content: 'Own.', sha256: 'x' },
    })
    assert.deepEqual(ruleLines(replaced), all)
    // A verdict review is unchanged.
    assert.deepEqual(ruleLines(review('edge-cases', { output: 'verdict' })), [])
  })

  it('keeps the test mark on a non-blocker only', () => {
    const parsed = parseFindingsOutput(
      [
        'PLAN: p',
        '```json',
        JSON.stringify([
          {
            severity: 'non-blocker',
            title: 'a',
            body: 'b',
            testException: 'unnamed-failure',
          },
          {
            severity: 'non-blocker',
            title: 'c',
            body: 'd',
            testException: 'other',
          },
          {
            severity: 'blocker',
            title: 'e',
            body: 'f',
            testException: 'unnamed-failure',
          },
        ]),
        '```',
        'REVIEW_STATUS: COMPLETE',
      ].join('\n'),
    )
    assert.equal(parsed.ok, true)
    if (!parsed.ok || !parsed.findings) throw new Error('findings expected')
    assert.deepEqual(
      parsed.findings.nonBlocker.map((f) => f.testException),
      ['unnamed-failure', undefined],
    )
    assert.equal(parsed.findings.blocker[0]?.testException, undefined)
  })

  it('counts, per reviewer and counted round, non-blockers at or above the threshold and demoted test findings', () => {
    const nb = (f: object) => ({
      severity: 'non-blocker' as const,
      title: 't',
      body: 'b',
      ...f,
    })
    const reviewOf = (lens: string, nonBlocker: object[]) => ({
      lens,
      decision: 'pass' as const,
      notes: 'ok',
      findings: {
        blocker: [],
        nonBlocker,
        counts: { blocker: 0, nonBlocker: nonBlocker.length },
      },
    })
    const rounds = [
      {
        round: 1,
        sequence: 1,
        candidate: null,
        status: 'completed',
        reviews: [
          reviewOf('correctness', [
            nb({ likelihood: 2, impact: 3 }),
            nb({ likelihood: 2, impact: 2 }),
            nb({ likelihood: 1, impact: 4 }),
            nb({ testException: 'unnamed-failure' }),
            // Scored and marked: counted as a test finding only.
            nb({ likelihood: 4, impact: 4, testException: 'unnamed-failure' }),
            // Demoted by the later-round rule: not under-blocking.
            nb({
              likelihood: 5,
              impact: 5,
              laterRoundException: 'outside-repair',
            }),
          ]),
          reviewOf('edge-cases', [nb({ likelihood: 1, impact: 2 })]),
        ],
      },
      {
        round: 2,
        sequence: 2,
        candidate: null,
        status: 'discarded',
        reviews: [reviewOf('correctness', [nb({ likelihood: 9, impact: 9 })])],
      },
    ] as Parameters<typeof blockingRuleNonBlockersOf>[1]
    assert.deepEqual(blockingRuleNonBlockersOf(5, rounds), [
      { round: 1, lens: 'correctness', aboveThreshold: 1, testException: 2 },
    ])
    assert.deepEqual(blockingRuleNonBlockersOf(4, rounds), [
      { round: 1, lens: 'correctness', aboveThreshold: 3, testException: 2 },
    ])
    assert.deepEqual(blockingRuleNonBlockersOf(null, rounds), [])
    assert.deepEqual(blockingRuleNonBlockersOf(0, rounds), [])
  })
})
