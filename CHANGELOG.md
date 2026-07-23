# Changelog

## 0.3.2 - 2026-07-23

Responses compatibility and compressed-stream hardening release.

### Added

- Per-provider `native`, `strict`, and `xai` Responses compatibility modes,
  configurable with `add/edit --responses-compat`.
- Strict relay sanitization for private Codex fields, `additional_tools`
  promotion, null reasoning content, and optional xAI-specific filtering.
- Request and response content-encoding support for transformed JSON bodies.

### Fixed

- Added CC Switch-aligned Responses namespace compatibility: namespace tools and
  `input[].namespace` metadata are flattened before strict upstream relays, then
  restored in buffered and SSE responses.
- Matched CC Switch's 16-hex SHA-256 suffix, de-duplicated flattened tools, and
  kept custom tool declarations and historical calls internally consistent.
- Forced identity encoding for streaming/transformed upstream requests and
  rejected compressed SSE before committing corrupt bytes to Codex.
- Selected SSE handling from the upstream response content type and preserved a
  final event even when the stream omitted its trailing blank-line delimiter.

## 0.3.1 - 2026-07-23

Independent GitHub release under `airpot/codex-switch`.

### Added

- Complete operator documentation for installation, provider maintenance, automatic routing, upgrades, session continuity, recovery, and troubleshooting.
- GitHub Actions verification for supported Node.js versions.

### Changed

- Package identity moved to `@airpot/codex-switch` and repository metadata now points to `airpot/codex-switch`.
- Normal router restarts reuse the local bearer token; explicit rotation requires `route start --rotate-token`.
- Both streaming and non-streaming forwarding now follow CC Switch-aligned failover and timeout behavior.
- Upstream connections follow deterministic system DNS ordering, avoiding false Node.js IPv4/IPv6 `ETIMEDOUT` failures on affected hosts.
- The router keeps the active Codex `model_provider` id so existing session history remains visible.

### Fixed

- Late streaming failures are never replayed against another provider after output has reached Codex.
- Built CLI entrypoint retains executable permissions.

## 0.3.0 - 2026-07-18

Claude Code provider switching release.

### Added

- Headless automatic provider routing with strict priority, pre-response failover, per-provider circuit breakers, and `route configure/start/status/stop` lifecycle commands.
- Authenticated localhost-only worker with provider-specific API key and model projection, secure runtime files, activation backups, and drift-aware restoration.
- Claude Code provider management via `--claude` flag on `add`, `switch`, `list`, `show`, `current`, `remove` commands.
- `codexs add --claude <name> --from-file <settings.json>` imports a Claude Code settings file as a named profile.
- `codexs switch --claude <name>` atomically replaces `~/.claude/settings.json` with the stored profile.
- `codexs current --claude` detects which registered profile matches the active Claude settings.
- `codexs list --claude` shows all Claude profiles with active detection.
- `codexs show --claude <name>` displays full Claude profile details including env vars.
- `codexs remove --claude <name>` removes a Claude profile from the registry.
- Separate `claude-providers.json` storage in tool home directory.
- `CODEXS_CLAUDE_DIR` environment variable to override the Claude Code directory.
- PRD v0.3.0 and Design v0.3.0 fact sources.

### Changed

- Package description updated to reflect dual-target (Codex + Claude Code) support.
- Help text for `add`, `switch`, `list`, `show`, `current`, `remove` updated with `--claude` usage.

## 0.2.2 - 2026-07-15

Version bump and command summary update.

## 0.2.1 - Unreleased

Provider-management-only consolidation release.

- Repositioned the current development line as a local-first Codex provider/model-provider management CLI.
- Removed current-facing Copilot login, `add --copilot`, bridge command, SDK, HTTP proxy bridge, and local bridge runtime contracts from docs and command presentation.
- Added `0.2.1` PRD and design fact sources.
- Updated release-contract coverage around the reduced provider-management command surface.
## 0.1.5 - 2026-07-01

