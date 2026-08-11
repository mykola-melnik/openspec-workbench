## Why

The project view has no direct route back to the Projects Hub, and background work is visible only through isolated status messages. Readers need an obvious way to switch projects and one trustworthy live view of observable Workbench activity without presenting model reasoning or unverified AI authorship.

## What Changes

- Turn the project-view brand into an accessible home link that returns stable Hub routes to the Projects Hub while preserving safe standalone behavior.
- Add a compact localized activity control and panel showing a bounded newest-first timeline for the current worktree process.
- Publish only allowlisted observable events for source or HEAD change detection, snapshot refresh, strict verification, and AGY translation lifecycle.
- Include bounded relative `openspec/` paths for confirmed source changes and the previous/new short revision for confirmed HEAD changes, without exposing an absolute project root.
- Stream new activity through the existing capability-protected SSE connection and return recent process-local entries after a page reload.
- Refresh the authoritative snapshot, sidebar, and currently selected plan in the background after a confirmed watcher change so ordinary updates do not require a full page reload.
- Replace the verbose artifact jump links with compact localized tabs for Overview, Tasks, Design, and Verification, showing one selected artifact section below the tabs while preserving direct URL fragments and browser history.
- Keep activity derived and non-authoritative: do not expose model reasoning, prompts, plan content, absolute paths, command output, stderr, credentials, capabilities, or unverified claims that a particular AI made a filesystem change.
- Keep consumer repositories, OpenSpec files, Git state, project registrations, and translation cache formats unchanged.

Non-goals:

- Capturing hidden model reasoning, terminal sessions, arbitrary process output, or every filesystem event.
- Attributing repository changes to Codex, Claude, AGY, or another actor without an authenticated event source.
- Creating an audit log, durable analytics store, hosted activity service, notification system, or project mutation workflow.

Compatibility impact is additive. Existing stable project URLs, standalone capability URLs, browser preferences, consumer OpenSpec versions, and project-local commands remain supported.

The security boundary remains loopback-only and read-only. Activity payloads use a closed schema, bounded strings and counts, no source content, and the existing Hub/child capability, Host, Origin, CSP, containment, and inert-rendering protections.

Release strategy: implement and verify in the application repository, restart only the local `openspec-workbench` process for live evidence, and retain the preceding deterministic bundle for rollback. No push, merge, tag, deployment, consumer update, or repository mutation is implied.

## Capabilities

### New Capabilities

- `workbench-home-navigation`: Accessible context-aware navigation from a project or worktree view back to the Projects Hub.
- `workbench-activity-feed`: A bounded live timeline of safe observable Workbench and worktree events.

### Modified Capabilities

None.

## Impact

- Application UI: brand markup, localized copy, responsive header control, activity panel, artifact tabs, focus behavior, file/revision evidence, and automatic live projection refresh.
- Runtime: one bounded in-memory activity journal per child, bounded relative-path evidence, allowlisted event publication, recent-entry API, and the existing SSE stream.
- Tests: event-schema, retention, API/SSE, security, localization, accessibility, responsive, and live-browser coverage.
- Consumer repositories: read-only observation only; no files, branches, worktrees, plans, standards pins, dependencies, or Git state are changed.
