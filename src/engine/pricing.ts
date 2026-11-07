/**
 * API-equivalent price estimates (catalog rates are USD per million tokens).
 *
 * Comparison labels for local cost reasoning only — NOT subscription billing.
 * Unknown models, and usage missing either priced leg, yield null (never
 * zero-filled, never priced from a partial leg).
 *
 * Meters follow the AI SDK v7 usage contract: `inputTokens` is the whole
 * prompt, and cache read/write tokens are subsets of it. When a provider
 * reports the cache legs, the non-cached remainder is billed at the input
 * rate and each cache leg at its own multiplier. When it reports none, the
 * whole input is billed at the input rate and the breakdown says so.
 */
import catalog from './model-prices.json' with { type: 'json' }

export const PRICE_BASIS = {
  basis: 'api-equivalent-estimate',
  source:
    'Per-invocation costPrices contain the applied rates, source and verification date.',
} as const

export interface ModelPrice {
  provider: 'openai' | 'anthropic'
  /** USD per million tokens, Standard processing, short context. */
  input: number
  output: number
  cacheRead: number | null
  /** OpenAI 30-minute / Anthropic 5-minute writes; null if not published. */
  cacheWrite: number | null
  source: string
  checkedAt: string
  /** False for historical entries not present in the monitored tables. */
  monitor: boolean
  /** Only individually verified IDs may share this entry's rates. */
  aliases: string[]
  /** All meters switch when one request's total input exceeds this boundary. */
  longContext?: {
    inputTokensAbove: number
    input: number
    output: number
    cacheRead: number | null
    cacheWrite: number | null
  }
}

export interface PriceCatalog {
  version: number
  models: Record<string, ModelPrice>
}

export const MODEL_PRICES: PriceCatalog = catalog as PriceCatalog

const pricesById = new Map<string, { model: string; price: ModelPrice }>()
for (const [model, price] of Object.entries(MODEL_PRICES.models)) {
  for (const id of [model, ...price.aliases]) {
    if (pricesById.has(id)) throw new Error(`Duplicate pricing ID: ${id}`)
    pricesById.set(id, { model, price })
  }
}

/** Exact IDs and explicitly verified aliases only; never match a family. */
export function resolveModelPrice(model: string | null, prices = MODEL_PRICES) {
  if (!model) return null
  const id = model.toLowerCase()
  if (prices === MODEL_PRICES) return pricesById.get(id) ?? null
  const match = Object.entries(prices.models).find(
    ([key, price]) => key === id || price.aliases.includes(id),
  )
  return match ? { model: match[0], price: match[1] } : null
}

/** Named price meters, one per billable token kind. */
export const PRICING_METERS = [
  'input_tokens',
  'input_cache_read_tokens',
  'input_cache_write_tokens',
  'output_tokens',
] as const
export type PricingMeter = (typeof PRICING_METERS)[number]

export interface PriceableUsage {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
  /** Deduplicated API responses, not agent-call totals. */
  requests?: Omit<PriceableUsage, 'requests'>[]
}

export interface CostBreakdown {
  totalUsd: number
  /** USD billed per meter; a meter the provider never reported is absent. */
  meters: Partial<Record<PricingMeter, number>>
  /** False when no cache leg was reported and the whole input was priced flat. */
  cacheAware: boolean
  /** Applied catalog entries, saved with the invocation rather than re-read later. */
  prices: Record<string, ModelPrice>
}

/**
 * Price a complete usage row per meter. Null when the model is unknown or
 * either priced leg (input + output) is missing — a partial leg must never
 * read as a complete cost.
 */
