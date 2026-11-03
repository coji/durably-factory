# ADR-0041: Repair test coverage is measured against the feature base

## Status

accepted

## Context

Issue #4 in coji/durably-factory distinguishes the base of a repair diff from the base on which a test must fail to demonstrate coverage. A repair starts from the parent's candidate, which can already contain the feature. Comparing a regression test to that candidate can therefore reject a useful test because both versions pass.

## Decision

- Repository inputs carry `featureBase`, initially the same ref as `baseRef`. Setup resolves it once to a commit and records it alongside `baseCommit`. When the two refs are the same, setup uses the same resolution for both.
- `baseCommit` remains the parent candidate on a repair run. Worktree creation, candidate diffs, baseline checks, review command placeholders and delivery retain that meaning.
- A repair inherits the parent's resolved `featureBase`, including across further repair runs. For a legacy setup without it, the parent's recorded `baseCommit` is the fallback; an earlier feature base is not guessed.
- Test-probe base preparation, reset and recreation use `featureBase`. Matching changed test paths still comes from the repair diff. Only those tests are overlaid onto the original feature base.
- Review coverage rules explicitly name `featureBase`. Every review context names both commits and distinguishes the diff base from the coverage base. Existing base/head review trees remain the diff trees.
- Reports expose the resolved `featureBase`; they do not present an unresolved trigger ref as a verified commit.

## Consequences

A test that already passed on the parent candidate can still demonstrate the feature when it fails on the original base. Repair diffs and delivery stay limited to the repair. The probe retains ADR-0039's limitations: an import or fixture failure alone is not evidence of behavioral coverage.

This supersedes ADR-0039's use of the repair diff base for the probe. Legacy runs without a recorded feature base keep their recorded base.
