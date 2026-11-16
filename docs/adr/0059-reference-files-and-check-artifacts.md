# ADR-0059: Reference files for every role and check artifacts for reviewers

## Status

accepted

## Context

A run's only inputs were text files: the task, `--spec-file`, `--context-file` and `--scope-file`. A target's visual source of truth, such as an HTML mock and its rendered screenshots kept outside git, could not be passed. In one UI task the coordinator transcribed a mock into prose; the first candidate used different components and layout, and the visual problems were found only after approval, by a separate critique that compared screenshots with the mock.

A check that writes screenshots of the candidate left them in the worktree, where reviewers could not reach them: a review reads the snapshots the factory makes for it, and the check's own output files were never passed on.

## Decision

- `factory trigger --reference <path>` takes a file or a directory and may be repeated. Trigger reads every file once, refuses symbolic links (inside a directory too), two files of the same name and more than 20 MiB in total, records each file's name, size and SHA-256 in the stored input, and copies the files into a staging directory of that trigger's own under the state root. The run does not exist yet at trigger, so the run's setup copies them into `runs/<id>/references/`, checks every hash, and then removes the stage; a worker that picks the run up never reads the original files.
- Repair, recheck and retrigger keep the stored list, so they copy the same files, from the parent run's `runs/<id>/references/` and checked against the recorded hashes, not from the stage. `--reload-config` keeps them too: they are an input, not a setting.
- Every role prompt (spec author and fixer, spec reviewers, implementer, repairer, both reviewers) has a trusted `REFERENCE FILES` section listing the absolute paths and calling them the owner's source of truth for the change. Writing roles keep to them; reviewers judge the change against them. Claude roles may `Read` exactly those files, a writing role included, and never write them; directory-based Claude roles (spec writers, command-mode reviewers) get the references directory as a readable root. Codex roles read the same absolute paths, which their sandboxes already allow.
- `checkArtifacts` in `factory.json` names a directory relative to the work directory. After every check of a candidate that completed, passing or failing (a timed-out check included, a cancelled one not), the factory copies that directory, if it exists, to `candidates/<id>/artifacts/` beside the candidate's diff: regular files only, symbolic links skipped, at most 50 MiB in name order. The directory belongs to the check run: the factory removes it from the worktree before every candidate check and after the baseline check, so only files that check wrote are copied, never ones an agent, an earlier check or the baseline left there. The path is stored normalised, without a trailing slash. The report lists the copied files under each candidate. Both code reviewers get a trusted `CHECK ARTIFACTS` section with their absolute paths, described as the check's own outputs to compare with the reference files, and may read them.
- A run without either option stores, prompts and reports exactly as before: every new field is written only when set.

## Consequences

- With `parallelReview`, the reviewers start beside the check, so that round's reviewers have no artifacts of their own candidate.
- No stage outlives the setup of its run. A child run needs its parent's `runs/<id>/references/`, so it cannot start once that run directory is removed.
- Artifacts the check writes into the worktree stay there until the next check, as any untracked check output does; a target that does not ignore them in `.gitignore` seals them into the next candidate. Files committed inside the artifacts directory are removed before each check, so that directory must hold only check output.
