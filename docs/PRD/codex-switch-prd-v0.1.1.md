# codex-switch v0.1.1 PRD

## Status

- Version line: `0.1.1`
- Role: documentation and fact-source completion release
- Current package version: `0.1.1`

## Goal

`0.1.1` closes documentation gaps after the first stable line. It does not change the primary command surface. Its purpose is to make README, CLI usage, product overview, technical architecture, PRD, design, and changelog agree on the same current facts.

## Requirements

- Keep `0.1.0` as the stable product contract summary.
- Add explicit `0.1.1` PRD and design fact sources so links from overview and architecture resolve.
- Remove obsolete `0.0.x` transition docs from the active docs tree.
- Keep Copilot described as a managed local bridge backed by the official GitHub Copilot runtime.
- Clarify that direct providers remain the stable, generic path and that Copilot has additional runtime prerequisites.
- Keep the development-version policy: no automatic migration or backward-compatibility shims unless a later task explicitly asks for them.

## Acceptance

- Public docs link only to current `0.1.0`, `0.1.1`, or planned `0.1.2` fact sources.
- No public page points to removed `0.0.x` transition documents.
- `npm test` and `npx tsc --noEmit` continue to pass.
