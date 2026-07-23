# codex-switch v0.3.0 Design Document

## Overview

This document describes the design for adding Claude Code provider switching to codex-switch. The feature allows users to manage multiple Claude Code configurations and switch between them with a single command.

## Architecture

### Design Principle: Parallel Path via Flag

Rather than introducing a generic "target" abstraction, Claude support is implemented as a parallel code path activated by the `--claude` flag. This keeps:

- Existing Codex code paths completely untouched
- No schema migrations required
- No new command parsing complexity
- Clear separation of concerns

### Layer Structure

```
CLI Layer:       handlers.ts → isClaudeCommand() → claude-handlers.ts
App Layer:       claude-add-provider.ts, claude-switch-provider.ts, etc.
Domain Layer:    claude-providers.ts (types, validation, comparison)
Storage Layer:   claude-paths.ts, claude-providers-repo.ts
```

### File Layout

```
~/.config/codex-switch/
  codex-switch.json          (tool config, unchanged)
  providers.json             (Codex providers, unchanged)
  claude-providers.json      (NEW: Claude provider store)
  backups/                   (shared backup directory)
  .codex-switch.lock         (shared lock file)

~/.claude/
  settings.json              (Claude Code active config, managed by switch)
```

## Data Flow

### Add Flow

```
codexs add --claude copilot --from-file ~/.claude/settings-copilot.json
  → parseArgs() detects --claude flag
  → isClaudeCommand() returns true
  → handleClaudeCommand() dispatches to claudeAddProvider()
  → Reads and validates the source JSON file
  → runMutation() locks, backs up claude-providers.json
  → Writes the new provider record to claude-providers.json
```

### Switch Flow

```
codexs switch --claude copilot
  → parseArgs() detects --claude flag
  → isClaudeCommand() returns true
  → handleClaudeCommand() dispatches to claudeSwitchProvider()
  → Reads provider from claude-providers.json
  → runMutation() locks, backs up ~/.claude/settings.json
  → Atomically writes stored settings as new settings.json
```

## Key Types

```typescript
// Domain model for stored Claude profiles
type ClaudeProviderRecord = {
  settings: Record<string, unknown>;  // opaque settings.json blob
  note?: string;
  tags?: string[];
};

// Claude paths resolved from tool home and Claude dir
type ClaudePaths = {
  claudeDir: string;              // ~/.claude
  claudeSettingsPath: string;     // ~/.claude/settings.json
  claudeProvidersPath: string;    // ~/.config/codex-switch/claude-providers.json
};
```

## Active Detection Algorithm

Settings are compared on identity-bearing fields only:

1. `model` (top-level)
2. `env.ANTHROPIC_BASE_URL`
3. `env.ANTHROPIC_DEFAULT_HAIKU_MODEL`
4. `env.ANTHROPIC_DEFAULT_SONNET_MODEL`
5. `env.ANTHROPIC_DEFAULT_OPUS_MODEL`

If all five match, the profile is considered active. This avoids false mismatches when non-identity fields (like `autoCompactEnabled`) change.

## Mutation Safety

All write operations reuse the existing `runMutation()` framework:

- **Lock**: Shared `.codex-switch.lock` serializes all operations
- **Backup**: Files are backed up before mutation
- **Rollback**: On failure, files are restored from backup
- **Atomicity**: File writes use `writeTextFileAtomic()`

## Error Codes

New error codes for Claude operations:

- `CLAUDE_PROVIDERS_NOT_FOUND` — `claude-providers.json` does not exist
- `CLAUDE_PROVIDERS_PARSE_ERROR` — `claude-providers.json` is malformed
- `CLAUDE_PROVIDER_NOT_FOUND` — named provider not in registry
- `CLAUDE_SETTINGS_NOT_FOUND` — `~/.claude/settings.json` missing
- `CLAUDE_PROVIDER_ALREADY_EXISTS` — duplicate provider name on add

## Environment Variable Override

- `CODEXS_CLAUDE_DIR` — override the Claude Code directory (default: `~/.claude`)

This follows the same pattern as `CODEXS_CODEX_DIR` for Codex.

## Files Modified

| File | Change |
|------|--------|
| `src/commands/handlers.ts` | Early-return to Claude handler when `--claude` detected |
| `src/commands/registry.ts` | Updated usage/details/examples for affected commands |
| `src/domain/errors.ts` | Added Claude-specific error codes |
| `src/cli/output.ts` | Added Claude-specific human output rendering |

## Files Created

| File | Purpose |
|------|---------|
| `src/domain/claude-providers.ts` | Types, validation, settings comparison |
| `src/storage/claude-paths.ts` | Path resolution for Claude dir |
| `src/storage/claude-providers-repo.ts` | Read/write claude-providers.json and settings.json |
| `src/app/claude-add-provider.ts` | Add provider from file |
| `src/app/claude-switch-provider.ts` | Switch settings.json |
| `src/app/claude-list-providers.ts` | List with active detection |
| `src/app/claude-show-provider.ts` | Show provider details |
| `src/app/claude-current.ts` | Detect active provider |
| `src/app/claude-remove-provider.ts` | Remove provider |
| `src/commands/claude-handlers.ts` | Claude command dispatch |

## Testing

Integration test verifies:
1. Add from file imports correctly
2. Switch replaces settings.json atomically
3. List detects active provider
4. Current identifies managed vs unmanaged state
5. Remove deletes from registry
6. Rollback restores previous settings.json
7. Existing Codex commands unaffected
