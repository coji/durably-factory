/** Versioned display names; persisted inputs, outputs and checkpoint keys stay intact. */
import { reviewerId } from '../factory/reviewers.js'
import type { HighlightGroup, HighlightVerdict, LoopReport } from './report.js'

export function wholeChangeReviewReport(
  report: LoopReport,
  instructionsVersion?: string,
): LoopReport {
  if (instructionsVersion !== 'local-factory.v7') return report
  const verdict = <T extends { lens: string }>(row: T): T => ({
    ...row,
    lens: reviewerId(row.lens),
  })
  const group = (value: HighlightGroup): HighlightGroup => ({
    ...value,
    verdicts: value.verdicts.map((row: HighlightVerdict) => verdict(row)),
  })
  const highlights = report.reviewHighlights
  return {
    ...report,
    reviewScope: 'whole-change',
    reviews: report.reviews.map(verdict),
    reviewRounds: report.reviewRounds.map((round) => ({
      ...round,
      reviews: round.reviews.map(verdict),
    })),
    roleUsage: report.roleUsage.map((row) => ({
      ...row,
      role: reviewerId(row.role),
    })),
    ...(report.prompts
      ? {
          prompts: Object.fromEntries(
            Object.entries(report.prompts).map(([role, policy]) => [
              reviewerId(role),
              policy,
            ]),
          ),
        }
      : {}),
    reviewBlockerRuleLenses: report.reviewBlockerRuleLenses?.map(reviewerId),
    belowThresholdBlockers: report.belowThresholdBlockers?.map(verdict),
    preflight: report.preflight
      ? {
          ...report.preflight,
          checks: report.preflight.checks.map((check) => ({
            ...check,
            roles: check.roles.map(reviewerId),
          })),
        }
      : null,
    reviewHighlights: {
      ...highlights,
      lastPasses: highlights.lastPasses.map(verdict),
      earlier: group(highlights.earlier),
      left: group(highlights.left),
      open: group(highlights.open),
    },
  }
}
