## Purpose

Separate task-complete changes that still require an OpenSpec lifecycle action from unfinished active work without changing authoritative status or repository state.

## ADDED Requirements

### Requirement: Derive archive readiness without changing status
The Workbench SHALL classify a change as archive-ready when its authoritative status is not completed or archived, it has at least one task, and every task is complete. This classification SHALL remain derived presentation state and SHALL NOT modify OpenSpec files or status.

#### Scenario: Active change has all tasks complete
- **WHEN** an active change reports a positive task total and completed tasks equal total tasks
- **THEN** the Workbench classifies it as archive-ready

#### Scenario: Active change has unfinished tasks
- **WHEN** an active change has at least one incomplete task
- **THEN** it remains in the active classification

#### Scenario: Change has no tasks
- **WHEN** a non-completed change reports zero tasks
- **THEN** it remains active and is not presented as archive-ready

#### Scenario: Authoritative status is completed
- **WHEN** a change status is complete, completed, or archived
- **THEN** it remains completed regardless of task counts

### Requirement: Present archive-ready changes separately
The sidebar SHALL show archive-ready changes in a distinct `Готові до архівації` (uk-UA) section between active and completed changes, with a visible cue that all tasks are done and an archive lifecycle action remains outside the read-only Workbench.

#### Scenario: Archive-ready plans exist
- **WHEN** at least one visible plan is archive-ready
- **THEN** each appears once in the archive-ready section and does not appear in the active section

#### Scenario: Search filters the list
- **WHEN** search matches an archive-ready plan
- **THEN** the plan remains in the archive-ready section and preserves its dependency presentation rules

#### Scenario: No archive-ready plans exist
- **WHEN** no visible plan is archive-ready
- **THEN** the archive-ready section is omitted
