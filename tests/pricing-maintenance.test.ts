import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  MODEL_PRICES,
  estimateCostBreakdown,
  estimateCostUsd,
  resolveModelPrice,
  unpricedModels,
  type PriceCatalog,
} from '../src/engine/pricing.js'
import {
  catalogChanges,
  fetchPriceDocuments,
  parsePrices,
  priceUpdateMarkdown,
  PRICING_SOURCES,
  updatePrices,
  validateCatalog,
} from '../src/maintenance/pricing.js'

const documents = {
  openai: await readFile(
    new URL('./fixtures/pricing/openai.md', import.meta.url),
    'utf8',
  ),
  anthropic: await readFile(
    new URL('./fixtures/pricing/anthropic.md', import.meta.url),
    'utf8',
  ),
}
const empty: PriceCatalog = { version: 1, models: {} }
// The updater validates a newly fetched catalog in CI. Its models can outgrow
// these saved documents, so maintenance scenarios must use a matching catalog.
const fixtureCatalog: PriceCatalog = {
  version: 1,
  models: Object.fromEntries(
    (['openai', 'anthropic'] as const).flatMap((provider) =>
      Object.entries(parsePrices(provider, documents[provider]).prices).map(
        ([model, rates]) => [
          model,
          {
            provider,
            ...rates,
            source: PRICING_SOURCES[provider],
            checkedAt: '2026-11-02',
            monitor: true,
            aliases: [],
          },
        ],
      ),
    ),
  ),
}

