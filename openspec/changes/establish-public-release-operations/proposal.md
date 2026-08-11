## Why

The public GitHub repository is behind the current private development tree, its CI jobs cannot start because of an account billing lock, and the project has no durable changelog, documentation site, or repeatable release checklist. Establishing explicit documentation and release gates is necessary before the first immutable public tag and GitHub release can be trusted.

## What Changes

- Add a deterministic documentation drift gate that verifies documented commands, supported-runtime claims, release metadata, and the public file inventory against repository-controlled facts.
- Add and maintain `CHANGELOG.md` as the canonical human-readable release history using SemVer and an Unreleased section.
- Add a minimal MkDocs site generated from repository-owned documentation, with a local strict build check and no automatic deployment or external write.
- Define a fail-closed public GitHub synchronization and release checklist covering CI health, Windows support evidence, pull-request disposition, immutable tags, GitHub prereleases, and rollback.
- Reconcile README claims with the current Hub-first startup and the evidence actually available for Windows support.
- Keep billing repair, GitHub account administration, npm publication, force-pushing, and automatic release publication outside repository automation.

## Capabilities

### New Capabilities

- `public-release-operations`: Defines documentation drift detection, changelog and documentation-site maintenance, public-repository synchronization, dependency-update triage, and immutable tag/release gates.

### Modified Capabilities

- `public-repository-readiness`: Extends public readiness from initial publication hygiene to repeatable documentation and release evidence.

## Impact

The change affects repository documentation, public-readiness scripts and tests, package scripts and development dependencies, GitHub workflow validation, the publication manifest, and release procedures. It does not change the Workbench runtime API, project content authority, local capability security, consumer repositories, or OpenSpec compatibility behavior.

Compatibility impact is limited to documentation tooling that runs in development and CI; the shipped application remains compatible with the existing Node 20.20.0 and 22.23.1 matrix. The security boundary remains fail-closed: generated documentation cannot become an authority source, CI receives no release credentials, and public synchronization must not rewrite the private history or force-push the public branch. The release strategy is to repair the external CI account state, synchronize a reviewed clean public snapshot, obtain green gates and platform evidence, then create an annotated immutable `v0.1.0` tag and GitHub prerelease as separately verified external actions.

Non-goals include npm publication, GitHub Pages deployment in this change, changing application UI or navigation, automatically merging dependency updates, and claiming interactive Windows release support without reproducible evidence.