export function estimateCostBreakdown(
  model: string | null,
  usage: PriceableUsage | null,
  prices = MODEL_PRICES,
): CostBreakdown | null {
  if (!usage) return null
  if (usage.inputTokens == null || usage.outputTokens == null) return null
  const matched = resolveModelPrice(model, prices)
  if (!matched) return null
  const { price } = matched
  if (price.longContext) {
    const requests = usage.requests
    if (requests) {
      if (!requests.length) return null
      // Final provider totals remain authoritative. A missing response or an
      // unfinished output stream must never turn into a complete estimate.
      for (const key of [
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
      ] as const) {
        if (
          requests.some(
            (r) =>
              r[key] == null || !Number.isFinite(r[key]) || (r[key] ?? -1) < 0,
          )
        )
          return null
        if (
          usage[key] != null &&
          requests.reduce((sum, r) => sum + (r[key] ?? 0), 0) !== usage[key]
        )
          return null
      }
      const meters: Partial<Record<PricingMeter, number>> = {}
      for (const request of requests) {
        if (
          (request.cacheReadTokens ?? 0) + (request.cacheWriteTokens ?? 0) >
          (request.inputTokens ?? 0)
        )
          return null
        const { longContext, ...base } = price
        const rates =
          (request.inputTokens ?? 0) > longContext.inputTokensAbove
            ? { ...base, ...longContext }
            : base
        const part = estimateCostBreakdown(matched.model, request, {
          version: 1,
          models: { [matched.model]: rates },
        })
        if (!part) return null
        for (const [meter, usd] of Object.entries(part.meters) as [
          PricingMeter,
          number,
        ][])
          meters[meter] = (meters[meter] ?? 0) + usd
      }
      return {
        totalUsd: Object.values(meters).reduce((sum, v) => sum + v, 0),
        meters,
        cacheAware: true,
        prices: { [matched.model]: price },
      }
    }
    // A small aggregate proves that every request was below the boundary.
    // A larger aggregate alone cannot tell us which requests crossed it.
    if (usage.inputTokens > price.longContext.inputTokensAbove) return null
  }
  const cacheRead = usage.cacheReadTokens ?? null
  const cacheWrite = usage.cacheWriteTokens ?? null
  const cacheAware = cacheRead !== null || cacheWrite !== null
  if (cacheRead != null && cacheRead > 0 && price.cacheRead === null)
    return null
  if (cacheWrite != null && cacheWrite > 0 && price.cacheWrite === null)
    return null
  const cached = (cacheRead ?? 0) + (cacheWrite ?? 0)
  // Providers that report cache legs count them inside inputTokens; never let
  // an inconsistent report produce a negative non-cached remainder.
  const nonCached = Math.max(0, usage.inputTokens - cached)
  const meters: Partial<Record<PricingMeter, number>> = {
    input_tokens: (nonCached / 1_000_000) * price.input,
    output_tokens: (usage.outputTokens / 1_000_000) * price.output,
  }
  if (cacheRead !== null)
    meters.input_cache_read_tokens =
      (cacheRead / 1_000_000) * (price.cacheRead ?? 0)
  if (cacheWrite !== null)
    meters.input_cache_write_tokens =
      (cacheWrite / 1_000_000) * (price.cacheWrite ?? 0)
  const totalUsd = Object.values(meters).reduce((sum, v) => sum + v, 0)
  return { totalUsd, meters, cacheAware, prices: { [matched.model]: price } }
}

/** Total of `estimateCostBreakdown`; null under the same conditions. */
export function estimateCostUsd(
  model: string | null,
  usage: PriceableUsage | null,
): number | null {
  return estimateCostBreakdown(model, usage)?.totalUsd ?? null
}

/**
 * Price usage that several models spent, each model's tokens at that
 * model's rate, summed per meter. Null when any model is unpriced or any
 * model's usage cannot be priced: the main model's rate is never assumed
 * for another model's tokens.
 */
export function estimateCostBreakdownByModel(
  byModel: Record<string, PriceableUsage>,
  catalog = MODEL_PRICES,
): CostBreakdown | null {
  const entries = Object.entries(byModel)
  if (entries.length === 0) return null
  const meters: Partial<Record<PricingMeter, number>> = {}
  let cacheAware = false
  const prices: Record<string, ModelPrice> = {}
  for (const [model, usage] of entries) {
    const part = estimateCostBreakdown(model, usage, catalog)
    if (!part) return null
    cacheAware ||= part.cacheAware
    Object.assign(prices, part.prices)
    for (const [meter, usd] of Object.entries(part.meters) as [
      PricingMeter,
      number,
    ][])
      meters[meter] = (meters[meter] ?? 0) + usd
  }
  const totalUsd = Object.values(meters).reduce((sum, v) => sum + v, 0)
  return { totalUsd, meters, cacheAware, prices }
}

/** Models with observed usage that cannot be priced, including unsupported meters. */
export function unpricedModels(
  byModel: Record<string, PriceableUsage>,
  catalog = MODEL_PRICES,
): string[] {
  return Object.entries(byModel)
    .filter(
      ([model, usage]) =>
        !resolveModelPrice(model, catalog) ||
        (resolveModelPrice(model, catalog)?.price.longContext !== undefined &&
          estimateCostBreakdown(model, usage, catalog) === null) ||
        (usage.cacheReadTokens != null &&
          usage.cacheReadTokens > 0 &&
          resolveModelPrice(model, catalog)?.price.cacheRead === null) ||
        (usage.cacheWriteTokens != null &&
          usage.cacheWriteTokens > 0 &&
          resolveModelPrice(model, catalog)?.price.cacheWrite === null),
    )
    .map(([model]) => model)
    .sort()
}