describe('model price maintenance', () => {
  it('reads Standard short-context prices, ignoring discounted and long-context rates', () => {
    const { prices } = parsePrices('openai', documents.openai)
    assert.deepEqual(prices['gpt-6.1-sol'], {
      input: 2,
      output: 10,
      cacheRead: 0.1,
      cacheWrite: 2.5,
    })
    assert.deepEqual(prices['gpt-6.1-terra'], {
      input: 1,
      output: 5,
      cacheRead: 0.05,
      cacheWrite: 1.25,
    })
    assert.equal(prices['gpt-5'].cacheWrite, null)
    assert.equal(prices.o3.input, 2)
  })

  it('reads model-specific Claude cache rates and paired conditional context tiers', () => {
    const { prices, skipped } = parsePrices('anthropic', documents.anthropic)
    assert.deepEqual(prices['claude-fable-5-2'], {
      input: 8,
      output: 40,
      cacheRead: 0.2,
      cacheWrite: 10,
    })
    assert.deepEqual(prices['claude-fable-5-1'], {
      input: 10,
      output: 50,
      cacheRead: 0.25,
      cacheWrite: 12.5,
    })
    assert.equal(prices['claude-opus-5-5'].cacheRead, 0.2)
    assert.equal(prices['claude-opus-5-5'].cacheWrite, 5)
    assert.deepEqual(prices['claude-haiku-5-5'], {
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite: 0.125,
      longContext: {
        inputTokensAbove: 100000,
        input: 0.5,
        output: 2.5,
        cacheRead: 0.05,
        cacheWrite: 0.625,
      },
    })
    assert.equal(
      skipped.filter((name) => name.includes('for prompts')).length,
      0,
    )
    assert.equal(prices['claude-haiku-3-5'], undefined)
  })

  it('rejects incomplete, conflicting and mismatched context tiers', () => {
    const longRow = documents.anthropic
      .split('\n')
      .find((line) => line.includes('for prompts over'))!
    for (const anthropic of [
      documents.anthropic.replace(
        longRow,
        `${longRow}\n${longRow.replace('$2.50', '$2.51')}`,
      ),
      documents.anthropic
        .split('\n')
        .filter((line) => !line.includes('for prompts over'))
        .join('\n'),
      documents.anthropic.replace('over 100,000', 'over 200,000'),
      documents.anthropic
        .replace('up to 100,000', 'up to 0')
        .replace('over 100,000', 'over 0'),
      documents.anthropic.replace('for prompts over', 'for requests over'),
    ])
      assert.throws(() =>
        updatePrices(fixtureCatalog, { ...documents, anthropic }, '2026-11-07'),
      )
  })

  it('updates long-context rates and reports both tiers without date churn', () => {
    const current = structuredClone(fixtureCatalog)
    current.models['claude-haiku-5-5'].longContext!.output = 99
    const update = updatePrices(current, documents, '2026-11-07')
    assert.equal(update.changes.length, 1)
    assert.equal(
      update.catalog.models['claude-haiku-5-5'].longContext!.output,
      2.5,
    )
    assert.match(
      priceUpdateMarkdown(update.changes, [], '2026-11-07'),
      /≤100000 input tokens: \$0.1.*above: \$0.5 \/ \$2.5/,
    )
    assert.equal(
      updatePrices(update.catalog, documents, '2026-11-08').changes.length,
      0,
    )
    for (const field of [
      'inputTokensAbove',
      'input',
      'output',
      'cacheRead',
      'cacheWrite',
    ] as const) {
      const bad = structuredClone(update.catalog)
      bad.models['claude-haiku-5-5'].longContext![field] = -1
      assert.throws(() => validateCatalog(bad))
    }
  })

  it('updates registered rates with sources and aliases, retaining historical entries without importing unregistered models', () => {
    const current = structuredClone(fixtureCatalog)
    current.models['gpt-5-codex'] = {
      ...current.models['gpt-5'],
      monitor: false,
    }
    current.models['claude-haiku-4-5'].aliases = ['claude-haiku-4-5-20251001']
    delete current.models['gpt-6.1-terra']
    current.models['gpt-6.1-sol'].input = 99
    const before = structuredClone(current)
    const update = updatePrices(current, documents, '2026-11-03')
    assert.deepEqual(current, before)
    assert.equal(update.catalog.models['gpt-6.1-sol'].input, 2)
    assert.equal(update.catalog.models['gpt-6.1-sol'].checkedAt, '2026-11-03')
    assert.equal(Object.hasOwn(update.catalog.models, 'gpt-6.1-terra'), false)
    assert.deepEqual(
      Object.keys(update.catalog.models).sort(),
      Object.keys(current.models).sort(),
    )
    assert.deepEqual(
      update.changes.map((change) => change.model),
      ['gpt-6.1-sol'],
    )
    assert.deepEqual(
      update.catalog.models['gpt-5-codex'],
      current.models['gpt-5-codex'],
    )
    assert.deepEqual(update.catalog.models['claude-haiku-4-5'].aliases, [
      'claude-haiku-4-5-20251001',
    ])
    const report = priceUpdateMarkdown(
      update.changes,
      update.skipped,
      '2026-11-03',
    )
    assert.match(report, /\$99/)
    assert.match(report, /\$2 \/ \$10 \/ \$0.1 \/ \$2.5/)
    assert.match(report, /https:\/\/developers.openai.com\/api\/docs\/pricing/)
    assert.match(report, /2026-11-03/)
    assert.match(report, /Select and register new models manually/)
  })

  it('does not populate an empty catalog from the official documents', () => {
    const update = updatePrices(empty, documents, '2026-11-07')
    assert.deepEqual(update.catalog, empty)
    assert.deepEqual(update.changes, [])
  })

  it('does not churn verification dates or PRs when rates are unchanged', () => {
    const first = updatePrices(fixtureCatalog, documents, '2026-11-03')
    const next = updatePrices(first.catalog, documents, '2026-11-04')
    assert.equal(next.changes.length, 0)
    assert.deepEqual(next.catalog, first.catalog)
    assert.deepEqual(catalogChanges(first.catalog, next.catalog), [])
    assert.ok(catalogChanges(empty, next.catalog).length > 0)
  })

  it('fails closed on incomplete pages, changed columns, invalid prices or conflicting duplicates', () => {
    const current = structuredClone(fixtureCatalog)
    const before = structuredClone(current)
    const bad = [
      '<html>upstream error</html>',
      documents.openai.replaceAll('Short context input', 'New input column'),
      documents.openai.replaceAll('$2.00', 'contact sales'),
      documents.openai.replaceAll('gpt-6.1-sol', 'gpt-6.1-sol-new'),
      documents.openai.replaceAll('gpt-6.1-sol', 'gpt-6-astra'),
    ]
    for (const openai of bad) {
      assert.notEqual(openai, documents.openai)
      assert.throws(() =>
        updatePrices(current, { ...documents, openai }, '2026-11-03'),
      )
      assert.deepEqual(current, before)
    }
    assert.throws(() =>
      updatePrices(current, { ...documents, anthropic: '' }, '2026-11-03'),
    )
    assert.deepEqual(current, before)
  })

  it('reports an HTTP failure without producing an update', async () => {
    await assert.rejects(
      fetchPriceDocuments(
        (async () =>
          new Response('unavailable', { status: 503 })) as typeof fetch,
      ),
      /HTTP 503/,
    )
    const result = await fetchPriceDocuments(
      (async (url: string | URL | Request) =>
        new Response(
          String(url).includes('openai.com')
            ? documents.openai
            : documents.anthropic,
        )) as typeof fetch,
    )
    assert.deepEqual(result, documents)
  })

  it('validates prices, source metadata and duplicate aliases', () => {
    validateCatalog(MODEL_PRICES)
    const bad = structuredClone(MODEL_PRICES)
    bad.models['gpt-6.1-sol'].input = -1
    assert.throws(() => validateCatalog(bad), /Invalid input/)
    bad.models['gpt-6.1-sol'].input = 2
    bad.models['gpt-6.1-sol'].aliases.push('gpt-6.1-terra')
    assert.throws(() => validateCatalog(bad), /duplicate pricing ID/)
  })
})

