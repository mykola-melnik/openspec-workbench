## Purpose

Enable a local user to add, name, and rebind explicit OpenSpec project registrations from the trusted Hub without using Terminal or weakening repository and worktree boundaries.

## ADDED Requirements

### Requirement: The trusted Hub offers explicit project registration
The system SHALL expose an accessible `Add project` action only from the trusted local Hub and SHALL NOT expose registration mutation through project content routes, remote origins, or ordinary capability-mode instances.

#### Scenario: User starts project registration
- **WHEN** the user activates `Add project` from the trusted local Hub
- **THEN** the system opens one native macOS folder chooser and indicates that folder selection is in progress

#### Scenario: Picker is unavailable
- **WHEN** no active macOS GUI session exists, folder access is denied, the picker times out, or the platform is unsupported
- **THEN** the Hub shows a specific recoverable error and neither scans the filesystem nor changes the registry

#### Scenario: User cancels folder selection
- **WHEN** the user cancels the native folder chooser
- **THEN** the Hub returns to the unchanged project list without presenting cancellation as a registration failure

#### Scenario: Concurrent selection is requested
- **WHEN** another folder selection is requested while the native picker is active
- **THEN** the system keeps a single picker active and reports that selection is already in progress

### Requirement: Folder selection produces a non-mutating candidate preview
The system SHALL keep the selected filesystem path in ephemeral server memory, SHALL NOT accept a candidate path from the browser, and SHALL present a preview only after bounded structural validation of the exact canonical folder.

#### Scenario: Valid OpenSpec worktree is selected
- **WHEN** the selected canonical folder is exactly a readable Git worktree root with a contained readable regular `openspec/config.yaml`
- **THEN** the Hub shows the canonical path, detected project name, current branch or detached state, worktree kind, and that OpenSpec was found without changing the registry

#### Scenario: Nested project folder is selected
- **WHEN** the chosen folder is inside a Git worktree but is not its exact top-level root
- **THEN** the Hub rejects the candidate and does not silently expand filesystem authority to the parent worktree

#### Scenario: Invalid folder is selected
- **WHEN** the selected folder is missing, unreadable, a bare repository, outside the supported containment rules, or lacks a contained readable `openspec/config.yaml`
- **THEN** the Hub shows a specific validation result and does not create a registration

#### Scenario: Candidate expires or the Hub restarts
- **WHEN** the ephemeral candidate expires, is consumed, or is lost on Hub restart
- **THEN** confirmation is rejected without using a browser-supplied path and the user can start a new selection

#### Scenario: Repository code has not been trusted
- **WHEN** the Hub is preparing the candidate preview before explicit confirmation
- **THEN** it performs no project-local package script, OpenSpec command, Git hook, optional lock, or filesystem monitor execution

### Requirement: Registration requires explicit confirmation and supports immediate naming
The system SHALL allow the user to edit a candidate display label and SHALL mutate the machine-local registry only after explicit confirmation, confirmation-time revalidation, and fail-closed compatibility verification.

#### Scenario: User confirms a valid candidate
- **WHEN** the user confirms a still-valid candidate with a printable label of 1 to 120 characters
- **THEN** the system verifies the selected project's declared OpenSpec compatibility through the bounded confirmed-project boundary, atomically registers it, closes the preview, and shows the resulting project card

#### Scenario: User edits the detected name
- **WHEN** the user changes the display label before confirmation
- **THEN** the confirmed normalized label is stored without modifying the selected repository

#### Scenario: Candidate changes before confirmation
- **WHEN** the selected folder, Git identity, OpenSpec configuration, or compatibility evidence changes between preview and confirmation
- **THEN** confirmation fails visibly and no registry mutation occurs

#### Scenario: Candidate is already registered
- **WHEN** the exact canonical root already belongs to a registration
- **THEN** the Hub identifies the existing card and offers to open or rename it instead of silently creating or overwriting a duplicate

#### Scenario: Confirmation is repeated
- **WHEN** the same candidate is confirmed more than once
- **THEN** at most one registry mutation occurs and later attempts receive a stable consumed or completed result

### Requirement: Unavailable registrations can be explicitly rebound
The system SHALL offer `Find new folder` for an unavailable registration and SHALL preserve that registration's stable URL identifier only after the user confirms redirecting it to the selected candidate.

#### Scenario: User selects a replacement folder
- **WHEN** the user starts `Find new folder`, selects a valid candidate, reviews the old and new canonical locations, and confirms the replacement
- **THEN** the system atomically updates the existing registration root, preserves its display label unless edited, increments its revision, and preserves stable project bookmarks

#### Scenario: Replacement is another repository
- **WHEN** the system cannot prove that the candidate represents the previously registered repository
- **THEN** the preview states that the stable registration will point to the selected worktree and requires explicit confirmation without claiming automatic repository identity recovery

#### Scenario: Registration changes in another tab
- **WHEN** the registration revision changes after the rebind preview was created
- **THEN** confirmation reports a conflict and leaves the newer registration unchanged

