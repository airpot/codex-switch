# codex-switch v0.2.0 Design

`0.2.0` is a major architecture release that replaces the Copilot SDK-based authentication and runtime model with a direct GitHub device-flow token exchange and HTTP proxy bridge.

## Architecture Changes

### Authentication: SDK-based to Device-Flow Token

- The Copilot SDK (`@github/copilot-sdk`) is no longer required for authentication or session management.
- Authentication is now handled via GitHub OAuth Device Flow (`login copilot`), which produces a GitHub personal access token stored at `<toolHomeDir>/github-token`.
- The GitHub PAT is exchanged for a short-lived Copilot API token via `POST /copilot_internal/v2/token` before every bridge start or switch operation.
- `TokenManager` handles background token refresh and expiry-aware caching with a new `invalidate()` method for forced refresh on upstream 401 responses.

### Bridge: SDK Session to HTTP Proxy

- The bridge worker (`copilot-http-bridge-worker.ts`) is now a pure HTTP reverse proxy between the local OpenAI-compatible surface and `api.githubcopilot.com`.
- Copilot token lifecycle (exchange, refresh, invalidation) is managed inside the worker via `createTokenManager`.
- On upstream 401, the worker invalidates its cached token and retries once with a freshly exchanged token.
- A `createStaticTokenManager` variant supports test scenarios where the exchange should be bypassed (`CODEX_SWITCH_BRIDGE_COPILOT_TOKEN` env var).

### Path Resolution: toolHomeDir Propagation

- `toolHomeDir` is now explicitly threaded through all functions that read the GitHub token: `switchProvider`, `startBridge`, `getStatus`, `runDoctor`, and the bridge worker spawn.
- The bridge worker receives the correct `toolHomeDir` (not `runtimeDir`) via `CODEX_SWITCH_TOOL_HOME_DIR`, ensuring the token is found at `<toolHomeDir>/github-token` rather than a nested runtime subdirectory.
- `readGithubToken(toolHomeDir?)` resolves the home directory in a consistent order: explicit arg, `CODEXS_HOME` env var, then `~/.config/codex-switch`.

### Provider Runtime Kind

- New providers created via `add --copilot` now use `kind: "copilot-http-proxy"` instead of `kind: "copilot-sdk-bridge"`.
- Both kinds are accepted by `isCopilotBridgeProvider` for backward compatibility with existing provider files.
- The distinction is cosmetic; both route through the same HTTP bridge worker.

### Status Contract

- `getStatus` output `copilotSdk` field is simplified to `{ installed: boolean, source: string }` reflecting the presence of a GitHub token rather than an SDK install.
- `copilotAuth` reflects the token exchange readiness rather than SDK session health.
- Legacy fields (`installDir`, `packageName`, `packageVersion`) are removed from the status contract.

## Test Infrastructure

- `setCopilotTokenExchangeImplementation` / `resetCopilotTokenExchangeImplementation` provide an in-process mock for the Copilot token exchange, enabling offline test execution.
- The bridge worker supports `CODEX_SWITCH_BRIDGE_COPILOT_TOKEN` env var to skip the real exchange in spawned child processes during tests.
- Integration tests that previously relied on fake SDK mock responses now verify state and configuration correctness without making HTTP requests through the bridge (bridge request handling is covered by `copilot-bridge-contract.spec.js`).

## Breaking Changes

- `copilotSdk` status output no longer includes `installDir`, `packageName`, or `packageVersion`.
- Provider `runtimeKind` for newly-created Copilot providers is `"copilot-http-proxy"` instead of `"copilot-sdk-bridge"`.
- `switchProvider` requires `toolHomeDir` to be passed explicitly when operating outside the default env-var-resolved home.
- The Copilot SDK (`@github/copilot-sdk`) is no longer a runtime dependency for authentication flows.

## Non-Goals

- The Copilot SDK is not removed from the repository; existing workflows that depend on it for non-auth purposes remain unchanged.
- No migration of existing `copilot-sdk-bridge` provider records to `copilot-http-proxy`; both are accepted.
- No changes to direct (non-Copilot) provider workflows.
