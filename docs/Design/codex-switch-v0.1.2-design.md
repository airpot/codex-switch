# codex-switch v0.1.2 Design

## Purpose

`0.1.2` repairs the Copilot runtime integration while keeping direct-provider support unchanged.

## SDK Runtime

- The managed installer installs `@github/copilot-sdk@1.0.2`.
- `loadCopilotSdk()` resolves `@github/copilot-sdk` from the managed runtime package using `createRequire()`.
- Copilot-specific paths call a Node gate before mutation or bridge startup. Node.js `<20` fails with `COPILOT_RUNTIME_NODE_UNSUPPORTED`.
- `probeCopilotSdkRuntime()` classifies missing installs, unsupported versions, and prerelease installs before runtime use.
- SDK API-shape validation happens later when creating the client or session.

## SDK API Contract

The supported runtime/session shape is:

- `CopilotClient`
- `CopilotClient.getAuthStatus()`
- `CopilotClient.createSession()`
- `CopilotSession.sendAndWait()` when present, otherwise `CopilotSession.send()`
- `CopilotSession.abort()`
- `CopilotSession.disconnect()` only as best-effort cleanup
- SDK `approveAll` or compatible permission handler

Auth readiness uses `getAuthStatus()` and does not create a session just to test login state. `abort()` is a required compatibility surface; `disconnect()` is not a required compatibility gate.

## Bridge Worker

The parent process passes both runtime state and SDK runtime directories into the worker. The worker creates one long-lived `CopilotClient`, starts it once, and serializes incoming requests through a promise queue. Each request gets its own session, uses `abort()` for timeout and cancellation control, and attempts `disconnect()` after completion as best-effort cleanup.

## Request Mapping

The bridge remains a minimal OpenAI-compatible adapter:

- `/v1/chat/completions` maps messages to a text prompt.
- `/v1/responses` accepts string input, message arrays, or typed top-level content-item arrays and maps those text-oriented shapes to the same prompt path.
- `model` is passed to `createSession({ model })`.
- Mixed top-level arrays are rejected as unsupported input.
- `sendAndWait()` receives `{ prompt }` and the request timeout when available; otherwise the bridge falls back to `send()`.

Non-text Responses content is represented as readable placeholders. Complex tool-call round trips are outside the `0.1.2` guarantee.

## Streaming

Streaming Responses requests emit `response.created`, `response.in_progress`, output item/content part setup events, text deltas, done events, and `response.completed`. The bridge writes initial SSE bytes before the upstream response completes and emits comment heartbeats every 15 seconds while waiting.

## Error Mapping

- Unsupported request shapes return `400`.
- Auth-required failures return `401`.
- Upstream timeouts return `504`.
- Other bridge runtime failures return `500`.

## Config Projection

Copilot provider projection includes:

```toml
wire_api = "responses"
stream_idle_timeout_ms = 300000
```

Direct provider projection does not add `stream_idle_timeout_ms`.
