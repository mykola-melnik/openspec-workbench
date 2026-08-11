# Security model

OpenSpec Workbench is a machine-local convenience application, not a sandbox
against another process already running as the same operating-system user.

## Local server

- Listeners bind only to loopback.
- Portable launches require an unguessable capability URL.
- Trusted local-domain mode requires exact Host and Origin values.
- Hub mutations require the application marker, same-origin fetch metadata, and a per-process CSRF token.
- CSP and cross-origin response protections remain enabled.

## Filesystem and execution

- Projects are registered explicitly; the application does not scan the computer.
- Each content process is confined to one canonical Git worktree root.
- Project files and Git state remain read-only to the Workbench.
- A registered repository's explicit OpenSpec npm command runs as the current user, so only trusted repositories should be registered.
- Workbench invokes npm's validated JavaScript CLI with literal arguments and `shell: false`; it never launches a package-manager batch shim or reconstructs command text.
- The trusted repository's `scripts.openspec` entry still runs with npm's normal platform script semantics, including npm's platform command interpreter. This repository-owned script is part of the explicit trust boundary.

## Reporting vulnerabilities

Follow the repository `SECURITY.md` policy and use GitHub private vulnerability
reporting. Do not include credentials, private repository contents, or live
capability URLs in public issues.
