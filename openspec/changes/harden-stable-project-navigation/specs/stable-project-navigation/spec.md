## Purpose

Provides stable, same-origin, bookmarkable access to isolated read-only
OpenSpec project and worktree projections with bounded local process lifetime.

## ADDED Requirements

### Requirement: Project content uses stable same-origin routes
The system SHALL expose an explicitly registered project's primary worktree at
`https://plans.internal/projects/<project-id>/` and an existing linked
worktree at
`https://plans.internal/projects/<project-id>/worktrees/<worktree-id>/` without
placing a child listener port or capability in browser-visible state.

#### Scenario: User opens a registered project
- **WHEN** the user selects an available project from the stable Hub
- **THEN** the browser navigates to that project's stable same-origin route and displays its read-only projection

#### Scenario: User opens an existing worktree
- **WHEN** the user selects an openable branch that already has a verified worktree
- **THEN** the browser navigates to that worktree's stable same-origin route without switching a branch or creating a worktree

#### Scenario: User follows a bookmark after restart
- **WHEN** a valid stable project or worktree URL is requested after child eviction, Hub restart, login restoration, or machine reboot
- **THEN** the system revalidates the target, lazily restores its isolated projection, and serves the same URL

#### Scenario: Stable route target is unavailable
- **WHEN** a stable URL names an unknown project, removed worktree, unreadable root, or unsupported project shape
- **THEN** the system shows a safe visible unavailable or compatibility state and does not substitute another project

### Requirement: Child capabilities remain server-side
The Hub SHALL keep every child listener capability and loopback origin only in
process memory, SHALL proxy authorized browser HTTP and event-stream traffic,
and SHALL preserve the child process's one-canonical-root authority and
identity handshake.

#### Scenario: Browser reads project content
- **WHEN** the browser requests an allowed resource under a stable project or worktree route
- **THEN** the Hub authorizes the public request, forwards only the required sanitized request to the verified child, and returns the read-only response

#### Scenario: Browser inspects navigation state
- **WHEN** project content is loaded or navigation history is recorded
- **THEN** no child capability, child port, or child origin appears in the URL, HTML, API response, referrer, or browser storage

#### Scenario: Child access lacks its capability
- **WHEN** a caller addresses a child listener directly without that child's current capability
- **THEN** the child rejects the request and exposes no project content

#### Scenario: Public authority is invalid
- **WHEN** a project-route request has an unapproved Host, Origin, absolute request target, cross-site mutation context, or missing required mutation header
- **THEN** the Hub rejects it, emits no CORS permission, and does not launch or contact a child

### Requirement: Stable navigation is bound to current registered identity
Before listing a project as available, launching it, or resolving one of its
worktrees, the system SHALL re-canonicalize the registered root and verify that
the resolved project or worktree still belongs to that explicit registration.

#### Scenario: Registered path is unchanged
- **WHEN** the stored canonical root still resolves to the registered OpenSpec Git worktree
- **THEN** the project can be listed and opened under its existing project id

#### Scenario: Registered path is replaced by a symlink
- **WHEN** a stored root now resolves through a symlink to another location or repository
- **THEN** the project is marked unavailable and no process is launched for the replacement target

#### Scenario: Worktree membership changed
- **WHEN** a bookmarked worktree id is no longer rediscovered as an existing readable worktree of the registered repository
- **THEN** the stable worktree route returns a safe unavailable state and does not resolve by path supplied by the browser

### Requirement: Child lifecycle is bounded and recoverable
The system SHALL stop a child after ten minutes with no active request or event
stream, SHALL treat an active project event stream as activity, and SHALL remove
exited children from live routing state.

#### Scenario: Open project remains active
- **WHEN** the project page maintains its normal event stream
- **THEN** its verified child remains available without avoidable restart churn

#### Scenario: Project becomes idle
- **WHEN** no request or event stream has remained active for ten minutes
- **THEN** the system terminates that child without changing any repository or registry state

#### Scenario: Idle project is reopened
- **WHEN** a request arrives for a valid stable route after its child was stopped
- **THEN** the system launches and verifies a new child and serves the requested route transparently

