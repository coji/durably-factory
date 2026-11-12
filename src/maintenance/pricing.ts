import type { ModelPrice, PriceCatalog } from '../engine/pricing.js'

export const PRICING_SOURCES = {
  openai: 'https://developers.openai.com/api/docs/pricing',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
} as const

type Provider = keyof typeof PRICING_SOURCES
type Rates = Pick<
  ModelPrice,
  | 'input'
  | 'output'
  | 'cacheRead'
  | 'cacheWrite'
  | 'cacheWrite1h'
  | 'longContext'
>

interface Table {
  heading: string
  headers: string[]
  rows: string[][]
}

/** Deliberately narrow: a changed table contract fails rather than guessing. */
function tables(markdown: string): Table[] {
  const result: Table[] = []
  let heading = ''
  let current: Table | null = null
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,6} /.test(line)) heading = line.replace(/^#+ /, '').trim()
    if (!line.trim().startsWith('|')) {
      current = null
      continue
    }
    const cells = line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim())
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    if (!current) {
      current = { heading, headers: cells, rows: [] }
      result.push(current)
    } else {
      if (cells.length !== current.headers.length)
        throw new Error(`Pricing table column count changed: ${heading}`)
      current.rows.push(cells)
    }
  }
  return result
}

function dollars(cell: string | undefined, required: true): number
function dollars(cell: string | undefined, required?: false): number | null
function dollars(cell: string | undefined, required = false): number | null {
  if (cell === undefined) {
    if (required) throw new Error('Missing required price column')
    return null
  }
  const value = cell.replace(/<sup>.*?<\/sup>/g, '').trim()
  if (!required && value === '-') return null
  const match = /^\$(\d+(?:\.\d+)?)(?:\s*\/\s*MTok)?$/.exec(value)
  if (!match) throw new Error(`Unrecognized token price: ${cell}`)
  const price = Number(match[1])
  if (!Number.isFinite(price)) throw new Error(`Invalid token price: ${cell}`)
  return price
}

export function parsePrices(provider: Provider, markdown: string) {
  const prices: Record<string, Rates> = {}
  const skipped = new Set<string>()
  const tiers = new Map<
    string,
    {
      short?: { boundary: number; rates: Rates }
      long?: { boundary: number; rates: Rates }
    }
  >()
  let matchedTables = 0
  const add = (model: string, rates: Rates) => {
    if (
      prices[model] &&
      JSON.stringify(prices[model]) !== JSON.stringify(rates)
    )
      throw new Error(`Conflicting Standard prices for ${model}`)
    prices[model] = rates
  }
  for (const table of tables(markdown)) {
    const { headers, rows, heading } = table
    const column = (row: string[], name: string) => row[headers.indexOf(name)]
    if (provider === 'openai') {
      if (heading !== 'Standard pricing data' || headers[0] !== 'Model')
        continue
      const short = headers.includes('Short context input')
      const input = short ? 'Short context input' : 'Input'
      const output = short ? 'Short context output' : 'Output'
      const read = short ? 'Short context cached input' : 'Cached input'
      if (
        !headers.includes(input) ||
        !headers.includes(output) ||
        !headers.includes(read)
      )
        throw new Error('OpenAI Standard pricing columns changed')
      matchedTables++
      for (const row of rows) {
        const model = row[0].replace(/ \(<272K context length\)$/, '')
        if (!/^(?:gpt-[a-z0-9][a-z0-9.-]*|o\d[a-z0-9.-]*)$/.test(model)) {
          skipped.add(row[0])
          continue
        }
        add(model, {
          input: dollars(column(row, input), true),
          output: dollars(column(row, output), true),
          cacheRead: dollars(column(row, read)),
          cacheWrite: dollars(
            column(row, short ? 'Short context 30m write' : '30m write'),
          ),
        })
      }
    } else {
      if (heading !== 'Model pricing' || headers[0] !== 'Model') continue
      for (const name of [
        'Base input tokens',
        '5m cache writes',
        '1h cache writes',
        'Cache hits and refreshes',
        'Output tokens',
      ])
        if (!headers.includes(name))
          throw new Error('Anthropic pricing columns changed')
      matchedTables++
      for (const row of rows) {
        const tier =
          /^(Claude [A-Za-z]+ \d+(?:\.\d+)*) \(for prompts (up to|over) ([\d,]+) tokens\)$/.exec(
            row[0],
          )
        if (/retired/i.test(row[0]) || (/for prompts/i.test(row[0]) && !tier)) {
          skipped.add(row[0])
          continue
        }
        const match = /^Claude ([A-Za-z]+) (\d+(?:\.\d+)*)(?:\s+\(.*\))?$/.exec(
          tier?.[1] ?? row[0],
        )
        if (!match) {
          skipped.add(row[0])
          continue
        }
        const model = `claude-${match[1].toLowerCase()}-${match[2].replaceAll('.', '-')}`
        const rates: Rates = {
          input: dollars(column(row, 'Base input tokens'), true),
          output: dollars(column(row, 'Output tokens'), true),
          cacheRead: dollars(column(row, 'Cache hits and refreshes')),
          cacheWrite: dollars(column(row, '5m cache writes')),
          cacheWrite1h: dollars(column(row, '1h cache writes')),
        }
        if (tier) {
          const pair = tiers.get(model) ?? {}
          const key = tier[2] === 'up to' ? 'short' : 'long'
          const value = { boundary: Number(tier[3].replaceAll(',', '')), rates }
          if (pair[key] && JSON.stringify(pair[key]) !== JSON.stringify(value))
            throw new Error(`Conflicting context prices for ${model}`)
          pair[key] = value
          tiers.set(model, pair)
        } else add(model, rates)
      }
    }
  }
  for (const [model, { short, long }] of tiers) {
    if (
      !short ||
      !long ||
      short.boundary !== long.boundary ||
      !Number.isSafeInteger(short.boundary) ||
      short.boundary <= 0
    )
      throw new Error(`Incomplete context pricing tiers for ${model}`)
    add(model, {
      ...short.rates,
      longContext: { inputTokensAbove: short.boundary, ...long.rates },
    })
  }
  if (matchedTables === 0 || Object.keys(prices).length === 0)
    throw new Error(`No supported ${provider} pricing tables found`)
  return { prices, skipped: [...skipped].sort() }
}

