# codex-switch v0.2.1 Design

## Summary

`0.2.1` narrows the current implementation to provider/model-provider management for Codex. The design removes current-facing bridge/account runtime paths and keeps a direct local-state architecture.

## Command Registry

The command registry contains only provider-management, config inspection, backup, rollback, and diagnostics commands. Removed command ids such as `login` and `bridge-*` are not part of the internal `CommandId` union.

`setup` remains registered only as a deprecated pointer to `init` and `migrate`.

## Provider Records

`providers.json` remains the managed source of provider records:

```json
{
  "providers": {
    "packycode": {
      "profile": "packycode",
      "apiKey": "sk-...",
      "model": "gpt-5",
      "baseUrl": "https://api.example/v1"
    }
  }
}
```

The stored `profile` field is the managed Codex `model_provider` id. Current user-facing docs explain `--profile` as this alias.

## Codex Projection

Mutating commands project provider state into the target Codex directory:

```toml
model = "gpt-5"
model_provider = "packycode"

[model_providers.packycode]
name = "packycode"
base_url = "https://api.example/v1"
wire_api = "responses"
requires_openai_auth = true
```

Auth projection writes API-key mode into `auth.json`. Managed projection does not create legacy `[profiles.*]` sections for new providers.

## Output Contract

Human output is provider-management-only:

- `list` shows provider name, current marker, model-provider id, model, tags, and note.
- `status` shows target Codex directory, tool home, current route, mapping state, auth/config health, warnings, and next step.
- `doctor` shows local config/provider/auth/Codex CLI issues.

JSON output keeps the standard envelope:

```json
{
  "ok": true,
  "command": "status",
  "data": {},
  "warnings": [],
  "error": null
}
```

## Diagnostics

`status` uses route mapping and consistency checks for a lightweight operator view. `doctor` performs issue-first checks across config existence, providers existence, consistency issues, auth projection, route drift, and Codex CLI availability.

No optional bridge, SDK, upstream-account, or background-service diagnostics are part of the current design.

## Migration Policy

Because this repository is still treated as development-version software, `0.2.1` does not add automatic migration shims for old experimental provider or bridge state. Users can manually clean old state or re-add providers.
