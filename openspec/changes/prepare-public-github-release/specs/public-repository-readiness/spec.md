## Purpose

Defines the privacy, licensing, verification, attribution, and publication contract required before distributing the repository as a public GitHub project.

## ADDED Requirements

### Requirement: Public snapshot excludes private provenance
The public repository snapshot SHALL exclude credentials, private repository URLs, personal filesystem roots, private consumer-project evidence, runtime process identifiers, and other machine-specific operational provenance. Deliberately synthetic values used by security tests MUST be clearly bounded as fixtures and MUST NOT identify a real person or organization.

#### Scenario: Tracked-tree readiness scan succeeds
- **WHEN** the public-readiness check inspects every tracked file selected for the public snapshot
- **THEN** it reports no prohibited private-provenance marker or credential pattern
- **AND** it exits non-zero with a safe file-relative diagnostic when a prohibited marker is present

#### Scenario: Private history is not published
- **WHEN** the GitHub repository is initialized from the approved public snapshot
- **THEN** private commit history, author-email provenance, and removed operational evidence are absent from the public Git object graph

### Requirement: Public legal and community metadata is complete
The repository SHALL declare an OSI-compatible project license, package license metadata, security reporting instructions, contribution guidance, a code of conduct, and public project status. Security guidance MUST provide a private reporting route and MUST NOT ask reporters to disclose vulnerabilities in a public issue.

#### Scenario: Required metadata is present
- **WHEN** a contributor opens the public repository root
- **THEN** the project license, contribution guide, security policy, code of conduct, and project status are directly discoverable

#### Scenario: Vulnerability reporting stays private
- **WHEN** a contributor finds a security vulnerability
- **THEN** the security policy directs them to a private GitHub reporting mechanism or repository-owner contact configured for that purpose

### Requirement: Public documentation distinguishes portable and managed integrations
The public README SHALL describe the application as an unofficial community companion for OpenSpec, identify its beta/read-only local scope, and distinguish portable runtime behavior from optional deployment-specific integrations. Examples SHALL use generic paths and repositories unless a hostname is intentionally part of a documented deployment option.

#### Scenario: New contributor evaluates portability
- **WHEN** a contributor reads the setup and compatibility documentation
- **THEN** they can identify the supported Node and OpenSpec expectations, the portable commands, optional managed-Mac features, privacy boundaries, and the absence of any affiliation claim with the upstream OpenSpec maintainers

### Requirement: Public automation is deterministic and non-authoritative
GitHub automation SHALL install pinned dependencies and run the repository's existing validation, typecheck, unit, security, build, bundle, and audit gates without changing consumer repositories, Git refs, tags, deployments, or authoritative OpenSpec plans.

#### Scenario: Pull request verification
- **WHEN** a pull request changes tracked project files
- **THEN** GitHub automation runs the documented public verification gates from a clean checkout
- **AND** reports failure without performing external writes when any gate fails

### Requirement: Distributed bundle retains required notices
The deterministic release bundle SHALL preserve dependency legal notices required for redistribution, and the repository SHALL expose third-party attribution sufficient to identify bundled runtime dependencies and their governing licenses.

#### Scenario: Bundle verification includes legal output
- **WHEN** the release bundle is rebuilt twice from the same tracked inputs
- **THEN** the outputs remain byte-for-byte deterministic
- **AND** required legal comments or notice files remain present in the release contents

### Requirement: Publication requires explicit destination and authorization
The repository SHALL NOT be pushed, tagged, deployed, or published until the final GitHub destination is recorded, all public-readiness gates pass, ownership authorization is confirmed, and the owner explicitly authorizes the external write.

#### Scenario: Destination is not yet known
- **WHEN** the GitHub repository URL has not been supplied
- **THEN** preparation may produce a verified local public snapshot
- **AND** remote configuration, push, tag, deployment, and package publication remain pending

#### Scenario: Publication gate is satisfied
- **WHEN** the final destination is recorded, ownership is confirmed, the clean snapshot passes every required gate, and explicit push authorization is given
- **THEN** only the approved clean snapshot is eligible for publication
