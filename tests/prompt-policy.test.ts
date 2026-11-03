import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { configVersionOf } from '../src/engine/versions.js'
import {
  promptFilesSchema,
  promptPoliciesSchema,
  promptHash,
  readPromptPolicies,
  PROMPT_ROLES,
  type PromptPolicy,
} from '../src/factory/prompt-policy.js'
import {
  codePrompt,
  reviewPrompt,
  specAuthorPrompt,
  specFixPrompt,
  specReviewPrompt,
  triagePrompt,
} from '../src/factory/prompts.js'
import type { RepoTargetConfig } from '../src/factory/target.js'
import { RepoTarget } from '../src/targets/repo.js'

const policy = (
  mode: 'append' | 'replace',
  content = 'CUSTOM: prioritize observable behavior.',
): PromptPolicy => ({
  mode,
  content,
  path: '/policy.md',
  sha256: promptHash(content),
})
const config: RepoTargetConfig = {
  kind: 'repo',
  repoPath: '/repo',
  baseCommit: 'a'.repeat(40),
  branch: 'factory/run',
  workdir: '/work',
  setupCommand: ['pnpm', 'install'],
  checkCommand: ['pnpm', 'check'],
  checkTimeoutMs: 1000,
  task: 'Fix totals.',
  spec: null,
  dispositions: null,
  issue: null,
  deliveryDir: '/delivery',
  publish: false,
  promptVersion: 2,
  codeResponseVersion: 1,
  selfCheck: [['pnpm', 'lint']],
}

