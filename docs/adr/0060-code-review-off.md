# ADR-0060: Let a run skip code review when the repository's own gate reviews

## Status

accepted

## Context

The factory reviews every candidate with two independent reviewers (ADR-0055) and approves only a candidate both pass. Some target repositories also have their own merge gate: a review harness, run on the pull request branch, that a change must pass before it can be marked ready. That gate has its own inputs (the branch's objective scope, the commit messages), its own rules (for example, where a workaround's root cause must be recorded) and its own blocker threshold.

With both in place, two review definitions judge the same change. In one target repository the factory approved a candidate, and the repository's gate then kept reporting findings the factory's reviewers had not raised, because the two read different inputs and applied different rules. Each finding cost a repair run and another gate round, and the lead time of a task grew by hours. Copying the gate's rules into the factory's reviewer prompts would keep two definitions that drift apart, and running the gate as a factory reviewer would nest one harness, with its own locks, round counting and records, inside another.

## Decision

- **An optional `codeReview` in `factory.json`, true when absent.** It is fixed at trigger like every other setting: stored in the run input, kept by `retrigger`, read again by `--reload-config`, inherited by a repair run. The setup records `codeReview: false` only when off.
- **Off means no code review stage.** After a candidate passes the pinned check, the policy goes to approval (or finishes, with `autoApprove`). A candidate that fails the check is repaired as before, and the repaired candidate is graded by the check alone. With `parallelReview`, verification runs on its own.
- **The spec stages are unchanged.** Their reviewers still review the spec.
- **It is part of the config version when off.** A run without code review is not the same population as one with it.
- **The report says so.** The report carries `codeReview: "off"`, and the Markdown says code review was off and the run was approved on the pinned check alone, so a reader never takes the absent reviews for passed ones.
- **Refused with `review.sessionMode: "reuse-experiment"`.** That mode requires both reviewers' fresh final confirmation.

## Consequences

- A repository whose merge gate is the only code reviewer gets one review definition: the factory implements and verifies, and outside findings come back through `factory repair`.
- Approval of such a run means only that the pinned check passed. The delivery has not been reviewed until the repository's gate reviews it.
- Runs that leave the setting out behave exactly as before.

## Rejected Alternatives

### Copy the repository gate's rules into the factory reviewers' prompts

Rejected. The rules would then live in two places and drift, which is the cause of the duplicated findings.

### Run the repository gate as a factory reviewer

Rejected. A reviewer is an agent that reads review snapshots. The gate is a harness with its own locks, round limits and records on the pull request branch; nesting it would duplicate state and make the record the repository trusts depend on the factory.
