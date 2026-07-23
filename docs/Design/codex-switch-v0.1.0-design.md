# codex-switch v0.1.0 Design

## Purpose

`0.1.0` freezes the stable CLI shape and documents the current architecture instead of introducing a new runtime model.

## Architecture

- `src/commands/` parses and dispatches public commands.
- `src/app/` owns use cases such as add, switch, status, doctor, bridge, and rollback.
- `src/domain/` owns provider, config, setup, and error contracts.
- `src/storage/` owns filesystem persistence for tool home and target Codex state.
- `src/runtime/` owns Codex CLI and optional Copilot runtime integrations.

## State Separation

The tool home stores managed state and backups. The target Codex home receives runtime projections. This keeps provider registry edits transactional and makes rollback meaningful without claiming ownership of unrelated Codex files.

## Projection

Switching a provider projects:

- top-level `model`
- top-level `model_provider`
- `[model_providers.<id>]`
- `auth.json` with `OPENAI_API_KEY`

Direct providers project the provider API key. Copilot providers project only the local bridge bearer secret; upstream GitHub/Copilot auth remains in the official runtime.

## Error Model

Command errors use stable CLI error codes and optional `details`. Command-specific errors may remain close to the command implementation when that keeps the public contract clearer than forcing every case into a shared diagnostic taxonomy.
