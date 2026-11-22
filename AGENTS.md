# AGENTS.md

durably-factory runs an issue through implementation, a pinned check, two independent reviews and a person's approval on a local machine, on top of [Durably](https://github.com/coji/durably) (`@coji/durably` from npm). It moved here from `examples/local-agent-loop` in coji/durably; ADR-0017 to ADR-0040 in `docs/adr/` come from there, and the issue numbers in them refer to coji/durably.

Start with `README.md`; details are in `docs/`.

## Git Workflow

- Never commit or push to `main` directly. Branch and open a pull request.
- Commit and PR titles follow Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:` …). A squash merge keeps the commit title for a one-commit PR and the PR title otherwise; release-please reads those titles.

## Releases

npm releases are automated by release-please in `.github/workflows/release.yml` (see `docs/maintainer.md`).

- Never edit `version` in `package.json`, `.release-please-manifest.json` or `CHANGELOG.md`, and never push a `v*` tag. release-please owns them.
- A push to `main` updates the release PR (`chore(main): release x.y.z`). Merging it tags, builds and publishes to npm. Merge it only when a person asks.
- The release PR gets no CI because Actions opened it: close and reopen it to run CI before merging.
- `feat:` raises minor, `fix:` patch; `docs:`/`test:`/`ci:`/`chore:` release nothing. To force a version, put `Release-As: x.y.z` in a commit body.
- A failed publish is rerun with `gh workflow run release.yml --ref main -f tag=vX.Y.Z`.

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

The database and every run's data live in `~/.local/state/durably-factory/`, outside any checkout. Tests and smoke runs that start a worker must use another `HOME` (see `docs/operations.md`).
