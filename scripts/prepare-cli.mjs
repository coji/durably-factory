import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const out = new URL('../dist/server/', import.meta.url)
const provider = new URL(import.meta.resolve('ai-sdk-provider-claude-code'))
const license = new URL('../LICENSE', provider)
const providerManifest = new URL(
  import.meta.resolve('ai-sdk-provider-claude-code/package.json'),
)
const { version } = JSON.parse(await readFile(providerManifest, 'utf8'))

// The provider pins an older Claude Agent SDK. Ship its MIT-licensed JS
// with the tested SDK as a normal dependency, so it resolves the right
// native binary on the machine installing Factory.
const vendor = new URL('vendor/claude-provider/', out)
await mkdir(vendor, { recursive: true })
await copyFile(provider, new URL('index.js', vendor))
await copyFile(license, new URL('LICENSE', vendor))
await writeFile(
  new URL('package.json', vendor),
  JSON.stringify({ type: 'module', version }) + '\n',
)
await chmod(new URL('cli.js', out), 0o755)
