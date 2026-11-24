# ADR-0067: Stop for an owner decision the implementer asks for

## Status

accepted; continues [ADR-0030](0030-local-agent-loop-verification-failed-repair.md) and [ADR-0047](0047-custom-work-policies.md)

## Context

A work policy can tell the implementer and the repairer what to do when the protected scope forbids the root-cause change and the Design records no workaround: leave the case unfixed and write the root cause and the blocked change in NOTES, so that the person who started the run can widen the request. They do so, with notes such as "This direct write is not in the spec's inventory table, so the orchestrator should accept or redirect it" or "F8: not changed". The factory had no way to act on such notes. It went on to the pinned check and both reviews. The reviewers blocked on the unfixed case, the repairer could not fix it either, and the run spent its rounds until `review-cap-reached`. Each such run took about 45 minutes before anyone could decide.

## Decision

- **A notes line.** From `local-factory.v10` (prompt version 6), the code and repair prompts carry one more line beside the reply format. It says: when the spec, the owner's decisions or the protected scope forbid every fix you can see for part of the task, do the rest of the work first, then put one line per case at the top of NOTES, `DECISION NEEDED: <what the owner must decide, and why no allowed fix exists>`. It is not for ordinary uncertainty, where the agent still makes the call and states the assumption. The line is in the reply format, so a `replace` work policy keeps it. Runs pinned to v9 or earlier get the prompts they had, byte for byte.
- **Parsing.** `decisionNeededLines` in `code-response.ts` reads the lines from the stored NOTES, beside the CHECK lines: `DECISION NEEDED` in capitals at the start of a line, as a list item or in bold too, with `:` or `：`, and non-blank text after it. A fenced example does not count. The CHECK lines and finding treatments are read as before. NOTES stay capped at 4 KiB, which is why the prompt asks for these lines first.
- **The stop.** The code stage keeps the lines in the candidate step beside the notes, only on a run whose prompts asked for them. The step is replayed from storage, so an old run whose notes happen to hold the words is never stopped by a newer factory. `code.completed` carries the lines, the reducer keeps them for that candidate only, and the policy then picks `stop` before `verify`. The stop stage ends the run as **`decision-needed`**, `approved: false`, with the candidate sealed and its diff written at sealing, `reviewRounds` 0, and the lines in the output as `decisionNeeded`. No check, test probe or review step is started.
- **Telling the person.** `decision-needed` is a `failure.kind`, retryable, with each line as a `decision needed: ` detail. So `status`, `wait` and the report in Markdown and JSON show the decisions, and the next step is `factory repair --run <id> --context-file <file>` with the answer. A given context replaces the parent's, so the hint says to repeat the earlier owner decisions. The web UI names the conclusion and the detail.
- **Repair.** `factory repair` accepts a completed `decision-needed` parent with a recorded candidate, as it accepts a review-capped one. Without `--findings-file`, the findings are the decision lines, one list item each. They stay untrusted input, since the implementer wrote them, and the owner's answer comes in as the trusted owner context. The child starts from the parent's candidate. It skips `baselineCheck`, because that candidate was never checked and finishing it is the repair's work. Its first review is a first round, because the parent was never reviewed and no parent blockers are recorded (ADR-0062). The repair base and the reviewers' base text say that the candidate was neither checked nor reviewed.

## Consequences

- A run that cannot go on without a decision stops after one implementation call, not after every review round.
- The implementer may also stop a run that could have gone on. That costs a repair run with an answer. The prompt limits the line to cases where every visible fix is forbidden, and the report keeps the notes for judging whether it was right.
- The new conclusion counts in neither the `verification-failed` nor the `review-cap-reached` column of `factory compare`.

## Rejected alternatives

### A durable wait for a person, like the spec-blocked wait

The run would wait in place for an answer and resume with it. It needs a new wait, a signal and its payload, a new resume path for the code stage and UI for answering. `repair --context-file` already starts from a kept candidate with an owner's answer as trusted context. The wait can be added later if a repair run proves too heavy.

### Let the run go on and only flag the notes

The reviewers block on the case left unfixed, and the repairer cannot fix it either, so the run still burns its rounds until the review cap. That is the cost this ADR removes.
