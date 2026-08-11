## 1. Approvals and central workflow

- [x] 1.1 Verify the standards repository OpenSpec bootstrap with `npm run openspec:doctor`, `npm run openspec:validate`, and `npm test`; retain healthy doctor, strict artifact validation, and the complete central fixture count.
- [x] 1.2 Present desktop and narrow-screen wireframes for the project/worktree header, change navigation, plan summary, task progress, language modes, stale snapshot, loading, empty, compatibility, and failure states; record project owner's explicit UX approval before UI implementation.
- [x] 1.3 Present the AGY CLI translation adapter, explicit Gemini/Google transmission disclosure, private local cache, account-limit boundary, and English fallback behavior; record project owner's explicit approval before implementation.

## 2. Reproducible tool foundation

Sections 2-9 record the verified prototype completed before standalone
ownership replaced standards-bundled distribution. Section 10 is the current
migration and release boundary.

- [x] 2.1 Create the typed server, client, test, fixture, and deterministic build boundaries; add canonical repository build, test, E2E, and bundle-verification scripts.
- [x] 2.2 Implement canonical root and Git worktree discovery with fixed-cwd argument-array Git commands, worktree identity, HEAD/ref, dirty state, and transitional-state detection.
- [x] 2.3 Implement snapshot epochs and watchers for `openspec/**` plus the worktree-specific HEAD with a revision polling fallback.
- [x] 2.4 Add unit fixtures proving invalid roots, detached state, dirty state, HEAD changes, missed watcher events, and one-process/one-root isolation.
- [x] 2.5 Confirm raw filesystem notifications against a bounded OpenSpec content identity so unchanged reads or metadata events do not show a false stale banner; retain real HEAD and repeated dirty-file invalidation coverage.

## 3. OpenSpec projection

- [x] 3.1 Invoke the consumer's repository-pinned OpenSpec commands for list, status, doctor, and strict validation JSON without a copied semantic status parser.
- [x] 3.2 Add explicit adapters and fixtures for every supported OpenSpec JSON shape and a visible fail-closed state for unknown output.
- [x] 3.3 Build a read-only artifact projection for proposal summaries, goals, non-goals, decisions, risks, tasks, verification availability, and exact English source provenance.
- [x] 3.4 Add parsing and progress tests for empty repositories, active/completed changes, skipped specs, missing artifacts, malformed task lists, and dirty working-tree content.

## 4. Local security boundary

- [x] 4.1 Implement loopback-only ephemeral-port startup and a per-process capability URL with deny-by-default Host, Origin, method, and route validation.
- [x] 4.2 Enforce realpath-based containment after symlink resolution and return safe diagnostics without raw filesystem paths or content.
- [x] 4.3 Render Markdown through a deny-by-default sanitizer with no active HTML, unsafe URL schemes, event handlers, or external page resources; add a restrictive Content Security Policy.
- [x] 4.4 Add executable negative fixtures for traversal, symlink escape, invalid capability, hostile Host/Origin, malicious Markdown, remote media, oversized input, and unavailable CLI failures.

## 5. Approved read-only interface

- [x] 5.1 Implement the approved responsive shell with persistent project, worktree, branch/ref, revision, dirty-state, and compatibility provenance.
- [x] 5.2 Implement approved change grouping, search/filter behavior, progress presentation, artifact navigation, and complete human-readable names without truncation-only or hover-only context.
- [x] 5.3 Implement approved loading, empty, stale-HEAD, detached, transitional Git, validation, compatibility, and safe unexpected-failure states.
- [x] 5.4 Add accessible keyboard navigation, focus behavior, landmarks, contrast, reduced-motion behavior, and desktop/narrow visual regression fixtures.
- [x] 5.5 Implement the approved self-contained OpenSpec circle-and-check SVG favicon for both the Hub and project shells; cover both links in the UI contract and verify the live browser tab.
- [x] 5.6 Implement the approved shared forest-green, mint, and neutral visual system for the Hub and project shells without changing information architecture, copy, interaction, or responsive order; verify light/dark contrast, 320-pixel behavior, UI contracts, and real reference consumer rendering.

## 6. Approved Ukrainian derived view

