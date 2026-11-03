# ADR-0047: Snapshot role-specific custom work policies

## Status

accepted

## Context

The default unattended coding and review prompts suit the factory, but repository owners need to adapt their working methods. Existing spec templates and reviewer commands cover only part of the workflow. Replacing an entire generated prompt would also remove candidate locations, trust boundaries and the formats the factory parses.

## Decision

- `factory.json.prompts` accepts eight keys: `implement`, `repair`, `correctness`, `edge-cases`, `triage`, `spec-author`, `spec-fix`, and `spec-review`. Each entry names a `file` and a `mode` (`append`, the default, or `replace`). A role without an entry retains its default, independently of other roles. Configuring a policy does not enable optional triage/spec stages.
- Files are nonempty UTF-8 text, at most 32 KiB each; paths resolve relative to the config file, including an explicit config outside the repository. Each path is read once at trigger. Input/setup store content, mode, source path and SHA-256. Workers never reread those files. Resolved inputs reject mismatched hashes and unknown roles/modes.
- Append retains the default work policy and adds a trusted custom block. Replace omits the default work-policy portion for that role. The fixed execution/reply contract remains: role and allowed work locations, grading, code instruction-file precedence/dependency restrictions/selfCheck, owner context/scope, feedback and untrusted boundaries, reviewer steering/threshold rules and reply formats. Custom work policy is scoped to the current call, including its response correction, not inherited implicitly through native session history.
- For code, scope/test philosophy is replaceable; the factory execution rules stay. For reviews, target-specific criteria and the default review procedure are replaceable. For spec writers, content-planning or revision style is replaceable while file/feedback constraints and existing templates stay. For spec reviews, readiness criteria are replaceable; read-only and parser contracts remain. Triage keeps the meaning and format of its two judgment labels.
- All named spec reviewers share `spec-review`. Existing `spec.template`, `spec.reviewTemplate`, review commands and local-instructions continue to compose with custom policies. Existing templates and output modes are not silently replaced by this new field.
- The canonical config version includes mode/content in stable role order, excluding source paths. No policies and an empty map keep the prior hash. Plain retrigger and automatic retries preserve stored input; repair/recheck inherit saved setup policies. Reload-config reads files again and incorporates effective policy content into its idempotency key, even when factory.json itself is unchanged.
- JSON/Markdown reports expose the stored policies, source paths and hashes. Existing setups without policies retain byte-identical default prompts; no global prompt marker bump is needed for an optional customization layer recorded independently in setup/configVersion.

## Consequences

Owners can alter working methods without rebuilding the factory or rewriting its response protocol. This is prompt composition, not a semantic guarantee that models obey contradictory text; runtime checks and review still judge the result. Policy files are trusted owner configuration, while task/spec/findings/implementer notes retain their original boundaries. No provider, tool, model, permission or grading setting changes through this feature.