#### Scenario: Rebind fails before commit
- **WHEN** candidate validation, compatibility verification, or registry persistence fails
- **THEN** the previous registration remains intact and the Hub reports the failed stage without exposing capabilities or raw command output

#### Scenario: Obsolete child cleanup fails after rebind
- **WHEN** the registry rebind commits but invalidating a child for the preceding root fails
- **THEN** the new registration remains authoritative and the Hub reports a safe local cleanup warning without reusing that child for the new root or touching repository files

### Requirement: Registration identity is stable and path changes are atomic
The system SHALL store a stable opaque registration identifier separately from the mutable canonical root and SHALL migrate prior machine-local registrations without changing their identifiers, labels, or repositories.

#### Scenario: Existing registry is upgraded
- **WHEN** the application first reads a supported legacy registry
- **THEN** it preserves every existing identifier, label, and canonical root while writing the new private versioned format only during an authorized registry mutation

#### Scenario: A registration root changes
- **WHEN** a confirmed rebind commits a different canonical root
- **THEN** project routes continue to use the same registration identifier and any obsolete child associated with the preceding revision cannot be reused for the new root

#### Scenario: Duplicate root would be introduced
- **WHEN** add or rebind would associate one canonical root with more than one registration
- **THEN** the mutation is rejected atomically and the existing registry remains unchanged

### Requirement: Registration mutations retain the trusted-local security boundary
The system SHALL authorize registration intents and confirmations only with exact trusted Host and Origin, same-origin fetch metadata, the application-client header, an ephemeral anti-CSRF value, strict method and content-type allowlists, bounded bodies, and closed JSON schemas.

#### Scenario: Untrusted request attempts to open a picker
- **WHEN** a request has a hostile or absent required authority signal, uses an absolute foreign target, or arrives through an untrusted mode
- **THEN** the system rejects it before launching the native picker or inspecting any candidate folder

#### Scenario: Browser submits a filesystem path
- **WHEN** any registration request includes a filesystem path or an unknown field
- **THEN** the system rejects the request and does not inspect or register that path

#### Scenario: Intent cannot be replayed
- **WHEN** an expired, mismatched, consumed, or foreign-session registration intent is used
- **THEN** the mutation is rejected and no registry or repository state changes

### Requirement: Obsolete registrations can be removed without deleting projects
The system SHALL let the user remove a project from the trusted local Hub by stable registration identifier and expected revision, SHALL require an explicit confirmation that only the Hub registration will be removed, and SHALL NOT accept a filesystem path or delete or modify any project, Git, worktree, or OpenSpec content.

#### Scenario: User removes an obsolete registration
- **WHEN** the user confirms removal of a registered project with its current revision
- **THEN** the system atomically removes only that machine-local registry record, makes its stable route unavailable, invalidates any child process for the preceding registered root after the commit, and leaves the project filesystem unchanged

#### Scenario: User cancels removal
- **WHEN** the user dismisses the removal confirmation
- **THEN** the registration and any running child remain unchanged

#### Scenario: Registration changed in another tab
- **WHEN** the submitted expected revision is stale
- **THEN** removal fails with a visible conflict and the current registry remains unchanged

#### Scenario: Removal request supplies a path
- **WHEN** the removal request contains a root, path, or any unknown field
- **THEN** the system rejects the request before registry or launcher mutation

#### Scenario: Child cleanup fails after removal
- **WHEN** the registry commit succeeds but obsolete child invalidation fails
- **THEN** the registration remains removed and the Hub reports a safe local cleanup warning without touching repository files

### Requirement: Branch and linked-worktree availability remains derived and read-only
The system SHALL derive local branches and linked worktrees from fresh Git evidence for the selected registered worktree and SHALL open only existing readable worktrees that independently contain a valid OpenSpec installation.

#### Scenario: Branch has a readable OpenSpec worktree
- **WHEN** a local branch maps to an existing worktree of the registered repository and that worktree contains a valid OpenSpec installation
- **THEN** the branch is available and opens through its own isolated one-root projection

#### Scenario: Branch has no worktree
- **WHEN** a local branch exists without an existing readable worktree
- **THEN** the branch remains visible but unavailable and the application performs no checkout, switch, or worktree creation

#### Scenario: Linked worktree lacks OpenSpec
- **WHEN** Git lists a linked worktree whose checked-out branch does not contain a valid OpenSpec installation
- **THEN** its branch is visible but unavailable and no OpenSpec state is borrowed from another branch or worktree

#### Scenario: Linked worktree is removed
- **WHEN** a previously openable linked worktree is removed while its local branch still exists
- **THEN** fresh discovery makes the branch unavailable and an existing stable route fails visibly without opening another root

#### Scenario: Worktree record disappears
- **WHEN** Git no longer reports a removed or pruned worktree record
- **THEN** the Hub does not invent a historical worktree entry, while any surviving branch remains governed by branch-without-worktree behavior

#### Scenario: OpenSpec worktree has no changes
- **WHEN** an available worktree contains a valid OpenSpec installation but no active or archived changes
- **THEN** the project view shows a valid empty state rather than an availability or compatibility error
