# Release operations

Public tags and GitHub releases are manual, immutable, fail-closed actions. They
do not publish npm packages or deploy the documentation site.

## Local candidate gates

1. Update `CHANGELOG.md`, the README, MkDocs sources, and the publication manifest together.
2. Run `npm run check:docs` to detect semantic documentation drift.
3. Install the hash-locked documentation dependencies from `requirements-docs.txt`.
4. Run `npm run verify`; this keeps ordinary development compatible with machines that do not have the optional Python documentation environment.
5. Inspect the complete candidate diff and public snapshot for private provenance and unexpected files.

## GitHub synchronization

The public repository and private development repository intentionally have
different histories. Prepare a temporary checkout from public `main`, apply the
approved candidate tree as one normal commit, and verify that exact tree. Never
force-push and never join the private history into the public repository.

GitHub Actions must start actual steps and pass on the exact public commit. A
local workflow configuration check cannot replace a hosted run blocked by an
account or billing issue.

## Dependency pull requests

- Node types must remain aligned with the supported Node 20/22 runtime matrix.
- OpenSpec upgrades require a dedicated compatibility review and adapter tests.
- GitHub Actions remain pinned to full commit SHAs and require green hosted CI.
- Close, defer, or merge the pull request with the reason recorded; allow the pull-request lifecycle to remove its Dependabot branch.

## Version and release

Before the first beta release:

1. Replace `Pending` in the `0.1.0` changelog heading with the release date and add the canonical `0.1.0` and Unreleased reference links.
2. Run `npm run verify:release`; unlike the development gate, it fails while the package-version changelog section is still `Pending` and includes the strict MkDocs build.
3. Confirm package version `0.1.0`, changelog version `0.1.0`, and clean tag `v0.1.0` agree.
4. Confirm hosted CI is green and every public platform claim has matching evidence or is explicitly provisional.
5. Create annotated tag `v0.1.0` on the reviewed public main commit and push only that tag.
6. Create one GitHub prerelease from the exact tag using the finalized changelog section.

If a normal defect is found after release, preserve the tag and publish a new
patch version. Sensitive-data incidents use the separate security response
procedure.
