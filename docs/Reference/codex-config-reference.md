# Codex Config Reference

This document reorganizes the official Codex configuration docs into a practical reference for day-to-day use.

It is not an official OpenAI document and it is not a line-by-line translation of the upstream pages.

Sources used for this summary:

- Advanced Configuration: https://developers.openai.com/codex/config-advanced
- Configuration Reference: https://developers.openai.com/codex/config-reference

Current against the official pages fetched on 2026-05-14.

## 1. What this reference covers

This guide focuses on three things:

- where Codex reads configuration from
- which configuration families matter most in practice
- how the most important `config.toml` and `requirements.toml` keys fit together

It intentionally summarizes and groups the official reference instead of reproducing every single key.

## 2. Config files and state locations

Codex stores local state under `CODEX_HOME`, which defaults to `~/.codex`.

Common files there include:

- `config.toml`: user-level local configuration
- `auth.json`: file-based credentials when applicable
- OS keychain/keyring: credential storage on supported systems
- `history.jsonl`: local session history when history persistence is enabled
- caches, logs, and other per-user state

The official docs also distinguish between:

- user config: `~/.codex/config.toml`
- project config: `<repo>/.codex/config.toml`
- admin-enforced requirements: `requirements.toml`

## 3. Configuration layers and precedence

Codex supports several ways to influence configuration.

### 3.1 User config

Your baseline settings usually live in:

```toml
~/.codex/config.toml
```

Use this for persistent defaults such as model choice, approval policy, sandbox mode, providers, notifications, and telemetry settings.

### 3.2 Project config

Codex can load repo-scoped overrides from:

```toml
<repo>/.codex/config.toml
```

Important behavior from the official docs:

- Codex walks from the project root to the current working directory.
- It loads every `.codex/config.toml` found along the way.
- If the same key is defined multiple times, the layer closest to the current working directory wins.
- Project-scoped config is loaded only for trusted projects.
- If a project is untrusted, Codex ignores project-local `.codex/` config, hooks, and rules.
- Relative paths inside a project config are resolved relative to the `.codex/` directory that contains that file.

Related keys:

- `project_root_markers`
- `projects.<path>.trust_level`
- `project_doc_max_bytes`
- `project_doc_fallback_filenames`

### 3.3 One-off CLI overrides

For a single run, you can override settings from the command line.

Preferred options:

- use dedicated flags when available, such as `--model`
- use `-c` or `--config` for arbitrary keys

Examples from the official docs:

```bash
codex --model gpt-5.4
codex --config model='"gpt-5.4"'
codex --config sandbox_workspace_write.network_access=true
codex --config 'shell_environment_policy.include_only=["PATH","HOME"]'
```

Important note:

- `--config` values are parsed as TOML, not JSON
- nested keys can use dot notation
- if a value cannot be parsed as TOML, Codex treats it as a string

### 3.4 Profiles

Profiles are named sets of config overrides stored in `config.toml`.

Official behavior:

- define them under `[profiles.<name>]`
- select one with `codex --profile <name>`
- set a default profile with top-level `profile = "<name>"`
- profiles are experimental
- profiles are not currently supported in the Codex IDE extension
- a selected profile can override `model_catalog_json`

Core keys:

- `profile`
- `profiles.<name>.*`
- `profiles.<name>.model_catalog_json`
- `profiles.<name>.model_instructions_file`
- `profiles.<name>.web_search`
- `profiles.<name>.windows.sandbox`
- profile-scoped versions of analytics, reasoning, personality, service tier, and OSS provider settings

Example:

```toml
model = "gpt-5.4"
approval_policy = "on-request"
profile = "deep-review"

[profiles.deep-review]
model = "gpt-5-pro"
model_reasoning_effort = "high"
approval_policy = "never"
```

Important `codex-switch` note:

- official Codex still supports profiles
- `codex-switch` `0.1.1` does not treat top-level `profile` as the recommended managed runtime selector
- in `codex-switch`, legacy `profile` and `[profiles.*]` are mainly inspect-and-adopt inputs for `migrate`, `doctor`, and `config` inspection flows

## 4. `config.toml` by topic

### 4.1 Model, reasoning, and response style

These keys define what model Codex uses and how it behaves.

Common keys:

