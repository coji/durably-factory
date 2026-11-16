/**
 * Reference files (`trigger --reference`) and check artifacts
 * (`checkArtifacts`): files that are not text inputs, such as an HTML mock
 * and its screenshots, or the screenshots a check took of a candidate.
 *
 * A reference is read once at trigger: it is hashed and copied into a
 * staging directory of its own under the state root, before the run exists.
 * The run's setup copies it from there into the run's own `references/`
 * directory, checks every file against the hash recorded at trigger, and
 * removes the stage, so editing the original afterwards changes nothing. A
 * repair, recheck or retrigger keeps the same stored list and copies the
 * same files from its parent run's `references/`.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path'

/** The most a run's references may hold in total, in bytes. */
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

/** The most a candidate's copied check artifacts may hold, in bytes. */
export const MAX_CHECK_ARTIFACT_BYTES = 50 * 1024 * 1024

/** One reference file as the run records it. */
export interface ReferenceFile {
  /** Path relative to the references directory, with `/` separators. */
  name: string
  size: number
  sha256: string
}

/** The run's own copy of its references: the directory and what is in it. */
export interface ReferenceFiles {
  dir: string
  files: ReferenceFile[]
}

/** The absolute path of each reference file in the run's own copy. */
export function referencePaths(
  references: ReferenceFiles | null | undefined,
): string[] {
  return (references?.files ?? []).map((file) =>
    join(references?.dir ?? '', ...file.name.split('/')),
  )
}

/** What trigger stores: where setup copies from, and what it must find. */
export interface StoredReferences {
  source: string
  files: ReferenceFile[]
}

const sha256Of = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex')

/** Where trigger stages references, one directory per trigger. */
function stagingRootOf(stateRoot: string): string {
  return join(stateRoot, 'references')
}

/**
 * A trigger's own staging directory: by the hash of its list and a random
 * part, so removing one run's stage never takes another run's.
 */
function stagingDirOf(stateRoot: string, files: ReferenceFile[]): string {
  return join(
    stagingRootOf(stateRoot),
    `${sha256Of(JSON.stringify(files))}-${randomUUID()}`,
  )
}

/** The run's own copy of its references. */
export function referencesDirOf(runRoot: string): string {
  return join(runRoot, 'references')
}

/** Every regular file under `dir`, refusing a symbolic link anywhere in it. */
async function filesIn(
  dir: string,
  refuse: (why: string) => Error,
): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink())
      throw refuse(
        `${path} is a symbolic link; symbolic links are not accepted`,
      )
    if (entry.isDirectory()) out.push(...(await filesIn(path, refuse)))
    else if (entry.isFile()) out.push(path)
    else throw refuse(`${path} is not a regular file`)
  }
  return out
}

/**
 * Read every `--reference` path once, refuse symbolic links, anything that
 * is neither a file nor a directory, two files of the same name and a total
 * over `MAX_REFERENCE_BYTES`, and copy the files into the staging directory.
 * A file is named by its base name; a directory's files by the directory's
 * base name and their path below it. Nothing is written when one is refused.
 */
export async function stageReferences(
  paths: string[],
  stateRoot: string,
): Promise<StoredReferences> {
  const found: { name: string; path: string }[] = []
  for (const given of paths) {
    const refuse = (why: string) => new Error(`--reference ${given}: ${why}`)
    const abs = resolve(given)
    let info
    try {
      info = await lstat(abs)
    } catch {
      throw refuse('cannot read it')
    }
    if (info.isSymbolicLink())
      throw refuse(
        'is a symbolic link; pass the file or directory it points to',
      )
    if (info.isFile()) found.push({ name: basename(abs), path: abs })
    else if (info.isDirectory()) {
      const files = await filesIn(abs, refuse)
      if (files.length === 0) throw refuse('the directory holds no files')
      for (const file of files)
        found.push({
          name: [basename(abs), ...file.slice(abs.length + 1).split(sep)].join(
            '/',
          ),
          path: file,
        })
    } else throw refuse('is neither a file nor a directory')
  }
  const names = new Set<string>()
  for (const { name } of found) {
    if (names.has(name))
      throw new Error(
        `--reference: two references are named ${name}; rename one of them`,
      )
    names.add(name)
  }
  const limit = `the limit is ${MAX_REFERENCE_BYTES / 1024 / 1024} MiB`
  let total = 0
  const read: { name: string; bytes: Buffer }[] = []
  for (const { name, path } of found) {
    // Sized before reading, so an oversized file is never loaded.
    total += (await lstat(path)).size
    if (total > MAX_REFERENCE_BYTES)
      throw new Error(
        `--reference: the references are over ${MAX_REFERENCE_BYTES} bytes in total; ${limit}`,
      )
    read.push({ name, bytes: await readFile(path) })
  }
  const files = read.map(({ name, bytes }) => ({
    name,
    size: bytes.length,
    sha256: sha256Of(bytes),
  }))
  const staged = stagingDirOf(stateRoot, files)
  const temporary = `${staged}.${process.pid}.${Date.now()}.tmp`
  await rm(temporary, { recursive: true, force: true })
  for (const { name, bytes } of read) {
    const to = join(temporary, ...name.split('/'))
    await mkdir(dirname(to), { recursive: true })
    await writeFile(to, bytes)
  }
  await mkdir(dirname(staged), { recursive: true })
  await rename(temporary, staged)
  return { source: staged, files }
}

/**
 * Every recorded file read from `source`, each checked against its size and
 * SHA-256; the reason it cannot be used otherwise.
 */
