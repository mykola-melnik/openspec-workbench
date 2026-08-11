## Why

The Workbench presents every OpenSpec change as a flat peer, so a reader cannot see which active plans are foundations and which plans explicitly depend on them. A compact two-level tree in the existing sidebar should make sequencing visible without turning the read-only viewer into a planning editor.

## What Changes

- Derive change-to-change dependencies only from strict, explicit dependency declarations in authoritative English OpenSpec proposal Markdown, and only when the referenced identifier exactly matches a currently listed change.
- Add derived dependency metadata to the Workbench snapshot without changing or writing consumer planning files.
- Present each change once in the existing active or completed section, indenting a dependent change beneath its available parent to form a maximum two-level tree.
- Keep search results visible even when their parent is filtered out, and label cross-section or additional dependencies instead of duplicating changes.
- Keep ambiguous references, unresolved identifiers, and dependency cycles flat rather than guessing a hierarchy.
- Preserve the current routes, plan detail view, read-only boundary, and narrow-screen behavior.

## Capabilities

### New Capabilities

- `change-dependency-navigation`: Safe dependency derivation and two-level sidebar navigation for OpenSpec changes.

### Modified Capabilities

None.

## Impact

- Affects the project projection, additive snapshot types, localized sidebar presentation, styles, client bundle, and automated tests.
- Existing registered projects remain compatible; projects without explicit recognized dependencies retain the current flat presentation.
- Consumer repositories remain read-only, and no repository discovery, branch switching, worktree creation, or plan mutation is introduced.
- Dependency parsing remains inside the canonical worktree root and uses the existing contained file-reading boundary.
- The change ships with the next normal OpenSpec Workbench application build and process restart; it requires no consumer migration or coordinated release.
- Non-goals include inferring semantic dependencies from similar names or general prose, editing dependency declarations, rendering an arbitrary-depth graph, and changing OpenSpec CLI formats.
