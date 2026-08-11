## Context

See `proposal.md` for motivation. The private development repository and public GitHub repository intentionally have different histories: the public repository began as a sanitized root snapshot, while the private repository retained its original history. The current public branch is stale, all hosted jobs fail before their first step because of account billing state, and repository automation must remain read-only.

OpenSpec plans remain the authoritative planning record. README, changelog, MkDocs pages, generated site output, GitHub pull requests, tags, and releases are publication views or delivery records and cannot replace that authority.

## Goals / Non-Goals

**Goals:**

- Detect release-relevant documentation drift without network access.
- Maintain a small, strict MkDocs site and conventional changelog with pinned tooling.
- Make public synchronization reproducible without joining unrelated histories or force-pushing.
- Separate repository failures from GitHub account failures and gate immutable release actions on actual hosted evidence.
- Provide a repeatable disposition for automated dependency pull requests.

**Non-Goals:**

- Automatic GitHub Pages deployment, npm publication, or unattended dependency merging.
- Rewriting private or public history.
- Adding a second planning system or editing consumer repositories.
- Changing Workbench runtime behavior or user interface.

## Decisions

### 1. Add a purpose-specific Node documentation contract check

`scripts/check-docs.mjs` will read repository-controlled files and validate exact structural facts: package version and scripts, Node support statements, required README sections and commands, changelog headings and compare links, MkDocs navigation targets, release procedure, and publication inventory. It will expose pure validation helpers for focused tests and perform no network or filesystem writes.

This complements rather than replaces MkDocs strict mode. MkDocs catches site configuration and link problems; the Node check catches semantic drift between documentation and application metadata. Alternatives considered were README substring checks embedded in unrelated tests and a remote link checker. The first hides ownership and the second is nondeterministic and network-dependent.

### 2. Use minimal pinned MkDocs without a third-party theme

The repository will keep the direct MkDocs pin in `requirements-docs.in`, compile every transitive documentation dependency and artifact hash into `requirements-docs.txt`, use the built-in theme, and generate into an ignored directory. CI will install the hash-locked Python documentation environment in a separate least-privilege job and run `mkdocs build --strict`; the canonical Node verification will always run the network-free documentation contract check.

A themed documentation framework was rejected for the first release because it adds dependency and styling maintenance without improving the release contract. GitHub Pages deployment is deferred because it requires a separate public hosting and permissions decision.

### 3. Keep one concise documentation source set with explicit ownership

The README remains the installation and quick-start entry point. MkDocs pages cover getting started, security model, release operations, and changelog access without duplicating the entire README. OpenSpec artifacts remain the only detailed behavior and planning authority. The documentation check owns cross-file version and command consistency.

### 4. Synchronize the public tree through a new commit on public main

The public GitHub main branch will be fetched into a separate temporary publication checkout. The approved private candidate tree will be applied as a reviewed file-level update on top of the existing public root history, preserving the public branch and avoiding `--force` or an unrelated-history merge. The exact resulting tree, diff, and public-readiness evidence will be inspected before push.

Rollback before push is deletion of the temporary checkout. Rollback after push is a corrective commit; public history is rewritten only under a separate confirmed secret-removal incident procedure.

### 5. Treat tag and release as separate fail-closed operations

The release checklist requires matching package, changelog, and tag versions; green hosted CI on the exact public main commit; evidence for platform claims; resolved dependency PR disposition; and explicit owner authorization. The first beta release is an annotated `v0.1.0` tag followed by a GitHub prerelease whose notes are derived from `CHANGELOG.md`.

No workflow receives credentials to create tags or releases. Manual commands make each external mutation visible and independently auditable. A dedicated local release verification composes the complete repository checks, strict MkDocs build, and finalized-changelog gate; GitHub-hosted CI, tag namespace checks, and repository tag-protection settings remain external prerequisites and cannot be replaced by a local success.

### 6. Record dependency-update decisions instead of bulk branch deletion

Dependabot branches are lifecycle artifacts of their pull requests. The project will close or merge the pull request with a reason and allow GitHub to delete the branch. Node type packages must align with the supported runtime matrix, OpenSpec upgrades require compatibility validation, and GitHub Action updates require a green workflow and pinned full commit SHA.

## Risks / Trade-offs

- [GitHub billing remains locked] → Complete all local work, keep release gates blocked, and provide the exact account action and rerun required from the owner.
- [MkDocs introduces Python tooling beside Node] → Pin one minimal dependency, isolate it to documentation commands and a separate CI job, and keep runtime bundles unchanged.
- [README and site duplicate facts] → Keep README as quick start, site pages as focused operational guides, and enforce shared facts with `check:docs`.
- [Public synchronization accidentally includes private provenance] → Build on public main in an isolated checkout and rerun publication inventory, secret/provenance, history, and diff checks before push.
- [Interactive Windows evidence is unavailable] → Describe the adapter as implemented but keep release-support claims and immutable release actions blocked or explicitly scoped until real evidence exists.
- [A Dependabot update looks green but changes compatibility] → Require compatibility-specific evidence in addition to generic CI.

## Migration Plan

1. Add documentation sources, pinned tooling, drift checks, and verification coverage to the private main branch.
2. Reconcile README claims and changelog entries with the exact release scope.
3. Run OpenSpec validation, the complete local verification suite, a strict MkDocs build, and public snapshot checks.
4. Repair the GitHub account billing state and rerun the existing hosted workflow.
5. Create a temporary checkout from public GitHub main, apply the approved tree update as a normal commit, inspect the exact diff and history, and push only that commit.
6. Rerun hosted CI on public main and disposition the existing dependency pull requests.
7. After platform evidence and version metadata agree, create the annotated tag and prerelease as separate explicit external actions.

If any pre-push gate fails, discard the temporary publication checkout. If a post-push verification fails, add a corrective public commit and do not tag. If a post-release defect is found, preserve the immutable tag and prepare a new patch version.
