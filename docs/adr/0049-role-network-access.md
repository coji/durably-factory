# ADR-0049: Opt-in network access for coding roles

## Status

accepted

## Context

Issue #17 reports that Codex in the factory's workspace-write sandbox cannot
listen on 127.0.0.1: local test servers fail with `listen EPERM`. A manual run
confirmed that `sandbox_workspace_write.network_access=true` allows a listener.
Implementation and repair need an explicit opt-in without changing the default
population or granting more access to reviewers and triage.

## Decision

- `factory.json` accepts `sandbox.network`, an array containing `code`, `repair`,
  both, or neither. Unknown roles and unknown sandbox keys are rejected.
  Entries are normalized to a unique list in code/repair order.
- Trigger snapshots enabled roles in the repository target input. Durable setup
  records the normalized setting. Repair inherits the parent's setup (falling
  back to its stored input for compatibility), without reading factory.json.
  Retrigger, recheck and automatic retry retain their existing snapshot paths;
  an explicit config reload can change or remove the setting.
- Code stage selects access by the actual invocation role, independently of
  which model profile or native session it uses. Response correction calls
  receive the same access as the call they correct.
- For an opted-in Codex implement or repair call, thread start/resume receives
  `sandbox_workspace_write.network_access=true` through `configOverrides` and
  every turn receives `{ type: 'workspaceWrite', networkAccess: true }`.
  The provider maps a plain workspace-write string to a turn policy without
  network access, so the explicit turn policy is necessary too.
- All other roles and providers keep their existing behavior. With no enabled
  roles, no provider override is sent and no sandbox field enters configVersion.
  Enabled role combinations enter the hash in canonical order. Instruction
  versions and existing config hashes are unchanged when disabled.

## Consequences

Chosen coding roles can run tests that start local servers while retaining the
workspace write boundary and approval policy. Network access also permits
outbound connections; this is not a localhost-only allowlist. An inherited
session receives the policy of the current role on every turn. Existing runs
without the setting retain their behavior. Claude and fake accept the stored
setting without changing permissions. This decision does not change worker
leases or sleep recovery (issue #16).

## Rejected Alternatives

- Enable network access by default: changes existing behavior and permissions.
- Use danger-full-access: broadens filesystem access unnecessarily.
- Enable networking for all roles or by profile: grants reviewer access and
  couples repair permissions to model/session reuse.
- Set only the thread config: does not explicitly carry network access into
  the turn policy emitted by the installed app-server provider.
