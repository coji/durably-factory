import { PIPELINE_SUFFIX } from '../glossary'
import { stageName } from '../labels'
import type { Pipeline, PipelineStage, PipelineState } from '../server'

/** The words of a stage: quiet once passed or not reached, tinted where it stands. */
const NAME_CLASS: Record<PipelineState, string> = {
  done: 'text-fg-2',
  auto: 'text-fg-2',
  running: 'bg-running-bg text-running font-medium',
  waiting: 'bg-waiting-bg text-waiting font-medium',
  current: 'bg-sunken text-fg font-medium',
  stopped: 'bg-failed-bg text-failed font-medium',
  'not-reached': 'text-fg-3',
}

/** Where the run stands: a stage it has not left, in a tinted chip. */
const STANDS: PipelineState[] = ['running', 'waiting', 'current', 'stopped']

/** The stroke inside a step mark, drawn on a 16-unit box at the icon weight. */
function Stroke({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-2.5">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * One round mark per stage, all the same size, so a row of them reads as
 * steps: a filled gray disc with a check once passed (gray, since a passed
 * stage asks for nothing), a disc in its state's colour where the run
 * stands, and an empty ring for a stage not reached.
 */
export function StepMark({ state }: { state: PipelineState }) {
  const base =
    'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full'
  switch (state) {
    case 'done':
    case 'auto':
      return (
        <span className={`${base} bg-fg-3 text-raised`}>
          <Stroke d="M3.5 8.5l3 3 6-7" />
        </span>
      )
    case 'running':
      return (
        <span className={`${base} border-running border`}>
          <span className="dot-live bg-running size-1.5 rounded-full" />
        </span>
      )
    case 'waiting':
      return (
        <span className={`${base} bg-waiting text-raised`}>
          <Stroke d="M6 4.5v7M10 4.5v7" />
        </span>
      )
    case 'stopped':
      return (
        <span className={`${base} bg-failed text-raised`}>
          <Stroke d="M5 5l6 6M11 5l-6 6" />
        </span>
      )
    case 'current':
      return (
        <span className={`${base} border-fg border`}>
          <span className="bg-fg size-1.5 rounded-full" />
        </span>
      )
    default:
      return <span className={`${base} border-line-strong border`} />
  }
}

/** One stage: its mark, then its name, count and state word. */
function Step({ s }: { s: PipelineStage }) {
  const stands = STANDS.includes(s.state)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StepMark state={s.state} />
      <span
        className={`inline-flex items-baseline gap-1 ${NAME_CLASS[s.state]} ${stands ? 'rounded-sm px-1.5' : ''}`}
      >
        {stageName(s.stage)}
        {s.count > 1 ? <span className="tabular-nums">×{s.count}</span> : null}
        {PIPELINE_SUFFIX[s.state] ? (
          <span className="font-normal">{PIPELINE_SUFFIX[s.state]}</span>
        ) : null}
      </span>
    </span>
  )
}

/**
 * The run's stages in their fixed order, on one line where it fits: a
 * round mark per stage joined by a hairline, darker over the part the run
 * has passed. An approval the settings gave says 自動. Screen readers hear
 * the server's one-sentence summary instead of the marks.
 */
export function StageTrack({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="text-xs leading-5">
      <p className="sr-only">{pipeline.label}</p>
      <ol aria-hidden className="flex flex-wrap items-center gap-y-1">
        {pipeline.stages.map((s, i) => {
          const passed = s.state !== 'not-reached'
          return (
            <li key={s.stage} className="inline-flex items-center">
              {i > 0 ? (
                <span
                  className={`mx-1.5 h-px w-3 ${passed ? 'bg-fg-3' : 'bg-line-strong'}`}
                />
              ) : null}
              <Step s={s} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
