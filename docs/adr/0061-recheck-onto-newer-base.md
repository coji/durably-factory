# ADR-0061: Recheck a candidate on a newer base

## Status

accepted

## Context

A run fixes its base commit at setup, and every repair and recheck inherits it. While a long run works, the target repository's main branch can gain a fix the pinned check depends on. In one target repository a run's check failed on a screen-capture walkthrough that main had fixed after the run started; the candidate passed once that fix was added. The factory offered no way forward that kept the reviewed candidate:

- `recheck` reruns the same commit on the same base and fails the same way.
- `repair` hands the implementer findings about a failure the candidate did not cause, inviting a workaround inside the change.
- `retrigger` or a new trigger starts over, writing the spec and the code again.

## Decision

- **`factory recheck --run <id> --onto <ref>`.** The same parents as a plain recheck. The factory resolves `<ref>` to a commit in the target repository and puts the candidate's changes (from the parent's base to its candidate) on that commit as one new commit, with a three-way merge whose merge base is the parent's base (`git merge-tree --write-tree`). No checkout or worktree is touched.
- **The moved commit is deterministic.** It carries the candidate commit's message, author and committer with their dates, on branch `factory/<parent>-onto-<12 hex>`. An existing branch is kept only at exactly that commit. The idempotency key includes the new base, so the same parent and base give one recheck, and a different base gives another.
- **The newer commit is the base and the feature base.** The child grades the moved candidate against it: the pinned check, both reviews over the whole change against it, and the test probe's base side on it. As in any recheck, no implementation or repair call runs.
- **Refusals.** A conflict refuses the recheck and names the conflicting paths; a person decides how to resolve them. A `<ref>` equal to the parent's base is refused in favour of a plain recheck.
- **Recorded.** The input and the setup keep `recheckOf.onto: { from, to }`. The report says the candidate was moved onto the new base from the old one, instead of "unchanged candidate".

## Consequences

- A candidate that failed only because its base was out of date can be graded on current main, keeping the implementation that was reviewed.
- Both reviews run again on the moved change, so changes on main that interact with the candidate are reviewed too.
- A conflict is not resolved automatically. The next step stays with a person: resolve it by hand, or start a new run.

## Rejected Alternatives

### Let a repair merge main into the candidate

Rejected. The candidate's diff would then include main's own changes, and the repair findings would describe a failure the candidate did not cause.

### Retrigger on the newer base

Rejected as the only path. It discards the reviewed implementation and repeats the spec and code stages, which can produce a different change.
