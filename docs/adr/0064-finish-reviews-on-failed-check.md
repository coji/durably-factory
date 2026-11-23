# ADR-0064: Let a review already sent finish when the check beside it fails

## Status

accepted; continues [ADR-0029](0029-local-agent-loop-parallel-verification-review.md)

## Context

With `parallelReview` (ADR-0029), the pinned check and both code reviews of a sealed candidate start together. When the check fails, the stage aborts one controller shared by the round, and a review still running is settled as cancelled (`superseded-by-verify`) with the usage it had reported. A review that already answered is kept on record, not counted, and handed to the next repair after the check failure (`failedCheckReviews`, `FAILED_CANDIDATE_REVIEWS`). A cancelled review hands the repair nothing.

In one real run, a review that had already written 8 blocking findings, among them the correct diagnosis of the check failure, was cancelled 1 second before it would have finished, and none of its findings reached the repair. The next round found 3 of the 8 again, and 3 were never found again in the run. That cost a whole extra repair round.

## Decision

- **`review.onFailedCheck` in `factory.json`, fixed at trigger.** `"finish"` (the default for new runs) or `"cancel"`. It applies only with `parallelReview`. It is stored in the run input's target and recorded in setup on every run set up with it. A repair inherits it from the parent's completed setup only. A parent whose setup has none, because it was stored or set up before the setting existed, means `"cancel"`, whatever its input says, and so does its repair. The bundled sample always uses `"cancel"`. So a run created before the option replays exactly as before.
- **`"finish"`: a review already sent runs to its answer.** A failed check still keeps a review that has not been sent from being sent: its tree extraction is ended and the call is recorded as `not-sent`, as before. The runner checks again right before it hands the call to the provider: a check that fails while the start is being recorded still keeps the call from being sent, and since the start is already on record, the call is settled as cancelled, with no usage, and a replay reads it back. Once a call has been handed to the provider, the failed check no longer ends it. Its answer is recorded as a verdict, and the existing `failedCheckReviews` path hands it to the next repair with the round's other answered reviews. The stage, and so the repair, waits for it.
- **`"cancel"`: as before.** A review still running when the check fails is ended and settled as cancelled.
- **Only the failed check changes.** A run cancel, a lost lease, the factory's total and idle limits and a provider error end or fail a review as they do today, in both modes. The switch is in the runner: `supersede` takes `onceSent: 'finish'`, and the signal is then read only before the call is sent; after that the call is settled as if no `supersede` had been given.
- **The round is still not counted.** The report labels a round whose reviews all answered beside a failed check `discarded` (`verify-failed`), as before, and a round with a review that was not sent `cancelled`. Neither counts toward the review rounds, the review cap, approval or `blockedRound` (ADR-0062). Its usage stays in the reviews of failed candidates.
- **Report.** `reviewOnFailedCheck` gives the setting setup recorded, on a run with `parallelReview` only. The Markdown header prints it.
- **Not part of `configVersion`.** Like `parallelReview`, it changes when a review ends, not what the review is. No prompt changes, so the instructions version stays `local-factory.v9`.
- **The repair prompt is left as it is.** The sentence before `FAILED_CANDIDATE_REVIEWS` says the reviews "completed before it failed", which is no longer exact under `"finish"`: a review may answer after the check failed. Rewording it would change the prompt of new runs, which by ADR-0062 and ADR-0063 means a new instructions version and the setting in `configVersion`. That is left to a later change; the rest of the sentence, that the reviews assessed the failed candidate, still holds.

## Consequences

- The repair after a failed check starts later, by the time the slowest review already sent still needed. With the reviewers' limits, that is at most `agentTimeoutMs`.
- When a review would otherwise have been lost, its findings reach the repair, and a repair round can be saved, as in the run above.
- A review that times out or fails after the check failed is now handled as a review timeout or failure in any round, and the repair does not start. Before, it would have been cancelled and the repair would have gone ahead. This keeps the timeout handling the same in every review, at the cost of that case.
- A run that prefers the repair to start at once sets `"cancel"`.
