# ADR-0066: Give the repair after a failed check the check's evidence

## Status

accepted; continues [ADR-0059](0059-reference-files-and-check-artifacts.md)

## Context

ADR-0059 copies the check's own outputs (`checkArtifacts`) beside each candidate and lists them for both code reviewers. The repair that follows a failed check never got them. The reducer put `acceptance: ` and the last 1000 characters of the check's output into the repair notes, and the code prompt showed that line as "Verified feedback to address". The check kept the last 8000 characters, the verdict stored the last 4000, and the full stdout and stderr logs sat in the run directory, but the repair was told none of their paths.

In one real run, a screen-capture check failed twice with only `ready condition was not met: Saved confirmation` in the repair's feedback. The failure screenshot among the check artifacts showed the cause at a glance. The repair could not reproduce the failure and changed unrelated code.

## Decision

- **In the run.** When a repair follows a failed verification of the candidate it repairs, the code prompt has a `CHECK FAILURE` section in place of the `acceptance:` note, before the failed candidate's reviews (`FAILED_CANDIDATE_REVIEWS`, ADR-0029):
  - the failure kind (`failureKind`, or "not recorded" on a verdict stored before it existed);
  - the exit code, or a note that the check did not exit by itself;
  - the stored tail of up to 4000 characters, fenced as untrusted `CHECK_OUTPUT` data;
  - the paths of the full stdout and stderr logs, with the log's write error when there was one;
  - the failed candidate's check artifacts, listed as untrusted evidence, not as the trusted section the reviewers get.
- **Read only.** The logs and the artifact files are added to the code call's `readableFiles`. A Claude repairer may `Read` exactly those files and never write them; Codex reads them as its sandbox already allows. Write access is unchanged.
- **Repair runs.** When `factory repair` builds the findings of a verification-failed parent from its stored check failure, it also records that check's kind, exit code, log paths and the parent's artifact directory in `repairOf.parentCheck`, and setup carries it into the target's `repairOf`. The first repair gets the same section; the tail stays in the FINDINGS block, which the section points to. The findings text, and so the idempotency key, are unchanged. A repair run given `--findings-file` gets no section.
- **Replay.** No event, reducer state or step name changes: the section is built from the stored verification and the setup record. The `acceptance:` note stays in the state, and is only left out of the prompt when the section replaces it.

## Consequences

- `INSTRUCTIONS_VERSION` stays `local-factory.v9`, as for ADR-0059: this adds evidence and changes no rule. A run set up under an earlier version also gets the new section on any repair call made from now on; calls already made replay as recorded.
- A repair run reads its parent's run directory for the logs and artifacts. When that directory has been removed, the paths are still listed but cannot be read; the artifact list is empty.
- The repair sees as much of the check's output as the report's stored tail, and the full logs when it needs more.
