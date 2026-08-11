## Why

Plans whose tasks are complete but whose OpenSpec status is still active are mixed with unfinished work, obscuring the archive queue. Ukrainian and side-by-side viewing also reset on reload, while cached translations are not restored independently from a new AGY request and AGY failures are reduced to an unhelpful generic message.

## What Changes

- Add a distinct `Готові до архівації` (uk-UA) sidebar section for non-completed changes with at least one task and all tasks checked, while preserving authoritative OpenSpec status and read-only behavior.
- Persist the selected English, Ukrainian, or side-by-side presentation mode in browser-local preferences and restore it after reload.
- Restore already accepted translations from the machine-local cache without invoking a translation CLI.
- Add a persistent translation-provider setting, default it to the configured AGY CLI, and translate uncached blocks directly with that provider whenever the persisted Ukrainian or side-by-side mode opens a plan.
- Preserve successful block-level cache entries across process and page restarts, while distinguishing cache misses from actual translation failures.
- Reuse one change projection per worktree generation and one verified stable Hub route per registration revision so plan content and translation cache checks appear immediately, while strict OpenSpec verification completes in the background instead of repeating Git and OpenSpec discovery for each route.
- Show an in-plan AGY progress notice with the number of missing blocks and keep exact English content visible until automatic translation completes.
- Return and localize safe AGY failure categories such as unavailable CLI, authentication required, quota/rate limit, timeout, and invalid structured output without exposing stderr, credentials, or raw provider diagnostics.

## Capabilities

### New Capabilities

- `plan-archive-readiness`: Read-only lifecycle cues that separate task-complete active changes from unfinished active work.
- `persistent-translation-view`: Persistent language presentation, cache-only restoration, and safe AGY execution diagnostics.

### Modified Capabilities

None.

## Impact

- Affects Workbench client grouping and localized copy, browser-local preference state, change-projection caching, background verification, translation service/API behavior, AGY process handling, styles, documentation, and automated tests.
- Snapshot and consumer OpenSpec formats remain compatible; lifecycle readiness is derived from existing status and task counts.
- Consumer repositories, plans, Git state, branches, and worktrees remain read-only and unchanged.
- Translation cache content and provider preference remain private machine-local derived state; cache reads do not transmit text, while opening a plan in a persisted non-English mode requests only its uncached eligible blocks.
- AGY subprocess diagnostics are allowlisted and bounded; raw stderr, auth material, provider payloads, and local paths are never returned to the browser.
- Release uses the normal application build and restarts only `openspec-workbench`; no consumer migration is required.
- Non-goals include archiving plans from the UI, changing OpenSpec status, persisting translated text into repositories, or managing AGY accounts from the Workbench.
