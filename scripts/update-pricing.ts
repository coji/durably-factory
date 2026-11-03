import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  fetchPriceDocuments,
  catalogChanges,
  priceUpdateMarkdown,
  updatePrices,
  validateCatalog,
} from '../src/maintenance/pricing.js'

const args = process.argv.slice(2)
let basePath: string | undefined
let write = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--write') write = true
  else if (args[i] === '--base' && args[i + 1]) basePath = args[++i]
  else
    throw new Error(
      'Usage: pnpm pricing:check [--write] [--base <catalog.json>]',
    )
}
const path = resolve('src/engine/model-prices.json')
const current = JSON.parse(await readFile(path, 'utf8'))
const checkedAt = new Date().toISOString().slice(0, 10)
const documents = await fetchPriceDocuments()
const update = updatePrices(current, documents, checkedAt)
const base = basePath ? JSON.parse(await readFile(basePath, 'utf8')) : current
validateCatalog(base)
const report = priceUpdateMarkdown(
  catalogChanges(base, update.catalog),
  update.skipped,
  checkedAt,
)
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report)
if (process.env.PRICING_PR_BODY)
  await writeFile(process.env.PRICING_PR_BODY, report)
if (write && update.changes.length > 0) {
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(update.catalog, null, 2)}\n`)
  await rename(temporary, path)
}
