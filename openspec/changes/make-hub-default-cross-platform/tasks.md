## 1. Baseline and Startup Contract

- [x] 1.1 Characterize the current Hub registration, one-root launcher, portable capability, managed-domain, and client loading behavior without changing consumer repositories; run `npm test` and record that the existing suite is green before scoped edits.
- [x] 1.2 Add failing CLI and UI-contract tests proving `npm start` selects Hub mode, the advanced standalone role requires one explicit absolute root, cwd is never auto-selected, and child registration routes remain absent; run the focused Node test files and show only the new intended assertions fail.
- [x] 1.3 Make `npm start` and `npm run hub` launch the Hub, add an advanced explicit-root script, reject missing, relative, noncanonical, and invalid roots before listening, and preserve `WorkbenchLauncher` self-module child spawning; run `npm test` to prove Hub-first launch and one-root isolation.

## 2. Portable Hub Mutation Authority

- [x] 2.1 Move portable bootstrap behind bearer-capability authentication and centralize POST/DELETE authority checks for exact Host and Origin, application header, same-origin fetch metadata, and per-process CSRF while preserving trusted-proxy behavior; run `npm run test:security` to prove missing, null, cross-origin, cross-site, wrong-capability, and wrong-CSRF requests do no work and expose no bootstrap secret.
- [x] 2.2 Enable registration bootstrap and existing server-held intent routes in authenticated portable Hub mode only, keep them absent from one-root children, and preserve strict schemas that reject browser-supplied paths; run `npm run test:e2e` and `npm run test:security` to prove add/cancel/confirm, child 404, no-path, expiry, and no-consumer-write behavior.

## 3. Cross-Platform Native Selection

- [x] 3.1 Add a platform-selected picker factory and bounded Windows PowerShell/WinForms adapter with fixed literal script, base64 path output, cancellation, interactive-session detection, single-flight ownership, timeout, output limits, and shutdown cleanup; run `npm test` with injected/fake process coverage for success, Unicode/spaces, cancel, malformed output, unavailable session, busy, timeout, and cleanup.
- [x] 3.2 Preserve the macOS Standard Additions picker and map both platform adapters to specific localized Hub states without exposing raw diagnostics; run `npm test` and the existing UI-contract tests for macOS regression and Windows error-copy coverage.

## 4. Shell-Free Project OpenSpec Runner

- [x] 4.1 Add bounded project `package.json` inspection and npm JavaScript CLI resolution using validated `npm_execpath` plus approved platform candidates, with typed missing-script and runner-unavailable failures and no shell fallback; run `npm test` for missing, malformed, oversized, non-file, relative, Windows-layout, Unix-layout, and environment-candidate cases.
- [x] 4.2 Execute the project-local `openspec` script as `process.execPath <npm-cli.js> run --silent openspec -- <literal args>` with existing environment, timeout, and output limits; document that npm retains normal platform script semantics, and run `npm test` to prove spaces and shell metacharacters remain literal at the Workbench boundary, supported JSON still adapts, and failure/timeout/output-limit codes stay distinct.

## 5. Visible Terminal Failure States

- [x] 5.1 Add a bounded initial API timeout and update the top-level project client failure path to replace the project-title loading placeholder, clear busy state, and render typed safe diagnostics; run UI-contract and end-to-end tests for snapshot HTTP failure, transport failure, timeout, valid empty state, and retryable child-open failure.
- [x] 5.2 Update Ukrainian catalogue mappings for runner resolution, missing script, command failure, timeout, and native picker availability without hardcoding copy in routes or components; run `npm test` to prove each safe code reaches its intended visible state.

## 6. Documentation, Bundles, and Verification

- [x] 6.1 Update README and release-facing command documentation for Hub-first `npm start`, the advanced explicit-root command, portable registration, Windows/macOS GUI requirements, CLI recovery, migration, and unchanged read-only boundaries; run `npm run check:public` and update `PUBLICATION_MANIFEST.txt` only if tracked inventory changes.
- [x] 6.2 Rebuild committed `dist/` outputs and run `npm run openspec -- validate make-hub-default-cross-platform --strict --no-interactive`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:security`, `npm run test:public`, `npm run check:public`, `npm run verify:bundle`, and `npm audit --audit-level=high`; record exact passing evidence without publishing or modifying a consumer project.
- [ ] 6.3 Perform a real interactive Windows smoke test from a clean install: `npm start` opens an empty Hub with `Add project`, native selection registers a fixture, Workbench invokes npm's JavaScript CLI without directly launching `npm.cmd` or interpolating arguments, pinned OpenSpec reads succeed, cancellation is harmless, and the one-root child identity matches; do not claim Windows release support until this external evidence is recorded.
