# ADR-0048: Use factory names for the CLI and runtime state

## Status

Accepted

## Context

The factory is a standalone repository, but its command, state paths, worker environment variables and UI still carry names from the original example. The owner requested one consistent name without compatibility aliases.

## Decision

- Use `pnpm factory` as the CLI entry point and remove the former package script.
- Store runtime data in `~/.local/state/durably-factory/`, with `durably-factory.db` as the database file.
- Use `DURABLY_FACTORY_NO_AUTO_WORKER` and `DURABLY_FACTORY_IDLE_MS` for worker settings.
- Use `durably-factory` in the CLI header, browser title and application shell, and update generated commands, UI command recognition, examples and test harnesses together.
- Remove the checkout-local legacy database warning. Do not read or migrate previous state locations, move existing data, or stop existing workers as part of this change. A run in a previous location can be completed with the version that started it.
- Retain former repository paths and historical ADRs as historical facts. This decision supersedes the naming choices in ADR-0017 and ADR-0037; their other behavior remains unchanged.

## Consequences

The new version starts with a separate state directory. Existing scripts and worker environment settings must use the new names. Run identifiers, workflow stages, prompt versions and stored job names are unchanged; this is a naming change, not a workflow migration.
