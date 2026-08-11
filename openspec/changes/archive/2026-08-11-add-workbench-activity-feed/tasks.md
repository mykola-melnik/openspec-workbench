## 1. Activity domain and evidence

- [x] 1.1 Add a closed typed activity event schema and bounded 100-entry in-memory journal with unit tests for validation, monotonic ids, newest-first reads, and eviction.
- [x] 1.2 Refine watcher change evidence so confirmed OpenSpec content and Git epoch changes are distinguishable without exposing paths or authorship; extend focused watcher tests.

## 2. Protected runtime lifecycle

- [x] 2.1 Instrument snapshot refresh and shared strict-verification start, completion, and safe failure boundaries without duplicating events for reused work.
- [x] 2.2 Instrument AGY translation start, completion, and safe failure with validated change ids and bounded counts only.
- [x] 2.3 Add capability-protected `GET /api/activity` and reuse `/api/events` for activity SSE; verify authorization, Host/Origin rejection, retention, reload restoration, and sanitized stable-Hub proxying with `npm test`.

## 3. Project navigation and live UI

- [x] 3.1 Turn the project brand into context-aware stable-Hub home navigation with a safe standalone fallback and localized accessible label.
- [x] 3.2 Add localized activity control, newest-first panel, process-local retention note, empty state, timestamps, unseen count, and inert closed-schema rendering.
- [x] 3.3 Add polite announcements only for important start/failure events, plus focus, reduced-motion, dark-theme, and narrow-viewport styling.
- [x] 3.4 Extend UI architecture and responsive contracts for home navigation, activity rendering, overflow prevention, and absence of hardcoded Ukrainian copy.

## 4. Documentation and verification

- [x] 4.1 Update `README.md` with the observable-event boundary, process-local retention, and explicit non-goals for reasoning and actor attribution.
- [x] 4.2 Run `npm test`, `npm run build`, `git diff --check`, and `npm run openspec -- validate add-workbench-activity-feed --strict`; retain successful evidence.
- [x] 4.3 Restart only `openspec-workbench` and verify in the controlled browser that the logo returns to the Hub, the panel survives page reload while the child lives, live AGY or verification activity appears automatically, and desktop/narrow layouts remain operable.

## 5. Specific change evidence and in-place refresh

- [x] 5.1 Extend the bounded OpenSpec content observation to retain entry fingerprints, derive added/changed/removed relative `openspec/` paths, and emit previous/new short HEAD evidence; cover dirty edits, deletion, multiple paths, truncation, and unchanged polling with focused tests.
- [x] 5.2 Extend the closed activity schema, localization, inert client validation, and activity rendering for at most twelve relative OpenSpec paths plus an additional count and bounded revision pairs; prove absolute, parent-traversal, control-character, and oversized payloads are rejected.
- [x] 5.3 Replace stale-banner-only handling with a coalesced bounded live-refresh loop that reloads the authoritative snapshot, sidebar, and selected plan in place, handles removed plans and racing generations, and retains a visible reload fallback on failure; add client-contract and E2E coverage.
- [x] 5.4 Update the observable-activity documentation, run `npm run openspec -- validate add-workbench-activity-feed --strict --no-interactive`, `npm run typecheck`, `npm test`, `npm run test:security`, `npm run test:contrast`, `npm run verify:bundle`, `npm audit`, and `git diff --check`, and record the final result without activating or restarting the managed runtime.

## 6. Artifact tab navigation

- [x] 6.1 Replace verbose artifact jump links with localized Overview, Tasks, Design, and Verification tabs that expose one visible panel, unavailable states, direct fragment selection, browser history, and standard keyboard navigation.
- [x] 6.2 Add focused UI contracts for tab semantics, labels, active-panel visibility, fragment restoration, keyboard behavior, and absence of the old "Go to" artifact copy; update responsive styling without changing plan content.
- [x] 6.3 Run strict OpenSpec validation, typecheck, the full test and security suites, contrast and deterministic bundle checks, audit dependencies, and verify a clean diff without activating or restarting the managed runtime.
