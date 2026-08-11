## Why

The repository is currently shaped for private machine-local development and contains internal clone URLs, personal filesystem paths, and incomplete public-project metadata. Before publishing it on GitHub, the public snapshot must have an explicit license, clear security and contribution policies, reproducible verification, and no private operational provenance.

## What Changes

- Add an MIT license, public-facing project metadata, contribution and security policies, a code of conduct, third-party notices, and GitHub issue and pull-request guidance.
- Rewrite durable documentation and OpenSpec evidence so the public tree contains portable examples rather than private hostnames, company repositories, personal paths, process identifiers, or unrelated consumer-project details.
- Add deterministic public-readiness checks and GitHub CI/dependency-update configuration that exercise the existing verification gates without writing to consumer projects or external systems.
- Preserve dependency license notices in the deterministic bundle and document which features are portable versus optional managed-Mac integrations.
- Prepare a clean-snapshot publication procedure so the private Git history and author-email provenance are not copied to GitHub.
- Record the public GitHub destination while leaving remote mutation, push, tag, deployment, and npm publication pending explicit authorization.

## Capabilities

### New Capabilities

- `public-repository-readiness`: Defines the repository hygiene, licensing, verification, attribution, and clean-publication requirements for a public GitHub release.

### Modified Capabilities

None.

## Impact

The change affects root project metadata, durable documentation, historical OpenSpec artifacts that will be included in the public snapshot, deterministic build settings, verification scripts, and GitHub configuration. Runtime content authority, loopback/capability security, UI behavior, consumer repositories, and machine-local state remain unchanged.

Non-goals are publishing the npm package, renaming the private npm package, changing the managed `plans.internal` deployment behavior, rewriting the private repository history, pushing without an approved clean snapshot, tagging, deploying, or changing any consumer project.

Compatibility impact is limited to regenerated bundle hashes caused by preserving legal comments; the application interfaces and supported OpenSpec/standards formats do not change. The security boundary remains fail-closed: no secrets or private provenance may enter the public snapshot, and publication requires a final tracked-tree and history scan. The release strategy is a verified clean snapshot on the new public destination `https://github.com/mykola-melnik/openspec-workbench` after the project owner explicitly authorizes the exact root commit.
