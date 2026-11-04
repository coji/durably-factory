/** Network opt-ins for the two roles that edit repository code. */
import { z } from 'zod'

export const sandboxSchema = z
  .object({
    network: z.array(z.enum(['code', 'repair'])).max(2),
  })
  .strict()

export type SandboxSettings = z.infer<typeof sandboxSchema>

/** Stable order, no duplicates, and no field at all when disabled. */
export function enabledSandbox(
  sandbox: SandboxSettings | undefined,
): SandboxSettings | undefined {
  const network = (['code', 'repair'] as const).filter((role) =>
    sandbox?.network.includes(role),
  )
  return network.length ? { network } : undefined
}
