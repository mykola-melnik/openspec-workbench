## Context

See `proposal.md` for motivation. The current trusted-proxy mode gives only the
Hub a stable origin. The Hub launches one capability-protected loopback child
per worktree and returns that child's ephemeral URL to the browser. Each child
then owns its own branch launcher and polls Git every 2.5 seconds for its entire
lifetime. The browser client assumes root-relative assets and APIs.

The existing security properties remain mandatory: explicit project
registration, exact Host and Origin checks, loopback-only sockets, no CORS,
restrictive CSP, inert plan rendering, canonical path containment, child
identity handshake, and no repository writes. Consumer OpenSpec files remain
the sole planning authority; application state is derived and machine-local.

## Goals / Non-Goals

**Goals:**

- Extend the stable origin through project and worktree reading without making
  the Hub a multi-root file reader.
- Keep child capabilities out of the browser and recover stable URLs across
  process lifecycle events.
- Bound idle process and Git polling cost while avoiding restart churn for an
  actively viewed project.
- Revalidate filesystem authority at every launch boundary and fail closed on
  ambiguous compatibility or diagnostics.
- Separate one mutable source checkout from the immutable bundle PM2 runs.

**Non-Goals:**

- A hosted or multi-user service, LAN exposure, authentication accounts, or a
  browser-accessible administrative API.
- Repository discovery, plan editing, comments, branch switching, worktree
  creation, Git mutation, or durable storage of projection content.
- Replacing the existing explicit registry or changing consumer OpenSpec and
  standards pins.
- Treating protection from another process running as the same macOS user as a
  solved boundary.

## Decisions

### Approved user-visible navigation contract

project owner approved the presented interaction in this conversation on 2026-08-03
and then explicitly directed implementation to continue from start to finish.
Project cards navigate in the same tab to `/projects/<project-id>/`; openable
worktrees navigate to `/projects/<project-id>/worktrees/<worktree-id>/`, while
unavailable branches remain visible and inert. Available Proposal, Design, and
Tasks labels are anchors to their rendered sections, missing artifacts remain
inert, focus moves to the destination heading, and ordinary browser Back
behavior is preserved. Existing desktop cards and rows remain the visual base;
at narrow widths actions wrap without truncating labels. Ukrainian copy remains
catalog-backed and uses the approved states `Відкрити плани`, `Відкриваю…`,
`Немає worktree`, `Недоступно`, and `Перейти до Proposal/Design/Tasks`.

### Route project and worktree content through stable path prefixes

The public routes are:

- `/projects/<project-id>/` for the registered primary worktree;
- `/projects/<project-id>/worktrees/<worktree-id>/` for an existing linked
  worktree.

Path prefixes were selected over per-project subdomains because they require
one TLS host, one Caddy route, no wildcard certificate, and no dynamic router
configuration. Query-only routing was rejected because it produces weak
bookmark semantics and complicates relative assets and navigation history.

The Hub resolves every route from the explicit registry. A worktree id is
rediscovered from the registered repository's current `git worktree` evidence;
the browser never supplies a filesystem path. Project selection and branch
selection return stable paths, not child URLs.

### Keep one-root children and proxy them with server-held capabilities

The launcher remains the only owner of child processes. A live entry contains
the verified child origin, capability, root identity, process handle, last
activity, and active stream count. Nothing in that entry is persisted or
returned to the browser.

For a stable project request the Hub:

1. validates public method, Host, Origin, request target, fetch metadata, and
   mutation header before resolving or launching anything;
2. resolves and revalidates the registered project/worktree identity;
3. reuses or launches and handshakes the one-root child;
4. strips the public project prefix, removes browser authority and hop-by-hop
   headers, sets the exact child Host and bearer capability, and forwards the
   bounded request;
5. sanitizes hop-by-hop response headers and streams the response with
   disconnect and backpressure handling.