export function validateCatalog(value: unknown): asserts value is PriceCatalog {
  const catalog = value as PriceCatalog
  if (
    catalog?.version !== 1 ||
    !catalog.models ||
    typeof catalog.models !== 'object'
  )
    throw new Error('Unsupported price catalog')
  const ids = new Set<string>()
  for (const [model, price] of Object.entries(catalog.models)) {
    if (
      !/^[a-z0-9][a-z0-9.-]+$/.test(model) ||
      !Object.hasOwn(PRICING_SOURCES, price.provider) ||
      price.source !== PRICING_SOURCES[price.provider] ||
      !/^\d{4}-\d{2}-\d{2}$/.test(price.checkedAt) ||
      typeof price.monitor !== 'boolean' ||
      !Array.isArray(price.aliases)
    )
      throw new Error(`Invalid price metadata: ${model}`)
    for (const meter of [
      'input',
      'output',
      'cacheRead',
      'cacheWrite',
    ] as const) {
      const rate = price[meter]
      if (rate === null && (meter === 'cacheRead' || meter === 'cacheWrite'))
        continue
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0)
        throw new Error(`Invalid ${meter} price: ${model}`)
    }
    for (const rates of [price, price.longContext]) {
      const hour = rates?.cacheWrite1h
      if (
        hour != null &&
        (typeof hour !== 'number' || !Number.isFinite(hour) || hour < 0)
      )
        throw new Error(`Invalid cacheWrite1h price: ${model}`)
    }
    if (price.longContext !== undefined) {
      const tier = price.longContext
      if (
        !tier ||
        !Number.isSafeInteger(tier.inputTokensAbove) ||
        tier.inputTokensAbove <= 0
      )
        throw new Error(`Invalid context boundary: ${model}`)
      for (const meter of [
        'input',
        'output',
        'cacheRead',
        'cacheWrite',
      ] as const) {
        const rate = tier[meter]
        if (rate === null && (meter === 'cacheRead' || meter === 'cacheWrite'))
          continue
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0)
          throw new Error(`Invalid long-context ${meter} price: ${model}`)
      }
    }
    for (const id of [model, ...price.aliases]) {
      if (
        typeof id !== 'string' ||
        !/^[a-z0-9][a-z0-9.-]+$/.test(id) ||
        ids.has(id)
      )
        throw new Error(`Invalid or duplicate pricing ID: ${id}`)
      ids.add(id)
    }
  }
}

export interface PriceChange {
  model: string
  before: ModelPrice | null
  after: ModelPrice
}

