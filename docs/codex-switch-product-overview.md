# codex-switch Product Overview

Current version: `0.2.1`

Current fact sources:

- [`PRD/codex-switch-prd-v0.2.1.md`](./PRD/codex-switch-prd-v0.2.1.md)
- [`Design/codex-switch-v0.2.1-design.md`](./Design/codex-switch-v0.2.1-design.md)
- [`cli-usage.md`](./cli-usage.md)

## Product

`codex-switch` is a local-first provider/model-provider management CLI for Codex. It is for users who switch between OpenAI-compatible provider endpoints and want the switch to be explicit, backed up, and inspectable.

The product owns three jobs:

- Maintain managed provider records in `providers.json`.
- Project Codex `model_provider` entries plus active top-level `model` / `model_provider` route.
- Provide diagnostics, import/export, backups, and rollback for local state.

## Current Workflow

```bash
codexs init
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> --base-url <url>
codexs switch <provider>
codexs status
codexs doctor
```

`migrate` is an advanced adopt helper for existing Codex config, not the fresh-install default.

## Current Boundary

`0.2.1` deliberately narrows the product to provider management. It does not include account onboarding, hosted services, local proxy bridges, or background runtime orchestration. A future third-party-router integration may be considered separately, but no workflow or runtime code path is part of `0.2.1`.

## Users

- Developers who maintain several Codex-compatible provider endpoints.
- AI agents that need a stable JSON command envelope and deterministic local state.
- Operators who want backups and diagnostics before changing Codex config.

## Non-Goals

- Copilot SDK or GitHub login flows.
- `login copilot`, `add --copilot`, or `bridge *` commands.
- HTTP proxy bridge or local bridge worker runtime.
- Account systems, cloud sync, or background services.
- Automatic migration of old experimental runtime state.
