# AGENTS.md

durably-factory runs an issue through implementation, a pinned check, two independent reviews and a person's approval on a local machine, on top of [Durably](https://github.com/coji/durably) (`@coji/durably` from npm). It moved here from `examples/local-agent-loop` in coji/durably; ADR-0017 to ADR-0040 in `docs/adr/` come from there, and the issue numbers in them refer to coji/durably.

Start with `README.md`; details are in `docs/`.

## Git Workflow

- Never commit or push to `main` directly. Branch and open a pull request.

## Toolchain

Node.js 24 and pnpm 12; exact versions and the managed runtime are in `package.json`. Type checking uses native TypeScript 7 (`@typescript/native`); the `typescript` alias is the TypeScript 6 compatibility API for Vite tooling.

```bash
pnpm validate      # format check, lint, typecheck, tests, UI build
pnpm format:fix
pnpm lint:fix
```

## Durably

The factory uses only the published `@coji/durably` API. When it needs something Durably does not have yet, change Durably in coji/durably, release it, then raise the version here.

## Runtime state

The database and every run's data live in `~/.local/state/local-agent-loop/`, outside any checkout. Tests and smoke runs that start a worker must use another `HOME` (see `docs/operations.md`).