#### Scenario: Child exits unexpectedly
- **WHEN** a child exits or fails its health or identity check
- **THEN** the Hub removes the stale route capability and either performs one bounded verified recovery or returns a safe failure

### Requirement: Projection freshness can recover
The system SHALL mark a projection stale when repository evidence changes or
becomes unavailable and SHALL clear that stale state after a complete
successful reread of the current Git and OpenSpec projection.

#### Scenario: Repository evidence changes
- **WHEN** filesystem notification or bounded polling detects a new projection epoch
- **THEN** connected clients receive a stale notification and request a fresh snapshot

#### Scenario: Fresh reread succeeds
- **WHEN** the client obtains a complete snapshot from the current authoritative files after a stale notification
- **THEN** the returned and subsequently displayed projection is marked fresh

#### Scenario: Fresh reread fails
- **WHEN** Git or OpenSpec evidence cannot be read completely
- **THEN** the projection remains visibly stale or unavailable and the last result is not represented as current truth

### Requirement: Compatibility and local failures fail visibly
The system SHALL enforce its declared project-local OpenSpec CLI protocol and
JSON compatibility at runtime, SHALL treat standards metadata as optional
provenance rather than an access requirement, and SHALL distinguish unsupported
shapes, oversized command output, unreadable roots, and transient command
failures without guessing status.

#### Scenario: Supported consumer is opened
- **WHEN** a registered project uses a declared supported project-local OpenSpec CLI version and returns supported doctor, list, status, and validation JSON shapes
- **THEN** the system renders its projection without changing the project or its OpenSpec version

#### Scenario: Standards provenance is absent or newer
- **WHEN** a protocol-compatible project has no `standards.version` or reports a standards version outside the application's observed provenance set
- **THEN** the system may report that provenance but does not block the project or require a particular standards file

#### Scenario: Unsupported consumer is opened
- **WHEN** the project-local OpenSpec CLI version is outside the declared compatibility matrix or a required JSON response has an unknown shape
- **THEN** the system shows a specific read-only compatibility state and does not infer tasks or plan status

#### Scenario: Git output exceeds a safety bound
- **WHEN** a bounded Git inspection cannot complete because its output is too large
- **THEN** the system reports a specific safe diagnostic rather than claiming the directory is not a Git worktree

### Requirement: Read-only artifact navigation is operable
The project view SHALL render each available artifact label as a keyboard-
operable navigation control to its corresponding rendered read-only section,
SHALL preserve full labels, and SHALL not represent unavailable artifacts as
active controls.

#### Scenario: User selects an available artifact
- **WHEN** the user activates the Proposal, Design, Tasks, or other supported artifact control
- **THEN** focus and reading position move to that artifact's rendered content without editing or opening an unsafe filesystem URL

#### Scenario: Artifact is unavailable
- **WHEN** the selected change does not contain that artifact
- **THEN** the view preserves an explicit unavailable state without a misleading active control

### Requirement: Local runtime is diagnosable and reversible
The supervised local installation SHALL run a verified deterministic release
bundle independently from a mutable development checkout, SHALL keep durable
rollback material, and SHALL report only successful HTTP health responses as
healthy.

#### Scenario: Development branch changes
- **WHEN** the source checkout switches branch or gains uncommitted work
- **THEN** the active supervised release remains on its previously activated verified bundle

#### Scenario: Local health endpoint rejects a request
- **WHEN** the health probe receives a non-successful HTTP status such as 403
- **THEN** the machine health check reports the service as unhealthy

#### Scenario: Release is rolled back
- **WHEN** the operator activates the preceding retained release and restores a machine integration backup
- **THEN** the stable domain returns to that release without changing consumer repositories or their Git state

### Requirement: Themes preserve readable contrast
The system SHALL provide at least WCAG 2.1 AA contrast for normal text,
interactive controls, warning states, and error states in each supported color
scheme.

#### Scenario: Dark color scheme is active
- **WHEN** the browser renders the Hub or project view using the dark color scheme
- **THEN** automated contrast checks pass for normal, muted, warning, danger, disabled, focus, and link states
