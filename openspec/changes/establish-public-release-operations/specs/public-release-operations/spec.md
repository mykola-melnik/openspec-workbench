## Purpose

Defines the evidence and maintenance contract for repeatable public documentation, dependency triage, immutable version tags, and GitHub releases.

## ADDED Requirements

### Requirement: Documentation claims are checked against repository facts
The repository SHALL provide a deterministic documentation check that validates startup commands, supported Node versions, package version references, documentation navigation, changelog state, and publication inventory without network access.

#### Scenario: Documentation matches the implementation
- **WHEN** the documentation check runs in a clean checkout whose README, package metadata, MkDocs navigation, changelog, and publication manifest agree
- **THEN** the check exits successfully with a concise summary

#### Scenario: A documented startup command becomes stale
- **WHEN** package scripts change so the README no longer describes the canonical Hub-first startup and explicit one-project command
- **THEN** the documentation check exits non-zero and identifies the stale documented contract without rewriting documentation

#### Scenario: A documentation file is omitted from publication
- **WHEN** a tracked release or MkDocs source file is absent from the publication inventory
- **THEN** the public-readiness gates fail before a public synchronization or tag is allowed

### Requirement: Release history is durable and versioned
The repository SHALL maintain `CHANGELOG.md` with an Unreleased section and immutable SemVer release sections whose entries describe user-visible changes, compatibility changes, security-relevant changes, and known limitations.

#### Scenario: Pending work is recorded
- **WHEN** a releasable change is merged before a version tag exists
- **THEN** its release-facing summary is recorded under Unreleased

#### Scenario: A release candidate is prepared
- **WHEN** version `X.Y.Z` is selected for release
- **THEN** the matching changelog section is finalized before tag `vX.Y.Z` is created
- **AND** the GitHub release notes are derived from that finalized section

#### Scenario: Development version remains pending
- **WHEN** the ordinary documentation drift check runs before the first tag or while a future package version is still pending
- **THEN** no changelog link advertises the pending tag and Unreleased compares from the latest finalized release when one exists

#### Scenario: Release verification sees Pending
- **WHEN** the release-specific verification runs while the package-version changelog section is still `Pending`
- **THEN** the gate exits non-zero before any tag or GitHub release action

### Requirement: Documentation site builds strictly from reviewed sources
The repository SHALL provide a hash-locked MkDocs dependency graph and pinned configuration whose navigation references only tracked English documentation and whose strict build fails on invalid configuration, missing pages, or broken internal references. Generated site output MUST remain derived, ignored state and MUST NOT become an authoritative planning source.

#### Scenario: Documentation site is valid
- **WHEN** the pinned documentation dependencies are installed and the strict site build runs
- **THEN** MkDocs produces the ignored site output without modifying OpenSpec plans or application runtime files

#### Scenario: Navigation references a missing page
- **WHEN** MkDocs navigation names a source file that is missing
- **THEN** the strict site build fails and no publication action occurs

### Requirement: Dependency pull requests are dispositioned against compatibility policy
Automated dependency pull requests SHALL be merged, deferred, or closed only after their runtime, compatibility, security, and verification impact is recorded. A failed or unavailable CI service MUST NOT be treated as evidence that a dependency change itself is invalid or valid.

#### Scenario: Dependency exceeds the supported runtime contract
- **WHEN** an automated dependency update targets types or runtime behavior beyond the supported Node matrix
- **THEN** the pull request is closed or deferred with the compatibility reason recorded

#### Scenario: CI cannot start for an account reason
- **WHEN** GitHub reports that jobs did not start because of account or billing state
- **THEN** no dependency pull request is merged on the basis of that failed run
- **AND** account recovery and a fresh green run remain release prerequisites

### Requirement: Tags and releases are immutable gated actions
An application tag SHALL use the `vX.Y.Z` SemVer form, match the package and changelog version, be created only from the reviewed public main commit, and remain immutable. A GitHub release SHALL reference that exact tag and SHALL be marked as a prerelease while the project remains beta.

#### Scenario: Release gates pass
- **WHEN** the public main commit matches the approved source snapshot, required CI checks are green, documented platform claims have evidence, dependency pull requests are dispositioned, and the owner authorizes the release
- **THEN** an annotated tag matching the package version may be pushed
- **AND** one GitHub prerelease may be created from that exact tag and changelog section

#### Scenario: A release prerequisite is stale or missing
- **WHEN** CI is unavailable, the public main commit differs from the reviewed snapshot, a claimed platform lacks required evidence, or version metadata disagrees
- **THEN** tag and release creation fail closed

#### Scenario: A released defect is discovered
- **WHEN** a published immutable tag contains a non-secret defect
- **THEN** the repository preserves the tag and publishes a corrective commit and new version
