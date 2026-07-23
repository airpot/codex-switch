# codex-switch v0.1.2 PRD

## Status

- Version line: `0.1.2`
- Status: release candidate
- Current repository package version: `0.1.2`
- Role: next Copilot runtime repair line
- Scope: make the experimental Copilot bridge diagnosable and usable for simple text-oriented turns against the currently verified Codex runtime boundary, with `0.140.x` treated as a planning and verification target rather than a blanket compatibility guarantee

## Problem

The existing Copilot path treated `@github/copilot-sdk` as a simple chat/session SDK. The package is an official JSON-RPC control surface for GitHub Copilot CLI and has a stricter runtime contract than the previous integration assumed. It also requires Node.js `>=20`, while direct providers should continue to support Node.js `>=18`.

## Requirements

- Default the managed installer to `@github/copilot-sdk@1.0.2` instead of `latest`.
- Keep package-level `engines.node >=18`, but fail Copilot-only paths early under Node.js `<20` with `COPILOT_RUNTIME_NODE_UNSUPPORTED`.
- Load the SDK from the managed runtime install directory using `createRequire()`.
- Probe auth through `CopilotClient.getAuthStatus()` rather than by creating a session.
- Treat unsupported SDK versions and prerelease installs as explicit runtime failures before bridge use, with API-shape validation reported separately as `COPILOT_SDK_API_UNSUPPORTED` when the client or session is actually used.
- Start the bridge worker with the same `runtimesDir` that passed parent readiness checks.
- Keep one long-lived `CopilotClient` in the worker, create one session per request, require `abort()`, and attempt `disconnect()` as best-effort cleanup after the request.
- Serialize bridge requests to avoid session event interleaving.
- Normalize `/v1/chat/completions` and `/v1/responses` text-oriented turns to SDK `prompt` messages and pass the model through `createSession({ model })`.
- Stream Responses API events before upstream completion and emit heartbeat comments while waiting.
- Return explicit bridge errors for unsupported requests, auth-required failures, SDK/runtime failures, and upstream timeouts.
- Project Copilot model providers with `wire_api = "responses"` and `stream_idle_timeout_ms = 300000`.

## Non-Goals

`0.1.2` does not claim the Copilot bridge is a complete OpenAI Responses API backend. Complex tool-call round trips remain experimental unless verified separately.

## Acceptance

- `/v1/responses` request normalization accepts string input, message arrays, or typed top-level content-item arrays; mixed arrays are rejected; non-text items become readable placeholders.
- Unsupported requests map to `400`, auth-required failures map to `401`, upstream timeouts map to `504`, and other bridge runtime failures map to `500`.
- Streaming Responses requests emit the expected event shape, including initial lifecycle events before upstream completion, text deltas, and final completion events.
- Copilot config projection writes `wire_api = "responses"` and `stream_idle_timeout_ms = 300000`.
- Simple non-stream and stream bridge requests work against the fake SDK contract.
- Node `<20` Copilot commands fail before mutating provider or Codex state.
