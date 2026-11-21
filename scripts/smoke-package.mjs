import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
const tarball = resolve(process.argv[2])
const scratch = await realpath(
  await mkdtemp(join(tmpdir(), 'factory-package-')),
)
const home = join(scratch, 'home')
const env = {
  ...process.env,
  HOME: home,
  DURABLY_FACTORY_STATE_DIR: './factory state',
  DURABLY_FACTORY_NO_AUTO_WORKER: '0',
  DURABLY_FACTORY_IDLE_MS: '7000',
  FAKE_FAIL_FIRST: '0',
  FAKE_REVIEW_SEQUENCE: 'pass',
}
const workers = new Set()

async function command(file, args, cwd, expected = 0) {
  try {
    const result = await run(file, args, { cwd, env, timeout: 120_000 })
    assert.equal(
      expected,
      0,
      `${file} ${args.join(' ')} unexpectedly succeeded`,
    )
    return result.stdout.trim()
  } catch (error) {
    if (expected !== 0 && error.code === expected) return error.stdout.trim()
    throw new Error(
      `${file} ${args.join(' ')}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      { cause: error },
    )
  }
}

const pnpm = (cwd, ...args) => command('pnpm', args, cwd)
const factory = (cwd, ...args) => pnpm(cwd, 'exec', 'factory', ...args)

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

async function until(action) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const result = await action()
    if (result) return result
    await delay(100)
  }
  throw new Error('timed out waiting for a process')
}

async function install(project, archive) {
  await pnpm(project, 'add', '--save-dev', '--save-exact', archive)
}

async function finishRun(project) {
  const started = JSON.parse(
    await factory(
      project,
      'trigger',
      '--provider',
      'fake',
      '--max-iterations',
      '1',
    ),
  )
  const worker = started.worker.autoStarted
  assert.ok(worker, 'the installed CLI should launch its worker')
  workers.add(worker.pid)
  const stateDir = join(project, 'factory state')
  assert.equal(started.db, join(stateDir, 'durably-factory.db'))
  assert.ok(worker.log.startsWith(join(stateDir, 'logs') + '/'))
  const runFlag = ['--run', started.runId]
  const wait = [
    'exec',
    'factory',
    'wait',
    ...runFlag,
    '--timeout',
    '20000',
    '--format',
    'json',
  ]
  await command('pnpm', wait, project, 2)
  const metadata = JSON.parse(
    await readFile(join(stateDir, 'worker.json'), 'utf8'),
  )
  assert.equal(metadata.pid, worker.pid)
  assert.equal(metadata.factoryVersion, await factory(project, '--version'))
  const waits = JSON.parse(await factory(project, 'waits', ...runFlag))
  assert.equal(waits.length, 1)
  await factory(project, 'approve', ...runFlag, '--wait', waits[0].id)
  await pnpm(project, ...wait)
  await until(() => !alive(worker.pid))
  workers.delete(worker.pid)
  assert.match(await readFile(worker.log, 'utf8'), /\[shutdown\] reason=idle/)
  return started.runId
}

async function checkUi(project, runId) {
  // Listen on an OS-selected port. The built server is tested with only
  // the dependencies installed from the tarball in the consumer.
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { startUiServer } from './node_modules/@coji/durably-factory/dist/server/ui/server.js'
     import { configuredStateRoot } from './node_modules/@coji/durably-factory/dist/server/durably.js'
     const ui = await startUiServer({ port: 0, stateRoot: configuredStateRoot() })
     console.log(ui.url)
     process.on('SIGTERM', () => void ui.close())`,
    ],
    { cwd: project, env, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const closed = new Promise((resolve) => child.once('close', resolve))
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk
  })
  try {
    const url = await until(() => {
      assert.equal(child.exitCode, null, 'the packaged UI should start')
      return output.includes('\n') && output.trim()
    })
    const response = await fetch(url)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /name="loop-ui-token" content="[a-f0-9]{64}"/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
    assert.ok(js)
    assert.equal(
      (await fetch(new URL(js, url), { method: 'HEAD' })).status,
      200,
    )
    const detail = await fetch(new URL(`/api/runs/${runId}`, url))
    assert.equal(detail.status, 200)
  } finally {
    child.kill('SIGTERM')
    await closed
  }
}

try {
  await mkdir(home)
  await command('tar', ['-xzf', tarball, '-C', scratch], scratch)
  const repack = join(scratch, 'package')
  const manifestFile = join(repack, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  const version = manifest.version
  const nextVersion = version.includes('-')
    ? `${version}.smoke`
    : `${version}-smoke`
  await writeFile(
    manifestFile,
    JSON.stringify({ ...manifest, version: nextVersion }),
  )
  const secondTarball = join(scratch, 'second.tgz')
  await pnpm(repack, 'pack', '--out', secondTarball)

  const sources = [
    join(scratch, 'first project'),
    join(scratch, 'second project'),
  ]
  for (const project of sources) {
    await mkdir(project)
    await writeFile(
      join(project, 'package.json'),
      JSON.stringify({ private: true }),
    )
    await writeFile(
      join(project, 'pnpm-workspace.yaml'),
      'allowBuilds:\n  better-sqlite3: true\n',
    )
  }
  const [first, second] = sources
  await install(first, tarball)
  await install(second, secondTarball)
  assert.equal(await pnpm(first, 'factory', '--version'), version)
  assert.equal(await factory(second, '--version'), nextVersion)
  await rm(join(first, 'node_modules'), { recursive: true })
  await pnpm(first, 'install', '--frozen-lockfile')
  assert.equal(await factory(first, '--version'), version)
  const versionOutput = await command(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { execFileSync } from 'node:child_process'
     import { claudeExecutable } from './node_modules/@coji/durably-factory/dist/server/engine/providers/claude.js'
     console.log(execFileSync(claudeExecutable(), ['--version'], { encoding: 'utf8' }).trim())`,
    ],
    first,
  )
  console.log(`Packaged Claude Code: ${versionOutput}`)

  const results = await Promise.allSettled([
    finishRun(first),
    finishRun(second),
  ])
  const [firstRun, secondRun] = results.map((result) => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
  for (const [project, own, other] of [
    [first, firstRun, secondRun],
    [second, secondRun, firstRun],
  ]) {
    const ownStatus = JSON.parse(await factory(project, 'status', '--run', own))
    const otherStatus = JSON.parse(
      await factory(project, 'status', '--run', other),
    )
    assert.equal(ownStatus.run.id, own)
    assert.equal(otherStatus.run, null)
  }
  assert.ok(!existsSync(join(home, '.local', 'state', 'durably-factory')))
  await checkUi(first, firstRun)
  await install(first, secondTarball)
  assert.equal(await factory(first, '--version'), nextVersion)
  const old = JSON.parse(
    await factory(first, 'report', '--run', firstRun, '--format', 'json'),
  )
  assert.equal(old.factoryVersion, version)
  await factory(first, 'report', '--run', firstRun, '--out', 'historical.md')
  assert.ok(
    (await readFile(join(first, 'historical.md'), 'utf8')).includes(
      `- factory version: ${version}`,
    ),
  )
  const newer = JSON.parse(
    await factory(second, 'report', '--run', secondRun, '--format', 'json'),
  )
  assert.equal(newer.factoryVersion, nextVersion)
  console.log(
    `Isolated runs and historical report versions verified: ${version}, ${nextVersion}`,
  )
} finally {
  for (const pid of workers) {
    if (alive(pid)) process.kill(pid, 'SIGTERM')
    await until(() => !alive(pid))
  }
  await rm(scratch, { recursive: true, force: true })
}
