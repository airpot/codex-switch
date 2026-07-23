# codex-switch v0.1.4 Design

`0.1.4` is a bridge reliability and observability repair release.

## Design Notes

- Bridge reuse probing is refactored into a structured probe helper that distinguishes transient transport failures from deterministic mismatches.
- Health and auth reuse probes use 2 attempts, a 2500 ms per-request timeout, and a 250 ms delay between attempts.
- Existing bridge workers are retried before replacement only for transient timeout and transport failures. Deterministic mismatches still replace immediately: different provider, different base URL, stale worker build, or explicit `401`/`403` auth rejection.
- Bridge worker stdout/stderr are appended to a persisted runtime log file under the managed runtime-state directory, and that log path is surfaced in bridge results and bridge-related errors.
- Parent-side lifecycle logging records probe attempts, transient failures, replacement reasons, worker start, startup timeout, startup failure, and startup success without logging secrets.
- Worker-side stderr logging records startup, shutdown, uncaught exception, and unhandled rejection.
- The shared test runner discovers `tests/*.spec.js` in sorted order, excludes helper files, and supports both suite export styles already present in the repository: `{ run }` and `{ name, tests: [...] }`.
- Interactive provider selection uses the structured config once and resolves the visible current hint in this order:
  1. unique managed mapping from top-level `model_provider`
  2. fallback to legacy top-level `profile` when top-level `model_provider` is missing or unresolved and the legacy value exactly matches one provider name
  3. ambiguous marker when multiple providers share the active `model_provider`
  4. no marker otherwise
