# Security Policy

## Supported versions

OpenSpec Workbench is currently beta software. Security fixes are made on the latest
published release and the default branch; older releases may not receive
backports.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull
request, or planning artifact.

Use the repository's
[private vulnerability reporting form](https://github.com/mykola-melnik/openspec-workbench/security/advisories/new).
If that option is not available, contact a maintainer privately through a
verified contact method on the
[repository owner's GitHub profile](https://github.com/mykola-melnik) and
include the repository name in the subject.

Please include the affected version, impact, reproduction steps, and any safe
mitigation you have already tested. Do not include real credentials, private
plan content, capability URLs, or unrelated repository data. Maintainers will
acknowledge a complete report as soon as practical and coordinate disclosure
after a fix or mitigation is available.

## Security boundaries

The portable application binds to loopback, uses capability URLs, validates
Host and Origin, confines filesystem reads to one canonical worktree, sanitizes
rendered content, and stores derived state in a private machine-local directory.

The optional managed-Mac Hub mode deliberately replaces only the Hub capability
URL with an exact trusted reverse-proxy origin. In that mode the Hub validates
the exact Host and Origin, applies same-origin CSRF checks to mutations, and
trusts the local operating-system user and operator-managed proxy. Project
content processes retain separate ephemeral capabilities and one-root
isolation. A malicious process already running as the same local user is outside
this mode's threat boundary because it can read that user's registry directly.

A deployment that exposes the loopback listener to another machine or bypasses
the applicable capability, Host, Origin, CSRF, or path-containment controls is
outside the supported security model.

Selecting a folder for preview performs structural reads only. Confirming a
registration and opening plans invokes that trusted repository's declared
`npm run openspec -- <args>` command as the current local user. Only register
repositories whose scripts you trust; the application bounds command
arguments, output, and execution time, passes only a small environment
allowlist, and disables npm pre/post hooks, but does not treat repository-owned
code as an untrusted sandbox workload.
