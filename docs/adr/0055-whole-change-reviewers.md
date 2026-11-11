# ADR-0055: Two independent reviewers of the whole change

## Status

accepted

## Context

Issue #27 asks for two independent assessments of the same change. Naming the reviewers `correctness` and `edge-cases` implied a division of responsibility, including when their context was delivered through `CLAUDE.local.md` to a review command.

## Decision

- Name the reviewers `review-a` and `review-b` in configuration and new reports. Both review the task and specification, correctness, boundaries, safety and tests. Neither assumes the other covers any part. Providers, models, effort, commands, output formats and custom policies remain independently configurable.
- Pin this instruction change as `local-factory.v7`. Both normal prompts and command/local-instructions contexts receive it. A replacement work policy does not remove the independent whole-change contract.
- Keep the historical `correctness` and `edge-cases` keys as opaque durable slots. Renaming step keys would miss existing checkpoints and could resend completed calls. Accept these keys as configuration aliases, but reject specifying both names of a slot. Normalize only role maps, never task text or saved records.
- Project neutral reviewer names in reports and traces only when the run's completed setup records v7. Preserve raw input, output, steps and attempts as evidence. Historical runs retain their pinned prompts and their historical report labels. No database migration is needed.
- Preserve the existing sealed candidate, separate fresh sessions, requirement for both results, failure/incomplete handling and invalidation after repair. Reviewer count and pipeline stages do not change.

## Validation

Regression tests cover the configuration aliases and conflicts, independent settings, the new prompt scope and legacy prompt versions, command-mode local instructions, report versioning, and the existing independent-review gates. Run `pnpm validate` before shipping.