- `model`: active model id, for example `gpt-5.5`
- `model_reasoning_effort`: `minimal | low | medium | high | xhigh`
- `model_reasoning_summary`: `auto | concise | detailed | none`
- `model_verbosity`: `low | medium | high`
- `model_context_window`: context window size
- `model_auto_compact_token_limit`: threshold for automatic compaction
- `service_tier`: `flex | fast`
- `personality`: `none | friendly | pragmatic`
- `plan_mode_reasoning_effort`: Plan-mode reasoning override

Important notes from the official docs:

- `model_reasoning_effort` applies to supported models using the Responses API
- `model_verbosity` applies only to providers using the Responses API
- Chat Completions providers ignore `model_verbosity`

### 4.2 Web search

Codex exposes web search as a first-class setting.

Key:

- `web_search`: `disabled | cached | live`

Official behavior:

- default is `"cached"`
- cached mode uses an OpenAI-maintained index and does not fetch live pages
- if you use `--yolo` or another full access sandbox setup, the default becomes `"live"`
- use `"live"` for the most recent data
- use `"disabled"` to remove the tool

Legacy feature flags such as `features.web_search`, `features.web_search_cached`, and `features.web_search_request` still exist, but the official reference treats them as deprecated in favor of the top-level `web_search` key.

### 4.3 Providers and API routing

Codex separates the active provider id from the provider definitions.

Core keys:

- `model_provider`
- `model_providers.<id>`
- `model_providers.<id>.base_url`
- `model_providers.<id>.env_key`
- `model_providers.<id>.env_key_instructions`
- `model_providers.<id>.http_headers`
- `model_providers.<id>.env_http_headers`
- `model_providers.<id>.query_params`
- `model_providers.<id>.request_max_retries`
- `model_providers.<id>.wire_api`
- `model_providers.<id>.requires_openai_auth`

Authentication options for custom providers include:

- `env_key`
- `experimental_bearer_token`
- command-backed bearer token auth via `model_providers.<id>.auth.*`

The official docs explicitly recommend `env_key` over direct bearer tokens.

Built-in or reserved provider behavior:

- `openai`, `ollama`, and `lmstudio` are reserved ids
- they cannot be overridden by custom providers
- `amazon-bedrock` is available as a built-in provider with nested AWS settings

Related Bedrock keys:

- `model_providers.amazon-bedrock.aws.profile`
- `model_providers.amazon-bedrock.aws.region`

#### `codex-switch` 0.1.1 managed projection

When `codex-switch` manages a direct OpenAI-compatible route for Codex `0.134.0+`, it intentionally projects a narrower runtime shape than the full official provider schema:

- top-level `model` is the active model selector
- top-level `model_provider` is the active route selector
- projected `[model_providers.<id>]` keeps `base_url`
- projected `[model_providers.<id>]` fixes `wire_api = "responses"`
- projected `[model_providers.<id>]` fixes `requires_openai_auth = true`
- projected runtime config does not keep `env_key`
- projected runtime config does not keep `env_key_instructions`

Authentication is projected through `auth.json` with `OPENAI_API_KEY`, not through `env_key` in the managed runtime config.

That is a `codex-switch` product decision, not a limitation of Codex itself. If you hand-write or independently manage Codex config, `env_key` remains a valid official mechanism.

### 4.3.1 `openai_base_url` vs custom providers

If you only want to point the built-in OpenAI provider to a proxy, router, or residency-specific endpoint, use:

```toml
openai_base_url = "https://us.api.openai.com/v1"
```

Use a custom `model_providers.<id>` entry when you need a separate provider identity, different auth wiring, or custom headers/query params.

### 4.3.2 OSS mode

Codex can target local open-source backends when run with `--oss`.

Key:

- `oss_provider`: `lmstudio | ollama`

If `--oss` is passed without an explicit provider, Codex uses `oss_provider` as the default local provider.

### 4.4 Approval policy and sandboxing

These keys control how much Codex can do without pausing and how much local access subprocesses receive.

Main keys:

- `approval_policy`
- `approvals_reviewer`
- `sandbox_mode`
- `sandbox_workspace_write.network_access`
- `sandbox_workspace_write.writable_roots`
- `sandbox_workspace_write.exclude_slash_tmp`
- `sandbox_workspace_write.exclude_tmpdir_env_var`
- `windows.sandbox`
- `windows.sandbox_private_desktop`

Top-level `approval_policy` supports:

