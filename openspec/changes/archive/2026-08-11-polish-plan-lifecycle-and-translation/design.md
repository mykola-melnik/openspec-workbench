## Context

See `proposal.md` for motivation and the two capability specs for observable behavior. The current client initializes language to English, keeps translations only in an in-memory map, and asks for consent before even checking the server-side cache. The server does persist accepted blocks, but the translation service collapses every adapter error into per-block failure and the AGY adapter discards bounded stderr that could support a safe category. The change list already has authoritative status and task counts suitable for a presentation-only archive-readiness cue.

## Goals / Non-Goals

**Goals:**

- Keep unfinished active work, archive-ready work, and completed work visually distinct.
- Restore a valid language preference and cached translations without network activity.
- Keep the translation provider explicit in settings and make the persisted non-English presentation mode the trigger for uncached translation whenever a plan opens.
- Make AGY execution deterministic, bounded, non-interactive, and safely diagnosable.
- Render plan source content immediately and move strict status and validation work behind a generation-bound projection cache.
- Keep automatic AGY progress visible inside the plan while exact English remains readable.
- Keep every new state derived or machine-local and maintain existing read-only consumer boundaries.

**Non-Goals:**

- Archive or mutate a change from the Workbench.
- Manage AGY authentication or install arbitrary translation CLIs from the Workbench.
- Store translations in consumer repositories or make Ukrainian authoritative.
- Expose AGY logs, stderr, OAuth material, account identifiers, or provider responses.

## Decisions

### Derive a third lifecycle section from existing snapshot fields

The client will use one shared completed-status predicate. A non-completed change with `totalTasks > 0` and `completedTasks === totalTasks` is archive-ready. It will be excluded from Active and inserted once into a localized section before Completed. Zero-task changes remain Active because no task evidence proves completion. This avoids adding a competing status to the server or OpenSpec source.

### Persist presentation mode and translation provider in browser-local storage

The client will validate versioned preference keys for the three presentation values and the available provider values. Storage reads and writes are best-effort; presentation falls back to English and provider falls back to AGY. Provider selection lives in a small settings control rather than an interruption in the reading flow.

### Split cache-only retrieval from explicitly requested translation

A read-only GET on the existing per-change translation route will return cached, rejected, and missing states without enabling or invoking the adapter. The existing guarded POST remains the only route that can call the selected provider and still requires the local client header plus the persisted non-English mode represented by the client request. After cache restoration, opening any plan in Ukrainian or side-by-side mode automatically requests only its missing eligible blocks, without a modal prompt or second language click.

The translation result will add a missing-block count and an optional allowlisted diagnostic code. Successful block writes remain atomic and content-addressed, so a partial historical cache is reusable after any reload or process restart.

### Classify bounded AGY failures without returning raw diagnostics

The adapter will capture only a small bounded stderr buffer for internal pattern classification. It will map authentication, quota/rate limit, timeout, unavailable executable, and invalid structured output to stable internal error codes; unknown failures remain generic. The browser receives only an allowlisted diagnostic code and chooses localized copy.

The subprocess receives an explicit current-user `HOME`, an absolute executable, a deterministic translation model with no conflicting effort override, bounded stdout/stderr/time, ignored stdin, plan+sandbox mode, and a disabled browser launcher environment. This is preferred over inheriting opaque long-lived PM2 environment as the sole credential-location signal. The release restart will also refresh the process environment.

### Separate immediate source projection from background verification

After the snapshot has established compatibility and the authoritative change summaries, the server will read the selected plan's contained proposal, design, and task files directly and cache that projection by change id and watcher generation. The detail route returns this readable projection immediately with verification marked pending, then starts one shared background status and strict-validation promise. Later detail, translation-cache, and translation requests reuse the same projection and promise rather than invoking OpenSpec again.

The Hub will cache the verified project/worktree route by registration id and revision, while retaining a cheap canonical-root check on every request and refreshing the full route if the revision, root, or requested worktree no longer matches. The launcher will reuse a live child already bound to the same canonical root before performing another Git identity discovery. This removes repeated Git work without weakening explicit registration or path containment.

The client keeps already opened detail projections in memory for instant return navigation and polls the cached detail route only while verification is pending. A watcher generation change clears server projection caches and preserves the existing visible stale banner instead of silently mixing generations.

### Render translation progress as plan content

Starting an automatic translation request will immediately re-render the selected heading with a live localized AGY notice. The notice includes the missing-block count, states that English remains readable, and promises automatic replacement. The existing global live region remains supplementary rather than being the only evidence that work is happening.

## Risks / Trade-offs

- [Task counts can be stale relative to a newly edited tasks file] → Existing snapshot staleness and reload behavior remains authoritative; the cue never mutates status.
- [A persisted non-English mode can launch translation during plan navigation] → Send only screened uncached blocks through the explicitly configured provider and keep exact English visible until the bounded request completes.
- [Provider wording changes and safe classification misses a known failure] → Fall back to a generic diagnostic without exposing stderr; extend allowlisted tests when evidence appears.
- [Browser storage is disabled or cleared] → Fall back to English; translation cache remains independent machine-local state.
- [A large plan exceeds one AGY request] → Preserve existing bounded request size and all prior cache hits; surface a safe request-size or generic diagnostic.
- [Background verification finishes after the reader changes plans] → Cache by plan id and generation, update only the currently selected matching plan, and retain the result for later navigation.
- [A source edit races a cached projection] → Invalidate all projections on watcher generation change and require the established page refresh for a new authoritative snapshot.

## Migration Plan

Build and test the additive client/server behavior, restart only `openspec-workbench` with refreshed environment, and verify the registered `codex/valvix` worktree. Existing cache files and registrations require no migration. Rollback restores the previous application build; the new browser preference keys and cache files are harmless if ignored.
