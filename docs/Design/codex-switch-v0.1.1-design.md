# codex-switch v0.1.1 Design

## Purpose

`0.1.1` is a documentation alignment release. The design work is to make the active docs tree match the stable implementation and remove obsolete development-version transition docs from the current fact surface.

## Documentation Structure

- `README.md`, `README.CN.md`, and `README.AI.md` describe the user-facing product.
- `docs/cli-usage.md` is the command reference.
- `docs/codex-switch-product-overview.md` is the product-level summary.
- `docs/codex-switch-technical-architecture.md` is the implementation map.
- `docs/PRD/` contains active version fact sources for `0.1.0`, `0.1.1`, and planned `0.1.2`.
- `docs/Design/` contains matching design fact sources.
- `docs/Reference/` keeps Codex configuration references.
- `docs/Tests/testing.md` keeps the current verification contract.

## Rules

- Public links should not point to removed `0.0.x` development documents.
- The active documentation set should describe current behavior, not historical migration intent.
- Copilot documentation should explicitly mark the bridge as local, bearer-protected, and backed by official GitHub Copilot runtime state.
