/** Model presets: default effort per model. Lookup table, no switch. */
import type { ProviderName } from './providers/types.js'

export interface ModelPreset {
  model: string
  provider: Exclude<ProviderName, 'fake'>
  effort: string
}

export const MODEL_PRESETS: readonly ModelPreset[] = [
  { model: 'gpt-6-astra', provider: 'codex', effort: 'low' },
  // New models use each vendor's own default effort.
  { model: 'gpt-6.1-sol', provider: 'codex', effort: 'medium' },
  { model: 'gpt-6.1-terra', provider: 'codex', effort: 'medium' },
  { model: 'gpt-6-luna', provider: 'codex', effort: 'medium' },
  { model: 'claude-fable-5-1', provider: 'claude', effort: 'low' },
  { model: 'claude-opus-5-5', provider: 'claude', effort: 'medium' },
  { model: 'claude-sonnet-5-5', provider: 'claude', effort: 'high' },
  { model: 'claude-haiku-5-5', provider: 'claude', effort: 'medium' },
]

// Explicit older model IDs keep their previous effort when a stored input is
// retriggered. They are no longer advertised as current presets.
const HISTORICAL_EFFORTS: Record<string, string> = {
  'gpt-6-sol': 'medium',
  'gpt-5.6-terra': 'medium',
  'gpt-5.6-sol': 'low',
  'gpt-5.6-luna': 'max',
  'claude-opus-5': 'high',
  'claude-sonnet-5': 'high',
}

const byModel: Record<string, ModelPreset> = Object.fromEntries(
  MODEL_PRESETS.map((p) => [p.model.toLowerCase(), p]),
)

/** Provider default when no model is requested: always a preset model, so
 * effort and pricing resolve without unknowns. Single source of truth —
 * providers must use this instead of hardcoding their own default. */
const DEFAULT_MODEL: Record<Exclude<ProviderName, 'fake'>, string> = {
  codex: 'gpt-6.1-sol',
  claude: 'claude-sonnet-5-5',
}

export function defaultModelFor(
  provider: Exclude<ProviderName, 'fake'>,
): string {
  return DEFAULT_MODEL[provider]
}

export function presetForModel(
  model: string | null | undefined,
): ModelPreset | null {
  if (!model) return null
  return byModel[model.toLowerCase()] ?? null
}

/**
 * Precedence: explicit option > model preset > null (unknown).
 *
 * Nothing ambient participates. A run's configuration has to be readable off
 * the command line that started it: an environment variable changes what is
 * measured and which `configVersion` the run lands in while appearing in
 * neither the command nor the shell history.
 */
export function resolveEffort(
  explicit: string | undefined,
  model: string | null,
): string | null {
  if (explicit) return explicit
  return (
    presetForModel(model)?.effort ??
    (model && Object.hasOwn(HISTORICAL_EFFORTS, model.toLowerCase())
      ? HISTORICAL_EFFORTS[model.toLowerCase()]
      : null)
  )
}
