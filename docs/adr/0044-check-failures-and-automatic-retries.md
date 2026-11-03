# ADR-0044: Classify check failures and bound transient retries

## Status

accepted

## Context

Issue #9 distinguishes a code defect from a timed-out check or failed preparation. Provider capacity errors and incomplete reviewer replies currently require a person to retrigger identical input.

## Decision

- Completed pinned checks record `failureKind`: `timeout`, `setup`, `test`, or `unknown`; passing checks use null. The verdict is classified before its output tail is truncated and is saved in the verification checkpoint. Timeouts use the factory timer metadata; setup/test categories require explicit failure signatures. Classification is diagnostic, not proof of the root cause.
- A timeout or setup failure stops before another code iteration, even if budget remains. Status and report recommend inspecting the logs before choosing a code repair or an environmental retry/recheck. Unknown failures retain the normal repair policy.
- `automaticRetryLimit` in factory.json is an integer from 0 to 3, default 1. It is fixed at trigger/setup; 0 disables automatic retries. A run stored before this policy has no setup opt-in and is not automatically restarted.
- The worker checks failed runs at startup and once per second, and before deciding that it is idle. A retry goes through the same action and idempotency key as a manual retrigger, keeping the stored task, findings, scope and settings. A retry is a new run; no old invocation checkpoint is removed or replayed as a new call.
- All unresolved invocation records must have an explicit provider capacity/rate-limit error to permit that exception to the uncertain-call rule. Cancellation, lease loss, timeouts, and unrelated unknown errors are excluded. An incomplete code review is eligible only when no invocation remains unresolved.
- Child input records `retryOf` (immediate parent, root, attempt number and reason). The count is inherited along the retry chain and compared to the fixed limit. Repeated scans and worker restarts use the same child. Archived runs are skipped. Manual retrigger remains possible after the automatic limit.
- Report JSON/Markdown records retry origin; task grouping includes retry children. The original failed run remains failed with its evidence intact.

## Consequences

A recognised capacity response permits a bounded resubmission, despite the original invocation lacking a completed checkpoint. A real provider may still have consumed resources; classification does not promise zero cost. General uncertain calls still require human inspection. Diagnostics use bounded captured output and may remain unknown when a tool's failure format is not recognised. This does not add automatic repair runs for environment failures.