Copilot Bridge process-visibility and redaction patch release.

### Changed

- Added stable Copilot bridge runtime events for assistant intent, message deltas, reasoning deltas, tool lifecycle, permission lifecycle, user-input requests, exit-plan-mode requests, and session status signals.
- Projected Copilot process/status events into Responses streaming commentary items and reasoning/progress updates into Responses reasoning summary events.
- Forwarded adapter runtime events through the bridge worker while keeping Chat Completions streaming text-only.
- Hardened unknown SDK event summaries with key-aware and value-aware redaction plus bounded truncation.
- Added adapter-level regression coverage for raw SDK session event normalization.

## 0.1.4 - Unreleased

Bridge stability and observability release.

### Changed

- Reworked Copilot bridge reuse to retry transient health/auth probe failures before replacing an existing worker.
- Added persisted bridge runtime logging, restart reason tracking, and surfaced `logPath` metadata across bridge, switch, status, and doctor flows.
- Extended bridge runtime state and start results with persisted probe/restart metadata for diagnostics.
- Restored the interactive provider picker `current` hint for legacy top-level `profile` state when `model_provider` is absent or unresolved.
- Replaced the hard-coded test runner with deterministic `tests/*.spec.js` discovery and aligned the widened release gate with the current help, runtime, and workflow contracts.

## 0.1.3 - Unreleased

Copilot login hotfix release.

### Changed

- Replaced the legacy `CopilotClient` constructor fields with the official `RuntimeConnection.forStdio({ path })` SDK connection path.
- Resolved the managed SDK runtime against `@github/copilot/npm-loader.js` instead of relying on implicit bundled package lookup.
- Kept human `copilot --help` and `copilot login` invocations on the bundled `.bin` shim while separating SDK runtime resolution from terminal CLI resolution.
- Added a focused `0.1.3` regression spec covering the Copilot login compatibility fix.

## 0.1.2 - Unreleased

Copilot runtime repair release.

### Changed

- Pinned the managed Copilot runtime installer to `@github/copilot-sdk@1.0.2` instead of installing `latest`.
- Added a Copilot-only Node.js runtime gate. Direct providers still support Node.js `>=18`; Copilot runtime paths require Node.js `>=20`.
- Reworked SDK loading to resolve `@github/copilot-sdk` from the managed runtime install directory via `createRequire()`.
- Replaced session-based auth probing with `CopilotClient.getAuthStatus()`.
- Added explicit Copilot runtime errors for unsupported Node runtime, SDK version, SDK API shape, and bridge upstream timeout.
- Reworked the bridge worker to keep one long-lived Copilot client, create one session per request, disconnect sessions after use, and serialize requests.
- Updated Responses streaming to emit initial SSE events before the upstream request completes and to keep the connection alive with heartbeat comments.
- Added Copilot config projection for `stream_idle_timeout_ms = 300000`.

### Documentation

- Added `0.1.2` PRD and design docs describing the experimental Copilot bridge boundary.
- Removed obsolete `0.0.x` transition docs and old test reports from the active docs tree.

## 0.1.1 - 2026-05-28

Documentation and fact-source completion release.

### Changed

- Added missing `0.1.1` PRD/design fact sources.
- Aligned README, CLI usage, product overview, architecture notes, and AI-facing README around the stable `0.1.x` route model.
- Clarified that `profile` is a managed alias for the Codex `model_provider` route id.

## 0.1.0 - 2026-05-28

First stable documentation baseline.

### Added

- Stable command-surface summary for direct provider and Copilot provider workflows.
- Stable JSON envelope contract for automation.
- Stable split-state model: tool home for managed state, target Codex home for runtime projection.

### Notes

- `migrate` remains an advanced adopt helper.
- `setup` remains a deprecated compatibility entry.
- Development-version policy remains in effect: no automatic migration shims or backward-compatibility preservation logic unless explicitly requested.
