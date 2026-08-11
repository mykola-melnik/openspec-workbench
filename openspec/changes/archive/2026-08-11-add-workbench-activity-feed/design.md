## Context

See `proposal.md` and the two capability specs. The project page already runs behind one isolated child per canonical worktree, keeps one protected SSE stream open, observes bounded OpenSpec and HEAD changes, performs strict verification in the background, and invokes AGY through a guarded server route. Those are the only trustworthy sources for a live timeline. The Workbench cannot observe model reasoning or identify which external actor edited a consumer repository.

## Goals / Non-Goals

**Goals:**

- Reuse the existing stable Hub and child security boundaries.
- Represent only events that the Workbench can directly prove occurred.
- Keep recent entries available across browser reloads while the child is alive.
- Keep payloads small, inert, localized at render time, and independent of plan content.
- Add an accessible compact header control without slowing plan projection.

**Non-Goals:**

- Durable auditing, cross-worktree aggregation, external agent instrumentation, terminal capture, or authorship inference.
- Persisting activity in a consumer repository or translation cache.
- Replacing detailed in-plan AGY progress or strict-verification state.

## Decisions

### Use one bounded in-memory journal per child

Each isolated worktree process will own a monotonically increasing activity id and an array capped at 100 entries. A new child starts a new journal. This naturally inherits the one-root authority, survives page reloads, disappears on idle eviction or restart, and avoids a new persistent data lifecycle.

Persisting JSONL in machine-local state was rejected for this slice because the user asked for live awareness rather than an audit trail. Durable storage would require retention policy, process identity migration, corruption recovery, and stronger privacy controls.

### Publish a closed data-only event schema

The server will emit only:

- `source-change-detected`
- `head-change-detected`
- `snapshot-refresh-started`, `snapshot-refresh-completed`, `snapshot-refresh-failed`
- `verification-started`, `verification-completed`, `verification-failed`
- `translation-started`, `translation-completed`, `translation-failed`

Each entry contains `id`, ISO timestamp, kind, and only allowlisted optional data: validated change id, non-negative bounded block counts, validation state, safe diagnostic category, up to twelve normalized relative `openspec/` paths with an additional-path count, or previous/new short Git revisions. It contains no display sentence. The client maps the closed kind to Ukrainian catalog copy and renders optional values with `textContent`.

Generic log strings remain rejected because they make privacy review and localization unreliable. Following reader feedback, bounded relative paths inside the already exposed `openspec/` planning tree are accepted as useful operational evidence. Absolute roots, paths outside `openspec/`, file content, arbitrary filesystem events, and author inference remain forbidden.

### Classify watcher evidence before journaling

The watcher already compares both Git epoch and a bounded OpenSpec content identity. It will publish a typed reason based on which confirmed value changed: HEAD, OpenSpec content, unavailable evidence, or watcher fallback. Only confirmed HEAD and OpenSpec changes enter the user timeline; low-level watcher errors remain safe runtime state rather than activity prose.

Filesystem notification alone remains a hint and never creates a source-change entry until the bounded identity differs. The content observation retains bounded entry fingerprints so it can compare the last acknowledged projection with the new observation and report added, modified, or removed relative paths. HEAD evidence carries only the old and new short revision. No actor is attached to either event.

### Reuse the protected read API and SSE stream

`GET /api/activity` will return the journal snapshot after normal capability checks. The existing `/api/events` connection will send `activity` events for later additions. This avoids another socket, polling loop, listener capability, or stable Hub proxy rule. A page loads the recent snapshot once, then merges strictly newer ids from SSE.

The existing `ready` and `stale` events remain unchanged. The Hub continues to sanitize and proxy the child event stream; activity never contains child origin or capability data.

### Instrument lifecycle boundaries on the server

Snapshot refresh, verification, and translation events will be appended at the server functions that actually start and settle that work. Shared generation-bound verification and translation requests produce one start and one terminal event even when several browser actions reuse the same promise. Safe failure entries carry only the existing allowlisted diagnostic category.

