## Purpose

Provides a safe portable Projects Hub onboarding flow that lets an interactive local macOS or Windows user select and explicitly register OpenSpec worktrees without terminal-only setup or browser-supplied filesystem authority.

## ADDED Requirements

### Requirement: Portable Hub can register projects with capability-bound authority
The loopback capability-protected Projects Hub SHALL expose project registration only after authenticating the current Hub capability and validating exact loopback Host, exact same-origin mutation authority, the application-client header, same-origin fetch metadata, and a per-process CSRF value. Registration routes SHALL exist only in the Hub role and SHALL NOT exist in an isolated one-root workbench role.

#### Scenario: Authorized portable Hub loads registration controls
- **WHEN** the browser opens the exact loopback Hub capability URL and requests bootstrap with that capability
- **THEN** the Hub returns a per-process CSRF value, exposes `Add project`, and emits no CORS permission

#### Scenario: Bootstrap is requested without the Hub capability
- **WHEN** a caller requests portable Hub bootstrap without the current capability
- **THEN** the Hub rejects the request without returning registration availability or a CSRF value

#### Scenario: Authorized portable Hub tab reloads after URL cleanup
- **WHEN** the authorized tab reloads the tokenless root after retaining its capability in tab session storage
- **THEN** the server returns only the inert Hub shell and the client authenticates bootstrap before receiving registration availability, CSRF, or project information

#### Scenario: Fresh tab opens the tokenless root
- **WHEN** a fresh tab without the retained capability opens the tokenless Hub root
- **THEN** it may receive the inert shell but bootstrap fails with `CAPABILITY_REQUIRED` and no project or mutation state is disclosed

#### Scenario: Portable mutation lacks authority
- **WHEN** a registration mutation has a missing or foreign capability, invalid Host or Origin, absent application header, cross-site fetch metadata, or invalid CSRF value
- **THEN** the Hub rejects it before opening a picker, inspecting a folder, executing project code, or changing the registry

#### Scenario: One-root child is probed for registration
- **WHEN** a caller requests a registration route from an isolated project workbench
- **THEN** the child reports that the route does not exist and exposes no registry or folder-selection authority

### Requirement: Native selection is bounded and cross-platform
The Hub SHALL use a server-owned native folder picker on supported interactive macOS and Windows desktop sessions, SHALL keep the selected path only in ephemeral server memory, and SHALL NOT accept a candidate path from browser input. Selection SHALL be single-flight, bounded by time and output limits, and cancelled on Hub shutdown.

#### Scenario: Windows user selects a folder
- **WHEN** an authorized portable Hub request starts selection in an interactive Windows desktop session
- **THEN** one native folder dialog returns either one absolute Windows path or cancellation without executing a command shell or interpolating request data

#### Scenario: macOS user selects a folder
- **WHEN** an authorized local Hub request starts selection in an interactive macOS desktop session
- **THEN** the existing bounded native folder dialog returns either one absolute POSIX path or cancellation

#### Scenario: Picker is already active
- **WHEN** another request starts selection while a native picker is active
- **THEN** the Hub reports a busy state and does not open a second dialog

#### Scenario: Desktop interaction is unavailable
- **WHEN** the platform is unsupported, the process is headless or non-interactive, the picker cannot start, or the selection times out
- **THEN** the Hub shows a specific recoverable error and makes no registry or repository change

#### Scenario: Native picker platform is unsupported
- **WHEN** bootstrap determines that the current platform has no native picker adapter
- **THEN** the Hub does not expose a nonfunctional `Add project` control and the documented CLI recovery path remains available

#### Scenario: Browser submits a filesystem path
- **WHEN** any portable registration request includes a root, path, or unknown field
- **THEN** the Hub rejects the request before filesystem inspection

### Requirement: Portable registration preserves explicit trust and one-root isolation
The portable Hub SHALL use the existing opaque, expiring, single-use registration intent and confirmation-time revalidation boundaries, SHALL execute project-local compatibility checks only after explicit confirmation, and SHALL open a confirmed registration through a distinct capability-protected one-root child.

#### Scenario: User confirms a selected project
- **WHEN** the user reviews a still-valid candidate, edits or accepts its display name, and confirms registration
- **THEN** the Hub performs bounded compatibility verification, atomically updates only the private registry, and shows the resulting project card

#### Scenario: Candidate changes before confirmation
- **WHEN** the canonical root, Git identity, OpenSpec configuration, or compatibility evidence changes after preview
- **THEN** confirmation fails visibly and neither the registry nor the consumer repository changes

#### Scenario: Registered project opens
- **WHEN** the user opens a compatible registered project from the portable Hub
- **THEN** the Hub launches or reuses an identity-verified child bound to exactly that canonical worktree and navigates with the child's distinct ephemeral capability

#### Scenario: Current directory contains OpenSpec
- **WHEN** the Hub starts from a directory that itself contains an unregistered OpenSpec project
- **THEN** the Hub does not scan, select, or register that directory automatically