- [x] 6.1 Implement semantic block segmentation and masking for code, paths, identifiers, permission keys, locale markers, normative keywords, and structured syntax.
- [x] 6.2 Implement the installed AGY CLI adapter behind a disclosed persisted non-English reading preference, server-derived screened blocks, plan+sandbox mode, schema-constrained output, protected-token validation, private cache, no Claude fallback, and English fallback.
- [x] 6.3 Implement content-addressed machine-local caching keyed by source, locale, glossary, prompt contract, parser, and adapter identity without writing under the consumer or `.standards` checkout.
- [x] 6.4 Implement Ukrainian, exact English, and side-by-side reading modes for essential blocks, plus on-demand translation for other supported prose and visible stale/rejected states.
- [x] 6.5 Add round-trip token-preservation, cache reuse/invalidation, zero-egress default, selected-scope egress, adapter failure, and token-usage tests.

## 7. Distribution and consumer proof

- [x] 7.1 Produce a deterministic self-contained runtime and add `npm run verify:bundle` to rebuild and compare release output.
- [x] 7.2 Add a disposable consumer fixture that launches the built runtime from a pinned standards checkout without installing dependencies or creating state inside that checkout.
- [x] 7.3 Add an optional consumer launch template and document one-server-per-worktree operation, local state, compatibility, stop, rollback, and no-provider behavior.
- [x] 7.4 Adopt the candidate runtime in one reference consumer worktree without product-route integration and verify that tracked, untracked, Git-ref, and `.standards` state remain unchanged after every MVP interaction.

## 8. Completion and release gate

- [x] 8.1 Run `npm run openspec:doctor`, `npm run openspec:validate`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, and `npm run verify:bundle`; record exact counts and outputs in `verification.md`.
- [x] 8.2 Run the approved desktop and narrow-screen visual review against real reference consumer planning data and record project owner's acceptance without storing translated private plans in Git.
- [x] 8.3 Review the complete diff for generated artifacts, dependency integrity, release contents, English-only durable prose, absence of consumer product changes, and `git diff --check`.
- [x] 8.4 Prepare release notes and a proposed immutable patch tag, but do not tag, push, or upgrade any consumer until explicitly authorized.

## 9. Read-only project and branch navigation

- [x] 9.1 Reconcile proposal, specification, design, tasks, release notes, and verification with the approved default-current-project, explicit Projects Hub, and current-plus-five-recent-local-branches behavior; verify strict OpenSpec validation.
- [x] 9.2 Implement a versioned private machine-local project registry with explicit CLI registration/list/removal, canonical-root validation, no repository scanning, and no plan content or capabilities at rest; add disposable filesystem and permission tests.
- [x] 9.3 Implement an optional capability-protected Hub that lists only registered projects, launches the immutable runtime with fixed argument arrays, validates child identity, and never reads or proxies OpenSpec content; add invalid-root, stale-entry, capability, Host, Origin, and one-root isolation tests.
- [x] 9.4 Implement fixed-cwd local-branch and existing-worktree discovery with current-plus-five-recent ordering, complete local search, same-repository validation, and no Git mutation; test detached, missing-worktree, linked-worktree, remote-only, dirty, and stale states.
- [x] 9.5 Implement the approved compact branch selector and optional Projects Hub UI with full labels, disabled explanations, keyboard/focus behavior, narrow layout, and persistent provenance; add UI-contract and desktop/narrow visual fixtures.
- [x] 9.6 Extend the deterministic bundle, consumer documentation, and launch commands for ordinary one-project, Hub, register, list, and remove modes without installing dependencies in `.standards`.
- [x] 9.7 Run the complete release gate plus disposable multi-project/multi-worktree E2E and a real reference consumer no-mutation proof; record exact evidence and obtain project owner's visual acceptance before release.

## 10. Dedicated repository migration

- [x] 10.1 Bootstrap `solo/openspec-workbench` as the standalone application owner with repository instructions, pinned Node metadata, OpenSpec 1.7 workflow, and English durable documentation.
- [x] 10.2 Move the Workbench source, tests, deterministic build scripts, generated runtime, and relevant planning/verification artifacts out of the unreleased standards feature branch without changing consumer repositories.
- [x] 10.3 Replace standards-coupled package paths and launch commands with standalone repository commands while preserving explicit project registration, one-root child isolation, and machine-local state paths.
- [x] 10.4 Add an explicit compatibility manifest and fixtures covering supported OpenSpec/standards pairs, including fail-closed behavior for unknown formats and differing project pins.
- [x] 10.5 Update the central standards contract to reference the standalone application, retain conformance expectations, and remove duplicated application source, build scripts, and candidate application release contents.
- [x] 10.6 Run standalone typecheck, unit, bundle, audit, and E2E gates plus the real reference consumer no-mutation proof; record exact evidence in the application repository.
- [x] 10.7 Run central doctor, strict validation, complete standards tests, dependency integrity, `git diff --check`, and verify no consumer pin, product file, Git ref, tag, or deployment changed.
