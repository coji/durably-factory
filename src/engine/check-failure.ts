/** Conservative diagnostics from a completed pinned check, never a product verdict. */
export type CheckFailureKind = 'timeout' | 'setup' | 'test' | 'unknown'

export function checkFailureKind(result: {
  passed: boolean
  stdout: string
  log?: { timedOutAfterMs?: number } | null
}): CheckFailureKind | null {
  if (result.passed) return null
  if (
    result.log?.timedOutAfterMs !== undefined ||
    /^check timed out:/m.test(result.stdout)
  )
    return 'timeout'
  // Use failure signatures, not the presence of an install/build command.
  if (
    /ERR_PNPM_(?:FETCH|NO_LOCKFILE|OUTDATED_LOCKFILE|RECURSIVE_EXEC_FIRST_FAIL)|npm (?:ERR!|error) (?:code )?(?:E(?:RESOLVE|CONNRESET|CONNREFUSED|NOTFOUND|AI_AGAIN)|ENOENT)|(?:install|build|compilation) (?:failed|failure)|Failed to (?:install|build|compile)|Cannot find (?:module|package)|Module not found|error TS\d+:/im.test(
      result.stdout,
    )
  )
    return 'setup'
  if (
    /(?:^|\n)[^\n]*(?:not ok \d+|[✖×] |FAIL(?:ED)?[ :]|AssertionError|tests? failed|[1-9]\d* failing|fail [1-9]\d*)/im.test(
      result.stdout,
    )
  )
    return 'test'
  return 'unknown'
}
