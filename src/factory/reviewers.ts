/** Neutral reviewer names over stable durable slots. Never rename stored step keys. */
import { z } from 'zod'

export const REVIEWER_IDS = ['review-a', 'review-b'] as const
export type ReviewerId = (typeof REVIEWER_IDS)[number]
export type ReviewSlot = 'correctness' | 'edge-cases'
const IDS: Record<ReviewSlot, ReviewerId> = {
  correctness: 'review-a',
  'edge-cases': 'review-b',
}

/** Known durable slot -> public reviewer name; other roles pass through. */
export function reviewerId(slot: string): string {
  return Object.hasOwn(IDS, slot) ? IDS[slot as ReviewSlot] : slot
}

/** Public name -> stable storage slot, also accepting the historical names. */
export function reviewSlot(id: string): string {
  return id === 'review-a'
    ? 'correctness'
    : id === 'review-b'
      ? 'edge-cases'
      : id
}

/** Normalize only a role map. Never traverse task text or rewrite saved records. */
export function reviewerAliases<T extends z.ZodType>(schema: T) {
  return z.preprocess((input: z.input<T>, ctx) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return input
    const result = { ...input } as Record<string, unknown>
    for (const id of REVIEWER_IDS) {
      if (!Object.hasOwn(result, id)) continue
      const slot = reviewSlot(id)
      if (Object.hasOwn(result, slot))
        ctx.addIssue({
          code: 'custom',
          path: [id],
          message: `use only one of ${id} and its legacy alias ${slot}`,
        })
      else result[slot] = result[id]
      delete result[id]
    }
    return result
  }, schema)
}
