## Purpose

Provides a stable locally trusted HTTPS address and supervised machine
lifecycle for the read-only Projects Hub without weakening project isolation.

## ADDED Requirements

### Requirement: Hub is available at one stable local address

The system SHALL expose the Projects Hub at `https://plans.internal` through
the machine-level local TLS router and SHALL bind its upstream listener only to
`127.0.0.1:4057`.

#### Scenario: User opens the stable address
- **WHEN** the supervised Hub and local router are healthy and the user opens `https://plans.internal`
- **THEN** the Hub loads without a capability token in the public URL

#### Scenario: Upstream is addressed directly with another host
- **WHEN** a request reaches port `4057` with a Host other than the exact approved local domain
- **THEN** the Hub rejects the request without exposing project registration data

#### Scenario: Machine restarts or user logs in again
- **WHEN** the user-level process supervisor restores saved applications
- **THEN** the same stable address becomes available without changing project repositories or browser bookmarks

### Requirement: Trusted-proxy mode rejects cross-origin authority

The Hub SHALL treat the stable domain as a narrow trusted-local-proxy mode,
SHALL emit no CORS permission, and SHALL validate request authority in the
application rather than relying only on the router.

#### Scenario: Same-origin read arrives
- **WHEN** a GET or HEAD request has the exact approved Host and has no Origin or the exact approved HTTPS Origin
- **THEN** the Hub serves the requested read-only Hub resource

#### Scenario: Cross-origin read arrives
- **WHEN** a request carries another Origin, a null Origin, an absolute foreign request target, or a forged forwarded host
- **THEN** the Hub rejects it and emits no access-control allow header

#### Scenario: Same-origin project launch arrives
- **WHEN** the Hub client sends a POST with the exact approved Origin, the required application-client header, and non-cross-site fetch metadata
- **THEN** the Hub may launch the selected explicitly registered project through the existing isolated launcher

#### Scenario: Untrusted project launch arrives
- **WHEN** a POST omits or changes the approved Origin or client header, or reports cross-site fetch metadata
- **THEN** the Hub rejects it without starting a child process

### Requirement: Stable Hub trust does not extend to project content

Every project and worktree content process SHALL retain one canonical root,
an ephemeral capability, loopback-only binding, and identity verification.

#### Scenario: User selects a registered project
- **WHEN** the stable Hub launches a registered project
- **THEN** navigation opens the verified one-root child URL with its distinct ephemeral capability

#### Scenario: Child capability is missing or belongs to another process
- **WHEN** a browser requests project content without that child's current capability
- **THEN** the child rejects access and exposes no OpenSpec content

### Requirement: Machine integration is isolated and reversible

The local router and process supervisor SHALL manage OpenSpec Workbench without
restarting, reconfiguring, or mutating unrelated product repositories.

#### Scenario: OpenSpec Workbench is restarted
- **WHEN** the operator restarts only the `openspec-workbench` process
- **THEN** other supervised applications continue running and the saved project registry remains available

#### Scenario: Local integration rolls back
- **WHEN** the route and supervised process are disabled or restored from the pre-change backup
- **THEN** consumer projects, standards pins, Git state, and authoritative OpenSpec artifacts require no recovery
