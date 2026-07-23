# codex-switch v0.3.0 PRD

## Summary

`0.3.0` extends `@airpot/codex-switch` with Claude Code provider switching support via the `--claude` flag. The tool remains a local-first CLI managing provider/model-provider routing state, now supporting both Codex and Claude Code as switch targets.

## Version

- Version line: `0.3.0`
- Target package version: `0.3.0`
- Status: current repository development line

## Goals

- Add Claude Code configuration switching without architectural disruption.
- Use `--claude` flag on existing commands (`add`, `switch`, `list`, `show`, `current`, `remove`).
- Store Claude provider profiles in a separate `claude-providers.json` within the same tool home directory.
- Switch Claude Code by atomically replacing `~/.claude/settings.json`.
- Reuse backup/rollback/lock infrastructure for Claude operations.
- Keep existing Codex provider workflow completely unchanged.

## Non-Goals

`0.3.0` does not implement:

- Generic "target" abstraction or pluggable provider type system.
- Automatic detection of which tool (Codex vs Claude) the user wants to switch.
- Claude Code API key management (Claude configs use full settings.json blobs).
- Claude Code plugin marketplace management.
- Remote sync or cloud backup of Claude profiles.
- Migration from Codex providers to Claude providers or vice versa.

## Current Command Surface

All commands from v0.2.1 remain, plus `--claude` flag support on:

- `add --claude <name> --from-file <path>`
- `switch --claude <name>`
- `list --claude`
- `show --claude <name>`
- `current --claude`
- `remove --claude <name>`

Commands unchanged from v0.2.1:
- `init`, `migrate`, `edit`, `import`, `export`, `config show`, `config list-profiles`, `status`, `backups list`, `rollback`, `doctor`, `setup` (deprecated)

## Claude Provider Data Model

```typescript
type ClaudeProviderRecord = {
  settings: Record<string, unknown>;  // full settings.json content
  note?: string;
  tags?: string[];
};

type ClaudeProvidersFile = {
  providers: Record<string, ClaudeProviderRecord>;
};
```

Storage location: `~/.config/codex-switch/claude-providers.json`

## Primary Claude Workflow

```bash
codexs add --claude default --from-file ~/.claude/settings.json
codexs add --claude copilot --from-file ~/.claude/settings-copilot.json
codexs switch --claude copilot
codexs current --claude
codexs list --claude
```

## Switch Mechanism

When `codexs switch --claude <name>` executes:
1. Read the named provider from `claude-providers.json`
2. Back up current `~/.claude/settings.json` via mutation framework
3. Write the stored settings as the new `~/.claude/settings.json`

## Active Detection

`current --claude` and `list --claude` detect which profile matches the active `~/.claude/settings.json` by comparing identity fields: `model`, `env.ANTHROPIC_BASE_URL`, `env.ANTHROPIC_DEFAULT_HAIKU_MODEL`, `env.ANTHROPIC_DEFAULT_SONNET_MODEL`, `env.ANTHROPIC_DEFAULT_OPUS_MODEL`.

## Acceptance Criteria

- Package metadata reports `0.3.0`.
- `codexs add --claude <name> --from-file <path>` imports a settings.json into `claude-providers.json`.
- `codexs switch --claude <name>` replaces `~/.claude/settings.json` with the stored profile.
- `codexs list --claude` shows all Claude profiles with active detection.
- `codexs current --claude` reports the active Claude profile or "unmanaged".
- `codexs show --claude <name>` displays a Claude profile's details.
- `codexs remove --claude <name>` removes a Claude profile with backup.
- All Claude operations use the existing lock and backup/rollback framework.
- Existing Codex commands (without `--claude`) are completely unaffected.
- `npm run build` passes without errors.
- Help text for affected commands mentions `--claude`.
