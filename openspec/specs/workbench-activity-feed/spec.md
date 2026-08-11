# workbench-activity-feed Specification

## Purpose

Provides a trustworthy live timeline of bounded observable Workbench activity without representing hidden AI reasoning or repository content as an application log.

## Requirements

### Requirement: Reader can inspect recent live activity
The Workbench SHALL provide a localized activity control in the project header that opens a responsive panel containing the current worktree process's recent events in newest-first order with timestamps and explicit event states.

#### Scenario: Reader opens the activity panel
- **WHEN** the reader activates the activity control
- **THEN** the panel shows the bounded recent timeline without navigating away from the selected plan

#### Scenario: Page reloads while the child remains alive
- **WHEN** a project page reloads before its isolated worktree process exits
- **THEN** the panel restores the bounded recent process-local entries and continues receiving new events

#### Scenario: Child process restarts
- **WHEN** the isolated worktree process is restarted or evicted
- **THEN** a new empty process-local timeline begins and the UI does not represent missing earlier entries as a complete durable history

#### Scenario: No activity has been recorded
- **WHEN** the reader opens the panel before any allowlisted event exists
- **THEN** the panel shows a localized empty state and remains ready for live updates

### Requirement: Activity includes only allowlisted observable evidence
The activity timeline SHALL include only closed-schema events derived from source or HEAD change detection, snapshot refresh, strict OpenSpec verification, and configured translation lifecycle. It SHALL distinguish started, completed, and failed work where those states are directly observed and SHALL NOT attribute a repository change to an AI actor without authenticated evidence.

#### Scenario: OpenSpec source changes
- **WHEN** the bounded watcher confirms that current worktree OpenSpec content changed
- **THEN** the timeline records a source-change event with a bounded list of changed paths relative to the canonical worktree root, limited to `openspec/`, plus a bounded additional-path count when needed, without plan content, an absolute path, or an asserted author

#### Scenario: HEAD changes
- **WHEN** the bounded watcher confirms a different Git projection epoch
- **THEN** the timeline records a HEAD-change event with the previous and new short revisions without exposing any other repository internals

#### Scenario: Strict verification runs
- **WHEN** strict verification starts and later completes or fails for a selected change
- **THEN** the timeline records the observed lifecycle with only the validated change identifier and safe state

#### Scenario: AGY translation runs
- **WHEN** the configured AGY translation starts and later completes or fails
- **THEN** the timeline records the provider label, validated change identifier, and bounded block counts or safe failure category without prompts, model output, stderr, credentials, or account data

#### Scenario: Arbitrary filesystem or process output exists
- **WHEN** a non-allowlisted file event, terminal message, command output, or model response occurs
- **THEN** the Workbench does not publish it to the activity timeline

### Requirement: Activity transport remains bounded and capability protected
The Workbench SHALL retain at most 100 activity entries per isolated worktree process, SHALL bound every identifier, relative path, revision, list, and numeric field, SHALL return recent entries only through its protected read API, and SHALL stream new entries through its existing protected same-origin event connection.

#### Scenario: More than 100 events occur
- **WHEN** the process records its 101st activity event
- **THEN** the oldest entry is discarded and the API and panel expose at most the newest 100 entries

#### Scenario: Activity API lacks authority
- **WHEN** a caller requests recent entries or the event stream without the current child capability or stable Hub authorization
- **THEN** the request is rejected and no activity metadata is exposed

#### Scenario: Host or Origin is invalid
- **WHEN** an activity request uses an invalid Host, Origin, or stable route authority
- **THEN** existing local-server protections reject it before activity is returned

#### Scenario: Activity text reaches the browser
- **WHEN** an activity entry is rendered
- **THEN** the client selects localized copy from the closed event kind and inserts identifiers and counts as inert text

### Requirement: Confirmed worktree changes refresh the visible projection
The Workbench SHALL use a confirmed watcher change as a hint to request a new authoritative snapshot, SHALL update the sidebar and current plan from that snapshot without a full document reload, and SHALL keep the stale state visible until the refresh is acknowledged.

#### Scenario: Current plan changes on disk
- **WHEN** a confirmed OpenSpec source or HEAD change affects the current worktree and the selected change still exists
- **THEN** the client refreshes the snapshot and selected change in place while preserving the selected language and scrollable application shell

#### Scenario: Selected plan disappears
- **WHEN** the refreshed authoritative snapshot no longer contains the selected change
- **THEN** the client selects the first remaining change or shows the empty state without requiring a page reload

#### Scenario: Changes arrive during refresh
- **WHEN** another confirmed watcher generation arrives while a refresh is running
- **THEN** the client coalesces the request and refreshes again until it receives a non-stale authoritative snapshot within its bounded retry policy

#### Scenario: Automatic refresh fails
- **WHEN** the authoritative snapshot or selected-plan request fails
- **THEN** the current safe projection remains visible with a localized stale/retry cue and manual page reload remains available as fallback

### Requirement: Reader navigates plan artifacts as tabs
The Workbench SHALL present available Overview, Tasks, Design, and Verification artifacts as a localized keyboard-operable tab set, SHALL show only the selected artifact panel below the tabs, and SHALL omit the verbose "Go to" prefix from tab labels.

#### Scenario: Reader selects an artifact tab
- **WHEN** the reader activates an available artifact tab
- **THEN** that tab becomes selected and only its associated artifact panel is visible without a document reload

#### Scenario: Reader opens a direct artifact URL
- **WHEN** the page opens with a supported artifact fragment or browser history returns to one
- **THEN** the matching tab and panel become active while the selected plan remains unchanged

#### Scenario: Reader uses the keyboard
- **WHEN** focus is within the artifact tab set and the reader presses an arrow, Home, or End key
- **THEN** focus and selection move among available tabs using the standard tab-list interaction without moving focus into hidden content

#### Scenario: Artifact is unavailable
- **WHEN** an optional artifact has no projected content
- **THEN** its localized tab remains visibly unavailable and cannot become the selected panel

#### Scenario: Live projection refreshes
- **WHEN** the current plan refreshes in place and its selected artifact still exists
- **THEN** the Workbench preserves the active artifact fragment and tab selection

### Requirement: Live activity remains accessible and non-disruptive
The activity control and panel SHALL preserve keyboard operation, focus visibility, responsive containment, and reduced-motion behavior. New routine entries SHALL not repeatedly interrupt assistive technology; only an important active or failed state SHALL use a polite live announcement.

#### Scenario: Routine events stream while panel is closed
- **WHEN** source, snapshot, or successful verification events arrive while the activity panel is closed
- **THEN** the control indicates updated activity without moving focus or announcing every entry

#### Scenario: Important work starts or fails
- **WHEN** AGY translation or strict verification starts or reports a safe failure
- **THEN** the Workbench provides one concise polite announcement without exposing diagnostics

#### Scenario: Narrow viewport opens activity
- **WHEN** the panel opens on a narrow viewport
- **THEN** it remains fully reachable without horizontal page overflow and without obscuring its close control

#### Scenario: Reduced motion is requested
- **WHEN** the reader prefers reduced motion
- **THEN** activity updates and panel state changes remain usable without decorative animation