- `untrusted`
- `on-request`
- `never`
- granular mode:

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = false,
  request_permissions = true,
  skill_approval = true
} }
```

Granular subkeys include:

- `approval_policy.granular.sandbox_approval`
- `approval_policy.granular.rules`
- `approval_policy.granular.mcp_elicitations`
- `approval_policy.granular.request_permissions`
- `approval_policy.granular.skill_approval`

Sandbox mode values:

- `read-only`
- `workspace-write`
- `danger-full-access`

This is the main policy combination most teams tune first:

- approval strictness determines when Codex pauses
- sandbox mode determines file and network boundaries

### 4.5 Named permission profiles

Codex also supports reusable permission profiles through:

- `default_permissions`
- `[permissions.<name>]`

Built-in profile names:

- `:read-only`
- `:workspace`
- `:danger-no-sandbox`

Custom profiles can define filesystem and network policy, including:

- `permissions.<name>.filesystem`
- `permissions.<name>.network.enabled`
- `permissions.<name>.network.mode`
- `permissions.<name>.network.domains`
- `permissions.<name>.network.proxy_url`
- `permissions.<name>.network.socks_url`
- `permissions.<name>.network.unix_sockets`

Use this when sandbox defaults are not enough and you need a reusable local policy shape.

### 4.6 Shell environment policy

Codex lets you control which environment variables are passed to subprocesses.

Main table:

```toml
[shell_environment_policy]
inherit = "none"
set = { PATH = "/usr/bin", MY_FLAG = "1" }
ignore_default_excludes = false
exclude = ["AWS_*", "AZURE_*"]
include_only = ["PATH", "HOME"]
```

Important keys:

- `shell_environment_policy.inherit`: `all | core | none`
- `shell_environment_policy.set`
- `shell_environment_policy.exclude`
- `shell_environment_policy.include_only`
- `shell_environment_policy.ignore_default_excludes`
- `shell_environment_policy.experimental_use_profile`

Official behavior:

- filters are case-insensitive glob patterns
- when `ignore_default_excludes = false`, Codex keeps the automatic `KEY` / `SECRET` / `TOKEN` filtering before your rules run

This is the main tool for preventing secret leakage to subprocesses while still supplying required paths or flags.

### 4.7 Instructions, AGENTS.md, and project guidance

Codex supports both built-in instruction replacement and project document discovery.

Relevant keys:

- `model_instructions_file`
- `project_doc_max_bytes`
- `project_doc_fallback_filenames`

Official behavior:

- `model_instructions_file` replaces built-in instructions instead of relying on `AGENTS.md`
- Codex reads `AGENTS.md` and related files and includes a limited amount of project guidance in the first turn
- `project_doc_max_bytes` limits how much is read from each `AGENTS.md`
- `project_doc_fallback_filenames` adds alternate filenames when `AGENTS.md` is missing

### 4.8 Hooks, agents, and feature flags

Codex has a large feature surface, but a few keys matter most for local config.

Useful feature keys:

- `features.codex_hooks`
- `features.codex_git_commit`
- `features.apps`
- `features.memories`
- `features.multi_agent`
- `features.personality`
- `features.shell_tool`
- `features.shell_snapshot`
- `features.fast_mode`

The advanced config guide calls out hooks as experimental.

Hook-related locations:

- `~/.codex/hooks.json`
- `~/.codex/config.toml`
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`

Project-local hooks follow the same trust behavior as project-local config.

### 4.9 Notifications and TUI options

Codex supports both external notifications and TUI-native notifications.

External notification key:

- `notify`: command array that receives a JSON payload

TUI notification keys:

- `tui.notifications`
- `tui.notification_method`: `auto | osc9 | bel`
- `tui.notification_condition`: `unfocused | always`

Other common TUI keys:

- `tui.animations`
- `tui.alternate_screen`
- `tui.status_line`
- `tui.terminal_title`
- `tui.theme`
- `tui.show_tooltips`

The advanced config guide distinguishes:

- `notify`: use this for webhooks, desktop notifiers, CI hooks, or any external side-channel
- `tui.notifications`: built-in terminal notifications for the interactive UI

### 4.10 History, citations, and local UX

History keys:

- `history.persistence`: `save-all | none`
- `history.max_bytes`

Official behavior:

- local history is stored under `CODEX_HOME`
- setting `history.persistence = "none"` disables local history persistence
- if `history.max_bytes` is exceeded, Codex compacts the file by dropping the oldest entries

Citation/terminal integration key:

- `file_opener`: `vscode | vscode-insiders | windsurf | cursor | none`

This controls how file citations are rewritten into clickable editor links in supporting terminals or editor integrations.