Client-only logging was rejected because reload would lose state and concurrent requests could produce duplicate or optimistic entries that do not prove server execution.

### Reconcile the visible projection after watcher events

The existing `stale` SSE event remains a change hint rather than plan data. The client marks the current view stale, coalesces concurrent hints behind one refresh loop, fetches `/api/snapshot`, clears generation-bound detail and translation projections, and reloads the selected change when it still exists. If a newer generation races the request, the returned snapshot remains stale and the loop retries within a small bound. A terminal failure preserves the current safe projection and visible reload fallback.

Reloading the whole document was rejected because it loses reading position, collapsible UI state, and pending operational context. Sending plan content through SSE was rejected because it duplicates the protected projection API and expands the event privacy boundary.

### Use a native header details panel

The project brand becomes an anchor. On a stable route its home is `/`; on a standalone route it uses the current authorized worktree URL and does not claim Hub availability.

A compact `details` activity control will sit with the existing branch and provenance controls. Its panel shows newest-first time, localized event copy, an explicit process-local-history note, and an empty state. Native disclosure supplies keyboard and focus behavior with little client state. CSS constrains it below the top bar on desktop and within the viewport on narrow screens. Routine entries update a visual count only; a separate polite live region receives concise start/failure messages.

### Present plan artifacts as one URL-addressable tab set

The existing artifact jump links become a four-item tab list: Overview, Tasks, Design, and Verification. Available tabs use the WAI-ARIA tab pattern with one selected tab, roving `tabindex`, arrow/Home/End keyboard handling, and one visible `tabpanel`. Unavailable optional artifacts remain visible as disabled labels so the reader can distinguish missing content from hidden navigation.

The existing `#artifact-proposal`, `#artifact-tasks`, `#artifact-design`, and `#artifact-verification` fragments remain the stable selection state. Activating a tab updates browser history without a document reload or forced scroll; direct fragments, Back, and Forward restore the corresponding panel. A plan refresh reads the same fragment, so the selected artifact survives an in-place projection update when still available and otherwise falls back to the first available tab.

Keeping the long "Go to" link labels and rendering every artifact in one vertical document was rejected because it makes navigation look like a table of contents and forces readers to scan unrelated sections. Separate routes were rejected because the artifacts are one plan projection and must share language, translation, verification, and live-refresh state.

## Risks / Trade-offs

- [A reader interprets the feed as a complete AI audit] → Label it as observable process-local activity and state explicitly that authorship and reasoning are not available.
- [Repeated snapshot requests create noisy entries] → Deduplicate identical active lifecycle work and cap the journal at 100 entries.
- [SSE reconnect duplicates an entry] → Merge by monotonically increasing process-local id.
- [A source and HEAD change occur together] → Emit both only when both confirmed values changed; order them under the same observation timestamp without claiming causality.
- [An activity panel increases top-bar density] → Use a compact disclosure and verified narrow-viewport containment.
- [Child restart silently loses history] → Show the process-local retention note and never describe the feed as durable.
- [A safe diagnostic enum grows] → Keep browser copy allowlisted and fall back to a generic localized failure state.
- [Many OpenSpec files change together] → Show only the first twelve sorted relative paths plus a bounded additional count.
- [A change arrives during automatic refresh] → Coalesce watcher hints and retry only while the authoritative snapshot reports stale, with a bounded attempt count.
- [A URL fragment targets an unavailable artifact] → Select the first available tab without discarding the plan or exposing an empty interactive panel.

## Migration Plan

Implement the journal, lifecycle hooks, protected API/SSE transport, localized panel, logo navigation, and tests. Run the full repository verification and strict OpenSpec validation, restart only `openspec-workbench`, and verify stable and standalone behavior in the controlled browser. Rollback restores the preceding deterministic application bundle; no registry, cache, or consumer migration is required.