export function catalogChanges(
  before: PriceCatalog,
  after: PriceCatalog,
): PriceChange[] {
  return Object.entries(after.models)
    .filter(
      ([model, price]) =>
        JSON.stringify(before.models[model]) !== JSON.stringify(price),
    )
    .map(([model, price]) => ({
      model,
      before: before.models[model] ?? null,
      after: price,
    }))
}

/** Validate both documents and update registered models only; adoption is manual. */
export function updatePrices(
  catalog: PriceCatalog,
  documents: Record<Provider, string>,
  checkedAt: string,
) {
  validateCatalog(catalog)
  const next = structuredClone(catalog)
  const changes: PriceChange[] = []
  const skipped: string[] = []
  for (const provider of ['openai', 'anthropic'] as const) {
    const parsed = parsePrices(provider, documents[provider])
    skipped.push(...parsed.skipped.map((name) => `${provider}: ${name}`))
    for (const [model, old] of Object.entries(catalog.models)) {
      if (
        old.provider === provider &&
        old.monitor &&
        !Object.hasOwn(parsed.prices, model)
      )
        throw new Error(
          `Monitored model missing from ${provider} table: ${model}. Keep the catalog and review the source.`,
        )
    }
    for (const [model, rates] of Object.entries(parsed.prices)) {
      if (!Object.hasOwn(catalog.models, model)) continue
      const before = catalog.models[model]
      if (before.provider !== provider)
        throw new Error(`Provider collision: ${model}`)
      if (
        before.source === PRICING_SOURCES[provider] &&
        (
          [
            'input',
            'output',
            'cacheRead',
            'cacheWrite',
            'cacheWrite1h',
            'longContext',
          ] as const
        ).every(
          (key) => JSON.stringify(before[key]) === JSON.stringify(rates[key]),
        )
      )
        continue
      const after: ModelPrice = {
        provider,
        ...rates,
        source: PRICING_SOURCES[provider],
        checkedAt,
        monitor: true,
        aliases: before.aliases,
      }
      next.models[model] = after
      changes.push({ model, before, after })
    }
  }
  next.models = Object.fromEntries(
    Object.entries(next.models).sort(([a], [b]) => a.localeCompare(b)),
  )
  validateCatalog(next)
  return { catalog: next, changes, skipped }
}

function ratesText(price: ModelPrice | null) {
  if (!price) return 'unregistered'
  const format = (rates: Rates) =>
    [
      rates.input,
      rates.output,
      rates.cacheRead,
      rates.cacheWrite,
      rates.cacheWrite1h ?? null,
    ]
      .map((v) => (v === null ? 'unpublished' : `$${v}`))
      .join(' / ')
  return price.longContext
    ? `≤${price.longContext.inputTokensAbove} input tokens: ${format(price)}; above: ${format(price.longContext)}`
    : format(price)
}

export function priceUpdateMarkdown(
  changes: PriceChange[],
  skipped: string[],
  checkedAt: string,
) {
  return [
    `Official model pricing checked on ${checkedAt}.`,
    '',
    'Standard processing. Rates are USD per million tokens in input / output / cache read / cache write / 1h cache write order. OpenAI uses short context. Conditional Anthropic rates show the per-request input boundary, including cache reads and writes. Writes use OpenAI 30-minute or Anthropic 5-minute retention; the final meter is Anthropic 1-hour retention.',
    '',
    '| Model | Before | Proposed | Source |',
    '| --- | --- | --- | --- |',
    ...changes.map(
      ({ model, before, after }) =>
        `| ${model} | ${ratesText(before)} | ${ratesText(after)} | [official pricing](${after.source}) |`,
    ),
    '',
    'Only registered models are updated. Select and register new models manually. Review rate changes and pricing conditions before merging. Existing invocation estimates and their recorded sources are retained.',
    ...(skipped.length
      ? [
          '',
          'Rows requiring manual review (not imported):',
          ...skipped.map((name) => `- ${name.replaceAll('|', '\\|')}`),
        ]
      : []),
    '',
  ].join('\n')
}

export async function fetchPriceDocuments(fetcher: typeof fetch = fetch) {
  const documents = await Promise.all(
    (['openai', 'anthropic'] as const).map(async (provider) => {
      const response = await fetcher(`${PRICING_SOURCES[provider]}.md`, {
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: 'text/markdown' },
      })
      if (!response.ok)
        throw new Error(
          `${provider} pricing fetch failed: HTTP ${response.status}`,
        )
      const document = await response.text()
      if (document.length > 2_000_000)
        throw new Error(`${provider} pricing document is unexpectedly large`)
      return [provider, document] as const
    }),
  )
  return Object.fromEntries(documents) as Record<Provider, string>
}
