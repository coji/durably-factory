# ADR-0063: One blocking rule for both code reviewers, and when a test or check finding blocks

## Status

accepted; continues [ADR-0040](0040-local-agent-loop-review-blocker-threshold.md)

## Context

Issue #56 counts 24 runs in one repository at threshold 5. Of 53 blockers, 38 had no scores: findings that are not about the product's behaviour sit outside the likelihood × impact rule (ADR-0040). 35 of the 53 pointed at test, capture or check scripts ("this check can pass by mistake", "no test covers this failing case"). Of the 15 scored blockers, 13 had a product of 12 or less, mostly 2×3 and 2×4, so threshold 5 only removes products 1 to 4. One reviewer blocked on all 53 and the other on none. The second reviewer had made 20 findings of product 5 or more non-blockers, among them missed requirements stated in the spec (8×3, 7×3). Both had the same rules. The ADR-0040 rule leaves "decide as you otherwise would" at and above the threshold, and for every finding that is not about the product.

## Decision

- **One explicit blocking rule, word for word for both reviewers.** From `local-factory.v9` (prompt version 5), a findings-json code review with a threshold of 1 or more gets a BLOCKING RULE in CHECK instead of the ADR-0040 lines:
  - a product finding whose likelihood × impact is at or above the threshold is a blocker, and below it a non-blocker;
  - a missed requirement the task, the spec or the owner's confirmed context explicitly asks for is a blocker, however rare its case;
  - a finding about whether tests or checks are sufficient (a test, check or verification script that could pass when it should fail, or an uncovered case) is a blocker only when that test or check would let through a failure that the task, the spec's acceptance criteria or the owner's confirmed context names. Otherwise it is a non-blocker, reported all the same and marked `"testException": "unnamed-failure"`;
  - a change outside the task's scope, steering and secrets keep today's judgement;
  - the reviewer decides each finding by this rule and the other CHECK rules alone, and neither blocks nor passes a finding for a reason they do not give.
- `thresholdException` stays as in the ADR-0040 addendum. The later-round rule (ADR-0062) still narrows what may block in later rounds.
- **Scope.** The rule is in CHECK, so the prompt, the input after a `command`, and `local-instructions` carry it, and a `replace` work policy does not remove it. Verdict reviews, spec reviews and a threshold of 0 get no rule, as before.
- **Mark.** The parser keeps `testException` on non-blockers only and drops any other value without failing the reply. As with the other marks, it is the reviewer's claim and is never checked.
- **Report.** `blockingRuleNonBlockers` lists, per counted code round and reviewer, two counts:
  - `aboveThreshold`: kept non-blockers whose product is at or above the threshold, leaving out those the later-round rule marked. From v9 the rule says such findings block, so a count shows a reviewer that under-blocks.
  - `testException`: demoted test and check findings.

  The Markdown header prints one line per entry. Runs before v9 are counted the same way, but their reviewers were allowed to keep such findings as non-blockers, so their counts are not rule breaks. Only kept findings are counted (the first 20 non-blockers of a review).

- **Pinning.** New runs record `local-factory.v9`. A run pinned to v8 or earlier replays the ADR-0040 lines byte for byte, which the tests check with hashes. No new setting; `review.blockerThreshold` is fixed at trigger as before.

## The threshold default

The evidence suggests 5 is too low to matter: 13 of 15 scored blockers were at or below 12. This ADR does not change the default. Before v9, scores were missing on most blockers and one reviewer under-blocked, so the distribution was not taken under one rule. The default is to be re-derived, as a further addendum to ADR-0040, from `belowThresholdBlockers` and `blockingRuleNonBlockers` of runs made under v9. A new default will be fixed at trigger like any value, so saved runs and reports keep their meaning.

## Consequences

- The many test and check script findings stop blocking unless they miss a named failure.
- The two reviewers apply one rule, and the report shows when one does not.
- Findings about tests are still reported, so a person or a repair run can act on them.
