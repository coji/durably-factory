# ADR-0056: Per-invocation usage and cache retention

## Status

accepted

## Context

Issue #28 requires a trustworthy cost comparison before reviewer-session experiments. Claude Code 2.1.277 and later restore `modelUsage` and `total_cost_usd` from the resumed session. Summing these results charges earlier calls again. The result also distinguishes cache writes with five-minute and one-hour retention; the factory previously priced every write at the five-minute rate.

## Decision

- Keep the latest native per-model totals on the provider session and durable implementation session. A call records the difference against the previous totals, including auxiliary models and subagents. Its completed checkpoint retains both the invocation usage and the next baseline. Replaying a checkpoint sends nothing and counts the same invocation once.
- A missing baseline, decreasing counters or disappearing model prevents a complete delta. Keep this call's streamed usage as partial; never treat the session total as invocation usage. A timed-out implementation call invalidates its previous baseline before continuing that conversation.
- Capture the reported five-minute and one-hour cache writes. Price them at separately registered rates. A new measurement with unknown retention, an inconsistent split or a missing rate has unknown cost. Do not infer retention from a model or the total cost.
- Historical usage without retention fields keeps its historical interpretation. Saved invocation catalogs remain authoritative; reports read recorded costs and never reprice old runs.
- Report each reviewer invocation with its candidate, round, session choice/reason, measured usage, elapsed time and cost. Preserve the raw session ID and per-model usage in JSON.

## Evidence and validation

`tests/fixtures/claude-session-usage.json` contains only token and cost telemetry from three completed calls of the November 11 pilot on Claude Code 2.1.321 / Agent SDK 0.3.321. It excludes prompts, replies, paths and session IDs. Tests reconcile the sum of invocation deltas with the native cumulative estimate, including the Haiku helper, and cover mixed/unknown TTLs, old catalogs, partial streams and checkpoint replay.

Sources checked November 11, 2026:

- [Claude Agent SDK cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking)
- [SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Official model prices](https://platform.claude.com/docs/en/about-claude/pricing)
