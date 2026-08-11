## Why

The Projects Hub currently exposes registrations created only through a terminal command, so a moved project remains unavailable until the user manually edits the machine-local catalogue through CLI operations. A local visual catalogue should let the user explicitly choose, inspect, name, register, and rebind OpenSpec worktrees without using Terminal while preserving the application's no-scan and read-only repository boundaries.

## What Changes

- Add a macOS-native folder-selection flow initiated from the trusted local Hub for adding a project or locating a replacement folder for an unavailable registration.
- Validate the selected canonical folder as an exact readable Git worktree containing a contained `openspec/config.yaml`, then show a non-mutating preview with its canonical path, detected name, current branch, and OpenSpec availability.
- Let the user edit the display label and explicitly confirm before the machine-local registry changes.
- Let the user explicitly remove an obsolete registration from the Hub after a confirmation that the project folder, Git repository, worktrees, and OpenSpec files will remain untouched.
- Revalidate the server-held candidate immediately before registration and never accept a filesystem path from browser input.
- Give registrations stable opaque identifiers independent of their paths so a confirmed rebind preserves stable project bookmarks; migrate existing machine-local entries without changing consumer repositories.
- Keep linked worktrees derived from current Git evidence: readable OpenSpec worktrees can open, removed or non-OpenSpec worktrees are unavailable, branches without worktrees remain visible but cannot be opened, and vanished Git records receive no invented history.
- Restrict registration mutations to the trusted local Hub with exact authority checks, ephemeral confirmation state, bounded request bodies, single-flight native selection, and visible cancellation, timeout, permission, validation, and conflict states.
- Make this change depend on the stable navigation and lifecycle boundaries established by `harden-stable-project-navigation` so rebind invalidates obsolete child state without exposing child capabilities.

Non-goals:

- Scanning the filesystem for repositories, accepting typed browser paths, uploading repositories, or discovering unregistered projects automatically.
- Checking out branches, creating or deleting Git worktrees, pruning Git metadata, editing plans, or changing consumer Git state.
- Running project-local package scripts before the user confirms trust in the selected worktree.
- Providing a remote, LAN, multi-user, or cross-platform administrative surface in this change.
- Deleting project folders, Git repositories, worktrees, branches, or OpenSpec content from the Hub.

## Capabilities

### New Capabilities

- `project-registration-management`: Trusted local Hub workflows for native folder selection, candidate inspection, explicit registration or rebind confirmation, stable registry identity, and honest linked-worktree availability.

### Modified Capabilities

None.

## Impact

- Application: Hub HTML/client interactions, trusted mutation routes, a short-lived registration-intent service, candidate validation, registry persistence/migration, launcher invalidation, localization, and accessible responsive states.
- Platform: a bundled macOS folder-picker adapter launched only in an active user GUI session; unsupported or unavailable GUI environments fail visibly without falling back to filesystem scanning or typed paths.
- API and security: new trusted-local administrative endpoints reuse exact Host/Origin/fetch-metadata checks and add ephemeral anti-CSRF state, strict JSON schemas, request limits, intent expiry, and confirmation-time revalidation.
- Compatibility: candidate preview performs structural checks without executing repository code; full declared OpenSpec/standards compatibility remains fail-closed at the confirmed/open boundary owned by the compatible runtime.
- Consumer projects: no files, Git refs, worktrees, standards pins, or OpenSpec artifacts are modified.
- Release: implementation is verified and published through the deterministic local release workflow after `harden-stable-project-navigation`; activation of the managed Mac runtime remains a separate explicitly authorized action.
