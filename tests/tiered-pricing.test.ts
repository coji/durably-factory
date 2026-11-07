import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { generateText } from 'ai'
import {
  claudeCode,
  type ClaudeCodeSettings,
  type SDKMessage,
} from 'ai-sdk-provider-claude-code'

import {
  MODEL_PRICES,
  estimateCostBreakdown,
  estimateCostBreakdownByModel,
  unpricedModels,
  type PriceableUsage,
} from '../src/engine/pricing.js'
import {
  ClaudeProvider,
  claudePartialUsage,
} from '../src/engine/providers/claude.js'
import type { ReviewCallSettings } from '../src/engine/providers/types.js'
import { writeMeasurement } from '../src/engine/runner.js'
import { mergeUsage, type TokenUsage } from '../src/engine/usage.js'

const model = 'claude-haiku-5-5'
const request = (
  inputTokens: number,
  outputTokens = 1000,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
) => ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })
const aggregate = (
  requests: NonNullable<PriceableUsage['requests']>,
): PriceableUsage => ({
  ...Object.fromEntries(
    ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].map(
      (key) => [
        key,
        requests.reduce((n, r) => n + (r[key as keyof typeof r] ?? 0), 0),
      ],
    ),
  ),
  inputTokens: requests.reduce((n, r) => n + r.inputTokens!, 0),
  outputTokens: requests.reduce((n, r) => n + r.outputTokens!, 0),
  requests,
})
const approx = (actual: number | undefined, expected: number) =>
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-12,
    `${actual} != ${expected}`,
  )

describe('Haiku prompt-length pricing', () => {
  it('prices the boundary and switches all meters only above it, including cached input', () => {
    const short = estimateCostBreakdown(
      model,
      aggregate([request(100000, 1000, 90000, 1000)]),
    )
    const long = estimateCostBreakdown(
      model,
      aggregate([request(100001, 1000, 90000, 1000)]),
    )
    approx(short?.meters.input_tokens, (9000 / 1e6) * 0.1)
    approx(short?.meters.output_tokens, 0.0005)
    approx(long?.meters.input_tokens, (9001 / 1e6) * 0.5)
    approx(long?.meters.output_tokens, 0.0025)
    approx(long?.meters.input_cache_read_tokens, (90000 / 1e6) * 0.05)
    approx(long?.meters.input_cache_write_tokens, (1000 / 1e6) * 0.625)
  })

  it('keeps separate requests at their own rates even when the aggregate exceeds the boundary', () => {
    approx(
      estimateCostBreakdown(model, aggregate([request(60000), request(60000)]))
        ?.totalUsd,
      0.013,
    )
    const usage = aggregate([request(60000), request(120000)])
    const cost = estimateCostBreakdown(model, usage)
    approx(cost?.totalUsd, 0.069)
    assert.deepEqual(cost?.prices[model], MODEL_PRICES.models[model])
    assert.deepEqual(unpricedModels({ [model]: usage }), [])
    const pinned = { version: 1, models: cost!.prices }
    assert.deepEqual(estimateCostBreakdown(model, usage, pinned), cost)
    approx(
      estimateCostBreakdownByModel({
        [model]: usage,
        'claude-opus-5-5': request(1000),
      })?.totalUsd,
      0.093,
    )
  })

  it('rejects incomplete, invalid or inconsistent request evidence rather than guessing a tier', () => {
    const usage = aggregate([request(120000)])
    for (const bad of [
      { ...usage, inputTokens: 120001 },
      { ...usage, outputTokens: 1001 },
      { ...usage, cacheReadTokens: 1 },
      { ...usage, requests: [] },
      aggregate([request(120000, 1000, 120001)]),
      aggregate([request(120000, -1)]),
      { ...usage, requests: [{ ...request(120000), outputTokens: null }] },
    ])
      assert.equal(estimateCostBreakdown(model, bad), null)
    assert.equal(estimateCostBreakdown(model, request(120000)), null)
    assert.deepEqual(unpricedModels({ [model]: request(120000) }), [model])
    approx(estimateCostBreakdown(model, request(100000))?.totalUsd, 0.0105)
  })

  it('retains request boundaries through measurement merging and JSON checkpoints', async () => {
    const usage: TokenUsage = {
      ...aggregate([request(60000), request(120000)]),
      cachedInputTokens: 0,
      totalTokens: 182000,
      usageSource: 'provider-final',
    }
    const stored = JSON.parse(
      JSON.stringify(mergeUsage(null, usage)),
    ) as TokenUsage
    assert.deepEqual(stored.requests, usage.requests)
    approx(estimateCostBreakdown(model, stored)?.totalUsd, 0.069)
    const measurement = await writeMeasurement(
      { setMetadata: async () => {} } as unknown as Parameters<
        typeof writeMeasurement
      >[0],
      { usage: null, reportedModel: model } as Parameters<
        typeof writeMeasurement
      >[1],
      { usagePatch: stored },
    )
    approx(measurement.costUsdEstimate ?? undefined, 0.069)
    assert.deepEqual(measurement.unpricedModels, [])
    assert.equal(
      measurement.costPrices?.[model].longContext?.inputTokensAbove,
      100000,
    )
    assert.deepEqual(measurement.usage?.requests, usage.requests)
  })
})

