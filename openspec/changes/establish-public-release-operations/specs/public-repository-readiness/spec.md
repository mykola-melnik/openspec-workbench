## ADDED Requirements

### Requirement: Public readiness includes current documentation evidence
The public snapshot SHALL include the canonical README, changelog, documentation sources, documentation configuration, release procedure, and deterministic checks that prove those files agree with current repository metadata and supported behavior.

#### Scenario: Public snapshot is synchronized after private development
- **WHEN** a reviewed private-tree change alters startup, compatibility, platform support, or release-facing behavior
- **THEN** the public snapshot includes the corresponding documentation and changelog updates
- **AND** documentation and public-readiness checks pass on the exact candidate tree

#### Scenario: Public README is older than the release candidate
- **WHEN** the public branch documents a startup contract that differs from the approved release candidate
- **THEN** the candidate is not eligible for tagging until a non-force public synchronization commit is reviewed and verified

### Requirement: Public release evidence distinguishes repository and account failures
Release readiness SHALL record whether each required check ran and passed. A workflow configuration check MAY prove repository configuration validity, but it MUST NOT replace a GitHub-hosted run that failed to start because of external account state.

#### Scenario: Workflow is valid but GitHub job never starts
- **WHEN** local workflow validation passes and GitHub annotates the job as blocked by billing or account state before any step runs
- **THEN** repository configuration remains provisionally valid
- **AND** public release readiness remains blocked until the external state is repaired and the hosted workflow passes
