## Why

The Hub has a stable local address, but opening a project or another worktree
still moves the browser to a short-lived loopback port and exposes that child
process capability to browser state. The current launcher also retains every
opened child for the Hub lifetime, while stale projections and replaced
registered paths can remain misleading or unsafe; the stable experience needs
to cover project content and recover cleanly across idle shutdowns and machine
restarts.

## What Changes

- **BREAKING**: Replace browser navigation to ephemeral child URLs with
  same-origin project routes under `https://plans.internal/projects/<project-id>/`.
- Keep each project or worktree in a separate one-root loopback child process,
  but retain its capability only in Hub memory and proxy browser HTTP and SSE
  traffic through the trusted Hub origin.
- Make stable project URLs bookmarkable and lazily restart the required child
  after idle eviction, Hub restart, login restoration, or machine reboot.
- Revalidate the registered canonical root, repository identity, and selected
  worktree immediately before launch so path replacement cannot redirect an
  existing registration to another repository.
- Stop inactive children after a bounded idle period while an active SSE
  connection keeps the selected projection alive.
- Restore a projection from `stale` to fresh after a successful authoritative
  reread, and reduce unnecessary background Git polling.
- Harden registry lock recovery, Git failure classification, runtime
  compatibility enforcement, local health checks, deterministic runtime
  ownership, rollback evidence, and dark-theme contrast.
- Turn displayed artifact labels into real read-only navigation targets while
  preserving inert rendering and repository containment.

The change remains read-only. It does not discover repositories, edit plans,
switch branches, create worktrees, persist child capabilities, expose the
service beyond loopback, or add a hosted account or shared planning database.

## Capabilities

### New Capabilities

- `stable-project-navigation`: Same-origin, bookmarkable, lifecycle-bounded
  access to explicitly registered project and worktree projections through the
  stable local Hub.

### Modified Capabilities

None. The new capability supersedes only the ephemeral browser-navigation
behavior described by the unarchived `add-stable-local-domain` change; its
stable Hub, local TLS, explicit registration, and machine-lifecycle
requirements remain in force.

## Impact

- Application: Hub routing and proxying, launcher lifecycle, registry
  validation, content client base paths, SSE handling, watcher freshness,
  compatibility checks, error mapping, styles, tests, and documentation.
- Browser contract: project and worktree content stays on the stable HTTPS
  origin; old ephemeral child URLs are intentionally not durable or supported.
- Security boundary: Caddy still exposes only the Hub; child listeners remain
  loopback-only and capability-protected, capabilities stay server-side, and
  the Hub preserves exact Host/Origin, CSRF, CSP, no-CORS, filesystem
  containment, and identity-handshake checks.
- Consumer repositories: no files, standards pins, dependencies, branches,
  worktrees, or Git state are changed. Registered roots are revalidated but
  remain explicit machine-local state.
- Compatibility: the application declares and enforces the supported
  project-local OpenSpec CLI protocol and JSON shapes at runtime. Optional
  standards provenance never gates an otherwise compatible project, while an
  unsupported CLI version or unknown response shape fails visibly without
  guessing or automatic consumer upgrades.
- Machine integration: `plans.internal` and port `4057` remain unchanged. The
  local health check is corrected, PM2 runtime ownership is made independent
  from a mutable feature checkout, and rollback material is stored durably
  instead of only under temporary storage.
- Release: implement and verify on the application feature branch, obtain
  explicit UX approval before visible interaction or copy changes, then release
  as a new immutable application version. No push, merge, tag, consumer update,
  or machine activation is implied by this proposal.