The Hub intercepts worktree-open POSTs and returns the stable worktree route,
so a proxied child never creates nested branch children. Direct standalone
capability mode may retain its existing isolated-navigation behavior.

A path-aware runtime contract supplies the public base path to HTML without an
inline script. Static asset URLs, API calls, event-stream URLs, and navigation
responses are constructed from that validated base path. Rewriting arbitrary
HTML or JavaScript response text in the proxy was rejected as fragile.

### Lazy start and evict after ten idle minutes

Any valid stable route can lazily start its child, including a direct bookmark
after a Hub or machine restart. Concurrent first requests for the same
worktree share one launch promise. A child is idle only when it has no request
in flight, no open event stream, and no completed activity for ten minutes.
An active SSE connection keeps it alive; closing the page starts the idle
window. Exited children are removed immediately. A failed proxy request may
trigger one fresh verified launch, never an unbounded retry loop.

Ten minutes balances quick return navigation with bounded background cost.
Immediate per-request children were rejected for latency and watcher churn;
unbounded lifetime was rejected because every opened project otherwise
accumulates a process and polling loop.

### Revalidate registrations and worktree membership at use time

Registration continues to store a generated id, label, and canonical root.
Before availability reporting or launch, the Hub resolves the stored root
again and requires the canonical result and discovered Git top level to equal
the stored canonical root. A symlink replacement therefore becomes unavailable
instead of silently redirecting authority. Worktree routes are resolved only
from a fresh branch/worktree inventory whose common Git directory matches the
registered project.

Persisting child credentials or browser-provided paths was rejected. A
registry format migration is unnecessary for the symlink boundary and would
create upgrade risk without providing a repository identity that survives all
legitimate Git moves.

### A successful snapshot acknowledges freshness

The watcher maintains the last acknowledged projection epoch. Filesystem
events or a bounded fallback poll mark it stale and notify SSE clients. A
successful snapshot rebuild acknowledges the new epoch and returns
`stale: false`; failures leave it stale. The primary notification remains the
filesystem watcher. Fallback Git polling runs every ten seconds only while the
child has an active event stream, avoiding perpetual 2.5-second polling for
unviewed processes.

### Enforce the compatibility manifest and classify bounded command failures

The bundled runtime loads and validates `compatibility.json`, obtains the
consumer OpenSpec CLI version through the bounded pinned runner, and selects
only the adapter declared for that supported version before project status is
interpreted. Shape validation of doctor, list, status, and validation responses
remains the final fail-closed check. An unsupported OpenSpec version or unknown
shape produces a specific compatibility result; command unavailability remains
a distinct transient failure.

`standards.version`, when present, is optional provenance only. Its absence, a
newer value such as `v1.9.0`, or the absence of any particular Markdown contract
does not block a project whose executable OpenSpec protocol is compatible. The
application never requires a consumer to add or preserve a repository-wide
marker for registration. Explicit user selection, canonical-root revalidation,
and the post-launch identity handshake are the trust boundary; a marker file
would not make running the project-local package command safe.

Git execution uses command-specific bounded readers. Dirty-state detection may
stop after the first status record; list operations retain explicit size and
time limits. Exit failure, timeout, output overflow, missing Git, invalid root,
and unreadable files map to distinct safe codes while raw command output stays
server-side.

### Recover registry locks conservatively

The lock file records the owning PID and creation time. On contention the
registry checks whether that process is alive and whether the lock exceeded a
bounded stale threshold before removing it and retrying atomically. An active
or unverifiable owner is never displaced. Atomic temporary-write-and-rename and
private permissions remain unchanged.

### Activate versioned deterministic bundles, not a feature checkout

The Git clone under `<application-checkout>` remains the single
source checkout. Verification publishes only the deterministic runtime and its
compatibility metadata to:

`~/Library/Application Support/OpenSpec Workbench/releases/<revision>/`

