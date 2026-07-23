# codex-switch v0.2.1 PRD

## Summary

`0.2.1` is a provider-management-only consolidation release for `@airpot/codex-switch`.

The product is a local-first CLI that manages Codex provider/model-provider routing state. It stores local provider records, projects Codex `model_provider` definitions, switches the active top-level `model` / `model_provider` route, and provides backups, diagnostics, import/export, and rollback.

## Version

- Version line: `0.2.1`
- Target package version: `0.2.1`
- Status: current repository development line

## Goals

- Make the current product positioning explicit: local-first provider/model-provider management.
- Remove current command and documentation promises for account-login and bridge runtime experiments.
- Keep direct OpenAI-compatible provider workflows simple and inspectable.
- Preserve current route-first Codex config projection for Codex `0.134.0+`.
- Keep `migrate` as an advanced adopt helper for existing Codex state.
- Keep `setup` only as a deprecated pointer.

## Current Command Surface

Current public commands are:

- `init`
- `migrate`
- `list`
- `show`
- `current`
- `status`
- `config show`
- `config list-profiles`
- `add`
- `edit`
- `switch`
- `remove`
- `import`
- `export`
- `backups list`
- `rollback`
- `doctor`
- `setup` as deprecated pointer

## Primary Workflow

```bash
codexs init
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> --base-url <url>
codexs switch <provider>
codexs status
codexs doctor
```

## Non-Goals

`0.2.1` does not implement or reserve runtime code paths for:

- GitHub Copilot SDK integration.
- GitHub device-flow login.
- `login copilot`.
- `add --copilot`.
- HTTP proxy bridge or local bridge worker commands.
- `bridge start`, `bridge status`, or `bridge stop`.
- Background runtime services, bridge logs, or bridge runtime state.
- Built-in third-party router packaging.
- Account systems or cloud sync.
- Automatic migration of old Copilot or bridge state.

A future release may introduce a third-party router-like integration, but that is outside `0.2.1` and must not be represented as current workflow, schema, or runtime behavior.

## Acceptance Criteria

- Package metadata reports `0.2.1`.
- Current docs point to this PRD and the `0.2.1` design doc as fact sources.
- Help and command registry do not expose removed command ids.
- Human `list` output does not display provider type.
- Human `status` and `doctor` output do not report bridge, SDK, upstream auth, or bridge-log state.
- Interactive add collects only provider-management fields.
- Tests cover the provider-management-only release contract.
