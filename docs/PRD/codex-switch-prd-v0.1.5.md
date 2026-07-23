# codex-switch v0.1.5 PRD

## Version

- Version line: `0.1.5`
- Target repository package version: `0.1.5`

## Summary

`0.1.5` is a Copilot Bridge process-visibility and redaction patch release. It surfaces assistant progress, reasoning summaries, tool lifecycle, permission, user-input, and exit-plan-mode signals through the existing bridge stream while keeping the provider command surface unchanged.

## Required Outcome

- Copilot SDK streaming sessions must subscribe to the generic session event channel and preserve existing text-delta compatibility listeners.
- Known SDK process events must map into a stable bridge runtime-event contract instead of leaking SDK-specific shapes.
- Responses streaming must surface process/status updates as commentary items and reasoning/progress updates as reasoning summary events.
- Chat Completions streaming must continue to receive text only and must not receive Responses-only commentary events.
- Unknown SDK events must be ignored by the UI projection path while logging bounded, redacted summaries for diagnostics.
- Adapter-level tests must cover raw SDK session event normalization, not only bridge-server projection of already-normalized events.

## Release Scope

- Copilot adapter runtime event contract and SDK event normalization.
- Bridge worker forwarding of adapter runtime events into request handlers.
- Responses streaming projection for commentary and reasoning summary events.
- Unknown-event truncation and redaction hardening.
- Focused regression coverage for raw SDK event mapping and bridge stream projection.

## Non-Goals

- No new provider families.
- No migration or backward-compatibility shims.
- No expansion of direct-provider workflows.
- No conversion of internal Copilot tool lifecycle events into Codex/OpenAI function-call or tool-call payloads.

## Release Acceptance

- `npm test` passes with adapter-level raw event normalization coverage.
- Responses streaming includes commentary and reasoning summary process events.
- Final assistant text still streams normally.
- Unknown events are redacted, truncated, logged for diagnostics, and ignored by the UI projection path.
- Chat Completions streaming does not emit Responses-only commentary events.