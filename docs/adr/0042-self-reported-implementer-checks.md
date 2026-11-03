# ADR-0042: Record implementer self-check results as claims

## Status

accepted

## Context

Issue #3 in coji/durably-factory asks implementers and repairers to run sandbox-runnable checks before returning and record their results. ADR-0031 already supplies the `selfCheck` setting and passes those commands to both roles. A second setting for the same commands would create competing sources of truth.

## Decision

- Reuse `selfCheck`, including its trigger-time validation, inheritance, reload behavior and contribution to the configuration version. Configure only commands that can run in the implementation sandbox; browser, localhost and network audit lanes are outside this workflow's scope.
- New repository setups record `codeResponseVersion: 1`. Their prompts identify configured commands as `C1`, `C2`, etc., ask the agent to run them before returning, fix failures, and always include `CHECK C1: pass | fail | not-run — <result or reason>` lines under `NOTES:`. A sandbox limitation must be reported as `not-run`, not a pass.
- A durable code response step reads the settled reply's bounded NOTES once. It records each configured argv and a status of `pass`, `fail`, `not-run`, `not-reported` or `invalid`. The argv comes from configuration, not the agent's claim. Duplicate or malformed result lines are not passes.
- JSON reports expose `codeResponses` and mark their source `self-reported`. Markdown reports identify the results as implementer claims and fence their text. The current candidate's NOTES continue to reach reviewers as untrusted input under ADR-0038.
- The fixed factory check remains the verification gate. The factory does not run `selfCheck` commands, infer that they ran, or accept an agent's claimed pass as trusted evidence.
- `local-factory.v4` identifies the new prompts. An older setup without the response version keeps its prior response path and acquires no additional agent calls on replay. With no self-check commands and no repair findings, no response step is added.

## Consequences

The report distinguishes a missing claim from a claimed failure or a command that could not run. Self-check results alone do not trigger an additional call or decide approval; reviewers and the factory's fixed check still judge the candidate. NOTES retain the existing 4 KiB limit.

This extends ADR-0031's prompt-only self checks with recorded claims, without adding a factory-run pre-check stage.