const event = (value: unknown, parent: string | null = null) =>
  ({
    type: 'stream_event',
    event: value,
    parent_tool_use_id: parent,
  }) as unknown as SDKMessage
const response = (id: string, input: number, parent: string | null = null) => [
  event(
    {
      type: 'message_start',
      message: {
        id,
        model,
        usage: {
          input_tokens: input,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    },
    parent,
  ),
  // Repeated content blocks carry the same response id and placeholder usage.
  {
    type: 'assistant',
    message: {
      id,
      model,
      usage: {
        input_tokens: input,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    parent_tool_use_id: parent,
  } as unknown as SDKMessage,
  event({ type: 'message_delta', usage: { output_tokens: 1000 } }, parent),
]

describe('Claude per-request price evidence', () => {
  it('deduplicates responses, retains streamed output, and excludes plain-call subagents', () => {
    const read = claudePartialUsage(null)
    let latest: ReturnType<typeof read> = null
    for (const message of [
      ...response('short', 60000),
      ...response('long', 120000),
      ...response('ignored', 200000, 'tool-1'),
    ])
      latest = read(message) ?? latest
    assert.equal(latest?.usage.requests?.length, 2)
    assert.equal(latest?.usage.requests?.[0].outputTokens, 1000)
    approx(estimateCostBreakdown(model, latest!.usage)?.totalUsd, 0.069)
  })

  for (const command of [false, true])
    it(`retains requests in a final ${command ? 'command-review' : 'main-loop'} result and prices them without a progress callback`, async () => {
      let settings: ClaudeCodeSettings | undefined
      const review: ReviewCallSettings | null = command
        ? {
            command: true,
            context: 'prompt',
            output: 'findings-json',
            readableDirs: [],
          }
        : null
      const provider = new ClaudeProvider({
        claudeCode: ((_model: string, given: ClaudeCodeSettings) => {
          settings = given
          return {}
        }) as unknown as typeof claudeCode,
        generateText: (async () => {
          assert.equal(settings?.includePartialMessages, true)
          for (const message of [
            ...response('short', 60000, command ? 'tool-1' : null),
            ...response('long', 120000, command ? 'tool-1' : null),
          ])
            settings?.onSdkMessage?.(message)
          return {
            text: 'done',
            usage: {
              inputTokens: 180000,
              outputTokens: 2000,
              totalTokens: 182000,
              inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
            response: { modelId: model },
            finalStep: {
              providerMetadata: {
                'claude-code': {
                  modelUsage: {
                    [model]: {
                      inputTokens: 180000,
                      outputTokens: 2000,
                      cacheReadInputTokens: 0,
                      cacheCreationInputTokens: 0,
                    },
                  },
                },
              },
            },
          }
        }) as unknown as typeof generateText,
      })
      const result = await provider.call({
        prompt: 'task',
        workdir: process.cwd(),
        timeoutMs: 60000,
        requestedModel: model,
        requestedEffort: null,
        role: command ? 'review-a' : 'implement',
        ...(review ? { review } : {}),
      })
      assert.equal(result.usage?.requests?.length, 2)
      assert.equal(result.usage?.usageSource, 'provider-final')
      approx(estimateCostBreakdown(model, result.usage)?.totalUsd, 0.069)
      if (command) {
        assert.equal(result.usageByModel?.[model].requests?.length, 2)
        approx(
          estimateCostBreakdownByModel(result.usageByModel!)?.totalUsd,
          0.069,
        )
      }
    })
})
