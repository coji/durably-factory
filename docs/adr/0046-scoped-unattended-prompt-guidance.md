# ADR-0046: Bound unattended coding and report all review findings

## Status

accepted

## Context

Issue #11 identifies unrequested changes, excessive permanent tests, instruction-file conflicts and repeated counterexample hunting. It requests explicit unattended execution and a common scope rule for implementation and every repair path, after issues #9 and #10.

The official [GPT-6 Astra prompting guidance](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#prompting-best-practices) describes clarification, instruction-file sensitivity and over-testing. Anthropic's [Fable 5.1 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#finish-the-whole-task) discusses task completion and [bounded changes/tests](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#keep-changes-and-tests-to-what-the-task-asks-for). The [Opus 5 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5#capability-improvements) recommends eliciting all findings before filtering. These sources were checked on 2026-11-03. The requested wording is a factory policy, not a claim that every shared model responds identically.

## Decision

- New setup records `local-factory.v6`; repository targets record `promptVersion: 2`. Code/review prompt builders receive the version selected from durable setup. Older completed setups retain their original target rules, code reply format, reviewer procedure, notes introduction and reply shapes. Goldens captured before the change verify five legacy prompt bytes; durable stage tests exercise both versions on replay.
- Every new code/repair prompt says that no person can answer mid-run. Routine choices are made and recorded under NOTES. Repository instructions supply code conventions; the factory rules and task decide workflow, scope and validation. A conflicting instruction file is named and quoted in NOTES.
- The shared repository rules limit changes to the requested behavior/feedback, put unrelated discoveries into follow-ups, and size tests to stated behaviors and neighbouring files. Added/changed tests run before finishing; additional verification needs a new change, failure or open concern. A nonempty setup command adds the dependency-management restriction. Existing selfCheck instructions remain last.
- NOTES may hold assumptions, follow-ups and instruction-file conflicts as well as deliberately unfixed changes. Configured check results and per-finding treatments still replace the optional omission sentence with an unconditional NOTES requirement. Implementer notes remain untrusted review data.
- Code review retains PLAN, reads task/spec/owner context first and reports all problems, minor ones included. Scope violations and introduced defects are findings; unrelated observations are non-blockers. Missing tests block only for stated behaviors lacking an effective test. Additional test breadth is non-blocking. The existing likelihood/impact threshold rule is unchanged.
- New review reply shapes omit COUNTEREXAMPLE; verdict NOTES has no sentence cap that would contradict reporting all findings. The existing verdict and findings-json parsers still accept their required markers; no parser contract is weakened. Spec reviews share the versioned reply shape, with their procedure otherwise unchanged.

## Consequences

The prompt policy is reproducible across worker upgrades, and all repair entry points receive the same coding boundaries. Fake/golden tests verify delivery and protocol compatibility, not a measured improvement in real-model behavior. Effects on Sol and other shared review models still require evaluation on real runs. This change does not change models, effort, tools, timeout/retry policy, grading, scope trust or the response-completeness gate.
