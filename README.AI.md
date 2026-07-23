# README.AI

This file is the current AI-facing fact sheet for `@airpot/codex-switch`.

Current repository version: `0.3.1`

Current fact sources:

- `docs/PRD/codex-switch-prd-v0.3.0.md`
- `docs/Design/codex-switch-v0.3.0-design.md`
- `docs/PRD/codex-switch-prd-v0.2.1.md`
- `docs/Design/codex-switch-v0.2.1-design.md`
- `docs/cli-usage.md`

## Product Positioning

`codex-switch` is a local-first CLI for managing and switching Codex and Claude Code provider routing. It manages local provider records, projects Codex `model_provider` sections, writes the active top-level `model` / `model_provider` route, switches Claude Code `settings.json` profiles, and maintains backups around mutating commands.

In `0.3.0`, there are two managed workflows:
1. **Codex providers** — OpenAI-compatible provider records projected into `config.toml` / `auth.json`.
2. **Claude Code providers** (via `--claude` flag) — full `settings.json` profiles stored and switched atomically.

## Primary Workflow (Codex)

```bash
codexs init
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

`--profile` means managed `model_provider` id alias. It is not the legacy Codex top-level `profile` selector.

## Automatic Routing

```bash
codexs route configure lxapi rivo
codexs route start
codexs route status
codexs route stop
```

The headless localhost worker provides strict provider priority, pre-response failover, circuit breakers, persistent local authentication across normal restarts, and activation backup restoration. It preserves the active Codex `model_provider` id so existing session history remains in the same namespace.

## Claude Code Workflow

```bash
codexs add --claude <name> --from-file <settings.json>
codexs switch --claude <name>
codexs current --claude
codexs list --claude
codexs show --claude <name>
codexs remove --claude <name> --force
```

Claude providers store the entire `settings.json` as an opaque blob. Switching replaces the whole file atomically with backup/rollback.

## Current Command Surface

Document only these current commands:

```text
init
migrate
list [--claude]
show [--claude]
current [--claude]
status
route configure
route start
route status
route stop
config show
config list-profiles
add [--claude]
edit
switch [--claude]
remove [--claude]
import
export
backups list
rollback
doctor
setup
```

`setup` is deprecated and only points callers to `init` or `migrate`.

## State Model

Tool home:

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  claude-providers.json
  router.json
  router-state.json
  router-token
  router.log
  backups/
```

Target Codex directory:

```text
~/.codex/
  config.toml
  auth.json
```

Target Claude Code directory:

```text
~/.claude/
  settings.json
```

Managed projection for current Codex versions is route-first:

- top-level `model`
- top-level `model_provider`
- matching `[model_providers.<id>]`
- API-key auth projection in `auth.json`

Do not present top-level `profile` or `[profiles.*]` as the current managed runtime path. They may be inspected for adoption or legacy diagnostics only.

## Current Non-Goals

`0.3.0` does not include:

- Copilot SDK integration.
- GitHub device-flow login.
- Copilot HTTP proxy bridge or Copilot bridge worker runtime.
- Generic system-service installation or boot-time startup management.
- Built-in third-party router packaging.
- Account systems or cloud sync.
- Claude Code plugin marketplace management.
- Generic "target" abstraction or pluggable provider type system.
- Field-based Claude provider creation (only `--from-file` import is supported).

## Verification Commands

```bash
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```
