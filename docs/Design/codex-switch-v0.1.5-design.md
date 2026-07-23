# codex-switch v0.1.5 Design

`0.1.5` is a Copilot Bridge process-visibility and redaction patch release.

## Design Notes

- `CopilotBridgeRuntimeEvent` is the stable internal boundary between Copilot SDK session events and the OpenAI-compatible bridge surface.
- Copilot sessions are created with `streaming: true` and register the generic `session.on("event", handler)` listener alongside the existing `data`, `message`, and `delta` text compatibility listeners.
- The adapter maps known SDK event names into bridge runtime events for assistant intent, assistant message deltas, assistant reasoning deltas, tool lifecycle, permission lifecycle, user-input requests, exit-plan-mode requests, session idle, and session errors.
- `assistant.message_delta` is also forwarded as a normal text delta so final response streaming remains compatible with existing Chat Completions and Responses text paths.
- The bridge worker forwards adapter runtime events through `onRuntimeEvent`, separate from `onTextDelta` and `onTextDone`.
- Responses streaming projects non-text runtime process events as completed assistant message items with `phase: "commentary"`.
- Reasoning deltas project as `response.reasoning_summary_part.added` followed by `response.reasoning_summary_text.delta`.
- Unknown SDK events become `session.unknown`, are omitted from the UI projection path, and are logged with bounded summaries.
- Unknown summaries redact sensitive key names and obvious token/API-key-like values before truncation.
- Chat Completions streaming only wires text deltas, so Responses-only commentary events stay out of Chat Completions streams.
- Internal Copilot tool lifecycle events remain process visibility signals only; they are not emitted as Codex/OpenAI function calls or tool calls.