### 4.11 Telemetry and analytics

Codex distinguishes between lightweight analytics and full OpenTelemetry export.

Analytics key:

- `analytics.enabled`

OpenTelemetry keys:

- `otel.environment`
- `otel.exporter`
- `otel.exporter.<id>.endpoint`
- `otel.exporter.<id>.headers`
- `otel.exporter.<id>.protocol`
- `otel.exporter.<id>.tls.*`
- `otel.log_user_prompt`
- `otel.metrics_exporter`
- `otel.trace_exporter`
- `otel.trace_exporter.<id>.*`

Important official behavior:

- `otel.exporter = "none"` means Codex records events but sends nothing
- exporters batch asynchronously and flush on shutdown
- event metadata includes model, sandbox settings, approval settings, CLI version, conversation id, and related fields
- `otel.log_user_prompt` is opt-in for exporting raw user prompts

Use `analytics.enabled` when you only need a high-level machine/profile switch.

Use `otel.*` when you need structured logs, traces, or metrics in your observability stack.

## 5. `requirements.toml`

`requirements.toml` is an admin-enforced configuration layer for security-sensitive settings that users cannot override.

The official reference describes it as a constraint system rather than a convenience layer.

High-level purpose:

- restrict which approval policies are allowed
- restrict which sandbox modes are allowed
- restrict which web search modes are allowed
- pin or disable selected features

Key families called out in the official reference:

- `allowed_approval_policies`
- `allowed_approvals_reviewers`
- `allowed_sandbox_modes`
- `allowed_web_search_modes`
- `[features]`
- `features.<name>`

Examples of feature constraints explicitly called out:

- `features.browser_use = false`
- `features.computer_use = false`
- `features.in_app_browser = false`

The official docs also note that:

- omitted feature keys remain unconstrained
- `disabled` is always allowed for `web_search`
- an empty `allowed_web_search_modes` list effectively allows only `disabled`

For enterprise setups, the reference also points to managed or cloud-fetched requirements and to admin/security documentation for precedence details.

## 6. Practical examples

### 6.1 Conservative daily default

```toml
model = "gpt-5.5"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "cached"
profile = "daily"

[profiles.daily]
model_reasoning_effort = "medium"
service_tier = "flex"
```

### 6.2 OpenAI through a proxy

```toml
model = "gpt-5.5"
openai_base_url = "https://us.api.openai.com/v1"
```

Use this when you still want the built-in `openai` provider behavior and only need a different base URL.

### 6.3 Custom provider with env-based auth

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "OpenAI via team gateway"
base_url = "https://proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
http_headers = { "X-Team" = "platform" }
```

This is an official Codex-style custom provider example.

If you are using `codex-switch` managed direct-provider projection instead, the runtime projection is intentionally narrower:

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "proxy"
base_url = "https://proxy.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

In that managed projection, `OPENAI_API_KEY` is expected in `auth.json` rather than through `env_key` in `config.toml`.

### 6.4 Locked-down shell environment

```toml
[shell_environment_policy]
inherit = "none"
include_only = ["PATH", "HOME"]
exclude = ["AWS_*", "AZURE_*"]
ignore_default_excludes = false
```

### 6.5 Disable local history

```toml
[history]
persistence = "none"
```

### 6.6 Basic OTEL logging

```toml
[otel]
environment = "prod"
exporter = { otlp-http = {
  endpoint = "https://otel.example.com/v1/logs",
  protocol = "binary"
}}
log_user_prompt = false
```

### 6.7 Admin-enforced requirements

```toml
allowed_approval_policies = ["on-request", "never"]
allowed_sandbox_modes = ["read-only", "workspace-write"]
allowed_web_search_modes = ["cached"]

[features]
browser_use = false
computer_use = false
```

## 7. Recommended reading strategy

Use this document for:

- understanding how the config system is organized
- choosing the right config layer
- finding the right key family quickly

Go back to the official reference when you need:

- every single supported key
- full type information for a rare key
- exact nested schema for provider auth, permissions, hooks, or OTEL exporters
- the latest values added after 2026-05-14

## 8. Notable update notes from the official pages

- `experimental_instructions_file` has been renamed to `model_instructions_file`
- `approval_policy = "on-failure"` is deprecated
- legacy `features.web_search*` toggles are deprecated in favor of top-level `web_search`
- profiles are still experimental
- profiles are not currently supported in the Codex IDE extension
