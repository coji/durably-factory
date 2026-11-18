import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const isSourceCheckout = import.meta.url.endsWith('.ts')
export const packageRoot = resolve(
  fileURLToPath(new URL(isSourceCheckout ? '../' : '../../', import.meta.url)),
)
export const cliPath = fileURLToPath(
  new URL(isSourceCheckout ? './cli.ts' : './cli.js', import.meta.url),
)

const manifest = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
) as { version?: string }

export const factoryVersion = manifest.version ?? null
