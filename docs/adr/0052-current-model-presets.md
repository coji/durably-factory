# ADR-0052: Advertise only current model presets

## Status

accepted

## Context

The owner wants only the latest general-purpose models in the suggested lineup. GPT-6.1 Sol, GPT-6.1 Terra and Claude Sonnet 5.5 were missing, and the default models and CLI help still pointed to previous generations.

## Decision

- Advertise eight models: GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Luna, Claude Fable 5.1, Claude Opus 5.5, Claude Sonnet 5.5 and Claude Haiku 5.5.
- Default new Codex calls to `gpt-6.1-sol` with `medium` effort and new Claude calls to `claude-sonnet-5-5` with `high` effort. Explicit model and effort settings still win. Do not change the chosen effort of other existing current presets.
- Remove previous generations from `MODEL_PRESETS`, but preserve their implicit effort defaults when an older ID is explicitly requested. This keeps saved explicit configurations stable when retriggered. Keep historical pricing entries and saved invocation catalogs.
- Generate CLI help from the registry and its provider defaults. Update active configuration examples and seeded demo profiles. Keep dated account-access observations and historical test fixtures as historical evidence. Model access continues to be checked by preflight; official availability does not prove access for a particular login.

## Sources

- [Current OpenAI lineup and per-model effort defaults](https://developers.openai.com/api/docs/guides/latest-model)
- [Current Claude lineup](https://platform.claude.com/docs/en/models/overview)
- [Sonnet 5.5 pricing](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)

## Validation

Model and provider tests cover current defaults, explicit effort precedence, historical settings without advertised presets, and complete pricing for every current preset. Existing configuration-version tests retain their historical fixtures.
