import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  defaultModelFor,
  MODEL_PRESETS,
  presetForModel,
  resolveEffort,
} from '../src/engine/models.js'
import { estimateCostUsd } from '../src/engine/pricing.js'

describe('model presets', () => {
  it('maps each preset model to its default effort', () => {
    assert.equal(presetForModel('gpt-6-astra')?.effort, 'low')
    assert.equal(presetForModel('gpt-6.1-sol')?.effort, 'medium')
    assert.equal(presetForModel('gpt-6.1-terra')?.effort, 'medium')
    assert.equal(presetForModel('claude-fable-5-2')?.effort, 'medium')
    assert.equal(presetForModel('claude-sonnet-5-5')?.effort, 'high')
    assert.equal(presetForModel('claude-haiku-5-5')?.effort, 'medium')
  })

  it('keeps explicit historical settings stable without advertising old models', () => {
    for (const [model, effort] of Object.entries({
      'gpt-6-sol': 'medium',
      'gpt-5.6-sol': 'low',
      'gpt-5.6-terra': 'medium',
      'gpt-5.6-luna': 'max',
      'claude-fable-5-1': 'low',
      'claude-opus-5': 'high',
      'claude-sonnet-5': 'high',
    })) {
      assert.equal(presetForModel(model), null)
      assert.equal(resolveEffort(undefined, model), effort)
      assert.equal(resolveEffort('medium', model), 'medium')
      assert.notEqual(
        estimateCostUsd(model, { inputTokens: 1, outputTokens: 1 }),
        null,
      )
    }
  })

  it('resolves explicit > preset > null', () => {
    assert.equal(resolveEffort('high', 'gpt-6-astra'), 'high')
    assert.equal(resolveEffort(undefined, 'claude-opus-5'), 'high')
    assert.equal(resolveEffort(undefined, 'gpt-5.6-luna'), 'max')
    assert.equal(resolveEffort(undefined, 'unknown'), null)
    assert.equal(resolveEffort(undefined, null), null)
  })

  it('provider defaults always hit a preset (no unknown effort)', () => {
    for (const provider of ['codex', 'claude'] as const) {
      const model = defaultModelFor(provider)
      assert.ok(
        presetForModel(model),
        `${provider} default ${model} must be a preset model`,
      )
      assert.ok(
        resolveEffort(undefined, model) !== null,
        `${provider} default effort must resolve, got null`,
      )
    }
  })

  it('prices preset models without cross-matching siblings', () => {
    const usage = { inputTokens: 1000, outputTokens: 1000 }
    const approx = (actual: number | null, expected: number) =>
      assert.ok(
        actual !== null && Math.abs(actual - expected) < 1e-9,
        `expected ~${expected}, got ${actual}`,
      )
    approx(estimateCostUsd('gpt-6-astra', usage), 0.06)
    approx(estimateCostUsd('gpt-6.1-sol', usage), 0.012)
    approx(estimateCostUsd('gpt-6.1-terra', usage), 0.006)
    approx(estimateCostUsd('gpt-6-sol', usage), 0.012)
    approx(estimateCostUsd('gpt-6-luna', usage), 0.0006)
    approx(estimateCostUsd('gpt-5.6-sol', usage), 0.024)
    approx(estimateCostUsd('gpt-5.6-terra', usage), 0.014)
    approx(estimateCostUsd('gpt-5.6-luna', usage), 0.0014)
    approx(estimateCostUsd('claude-fable-5-1', usage), 0.06)
    approx(estimateCostUsd('claude-fable-5-2', usage), 0.048)
    // Longest match first: `claude-opus-5-5` must not be priced as Opus 5.
    approx(estimateCostUsd('claude-opus-5-5', usage), 0.024)
    approx(estimateCostUsd('claude-opus-5', usage), 0.03)
    approx(estimateCostUsd('claude-sonnet-5', usage), 0.012)
    approx(estimateCostUsd('claude-sonnet-5-5', usage), 0.012)
    approx(estimateCostUsd('claude-haiku-5-5', usage), 0.0006)
  })

  it('prices every preset model', () => {
    // A preset without a price row makes every cost for that model unknown,
    // which would silently blank the column this example exists to fill.
    for (const preset of MODEL_PRESETS) {
      assert.notEqual(
        estimateCostUsd(preset.model, { inputTokens: 1, outputTokens: 1 }),
        null,
        `${preset.model} has a preset but no price`,
      )
    }
  })
})
