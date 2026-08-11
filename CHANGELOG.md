# Changelog

All notable changes to OpenSpec Workbench are recorded in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Deterministic documentation drift checks and a strict MkDocs documentation build.
- A fail-closed public synchronization, dependency-triage, tagging, and release procedure.

## [0.1.0] - Pending

First public beta release candidate. The immutable Git tag and GitHub prerelease
remain gated and do not exist until the release procedure is complete.

### Added

- Projects Hub for explicit machine-local project registration without filesystem scanning.
- Hub-first `npm start` and an explicit advanced one-project command requiring `--root`.
- Native macOS folder selection and a provisional Windows desktop adapter, with CLI recovery commands.
- Read-only OpenSpec plan navigation, worktree-aware activity, lifecycle metadata, and pluggable Ukrainian translation providers.
- Deterministic public-readiness, security, compatibility, bundle, and GitHub configuration checks.

### Security

- Loopback-only listeners, launch capabilities, strict Host and Origin validation, same-origin fetch metadata, per-process CSRF tokens, CSP, and canonical path containment.
- Bounded literal-argument execution for repository-owned OpenSpec commands; Workbench launches npm's JavaScript CLI without a package-manager shim, while npm retains its normal platform script semantics.

### Compatibility

- Node.js 20.20.0 or newer is required; CI targets Node.js 20.20.0 and 22.23.1.
- Consumer repositories remain pinned to their own OpenSpec command. The Workbench compatibility contract currently validates OpenSpec 1.7.0 JSON shapes.

### Known limitations

- Interactive Windows support remains provisional until a real clean-install Hub and folder-picker smoke test is recorded.
- Linux hides native registration and requires explicit CLI project registration.
- Headless environments on otherwise supported platforms fail visibly and can use the same CLI recovery path.
- The project is beta; interfaces and compatibility declarations may change before 1.0.
