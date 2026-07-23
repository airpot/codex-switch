# Testing

Current version: `0.2.1`

The test suite is plain Node.js. `npm test` rebuilds the CLI and runs `tests/run-tests.js`, which discovers `tests/*.spec.js` files.

## Commands

```bash
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

## Required Coverage For 0.2.1

Focus on the provider-management-only contract:

- Version metadata is `0.2.1` in `package.json` and `package-lock.json`.
- Current docs point to `docs/PRD/codex-switch-prd-v0.2.1.md` and `docs/Design/codex-switch-v0.2.1-design.md`.
- Help exposes only current commands: `init`, `migrate`, `list`, `show`, `current`, `status`, `config show`, `config list-profiles`, `add`, `edit`, `switch`, `remove`, `import`, `export`, `backups list`, `rollback`, `doctor`, and deprecated `setup`.
- Fresh provider flow: `init -> add -> switch -> status -> doctor`.
- Base URL drift diagnostics.
- Ambiguous active provider mapping.
- `migrate` remains an advanced adopt helper.
- `setup` remains a deprecated pointer.
- JSON output uses the stable envelope.

Do not add tests for removed `0.2.1` runtime experiments such as Copilot SDK integration, GitHub login, `add --copilot`, or bridge commands.
