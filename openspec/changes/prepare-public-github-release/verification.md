# Verification

Date: 2026-08-11

## Public-source gate

- `PUBLICATION_MANIFEST.txt` is the exact sorted publication inventory. The
  readiness gate rejects missing entries, unapproved tracked or unignored
  entries, symlinks, binary or invalid-UTF-8 inputs, private filesystem roots,
  private contact details, and high-confidence credential forms.
- `npm run test:public` passes portable-text, injected-secret, binary,
  invalid-UTF-8, and unapproved-untracked-file cases without printing secret
  contents.
- `npm run check:public` passes the complete manifest with zero findings.
- The private repository history is ineligible for publication. The publication
  procedure creates a separate one-root `main` history, normalizes every file to
  mode `100644`, and compares the committed path set exactly with the manifest.

## Legal and ownership gate

- The project is licensed under MIT with Mykola Melnik identified as the
  copyright holder.
- The project owner confirmed the right to publish the original code under MIT
  and accepted the dependency and toolchain attribution in
  `THIRD_PARTY_NOTICES.md`.
- Security, contribution, conduct, issue, and pull-request guidance is present
  and contains no private contact detail.

## Repository and application gates

- OpenSpec doctor is healthy.
- Strict OpenSpec validation passes 11/11 items.
- TypeScript typecheck passes.
- The application, unit, and E2E suite passes 80/80 tests.
- The focused security suite passes 4/4 selected tests.
- The contrast suite passes 2/2 tests.
- The public-readiness suite passes all cases.
- `npm audit --audit-level=high` reports zero vulnerabilities.
- `git diff --check` passes.

## Deterministic distribution

`npm run verify:bundle` rebuilds and matches all four committed release files:

- `server.mjs`: `1ab62061c4d6f185dc8aab2ce804751cda49b96d98b0dd231e7383aeedc89b89`
- `testing.mjs`: `0adf0160c5b2d9b751eb7b8b562916ee06b2a6d13441e646ed6b3725bb1bbda9`
- `LICENSE`: `bdfcaab84b5617bf39f179357057399e02e42078de8c3fe9baa90bbcf40f671e`
- `THIRD_PARTY_NOTICES.md`: `5cd6463a7a8e6cc57157820bbda4ed26c787ffff1b999644c5d051ba96e561d2`

The build retains end-of-file legal comments and copies the project license and
toolchain/dependency notice into each release output directory. Dependency or
build-tool updates must regenerate and commit these outputs before CI passes.

## GitHub automation

- Checkout and Node setup actions are pinned to full commit SHAs.
- Workflow permissions are limited to `contents: read` and checkout credentials
  are not persisted.
- CI tests Node 20.20.0 and 22.23.1, runs `npm ci`, `npm run verify`, and
  `npm audit --audit-level=high`, and contains no push, release, publish, or
  deployment step.
- Dependabot covers npm and GitHub Actions on conservative schedules. Generated
  bundle updates remain an explicit maintainer follow-up when dependency bytes
  change.

## Publication control

The approved destination is
`git@github.com:mykola-melnik/openspec-workbench.git`. Publication eligibility
is decided from an exact clean snapshot outside the source commit: its root
commit, tree, full diff, history scan, clean-worktree result, dependency audit,
and independent review are presented immediately before the authorized push.
Embedding a candidate's own commit identity or transient review session in this
file would be self-referential operational provenance, so those values remain
in the private release handoff only.

No tag, GitHub release, npm publication, deployment, or consumer-project change
is part of the initial source push.
