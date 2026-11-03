import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseCodeResponse,
  repairDispositionText,
  repairFindings,
} from '../src/factory/code-response.js'

describe('repair finding contract', () => {
  it('keeps explicit IDs, numbers unnumbered findings without collisions, and carries do-not-change dispositions', () => {
    const findings = repairFindings(
      [
        'F2: Remove dead branch\n  Keep the caller.\n- Add the boundary test\n- Delete unused export',
      ],
      'F2: non-actionable — retained by owner\nF1: deferred — later\nF3: accepted',
    )
    assert.deepEqual(
      findings.map((f) => [f.id, f.disposition]),
      [
        ['F2', 'non-actionable'],
        ['F1', 'deferred'],
        ['F3', null],
      ],
    )
    assert.match(findings[0].text, /Keep the caller/)
    assert.equal(
      repairDispositionText('F1: accepted\nF2: deferred — later'),
      'F2: deferred — later',
    )
    assert.equal(repairDispositionText('no settled findings'), null)
  })

  it('splits ordinary paragraphs and review blocker lists without inventing findings from fenced examples', () => {
    assert.equal(
      repairFindings(['First problem\n\nSecond problem'], null).length,
      2,
    )
    const findings = repairFindings(
      [
        '# Review findings\n\nContext\n\n## correctness\n- First finding\n```txt\n- example\n```\n- Second finding',
      ],
      null,
    )
    assert.equal(findings.length, 2)
    assert.match(findings[0].text, /example/)
    assert.throws(
      () => repairFindings(['F1: first\nF1: second'], null),
      /duplicate repair finding ID/,
    )
    assert.throws(
      () => repairDispositionText('F1: deferred\nF1: non-actionable'),
      /duplicate repair disposition/,
    )
  })

  const findings = repairFindings(
    ['F1: Fix the boundary\nF2: Keep compatibility'],
    null,
  )
  const read = (text: string) =>
    parseCodeResponse({
      text,
      role: 'repair',
      iteration: 2,
      correction: false,
      commands: [['pnpm', 'lint']],
      findings,
    })

  it('records every treatment and the result against the configured command as self-reported claims', () => {
    const response = read(
      'Changed files.\nNOTES:\nF1: fixed src/index.ts:4\nF2: not changed — compatibility is required\nCHECK C1: pass — zero warnings',
    )
    assert.deepEqual(response.missing, [])
    assert.equal(response.source, 'self-reported')
    assert.deepEqual(
      response.treatments.map((t) => t.status),
      ['fixed', 'not-changed'],
    )
    assert.deepEqual(response.checks[0], {
      id: 'C1',
      command: ['pnpm', 'lint'],
      status: 'pass',
      detail: 'zero warnings',
    })
  })

  it('rejects absent, malformed, contradictory or quoted treatments rather than accepting a blanket claim', () => {
    for (const text of [
      'All findings fixed.',
      'NOTES:\nF1: fixed\nF2: disputed',
      'NOTES:\nF1: fixed —\nF2: not changed —',
      'NOTES:\nF1: fixed a.ts:1\nF1: not changed — no\nF2: fixed a.ts:2',
      'NOTES:\n```text\nF1: fixed a.ts:1\nF2: fixed a.ts:2\n```',
      'NOTES:\nF11: fixed a.ts:1',
    ])
      assert.ok(read(text).missing.length > 0, text)
    assert.equal(
      read('NOTES:\nCHECK C1: pass — yes\nCHECK C1: fail — no').checks[0]
        .status,
      'invalid',
    )
    assert.equal(
      read('NOTES:\nF1: disputed — tests conflict\nF2: fixed a.ts:2').checks[0]
        .status,
      'not-reported',
    )
  })
})
