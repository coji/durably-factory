# ADR-0058: Run configured generation commands before a candidate is sealed

## Status

accepted

## Context

Some files a candidate needs cannot be produced by the implementer. Screenshot reference images, for example, have to be rendered inside the same container the pinned check uses, and that container's command installs dependencies, which the implementer's sandbox forbids. The implementer then either leaves the images stale, so the check fails, or renders them another way (a host browser), so they differ from what the check's environment renders and the check fails anyway. In one target repository this cost two failed verifications on one task.

## Decision

- **An optional `generate` in `factory.json`.** A list of 1 to 5 argv commands, with the same shape and validation as `selfCheck` (ADR-0031). It is fixed at trigger like every other setting: stored in the run input, carried into the setup's target config, kept by `retrigger`, read again by `--reload-config`, inherited by a repair run. It enters `configVersion` only when present, so existing runs keep their version.
- **Run by the factory between the call and the seal.** After every implementation or repair call that leaves changes, the code stage runs each command in order in the worktree, with the worker's environment rather than the implementer's sandbox, each within `checkTimeoutMs`. Each command gets `FACTORY_SPEC_PATH` (the run's spec file, written from the settled spec; empty without a spec) and `FACTORY_RUN_ID`. The whole generation is one durable step (`stage:<n>:code:generate`), so a replay reads its result and never runs the commands again.
- **What they change is part of the candidate.** The step records the paths the commands added, modified and deleted, from the tree of the worktree before them to the tree after (both written through a scratch index, so the worktree's index and `HEAD` are untouched). The sealed candidate carries that list as `generated`; the report shows it per iteration in a "Generation" section, and both reviewers' trusted context names those paths as produced by generation, not written by the implementer.
- **A failure ends the run with its own conclusion.** A command that exits non-zero, times out or cannot start stops the run as `generate-failed`: a completed run, like `verification-failed`, with no new candidate sealed or verified. The step stores the command, its exit code and the tail of its output; the report and `factory status` show them.
- **Without `generate`, nothing changes.** No step is added and no prompt changes.

## Consequences

- A target can regenerate artifacts in the check's own environment before grading, instead of spending repairs on files the implementer cannot produce.
- The commands run with the worker's permissions on the worktree. They are the repository owner's configuration, like `check` and `setup`, not the implementer's.
- A repair after a failed check sees generated files as part of the candidate it starts from; the next generation runs again after the repair.
- A generation failure is not repaired automatically: whether the command, the environment or the implementer's change is at fault needs a person.

## Rejected Alternatives

### Let the implementer run the commands

Rejected. The commands exist precisely because they need what the implementer's sandbox forbids (installing dependencies, starting containers).

### Run them inside the verification step

Rejected. Verification grades a sealed candidate and must not change it; files produced there would not be in the candidate the reviewers read and the human receives.
