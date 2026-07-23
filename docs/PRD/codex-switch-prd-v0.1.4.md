# codex-switch v0.1.4 PRD

## Version

- Version line: `0.1.4`
- Target repository package version: `0.1.4`

## Summary

`0.1.4` is a bridge stability and observability release. It is a narrow reliability bridge between the existing Copilot bridge experiment and a stricter release gate, with no new provider families or migration behavior.

## Required Outcome

- Copilot bridge reuse must survive one transient health or auth probe failure before the existing worker is replaced.
- Bridge failures must expose actionable evidence, including the persisted runtime log path and the restart reason when an old worker is recycled.
- `npm test` must become the widened real release gate by discovering and running the broader repository suite set already present under `tests/`.
- Interactive provider selection must restore the visible `current` hint for legacy state where only the top-level `profile` is present and `model_provider` is absent.

## Release Scope

- Bridge reuse probe hardening for transient transport and timeout failures.
- Bridge log persistence and surfaced restart metadata across command results and diagnostics.
- Widened test-runner coverage plus any pre-existing red paths that block the widened suite from becoming the real ship gate.
- Interactive current-marker repair for legacy top-level `profile` fallback.

## Non-Goals

- No new provider families.
- No migration or backward-compatibility shims beyond the prompt-only legacy `profile` hint fallback.
- No command-surface expansion outside the new bridge diagnostics and status fields.

## Release Acceptance

- `switch` no longer flaps on one transient bridge probe failure.
- Bridge startup or reuse failures surface the log path and the worker replacement reason when applicable.
- `npm test` executes the widened deterministic suite set and passes.
- Interactive provider selection correctly marks the current provider from legacy top-level `profile` state when top-level `model_provider` is absent or unresolved.
