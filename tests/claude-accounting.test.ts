import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SDKMessage } from 'ai-sdk-provider-claude-code'

import {
  estimateCostBreakdown,
  estimateCostBreakdownByModel,
  MODEL_PRICES,
} from '../src/engine/pricing.js'
import {
  claudeInvocationUsage,
  claudeUsageByModel,
  claudePartialUsage,
} from '../src/engine/providers/claude.js'
import { mergeUsage, type TokenUsage } from '../src/engine/usage.js'
import { FactoryEventSchema } from '../src/factory/events.js'
import { reduce } from '../src/factory/reducer.js'
import { initialState, type FactorySetup } from '../src/factory/types.js'
import fixture from './fixtures/claude-session-usage.json' with { type: 'json' }

const near = (actual: number | undefined, expected: number) =>
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-10,
    `${actual} != ${expected}`,
  )

describe('native Claude invocation accounting', () => {
  it('subtracts restored totals across three real calls, including the hidden helper and TTLs, once', () => {
    let previous: Record<string, TokenUsage> = {}
    let sum = 0
    for (const row of fixture) {
      const totals = claudeUsageByModel(row.result.modelUsage, true)!
      const call = claudeInvocationUsage({ totals, previous, observed: null })
      const cost = estimateCostBreakdownByModel(call.usageByModel!)!
      assert.ok(cost, row.step)
      sum += cost.totalUsd
      near(sum, row.result.total_cost_usd)
      assert.equal(call.usage?.cacheWrite5mTokens, 0)
      assert.ok(call.usage?.cacheWrite1hTokens)
      if (row.step !== 'baseline-c1')
        assert.equal(call.usageByModel?.['claude-haiku-5-5']?.inputTokens, 0)
      previous = totals
    }
    near(sum, fixture.at(-1)!.result.total_cost_usd)
  })

  it('retains the native baseline through event serialization and state reduction', () => {
    const baseline = claudeUsageByModel(fixture[0].result.modelUsage, true)!
    const event = FactoryEventSchema.parse(
      JSON.parse(
        JSON.stringify({
          type: 'code.completed',
          role: 'implement',
          candidate: {
            id: 'sealed',
            snapshotDir: '/sealed',
            sourceHash: 's',
            acceptanceHash: 'a',
          },
          session: {
            provider: 'claude',
            nativeId: 'session',
            profileId: 'code',
            cwd: '/work',
            instructionsVersion: 'v7',
            usage: baseline,
          },
        }),
      ),
    )
    const state = reduce(initialState({} as FactorySetup), event)
    assert.deepEqual(state.implementationSession?.usage, baseline)
    const next = claudeInvocationUsage({
      totals: claudeUsageByModel(fixture[1].result.modelUsage, true),
      previous: state.implementationSession!.usage!,
      observed: null,
    })
    const deltaCost = estimateCostBreakdownByModel(next.usageByModel!)!.totalUsd
    near(
      deltaCost,
      fixture[1].result.total_cost_usd - fixture[0].result.total_cost_usd,
    )
  })

  it('keeps an absent or reset session baseline partial rather than charging restored usage', () => {
    const totals = claudeUsageByModel(fixture[0].result.modelUsage, true)!
    assert.equal(
      claudeInvocationUsage({ totals, previous: null, observed: null }).usage,
      null,
    )
    const newer = claudeUsageByModel(fixture[2].result.modelUsage, true)!
    assert.equal(
      claudeInvocationUsage({ totals, previous: newer, observed: null }).usage,
      null,
    )
  })

  it('prices mixed TTLs and reports unknown retention or rates as unknown, preserving old catalogs', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 10,
      cacheWriteTokens: 40,
      cacheWrite5mTokens: 15,
      cacheWrite1hTokens: 25,
    }
    const priced = estimateCostBreakdown('claude-opus-5-5', usage)!
    near(priced.totalUsd, (50 * 4 + 10 * 0.2 + 15 * 5 + 25 * 8 + 10 * 20) / 1e6)
    assert.equal(
      estimateCostBreakdown('claude-opus-5-5', {
        ...usage,
        cacheWrite1hTokens: null,
      }),
      null,
    )
    assert.equal(
      estimateCostBreakdown('claude-opus-5-5', {
        ...usage,
        cacheWrite1hTokens: 20,
      }),
      null,
    )
    const oldPrice = { ...MODEL_PRICES.models['claude-opus-5-5'] }
    delete oldPrice.cacheWrite1h
    const pinned = { version: 1, models: { 'claude-opus-5-5': oldPrice } }
    assert.equal(estimateCostBreakdown('claude-opus-5-5', usage, pinned), null)
    const legacy = {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 10,
      cacheWriteTokens: 40,
    }
    near(
      estimateCostBreakdown('claude-opus-5-5', legacy, pinned)!.totalUsd,
      (50 * 4 + 10 * 0.2 + 40 * 5 + 10 * 20) / 1e6,
    )
  })

  it('retains raw response TTLs for main and subagent requests and across metadata merges', () => {
    const read = claudePartialUsage(null, { allModels: true, retention: true })
    let last
    for (const [id, parent] of [
      ['main', null],
      ['child', 'tool-1'],
    ] as const) {
      last = read({
        type: 'assistant',
        uuid: id,
        parent_tool_use_id: parent,
        message: {
          id,
          model: 'claude-opus-5-5',
          usage: {
            input_tokens: 5,
            output_tokens: 4,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 20,
            cache_creation: {
              ephemeral_5m_input_tokens: 3,
              ephemeral_1h_input_tokens: 17,
            },
          },
        },
      } as unknown as SDKMessage)
    }
    assert.equal(last?.usage.cacheWrite5mTokens, 6)
    assert.equal(last?.usage.cacheWrite1hTokens, 34)
    assert.equal(mergeUsage(null, last!.usage)?.cacheWrite1hTokens, 34)
    const unknown = mergeUsage(last!.usage, { cacheWrite1hTokens: null })!
    assert.equal(unknown.cacheWrite1hTokens, null)
    assert.equal(estimateCostBreakdown('claude-opus-5-5', unknown), null)
  })
})
