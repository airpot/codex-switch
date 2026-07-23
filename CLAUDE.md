# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile src/**/*.ts → dist/ (plain tsc, no bundler)
npm test               # Build + run tests/run-tests.js
npx tsc --noEmit       # Type-check only
node dist/cli.js --help  # Run built CLI locally
npm pack --dry-run     # Preview publishable package
```

Node.js `>=18` required. Single runtime dependency: `inquirer`.

## Running a Single Test Suite

Tests use a custom harness (no Jest/Vitest). Each `tests/*.spec.js` exports `{ name, tests: [{ name, run() }] }`. To run one suite in isolation:

```bash
npm run build && node -e "require('./tests/provider-workflow.spec.js')"
```

Or use the full runner which discovers all `*.spec.js` alphabetically:

```bash
node tests/run-tests.js
```

## Architecture

```
src/cli.ts              Entry point — argv parsing, dispatch, output rendering
src/commands/           Command registry, arg parsing (parseArgs), dispatch routing
  handlers.ts           Main switch for Codex commands
  claude-handlers.ts    --claude flag dispatch (early-returns before Codex path)
  registry.ts           COMMANDS array with tokens, usage, handler refs
src/app/                Application services (one file per command action)
  run-mutation.ts       Lock + backup + rollback wrapper for all write ops
src/domain/             Pure types, validation, errors (no I/O)
  providers.ts          Codex ProviderRecord / ProvidersFile
  claude-providers.ts   Claude ClaudeProviderRecord / ClaudeProvidersFile
  config.ts             TOML parser with byte-offset patching
  errors.ts             ErrorCode union + cliError() factory
src/storage/            File I/O — read/write repos, path resolution
  codex-paths.ts        ~/.config/codex-switch paths + ~/.codex target
  claude-paths.ts       ~/.claude target paths
src/interaction/        Interactive prompts (inquirer-based)
src/runtime/            Codex CLI detection/probing
```

### Dual-Target Model

The CLI manages two independent targets via the same tool-home (`~/.config/codex-switch/`):

- **Codex** (default): `providers.json` → projected into `~/.codex/config.toml` + `auth.json`
- **Claude Code** (`--claude` flag): `claude-providers.json` → atomic replacement of `~/.claude/settings.json`

The `--claude` flag is detected in `handleRegisteredCommand()` and early-returns to `handleClaudeCommand()` before any Codex-specific logic runs (including the `codexDir` requirement check).

### Mutation Safety

All write commands go through `runMutation()` which: acquires a file lock, snapshots affected files into `backups/`, executes the mutation, and auto-restores on failure. Both Codex and Claude operations share the same lock file.

### Arg Parsing Quirk

The arg parser (`src/commands/args.ts`) treats any `--flag nextToken` as `flag=nextToken` unless `nextToken` starts with `--`. So `codexs add --claude myname` assigns `"myname"` as the value of `--claude`. The `resolveClaudeProviderName()` helper in `claude-handlers.ts` normalizes this by checking both positionals and the `--claude` flag value.

## Style

- TypeScript strict mode, 2-space indent, semicolons, double-quoted imports
- `camelCase` functions/variables, `PascalCase` types, `kebab-case` filenames
- JSDoc on exported functions; inline comments only for non-obvious invariants
- No formatter/linter configured — match surrounding code

## Testing

- Plain Node specs using `node:assert/strict`
- Fixture directory: `dev-codex/local-sandbox/`
- Test helpers in `tests/helpers.js` provide sandbox copy, tool-home creation, and in-process CLI execution
- Use `--codex-dir` with sandbox directories for mutating command tests

## Security

Never commit real API keys, `auth.json`, `settings.json` with real tokens, or private provider exports.