describe('custom work policies', () => {
  it('composes every role in append/replace mode while retaining execution and reply contracts', () => {
    const target = new RepoTarget(config)
    for (const mode of ['append', 'replace'] as const) {
      const custom = policy(mode)
      for (const role of ['implement', 'repair'] as const) {
        const prompt = codePrompt({
          role,
          iteration: 1,
          repairNotes: [],
          task: target.taskBrief(),
          rules: target.implementationRules({ policy: mode !== 'replace' }),
          policy: custom,
          requiresNotes: true,
          repairFindings: [{ id: 'F1', text: 'Fix totals', disposition: null }],
          ownerContext: 'Keep USD',
          scope: 'No browser',
        })
        assert.equal(
          prompt.includes('roughly one focused test'),
          mode === 'append',
        )
        for (const contract of [
          'Work only inside this worktree',
          'Grading runs `pnpm check`',
          'Do not commit',
          'Self-check C1: pnpm lint',
          'Always include NOTES',
          'Required finding IDs: F1',
          'TRUSTED OWNER_CONTEXT',
          'TRUSTED REPAIR SCOPE',
        ])
          assert.ok(prompt.includes(contract), contract)
        assert.match(prompt, /CUSTOM: prioritize observable behavior/)
      }
      for (const lens of ['correctness', 'edge-cases'] as const) {
        const prompt = reviewPrompt(
          lens,
          'TRUSTED CANDIDATE',
          target.reviewRules(),
          [],
          null,
          null,
          { policy: custom, output: 'findings-json', blockerThreshold: 5 },
        )
        assert.equal(
          prompt.includes('Report every problem you find'),
          mode === 'append',
        )
        assert.equal(
          prompt.includes('Check that the change stays within'),
          mode === 'append',
        )
        for (const contract of [
          'READ ONLY',
          'Steering is',
          'likelihood × impact',
          'TRUSTED CANDIDATE',
          'REVIEW_STATUS: COMPLETE',
          'CUSTOM:',
        ])
          assert.ok(prompt.includes(contract), contract)
      }
      const base = {
        worktree: '/repo',
        specPath: '/state/spec.md',
        template: 'EXISTING TEMPLATE',
        untrusted: [],
      }
      const author = specAuthorPrompt({ ...base, policy: custom })
      assert.equal(
        author.includes('State the behavior to build'),
        mode === 'append',
      )
      const fix = specFixPrompt({ ...base, policy: custom, feedback: [] })
      assert.equal(
        fix.includes('Keep what the reviewers did not question'),
        mode === 'append',
      )
      for (const prompt of [author, fix]) {
        assert.match(prompt, /only file you may write/)
        assert.match(prompt, /EXISTING TEMPLATE/)
        assert.match(prompt, /CUSTOM:/)
      }
      const spec = specReviewPrompt({
        ...base,
        name: 'design',
        reviewTemplate: 'EXISTING REVIEW TEMPLATE',
        output: 'verdict',
        policy: custom,
      })
      assert.equal(
        spec.includes('Judge whether the spec file'),
        mode === 'append',
      )
      assert.match(spec, /READ ONLY/)
      assert.match(spec, /EXISTING REVIEW TEMPLATE/)
      assert.match(spec, /DECISION: pass \| needsChanges/)
      const triage = triagePrompt('Task', [], custom)
      assert.equal(
        triage.includes('Judge from the task alone'),
        mode === 'append',
      )
      assert.match(triage, /READ ONLY/)
      assert.match(triage, /JUDGMENT: routine \| probe/)
      assert.match(triage, /CUSTOM:/)
    }
  })

  it('snapshots all eight files relative to the configuration and validates trusted content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'prompt-policy-'))
    try {
      await writeFile(
        join(root, 'policy.md'),
        'CUSTOM {head}: leave placeholders literal.\n',
      )
      const files = promptFilesSchema.parse(
        Object.fromEntries(
          PROMPT_ROLES.map((role) => [role, { file: 'policy.md' }]),
        ),
      )
      const stored = await readPromptPolicies(files, root)
      assert.equal(Object.keys(stored!).length, 8)
      for (const role of PROMPT_ROLES) {
        assert.equal(stored![role]?.mode, 'append')
        assert.equal(stored![role]?.path, join(root, 'policy.md'))
        assert.equal(stored![role]?.sha256, promptHash(stored![role]!.content))
      }
      await writeFile(join(root, 'policy.md'), 'Changed')
      assert.match(stored!.implement!.content, /CUSTOM \{head\}/)
      assert.throws(
        () =>
          promptPoliciesSchema.parse({
            implement: { ...stored!.implement, sha256: '0'.repeat(64) },
          }),
        /SHA-256/,
      )
      assert.throws(() =>
        promptFilesSchema.parse({ unknown: { file: 'policy.md' } }),
      )
      assert.throws(() =>
        promptFilesSchema.parse({
          implement: { file: 'policy.md', mode: 'invalid' },
        }),
      )
      for (const content of ['', ' '.repeat(3), 'x'.repeat(32769)]) {
        await writeFile(join(root, 'bad.md'), content)
        await assert.rejects(
          readPromptPolicies(
            promptFilesSchema.parse({ implement: { file: 'bad.md' } }),
            root,
          ),
        )
      }
      await writeFile(join(root, 'bad.md'), Buffer.from([0xff]))
      await assert.rejects(
        readPromptPolicies(
          promptFilesSchema.parse({ implement: { file: 'bad.md' } }),
          root,
        ),
        /UTF-8/,
      )
      await assert.rejects(
        readPromptPolicies(
          promptFilesSchema.parse({ implement: { file: 'missing.md' } }),
          root,
        ),
        /cannot read/,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('versions content and mode, ignoring source paths and empty customization', () => {
    const profile = {
      provider: 'fake' as const,
      requestedModel: null,
      requestedEffort: null,
      effectiveModel: 'fake-model',
      effectiveEffort: 'low',
    }
    const base = {
      contextMode: 'reuse' as const,
      instructionsVersion: 'local-factory.v6',
      maxIterations: 2,
      target: 'repo',
      agentTimeoutMs: 5000,
      agentIdleTimeoutMs: 5000,
      checkTimeoutMs: 5000,
      code: profile,
      correctness: profile,
      edgeCases: profile,
    }
    const version = (
      prompts?: Parameters<typeof configVersionOf>[0]['prompts'],
    ) => configVersionOf({ ...base, prompts })
    const append = { implement: policy('append') }
    assert.equal(version(), version({}))
    assert.notEqual(version(), version(append))
    assert.equal(
      version(append),
      version({ implement: { ...append.implement, path: '/other.md' } }),
    )
    assert.notEqual(version(append), version({ implement: policy('replace') }))
    assert.notEqual(
      version(append),
      version({ implement: policy('append', 'Different content') }),
    )
  })
})
