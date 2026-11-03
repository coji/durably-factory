# ADR-0045: Separate repair scope from findings and recheck fixed candidates

## Status

accepted

## Context

Issue #10 reports operational instructions mixed into findings. Reviewers correctly treat findings as untrusted and may reject a request to omit requirements. Repeating checks/reviews without code changes also needs an operation separate from repair.

## Decision

- `repair --scope-file` reads nonempty UTF-8 text up to 32 KiB before creating a run. The owner names excluded task/spec sections and sandbox limitations. This separate trusted block reaches the code prompt and every code review, including configured review context/local instructions. Owner decisions remain in `--context-file`; findings and dispositions retain their existing trust level.
- The scope rule says not to implement excluded requirements or report their absence as a finding. An inability to verify due solely to a named sandbox limitation is a verification gap, not by itself a reason for needsChanges. All other code defects remain reviewable, and scope never overrides the pinned check verdict.
- Scope content/path are inherited across repairs unless replaced. The effective content participates in repair idempotency. Report inputs retain the content, source and SHA-256.
- `recheck --run <id>` accepts the same settled candidate-bearing parents as repair, without requiring findings. It inherits the fixed spec, check, resolved profiles, limits, scope and feature base; no source file/config is reread.
- A new worktree starts at the parent's exact candidate commit. Its diff base remains the parent's diff base, so reviewers can still see the change. The candidate branch must still point to the recorded commit, both at trigger and setup. Setup is refused if it changes the candidate before sealing.
- Recheck skips spec generation, triage, baseline grading, implementation and repair. It runs the pinned check and independent reviews with one fixed candidate; failed checks/blocking reviews stop without code changes. The normal approval policy is retained. Delivery writes local artifacts only (`publish: false`).
- The child records `recheckOf`; repeated commands use one idempotency key. Reports and task grouping link the parent. A recheck can itself be repaired or rechecked under the usual candidate rules.

## Consequences

Scope is an explicit owner instruction, so it should name requirements precisely; the factory validates its encoding/size but cannot judge its meaning. Fake review tests exercise the trusted channel and scripted scope behavior, not a real model's semantic compliance. Recheck creates a fresh execution/evidence record; it never changes an old verdict or silently approves previously unreviewed work. A plain retrigger continues to repeat the original stored input, including implementation.

This extends ADR-0038 with a separate trusted scope channel, and leaves the untrusted finding/disposition contract in place.
