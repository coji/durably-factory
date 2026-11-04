# ADR-0050: Recover runs after sleep and worker loss

## Status

accepted

## Context

Issue #16 reports laptop sleep expiring a ten-second lease. Replay then checked an older candidate against a worktree already advanced by repair, or stopped on an agent call whose outcome was unknown. Recheck and repair cannot continue a spec-author call without a candidate. The owner requested a ten-minute lease and immediate reclamation after worker death, without taking a live worker's run.

## Decision

- Set `LEASE_MS` to 600000, retaining one-second renewal. Status derives the last renewal by subtracting this same constant from the expiry. Five minutes of sleep stays within the lease; longer interruptions still use normal lease-loss recovery.
- Persist each stage's validated event in a separate completed step after the handler returns, before the next stage can mutate the worktree. Replay reduces that event without invoking completed stage mechanics or comparing an earlier candidate to the current worktree. Never wrap a stage containing a durable wait in `step.run`. An incomplete verification runs again against its sealed candidate; completed parallel reviews replay their existing checkpoints.
- After migration and before starting polling, a worker holding the state root's exclusive SQLite lock expires abandoned leases of the factory job through Durably's published storage API. Durably claims them with a new lease generation, including interrupted wait resumption. Lock ownership, rather than a pid note or elapsed time, proves that the preceding worker no longer owns this root. Reclamation requires a still-held lock for the same root. A second live worker is refused before any lease is changed.
- Unknown agent outcomes remain terminal stops by default. Add `factory resume --run <id> --acknowledge-uncertain` for an owner who has inspected provider history, usage and the worktree and explicitly permits resending. Require a failed uncertain call, retained start checkpoints, an unarchived run and the exclusive worker lock. The owner stops the worker first. No automatic retry calls this operation.
- Resume retains the same run, completed steps, stage events and worktree. It moves unknown start checkpoints to timestamped acknowledgment files and requeues the run using the published storage API. The new call has a new invocation ID. A receipt tied to the stopped error lets a request interrupted during checkpoint moves finish those moves on the next request. Completed invocation checkpoints are untouched. On success, normal CLI worker auto-start applies.

## Consequences

Short sleep no longer expires the lease. A crash does not impose the ten-minute wait once a replacement worker acquires the OS lock. Regression tests simulate expiry during verification of a repaired candidate, with sequential and parallel review, and during implementation and spec authoring. They check retained reviews, explicit acknowledgment and lock fencing; the existing CLI restart test exercises actual process death and a refused second worker.

Explicit resume can repeat paid work or edits; it does not claim the old call never happened. The owner must also stop any orphaned agent process before permitting another call. The old uncertain measurement and acknowledged start remain evidence. The run's previous stop timestamp remains stored until its next terminal outcome; reports must treat only terminal runs as having a final duration.

Stage event checkpoints apply to runs executed with this version. As with the existing runtime compatibility policy, runs started on an older checkout should use that version; this change does not reconstruct missing historical stage events.

## Rejected Alternatives

- Automatically resend when the worktree has no changes: an agent may have incurred charges or performed other work without changing tracked files.
- Treat all uncertain calls as safe retriggers: this repeats completed implementation and reviews and loses the interrupted worktree.
- Increase only the lease: this reduces short-sleep failures but leaves longer interruptions and slow crash recovery unresolved.
- Reclaim based on the recorded pid: pid reuse and stale notes are weaker evidence than the OS-held exclusive lock.
