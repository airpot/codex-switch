# codex-switch v0.1.3 Design

`0.1.3` is a targeted Copilot login compatibility repair release.

## Design Notes

- The SDK adapter constructs `CopilotClient` through `RuntimeConnection.forStdio({ path })`.
- The runtime path passed to the SDK resolves to the managed `@github/copilot/npm-loader.js` entrypoint.
- Human terminal commands such as `copilot --help` and `copilot login` continue to use the bundled `.bin` shim so interactive onboarding behavior remains unchanged.
- The release adds regression coverage for the constructor compatibility path and runtime loader resolution.
