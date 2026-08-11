## 1. Dependency Projection

- [x] 1.1 Add additive dependency fields to change summaries and parse only exact current change identifiers from strict proposal dependency declarations.
- [x] 1.2 Derive deterministic maximum-two-level display parents, leaving unresolved references and cycles flat and preserving multiple direct dependencies.
- [x] 1.3 Add projection tests covering explicit declarations, incidental references, missing proposals, chains, multiple parents, and cycles.

## 2. Sidebar Tree

- [x] 2.1 Render each plan once with child indentation only when its display parent is visible in the same status section.
- [x] 2.2 Add localized direct-dependency and additional-parent labels plus accessible semantic metadata.
- [x] 2.3 Add bounded desktop and narrow-screen tree connectors without horizontal overflow.
- [x] 2.4 Add UI contract tests for hierarchy wrappers, filtering behavior, status separation, labels, and responsive containment.

## 3. Verification and Release

- [x] 3.1 Run `npm test` and confirm all automated tests pass.
- [x] 3.2 Run `npm run build` and confirm the TypeScript and client bundles build successfully.
- [x] 3.3 Run `npm run openspec -- validate show-change-dependency-tree --strict --json --no-interactive` and confirm strict validation passes.
- [x] 3.4 Restart only the `openspec-workbench` process and verify the live `codex/valvix` sidebar shows confirmed dependencies as a two-level tree, preserves search reachability, and has no narrow-screen horizontal overflow.