describe('strict price lookup', () => {
  it('keeps models absent from an invocation snapshot unpriced after a catalog update', () => {
    const pinned = structuredClone(MODEL_PRICES)
    delete pinned.models['gpt-6.1-sol']
    const usage = { inputTokens: 1000, outputTokens: 1000 }
    assert.ok(estimateCostBreakdown('gpt-6.1-sol', usage))
    assert.equal(estimateCostBreakdown('gpt-6.1-sol', usage, pinned), null)
    assert.deepEqual(unpricedModels({ 'gpt-6.1-sol': usage }, pinned), [
      'gpt-6.1-sol',
    ])
  })

  it('prices every Fable 5.2 cache leg and keeps older invocation catalogs unpriced', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 800_000,
      cacheWriteTokens: 100_000,
    }
    const result = estimateCostBreakdown('claude-fable-5-2', usage)
    assert.ok(result)
    assert.ok(Math.abs(result.totalUsd - 5.96) < 1e-9)
    assert.equal(result.meters.input_tokens, 0.8)
    assert.ok(
      Math.abs((result.meters.input_cache_read_tokens ?? 0) - 0.16) < 1e-9,
    )
    assert.equal(result.meters.input_cache_write_tokens, 1)
    assert.equal(result.meters.output_tokens, 4)
    const old = structuredClone(MODEL_PRICES)
    delete old.models['claude-fable-5-2']
    assert.equal(estimateCostBreakdown('claude-fable-5-2', usage, old), null)
    assert.ok(estimateCostBreakdown('claude-fable-5-1', usage, old))
  })

  it('does not treat an unpublished cache-write rate as free when writes were spent', () => {
    const prices = structuredClone(MODEL_PRICES)
    prices.models['gpt-5'].cacheWrite = null
    const usage = {
      inputTokens: 1000,
      outputTokens: 1000,
      cacheWriteTokens: 50,
    }
    assert.equal(estimateCostBreakdown('gpt-5', usage, prices), null)
    assert.deepEqual(unpricedModels({ 'gpt-5': usage }, prices), ['gpt-5'])
    assert.ok(
      estimateCostBreakdown('gpt-5', { ...usage, cacheWriteTokens: 0 }, prices),
    )
  })

  it('does not price unregistered suffixes, variants or provider-qualified IDs as a known family', () => {
    for (const model of [
      'gpt-6.1-sol-mini',
      'gpt-5-new',
      'gpt-5-codex-new',
      'claude-opus-5-50',
      'claude-opus-5-5-foo',
      'claude-fable-5-1-20260901',
      'claude-fable-5-2-20261109',
      'claude-fable-5-20',
      'openai/gpt-6.1-sol',
      'claude-haiku-4-5-20261101',
      'constructor',
    ]) {
      assert.equal(resolveModelPrice(model), null, model)
      assert.equal(
        estimateCostUsd(model, { inputTokens: 1000, outputTokens: 1000 }),
        null,
        model,
      )
    }
  })

  it('keeps only explicitly registered dated aliases', () => {
    assert.equal(
      resolveModelPrice('CLAUDE-HAIKU-4-5-20251001')?.model,
      'claude-haiku-4-5',
    )
    const b = estimateCostBreakdown('claude-haiku-4-5-20251001', {
      inputTokens: 1000,
      outputTokens: 1000,
    })
    assert.ok(b)
    assert.deepEqual(
      b.prices['claude-haiku-4-5'],
      MODEL_PRICES.models['claude-haiku-4-5'],
    )
    assert.match(b.prices['claude-haiku-4-5'].source, /^https:/)
  })
})
