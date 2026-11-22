# ADR-0062: Later review rounds block only on earlier blockers and on the repair

## Status

accepted

## Context

Issue #55 reports reviews that never run out of blockers. In 24 runs of four related tasks in one repository, 31 code review blockers came from rounds 2 and later. Against the diff from the previous candidate, 8 were inside the repair diff, 7 elsewhere in a file the repair touched, 14 in files the repair did not touch, and 2 named no file. One review returned 1 to 5 blockers, and each round returned different ones: the first round had not reported them all, so every repair met a new set, and 7 of the 24 runs stopped at the repair cap. Spec reviews showed the same pattern: one reviewer blocked in all 13 rounds of three specs, mostly with new findings, some about text added to answer the previous round.

Every round is a fresh whole-change review (ADR-0055), and the reuse experiment's final confirmation is one too (ADR-0057). Nothing tells a later round that the earlier round has already been answered.

## Decision

- **`review.laterRounds` in `factory.json`, fixed at trigger.** `"scoped"` (the default for new runs) or `"whole"`. It is stored in the run input's target and recorded in setup on every run set up with it. A run stored before it existed has none, which means `"whole"`, and a repair of such a run inherits `"whole"`, never the default. The bundled sample always uses `"whole"`. Only `"scoped"` enters `configVersion`.
- **Round 1 is told to report every blocker now.** With `"scoped"`, the first code review round and the first spec review round are told that later rounds may block only for the reasons below, so a blocker held back now may never block.
- **A later code round blocks only for three reasons.** A later round is a code review of a candidate other than the one the last counted round that asked for changes reviewed. Its reviewers may block only on (1) a blocker of that round that this candidate does not fix, (2) a defect the repair introduced, wherever it shows, or (3) a problem inside the repair diff. Anything else is a non-blocker and stays in the reply. The earlier threshold rule (ADR-0040) still applies; a finding blocks only when both rules allow it. Reviewers still read the whole change, so they can see what the repair affects.
- **What a later round is shown.** Both reviewers' blockers of the earlier round, which the factory collects from the stored verdicts (a findings-json verdict's notes are its blocker lines), in an `EARLIER_BLOCKERS` block. The factory writes the block, but the text is the reviewers', so it is fenced and is data, not instructions. A `REPAIR CHANGES` section names the diff and changed-file list from the earlier round's candidate to this one. They are written beside the candidate's own diff with the same `writePatch`, `describeCommitChanges` and `diffStat` calls, from two fixed commits, inside the review step. Command reviewers get the paths in their locations file, and prompt reviewers may read them.
- **Which round counts as the earlier one.** The state keeps the last counted round that asked for changes (`blockedRound`) across repairs. Reviews discarded beside a failed check are not a round. So after review, repair, failed check, repair, the diff runs from the reviewed candidate to the current one. A review of the same candidate again, as in the reuse experiment's final confirmation, follows that rule too: it is a later round when the last blocked round reviewed another candidate, and a first round otherwise.
- **Repair runs.** The first review of a repair run is a later round of the parent's last round only when the parent stopped at its review cap and the findings were built from its stored reviews (no `--findings-file`). Setup copies those findings into `repairOf.parentBlockers`, and the repair run's own diff is the repair diff, since its base is the parent's candidate. The `review-cap-reached` judgement is reworded for this case so that it no longer tells the reviewer to judge the whole candidate without saying what may block. Parents that failed verification or whose reviews did not finish were never fully reviewed, approved parents have outside findings, and `recheck` has no repair, so their first review is round 1.
- **Spec reviews.** A later spec round, after a fix of blockers, may block only on (1) an earlier blocker the revision does not address or (2) a problem the revision introduced, in what it changed or in what that change broke elsewhere. The reviewers get the earlier round's blockers, the version that round reviewed and the diff from it (`git diff --no-index`). Both files are written to the run's `spec-revisions/` directory, outside the spec directory the writers may touch.
- **One context for every form.** The rules are CHECK lines and the blockers and diff are sections of the review context, so the prompt, the input after a `command`, and `local-instructions` all carry them. A `replace` work policy does not remove them.
- **Marking demoted findings.** A findings-json reviewer adds `"laterRoundException": "outside-repair"` to a non-blocker that it would have returned as a blocker without this rule. The parser keeps the mark on non-blockers only and drops any other value without failing the reply. A verdict review lists such problems in NOTES as not blocking and has no mark. As with `thresholdException`, the mark is the reviewer's claim and is never checked.
- **Report.** `reviewLaterRounds` gives the setting setup recorded. `laterRoundNonBlockers` counts the marked non-blockers by stage (code or spec), round and reviewer. The Markdown header prints both. Only the findings the report keeps are counted, as for `belowThresholdBlockers`.
- **Pinned as `local-factory.v8`.** Prompt text under `"whole"` is unchanged from v7, and v7 runs replay with their own prompts. Neutral reviewer names in reports apply to v7 and every later version.

## Consequences

- A repair round should end once the earlier blockers are fixed and the repair is sound, instead of meeting a new set of whole-change blockers.
- A real problem first noticed in a later round outside the repair does not stop the run. It is kept as a non-blocker, counted in the report, and can be given to a repair run as findings.
- Round 1 can return more blockers than before, because it is asked to report all of them.

## Rejected alternatives

### Show later rounds only the repair diff

Rejected. A repair can break code it did not touch, and reason (2) needs the whole change to find that.

### Let the factory demote blockers outside the repair diff

Rejected for the same reason as in ADR-0040: whether a finding is an unfixed earlier blocker or a defect the repair caused cannot be told from a path, so the reviewer decides and the factory only counts its marks.
