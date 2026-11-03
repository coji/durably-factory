# ADR-0043: Require a treatment for each repair finding before sealing

## Status

accepted

## Context

Issue #5 in coji/durably-factory reports repairs that omit findings and require another review to discover the omissions. A free-text summary cannot tell whether the repairer addressed each request. Dispositions marked non-actionable or deferred also need to reach the repairer without becoming trusted owner instructions.

## Decision

- New repository setups use the response contract recorded by ADR-0042. A repair's requests come from the initial outside findings, or from the reviews asking for changes, including completed reviews of a candidate that failed its check. Factory-generated check diagnostics alone are not individual review findings.
- Findings may use explicit ID-prefixed lines, top-level list items or separate paragraphs. Explicit IDs such as `F1:` are retained; missing IDs receive stable `F<n>` identifiers without collisions. Duplicate explicit IDs are refused rather than matched ambiguously. Fenced examples remain part of their finding.
- Generated review findings render actual verdict notes as list items, keeping the factory's execution-status preamble out of the required responses. If an accepted nonempty source has no recognized item or paragraph, keep the whole source as one opaque finding rather than silently disabling the gate.
- The factory includes the ID list and an untrusted `REPAIR_FINDINGS` block in the repair prompt. Under NOTES, every ID needs exactly one `fixed <concrete change or file:line>`, `not changed — <reason>` or `disputed — <reason>` line. A blanket claim, a quoted example, duplicate lines or an empty treatment does not cover a finding.
- Missing or malformed treatments cause one correction call before sealing, verification or review. The correction gets the original task, context, finding list and the previous reply as untrusted data. It must return the complete response, not just missing lines. It continues its own repair session in reuse mode when possible; fresh mode starts a fresh session. The parent's session is never inherited by an outside repair run.
- The first response and correction have separate durable steps and agent operation keys. Replay reads them back without resending either call. The correction is part of the same code iteration, with its own invocation usage, cost and timeout. If its treatments remain incomplete, or the correction times out, the run stops without sealing or reviewing that work.
- Both response records appear in `codeResponses`, including finding text, dispositions, treatments and missing IDs. Claims remain untrusted; the gate checks completeness and format, not whether the repairer actually fixed the code or whether a disputed finding is correct.
- `ID: non-actionable — <reason>` and `ID: deferred — <reason>` lines from dispositions are handed to code as untrusted do-not-change requests. Other disposition lines still go only to reviewers. The owner context retains precedence. Finding treatments never become dispositions or trusted stage context.
- Setups recorded before the response contract retain their prior path. A worker resuming an already settled old candidate must not add a correction call merely because this feature was deployed.

## Consequences

Review is no longer needed merely to discover an omitted response. At most one extra agent call is spent per repair iteration; `maxIterations` still counts candidates, not response corrections. NOTES must fit every treatment and configured check result within 4 KiB. This is a syntax and completeness gate; independent review remains necessary.

This extends ADR-0038's reviewer-only disposition delivery for the two explicit do-not-change statuses. It does not promote dispositions or implementer claims into trusted context.
