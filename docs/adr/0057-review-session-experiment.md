# ADR-0057: Opt-in reviewer-session continuation with fresh confirmation

## Status

accepted as an experiment; default remains fresh

## Context

Issue #29 asks whether repeated reviews can reuse their own context without weakening the two-reviewer gate. The earlier pilot found lower re-review spend but did not establish equivalent detection. A fresh final check may remove the apparent saving. ADR-0056 supplies invocation-level cost accounting.

## Decision

- Pin `review.sessionMode: "reuse-experiment"` at trigger/setup. Omission and `fresh` retain the existing behavior and configuration hash. Only the explicit experiment changes the hash. A historical setup without the field stays fresh.
- Keep one native session per reviewer within one run. Bind it to its provider, fixed profile, working directory and instruction version. Recreate each reviewer's own directory at a stable path, using only base configuration and current candidate locations. The native conversation lives in the provider's session store. Prompt reviewers read sealed snapshots too.
- Retain/resume Claude command sessions only when explicitly opted in. The same read-only tools, hooks, source restrictions and no-MCP policy apply. Codex supports prompt reviews; command/local-instructions configurations remain unsupported for Codex. The bundled subject target does not expose this repository-only setting.
- Every candidate is reviewed anew by both reviewers. Instructions explicitly require rereading current files, discarding stale paths/content/verdicts, checking repairs and finding regressions across the whole change. Never pass the other reviewer's verdict into a reviewer session.
- An iterative pass schedules another ordinary review round on the same sealed candidate. Both calls in that round are fresh, and neither replaces the iterative session. A final blocker returns to repair within the existing iteration cap. New code invalidates final confirmation. Policy and both outward gates require final confirmation of the current candidate. No new stage or unbounded review loop is added.
- Failed, cancelled and uncertain calls retain the existing checkpoint and no-resend rules. A failed concurrent check clears the reviewer sessions; a later candidate starts fresh. Checkpoints preserve each returned session and usage baseline before events update state.
- Label iterative/final invocations in reports and final confirmation in the trace. All final calls count toward measured cost/time. Provider transcripts are retained to permit resumption; scratch candidate directories are still cleaned up.

## Validation and limits

Tests cover prompt/serial and command/local-instructions/parallel workflows, session separation, native baselines through persisted events, a fresh final blocker followed by repair, invalidation, incomplete final results, iteration caps and both approval gates. A bounded real-Claude command smoke and its limitations are recorded in [the research note](../research/review-session-experiment.md). This is not evidence of equal review quality or net production savings, so the mode remains opt-in.
