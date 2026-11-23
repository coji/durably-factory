# ADR-0065: A test probe rule can stop the base run at its first failure and give the base its own time limit

## Status

accepted; continues [ADR-0039](0039-local-agent-loop-test-probe.md)

## Context

The test probe (ADR-0039) runs each added or changed test file on the base commit and on the candidate, one file at a time, each side limited only by `checkTimeoutMs`. On the base side the probe only needs to learn whether the new test fails there. In one run a new table test with 224 cases took 23 minutes on the base, because every case failed and waited for its own timeout, and 1.5 minutes on the candidate. The probe runs before the check in every round, and that run had two rounds, so 46 minutes of a 2 h 54 min run went to learning that the test fails on the base.

ADR-0039 left the probe without a limit of its own: "a limit would need its own setting and a policy for a half-run probe, which no run has needed yet". This run needs one.

## Decision

- **Two optional fields on a `testProbe` entry.** Both are fixed at trigger with the rest of the entry, so they are stored in the run input, inherited by `retrigger` and by a repair run, and read again only by `--reload-config`. An entry without them runs exactly as before.
  - `baseArgs`: 1 to 20 non-empty strings of at most 200 characters each, none containing `{files}`. They are appended after the entry's `command`, with `{files}` already replaced, on the base side only. The candidate side runs `command` unchanged. The repository chooses what they do, such as Vitest's `--bail=1` to stop at the first failure. The factory never interprets them.
  - `baseTimeoutMs`: a positive integer of milliseconds, the base side's limit in place of `checkTimeoutMs`. The trigger refuses a value at or above the run's resolved `checkTimeoutMs`, since it would never stop the base side early. The probe still applies it only while it is below `checkTimeoutMs`, so a repair run that kept the parent's limits behaves the same way.
- **A base side stopped at its limit is its own outcome.** The side is stored as not run, with the timeout's reason and its elapsed time as before, plus `stoppedAtMs`, the limit that stopped it. Only a `SpawnTimeoutError` from the base side's own limit sets it. A timeout at `checkTimeoutMs`, or any other failure to run, is recorded as before. The outcome is:
  - `unfinished-on-base`, "did not finish on the base within its base time limit, passed on the candidate", when the candidate side passed;
  - `failed-on-candidate` when the candidate side ran and failed, as for a base side that finished;
  - `could-not-run` when the candidate side could not run.

  `could-not-run` does not fit the first case. The result text tells reviewers to judge a test that could not run from the code alone, and the report lists those sides as could not run, while this test did run on the base and did not pass there within the limit. `failed-on-base` does not fit either: the test neither passed nor failed on the base.

- **What the record keeps.** A file whose rule has `baseArgs` stores the base side's argv as `baseCommand`, and a file whose rule has `baseTimeoutMs` stores that limit as `baseTimeoutMs`, each only when the base side started. A base side that never started, because the base could not be prepared, the file could not be placed or the command could not start, is reported as could not run, as before, and is not counted as a shortened run. Both fields are absent otherwise, so a record made before this ADR reads as before. The probe is still one durable step per candidate whose output is the record, and a replay reads it back and runs nothing.
- **The reviewers' result text says when the base run was not a full run.** When any file used `baseArgs` or was stopped at its base limit, the summary adds a sentence with only counts and no repository strings, so it stays whatever the per-file sections shrink to. The sentence says that those base sides show only what ran before they stopped. Each such file's section shows the base command, says that the rule's `baseArgs` were configured to stop the base run early, so its exit code and output tail may cover only part of the file, and words a base stopped at its limit as "stopped after … at the rule's base time limit; it neither passed nor failed on the base within that time". Without either field the text is byte for byte what it was. The summary leaves out the `unfinished-on-base` count while it is zero.
- **Report.** Each entry of `testProbes` adds `unfinishedOnBase` and `baseNotFull`, one line per file whose base run used `baseArgs` or was stopped at `baseTimeoutMs`. A base side stopped at its limit is no longer in `couldNotRun`. The Markdown Test probe section keeps its line per candidate and adds a second line, with the reasons fenced, only when `baseNotFull` has any.

## Consequences

- A repository whose new tests fail slowly on the base, such as a table test whose cases each time out, can make the base side end at its first failure or within a few minutes. The candidate side still runs in full within `checkTimeoutMs`.
- A reviewer reading a base exit code from a run with `baseArgs` is told that it may cover only part of the file, and a base stopped at its limit is reported as unfinished, not as a failure or as a test that could not run.
- Nothing about a run that sets neither field changes: its input, record, result text and report are the same.

## Rejected Alternatives

### One base time limit for the whole probe

Rejected. Runners differ in how long a failing file takes, and the stop-at-first-failure flag is per runner, so both belong on the entry whose command they modify.

### Record a base side stopped at its limit as failed on the base

Rejected. A test that did not finish has neither passed nor failed. Counting it as a failure would tell the reviewers more than the probe saw. The output tail is still there for them to read.

### Insert `baseArgs` before `{files}` instead of appending them

Rejected. Appending keeps the rule simple and works for the usual runners, which take options after the paths. A runner that needs them elsewhere can use a wrapper script in `command`.
