import { parseImplementerNotes } from './prompts.js'

export interface RepairFinding {
  id: string
  text: string
  /** Only the two explicit do-not-change dispositions are recognized. */
  disposition: 'non-actionable' | 'deferred' | null
}

export interface FindingTreatment {
  id: string
  status: 'fixed' | 'not-changed' | 'disputed'
  detail: string
}

export interface ReportedCheck {
  id: string
  command: string[]
  status: 'pass' | 'fail' | 'not-run' | 'not-reported' | 'invalid'
  detail: string | null
}

export interface CodeResponse {
  iteration: number
  role: 'implement' | 'repair'
  correction: boolean
  notes: string | null
  /** All results and treatments are implementer claims, never trusted evidence. */
  source: 'self-reported'
  checks: ReportedCheck[]
  findings: RepairFinding[]
  treatments: FindingTreatment[]
  missing: string[]
}

const ID = '(?=[A-Za-z0-9_-]*\\d)[A-Za-z][A-Za-z0-9_-]{0,31}'
const EXPLICIT_ID = new RegExp(`^(${ID})\\s*[:：]\\s*([\\s\\S]+)$`)
const DISPOSITION = new RegExp(
  `^\\s*(?:[-*]\\s+)?(${ID})\\s*[:：]\\s*(non-actionable|deferred)\\b(.*)$`,
  'i',
)

/** Never count a quoted example in a fenced code block as the agent's reply. */
function plainLines(text: string): string[] {
  const lines: string[] = []
  let fence: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = null
    } else if (!fence) lines.push(line)
  }
  return lines
}

export function repairDispositions(text: string | null) {
  const dispositions = new Map<
    string,
    { status: 'non-actionable' | 'deferred'; text: string }
  >()
  for (const line of plainLines(text ?? '')) {
    const match = DISPOSITION.exec(line)
    if (!match) continue
    const id = match[1].toUpperCase()
    if (dispositions.has(id))
      throw new Error(`duplicate repair disposition: ${id}`)
    dispositions.set(id, {
      status: match[2].toLowerCase() as 'non-actionable' | 'deferred',
      text: line.trim(),
    })
  }
  return dispositions
}

/** Only recognized do-not-change entries reach code; review still gets the whole file. */
export function repairDispositionText(text: string | null): string | null {
  const entries = [...repairDispositions(text).values()].map(
    (entry) => entry.text,
  )
  return entries.length ? entries.join('\n') : null
}

/**
 * Findings can be ID-prefixed lines, top-level list items or paragraphs.
 * List continuations and fenced examples stay in their finding. Document
 * headings are context; a heading with an explicit ID opens that finding.
 */
function findingParts(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const items: string[] = []
  let current: string[] = []
  let fenced = false
  let hasItems = false
  const flush = () => {
    const body = current.join('\n').trim()
    if (body) items.push(body)
    current = []
  }
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced
    const bare = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s{0,2}(?:[-*]|\d+[.)])\s+/, '')
      .trim()
    const item =
      !fenced &&
      (EXPLICIT_ID.test(bare) || /^\s{0,2}(?:[-*]|\d+[.)])\s+/.test(line))
    if (item) {
      // A preamble such as "review findings of run ..." is still present
      // in the original untrusted block, but is not another finding.
      if (!hasItems) current = []
      else flush()
      hasItems = true
      current.push(bare)
    } else if (!fenced && /^#{1,6}\s+/.test(line)) {
      if (hasItems) flush()
    } else current.push(line)
  }
  flush()
  return hasItems
    ? items
    : items.flatMap((part) => part.split(/\n\s*\n/).filter((p) => p.trim()))
}

export function repairFindings(
  texts: string[],
  dispositions: string | null,
): RepairFinding[] {
  const parts = texts.flatMap(findingParts)
  const used = new Set<string>()
  const explicit = parts.map((part) => EXPLICIT_ID.exec(part))
  for (const match of explicit) {
    if (!match) continue
    const id = match[1].toUpperCase()
    if (used.has(id)) throw new Error(`duplicate repair finding ID: ${id}`)
    used.add(id)
  }
  const settled = repairDispositions(dispositions)
  let sequence = 1
  return parts.map((part, index) => {
    const match = explicit[index]
    let id = match?.[1].toUpperCase()
    if (!id) {
      while (used.has(`F${sequence}`)) sequence++
      id = `F${sequence++}`
      used.add(id)
    }
    return {
      id,
      text: match?.[2] ?? part,
      disposition: settled.get(id)?.status ?? null,
    }
  })
}

export function parseCodeResponse(args: {
  text: string
  role: 'implement' | 'repair'
  iteration: number
  correction: boolean
  commands: string[][]
  findings: RepairFinding[]
}): CodeResponse {
  const notes = parseImplementerNotes(args.text)
  const lines = plainLines(notes ?? '').map((line) =>
    line.replace(/^\s*[-*]\s+/, '').trim(),
  )
  const treatments: FindingTreatment[] = []
  const missing: string[] = []
  for (const finding of args.findings) {
    const prefixed = lines.filter((line) =>
      line.toUpperCase().startsWith(`${finding.id}:`),
    )
    const match =
      prefixed.length === 1
        ? /^[^:]+:\s*(fixed|not changed|not-changed|disputed)\s+(?:[—–-]\s*)?(.+)$/i.exec(
            prefixed[0],
          )
        : null
    if (match && match[2].replace(/[—–\s-]/g, '') !== '')
      treatments.push({
        id: finding.id,
        status: match[1]
          .toLowerCase()
          .replace(' ', '-') as FindingTreatment['status'],
        detail: match[2].trim(),
      })
    else missing.push(finding.id)
  }
  const checks = args.commands.map((command, index): ReportedCheck => {
    const id = `C${index + 1}`
    const prefixed = lines.filter((line) =>
      line.toUpperCase().startsWith(`CHECK ${id}:`),
    )
    const match =
      prefixed.length === 1
        ? /^CHECK C\d+:\s*(pass|fail|not-run)\s+(?:[—–-]\s*)?(.+)$/i.exec(
            prefixed[0],
          )
        : null
    return {
      id,
      command,
      status: match
        ? (match[1].toLowerCase() as ReportedCheck['status'])
        : prefixed.length
          ? 'invalid'
          : 'not-reported',
      detail: match?.[2].trim() ?? null,
    }
  })
  return {
    role: args.role,
    iteration: args.iteration,
    correction: args.correction,
    source: 'self-reported',
    notes,
    checks,
    findings: args.findings,
    treatments,
    missing,
  }
}
