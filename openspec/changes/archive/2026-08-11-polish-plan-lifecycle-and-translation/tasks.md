## 1. Archive Readiness

- [x] 1.1 Add shared completed-status and archive-readiness classification helpers with tests for complete, incomplete, zero-task, and completed-status changes.
- [x] 1.2 Render a localized archive-ready section and lifecycle cue without duplicating plans or breaking dependency/search grouping.

## 2. Persistent Translation View

- [x] 2.1 Persist and validate the selected language presentation in browser-local storage with English fallback.
- [x] 2.2 Add cache-only translation retrieval that reports cached, missing, rejected, and failed blocks without invoking AGY or requiring consent.
- [x] 2.3 Restore cached translations when a non-English preference opens or selects a plan, then automatically translate only the remaining eligible blocks through the persisted provider.
- [x] 2.4 Add localized cache-miss and safe AGY diagnostic messages while preserving exact English fallback.
- [x] 2.5 Add a persistent translation-provider setting with AGY as the configured default and remove the intermediate translation confirmation dialog.
- [x] 2.6 Automatically translate uncached blocks whenever a plan opens in a persisted Ukrainian or side-by-side mode, without requiring a second language click.
- [x] 2.7 Add generation-bound plan projection and revision-bound stable-route caches that render source content immediately, reuse a live child binding, run strict status and validation once in the background, and are reused by translation routes.
- [x] 2.8 Add an in-plan live AGY progress notice with missing-block count, English-availability copy, and automatic completion behavior.

## 3. AGY Runtime Hardening

- [x] 3.1 Run AGY with explicit current-user profile, deterministic model, disabled browser launcher, and bounded stdout, stderr, and timeout behavior.
- [x] 3.2 Classify authentication, quota/rate-limit, timeout, unavailable executable, invalid output, and generic failures without exposing raw diagnostics.
- [x] 3.3 Add adapter, service, API, and UI contract tests for cache reuse, partial success, explicit-request boundaries, and safe diagnostics.
- [x] 3.4 Update the README to document persistent language presentation, cache-only restoration, and AGY failure behavior.

## 4. Verification and Activation

- [x] 4.1 Run `npm test` and confirm all automated tests pass.
- [x] 4.2 Run `npm run build` and confirm the production bundles build successfully.
- [x] 4.3 Run `npm run openspec -- validate polish-plan-lifecycle-and-translation --strict --json --no-interactive` and confirm strict validation passes.
- [x] 4.4 Restart only `openspec-workbench` with refreshed environment and verify on the live `codex/valvix` worktree that plan switching renders promptly, verification completes in the background, AGY progress is visible in-plan, and cached translation remains prompt-free without browser console errors.
