# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the TypeScript CLI implementation. Keep command wiring in `src/cli.ts`, user-facing command helpers under `src/cli/`, application use cases in `src/app/`, domain types and errors in `src/domain/`, and filesystem/Codex integrations in `src/infra/`. Compiled output goes to `dist/` and should be treated as generated artifacts. Tests live in `tests/`, with sample Codex state under `dev-codex/`. Longer product and architecture notes belong in `docs/`.

## Build, Test, and Development Commands

Use Node.js `>=22.13`.

- `npm run build` compiles `src/**/*.ts` into `dist/` via `scripts/build.cjs`.
- `npm test` rebuilds the CLI and runs the test harness in `tests/run-tests.js`.
- `npm run prepare` runs the build step before packaging/publishing.
- `node dist/cli.js --help` runs the built CLI locally.
- `npx tsc --noEmit` is useful for a quick type-check when you want compiler feedback without rewriting `dist/`.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: 2-space indentation, semicolons, double-quoted imports, and `strict`-mode-compatible code. Use `camelCase` for functions and variables, `PascalCase` for types, and kebab-case filenames such as `switch-provider.ts` or `providers-repo.ts`. Keep modules small and layered: CLI parsing in `cli`, business actions in `app`, pure structures in `domain`, and file/process access in `infra`. There is no dedicated formatter configured, so match surrounding code exactly.

Implementation files under `src/` must include English JSDoc comments for exported functions, complex private helpers, and exported types that carry non-obvious contract meaning. Add concise intent comments only where control flow, mutation ordering, rollback safety, config precedence, or parsing assumptions are not self-evident, and avoid comments that merely restate obvious code. Pure re-export or barrel files should carry a short module-level comment instead of redundant per-symbol comments.

## Development Version Policy

Until the user explicitly declares a real release, this repository should be treated as development-version software, including versions named `0.1.0`. Do not add automatic migration, backward-compatibility shims, dual-read/dual-write paths, or other upgrade-preservation logic unless the user explicitly asks for them in the current task. Prefer the minimum clean implementation for current requirements, and treat old local state as something the user may handle manually by cleanup, copying files, or re-adding providers.

Command-surface errors do not need to be forced into `src/domain/errors.ts` or a single shared error-code union. When a command-specific interactive or integration flow needs its own error family, it may define and organize those errors separately as long as the public command contract stays explicit and consistent.

## Testing Guidelines

Tests are plain Node-based specs, not Jest/Vitest. Add coverage by extending `tests/*.spec.js` and wiring new suites through `tests/run-tests.js` when needed. Prefer focused fixture-driven tests using `dev-codex/local-sandbox/` or a new isolated fixture directory. Name tests after the feature area they cover, for example `switch-provider` behavior in `app.spec.js` or argument parsing in `cli.spec.js`.

When touching `status` or `doctor` diagnostics, keep optional Copilot runtime checks scoped to Copilot workflows only. A missing Copilot SDK must not turn a pure direct-provider workspace into a runtime-health failure.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects, often with Conventional Commit prefixes such as `feat:`. Keep commit messages concise and scoped to one change. Pull requests should describe the user-visible behavior, note any CLI command changes, mention backup/config migration impact, and include terminal output or screenshots when interactive prompts change. Link the relevant issue or design doc in `docs/` when applicable.

## Security & Configuration Tips

This project manages local Codex credentials. Never commit real API keys, `auth.json`, or private provider exports. Use `--codex-dir` with `dev-codex/` or another sandbox directory when testing mutating commands.