async function readVerified(
  source: string,
  files: ReferenceFile[],
): Promise<{ name: string; bytes: Buffer }[] | string> {
  const out: { name: string; bytes: Buffer }[] = []
  for (const file of files) {
    let bytes: Buffer
    try {
      bytes = await readFile(join(source, ...file.name.split('/')))
    } catch {
      return `${file.name} is missing from ${source}`
    }
    if (bytes.length !== file.size || sha256Of(bytes) !== file.sha256)
      return `${file.name} in ${source} no longer matches the SHA-256 recorded at trigger`
    out.push({ name: file.name, bytes })
  }
  return out
}

/** Whether `dir` holds exactly the recorded files, each as recorded. */
async function holdsExactly(
  dir: string,
  files: ReferenceFile[],
): Promise<boolean> {
  let present: string[]
  try {
    present = (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((e) => !e.isDirectory())
      .map((e) =>
        relative(dir, join(e.parentPath, e.name)).split(sep).join('/'),
      )
  } catch {
    return false
  }
  if (present.length !== files.length) return false
  const names = new Set(files.map((f) => f.name))
  if (!present.every((name) => names.has(name))) return false
  return typeof (await readVerified(dir, files)) !== 'string'
}

/**
 * Copy a run's stored references into its own directory `dir`, checking
 * each file's size and SHA-256 against what trigger recorded. The files are
 * read from the first of `parents` (an earlier run's own `references/`, for
 * a repair, recheck or retrigger) that holds them all as recorded, and from
 * the trigger's stage otherwise. A `dir` that already holds exactly them,
 * as when setup runs again after it copied them, is kept.
 */
export async function copyReferences(
  stored: StoredReferences,
  dir: string,
  parents: string[] = [],
): Promise<ReferenceFiles> {
  if (await holdsExactly(dir, stored.files)) return { dir, files: stored.files }
  let read: { name: string; bytes: Buffer }[] | string = 'none'
  for (const source of [...parents, stored.source]) {
    read = await readVerified(source, stored.files)
    if (typeof read !== 'string') break
  }
  if (typeof read === 'string')
    throw new Error(
      `references: cannot copy the references recorded at trigger: ${read}`,
    )
  await rm(dir, { recursive: true, force: true })
  for (const { name, bytes } of read) {
    const to = join(dir, ...name.split('/'))
    await mkdir(dirname(to), { recursive: true })
    await writeFile(to, bytes)
  }
  return { dir, files: stored.files }
}

/**
 * The stored references of a new run made from an earlier run's input:
 * read from that run's own copy when it holds them, since its setup removed
 * the stage; as stored otherwise.
 */
export async function referencesFromRun(
  stored: StoredReferences,
  runRoot: string,
): Promise<StoredReferences> {
  const dir = referencesDirOf(runRoot)
  return (await holdsExactly(dir, stored.files))
    ? { source: dir, files: stored.files }
    : stored
}

/**
 * Remove the trigger's stage once the run holds its own copy. Only a stage
 * directly under `<stateRoot>/references/` is removed.
 */
export async function removeStagedReferences(
  stored: StoredReferences,
  stateRoot: string,
): Promise<void> {
  if (dirname(resolve(stored.source)) !== resolve(stagingRootOf(stateRoot)))
    return
  await rm(stored.source, { recursive: true, force: true })
}

/**
 * Why `checkArtifacts` cannot name a directory inside the worktree, or
 * null when it can: it must be relative and stay below the worktree.
 */
export function checkArtifactsPathProblem(path: string): string | null {
  if (isAbsolute(path)) return 'must be relative to the work directory'
  // The directory is removed before every check, so it must never be the
  // work directory itself, anything above it, or its `.git`.
  const normal = normalizeCheckArtifactsPath(path)
  if (normal === '' || normal === '.' || normal.split('/')[0] === '..')
    return 'must name a directory inside the work directory'
  if (normal.split('/')[0] === '.git') return 'must not be inside .git'
  return null
}

/**
 * `checkArtifacts` as stored: normalised, with `/` separators and no
 * trailing separator, so `.factory/artifacts/` and `./.factory/artifacts`
 * name the same directory.
 */
export function normalizeCheckArtifactsPath(path: string): string {
  return normalize(path)
    .split(sep)
    .filter((part) => part !== '')
    .join('/')
}

/**
 * Copy the check's artifact directory, when it exists, into `to`, afresh:
 * regular files only, symbolic links skipped, and at most
 * `MAX_CHECK_ARTIFACT_BYTES` in total, in name order. Returns the copied
 * files' paths relative to `to`; empty when there was nothing to copy.
 */
export async function copyCheckArtifacts(
  from: string,
  to: string,
): Promise<string[]> {
  await rm(to, { recursive: true, force: true })
  let info
  try {
    info = await lstat(from)
  } catch {
    return []
  }
  if (!info.isDirectory()) return []
  const copied: string[] = []
  let total = 0
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        const size = (await lstat(path)).size
        if (total + size > MAX_CHECK_ARTIFACT_BYTES) continue
        total += size
        const rel = relative(from, path)
        await mkdir(dirname(join(to, rel)), { recursive: true })
        await writeFile(join(to, rel), await readFile(path))
        copied.push(rel.split(sep).join('/'))
      }
    }
  }
  await walk(from)
  return copied
}

/** The files under a candidate's copied artifacts, relative; empty when none. */
export async function checkArtifactFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(dir, join(e.parentPath, e.name)))
      .map((rel) => rel.split(sep).join('/'))
      .sort()
  } catch {
    return []
  }
}

/** A candidate's copy of its check artifacts, beside its diff. */
export function candidateArtifactsDirOf(candidateDir: string): string {
  return join(candidateDir, 'artifacts')
}
