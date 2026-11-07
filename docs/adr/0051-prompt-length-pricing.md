# ADR-0051: Price Haiku 5.5 per request prompt length

## Status

accepted

## Context

Claude Haiku 5.5 uses different input, output and cache prices when an individual request exceeds 100,000 input tokens, including cached input. The price updater previously skipped conditional rows because the catalog held one set of rates per model. Registering only the lower rates would understate costs; applying the higher rates to an entire agent call would overstate them when several short requests exceed the threshold in aggregate.

## Decision

- Register `claude-haiku-5-5` with the vendor's default `medium` effort. Keep existing provider defaults.
- Add an optional `longContext` to catalog entries: an exclusive input boundary and all four higher-context rates. The Anthropic parser accepts paired `for prompts up to N tokens` and `for prompts over N tokens` rows only when their boundaries agree. Missing, invalid or conflicting tiers fail the update. Reports show both tiers, and changes to either tier require review.
- Retain deduplicated request usage for tiered models in `TokenUsage.requests`. Claude streams partial messages even without a progress callback so final output counts are available. Existing response-ID deduplication, monotonic legs, and main-loop versus command-review subagent scope also govern these records.
- Keep final provider totals authoritative. Reconcile each known aggregate meter against request records before pricing each request, then sum its cost. Persist both tiers in invocation price snapshots and retain request records through measurement merging and completed checkpoints. Replaying an invocation uses its saved catalog.
- Without request records, an aggregate at or below the boundary proves that every request used the base rates. A larger aggregate, mismatched request totals, or incomplete request evidence stays unpriced rather than guessing. Historical calls gain no invented request boundaries or retroactive costs.

## Sources

- [Haiku 5.5 model ID, default effort and rates](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Per-request prompt length and cache accounting](https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing)
- [Agent SDK usage, duplicate response IDs and streamed output counts](https://code.claude.com/docs/en/agent-sdk/cost-tracking)

## Validation

Offline tests cover the boundary, cached inputs, multiple short requests, mixed tiers, subagents, streamed output and duplicate assistant blocks, final-result preservation without a progress callback, checkpoint serialization, and invalid or incomplete tier documents. The existing suite retains checks for pinned catalogs, unknown usage and unrelated models.