PM2 uses a stable `current` release pointer. Activation changes that pointer
only after bundle, tests, OpenSpec validation, and health checks pass; the
preceding release remains available for rollback. Machine configuration
backups move from temporary storage to the private application state directory
with a manifest of original paths and checksums. This avoids a second source
clone while insulating the running service from branch changes.

Application code owns portable behavior and release tooling. Central standards
may document organizational integration guidance, but no central standards
path is a runtime dependency. Consumer repositories own their plans, Git state,
OpenSpec CLI, and any standards provenance they choose to expose.
Machine-specific Caddy and PM2 declarations remain in `local-dev` and are
changed only during an explicit activation step.

### Make artifact controls honest and themes measurable

Available artifact badges become ordinary keyboard-operable anchors that move
focus to the corresponding rendered Proposal, Design, Tasks, or supported
artifact section. Missing artifacts retain visible status text without an
active control. No repository file URL is exposed. This exact interaction,
localized copy, focus treatment, and responsive placement require project owner's
explicit approval before implementation.

Theme colors are expressed as semantic tokens for normal, muted, link, focus,
warning, danger, and disabled states in both color schemes. Automated contrast
fixtures enforce WCAG 2.1 AA instead of relying on visual inspection alone.

## Risks / Trade-offs

- **The Hub becomes a streaming reverse proxy** -> Keep a narrow path and
  method allowlist, sanitize both directions, cap ordinary bodies, handle SSE
  cancellation/backpressure, and add hostile integration fixtures.
- **A path prefix can break absolute asset or API URLs** -> Introduce one
  validated base-path contract and test HTML, assets, APIs, SSE, refresh, and
  nested worktree bookmarks through the public origin.
- **Concurrent lazy requests can duplicate children** -> Deduplicate launch
  promises by verified worktree id and publish a route only after handshake.
- **Idle eviction can race with a new request** -> Track in-flight requests and
  streams, cancel eviction before proxying, and terminate only an unchanged
  idle generation.
- **Filesystem identity can change between validation and spawn** -> Repeat
  discovery in the launcher and require the post-launch identity handshake to
  match the just-resolved snapshot.
- **A same-user local process can forge trusted-origin requests** -> Retain the
  documented local threat boundary; do not add a persistent secret that the
  same user could read.
- **OpenSpec protocol checks may reject previously tolerated consumers** ->
  Keep the CLI-version-to-JSON-adapter matrix explicit, report the exact
  unsupported component safely, and expand support only with fixtures and a
  reviewed application release; never use optional standards provenance as a
  compatibility gate.
- **Release directories consume disk over time** -> Retain the active and one
  preceding verified release by default; deletion of older releases remains an
  explicit recoverable maintenance action.

## Migration Plan

1. Obtain project owner's explicit approval for the stable route behavior, artifact
   navigation, focus treatment, localized copy, and responsive placement.
2. Implement root revalidation, freshness acknowledgement, compatibility and
   diagnostic classification, and registry lock recovery with focused tests.
3. Refactor the Hub launcher into the sole lifecycle owner, add lazy launch and
   ten-minute eviction, then add the sanitized HTTP/SSE proxy and path-aware
   child contract.
4. Update the Hub and project clients to use stable navigation; add artifact
   anchors and approved theme tokens.
5. Run unit, E2E, security, bundle, OpenSpec, contrast, and local health tests.
   Verify that consumer fixtures and the live reference consumer repository are unchanged.
6. Publish a revision-addressed deterministic bundle, create a durable machine
   backup, point PM2 at the verified release, restart only `openspec-workbench`, save
   PM2 state, and verify fresh navigation plus existing bookmarks through
   `https://plans.internal`.
7. Retain the preceding release and backup. Rollback repoints `current`,
   restarts only `openspec-workbench`, restores machine configuration only if that
   configuration changed, and re-runs public and hostile health checks.

No push, merge, tag, consumer update, or machine activation occurs without the
separate authorization required for that action.
