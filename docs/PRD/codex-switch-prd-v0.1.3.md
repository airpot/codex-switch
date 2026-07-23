# codex-switch v0.1.3 PRD

## Version

- Version line: `0.1.3`
- Current repository package version: `0.1.3`

## Summary

`0.1.3` is a narrow hotfix release for the broken `login copilot` path. The goal is to restore compatibility with the currently supported official Copilot SDK/runtime pairing without expanding the command surface or the experimental Copilot bridge scope.

## Required Outcome

- `codexs login copilot` must no longer fail during `CopilotClient` construction when the managed SDK/runtime is installed.
- The SDK integration must explicitly point at the managed Copilot runtime loader instead of relying on implicit package discovery.
- Existing direct-provider behavior and Copilot bridge behavior remain unchanged outside the constructor compatibility fix.

## Non-Goals

- No new Copilot features or new upstream families.
- No migration shims or backward-compatibility preservation for older local experimental runtime state.
- No changes to the managed SDK pin or Node version requirements.
