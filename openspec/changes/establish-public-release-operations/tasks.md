## 1. Documentation Contract

- [x] 1.1 Add `scripts/check-docs.mjs`, focused Node tests, and `npm run check:docs`; prove with `node --test test/docs-contract.test.mjs` that stale startup commands, versions, navigation targets, changelog structure, and publication inventory fail closed.
- [x] 1.2 Reconcile `README.md` with Hub-first startup, current security checks, and evidence-backed Windows wording; run `npm run check:docs` and record a successful semantic drift check.
- [x] 1.3 Add `CHANGELOG.md` with Unreleased and `0.1.0` beta sections, compatibility and limitation notes, no references to a pending tag, last-finalized-release compare links when available, and a release-only finalized-date gate; run focused tests and prove package/changelog version agreement across the first release and a future version bump.

## 2. MkDocs and Public Inventory

- [x] 2.1 Add direct and hash-locked transitive MkDocs requirements, `mkdocs.yml`, and focused English pages for overview, getting started, security, and release operations; install with `--require-hashes`, run `python3 -m mkdocs build --strict`, and record a clean ignored output build.
- [x] 2.2 Add a least-privilege CI documentation job with pinned setup actions, dependency installation, `npm run check:docs`, and strict MkDocs build; run `npm run check:github` and prove the workflow contains no write, tag, release, or deployment permission.
- [x] 2.3 Add generated site output to `.gitignore` and update `PUBLICATION_MANIFEST.txt` for every new tracked public file; run `npm run check:public` and record exact manifest coverage.

## 3. Integrated Verification

- [x] 3.1 Update package scripts and the lockfile where required, run `npm run openspec:validate`, `npm run verify`, and the strict MkDocs build, and record that runtime bundles remain deterministic.
- [x] 3.2 Inspect the complete diff for documentation duplication, private provenance, unsafe external writes, compatibility drift, and release-gate bypasses; resolve every confirmed finding before publication preparation.

## 4. Public GitHub Synchronization

- [ ] 4.1 Confirm the GitHub account billing lock is cleared, rerun the hosted workflow on the existing public main commit, and record a run that starts actual steps; do not treat local workflow validation as a substitute.
- [x] 4.2 Prepare an isolated checkout from public GitHub `main`, apply the approved private candidate as one normal public commit, and run `npm ci`, `npm run verify`, `python3 -m mkdocs build --strict`, public history scanning, and exact diff inspection without force-pushing or joining histories.
- [ ] 4.3 Push only the reviewed public synchronization commit, confirm remote `main` matches its expected commit and tree, and record green hosted CI on that exact commit.

## 5. Pull Requests and First Release

- [ ] 5.1 Disposition each open Dependabot pull request with a recorded compatibility reason: close or defer Node 26 types, require a dedicated OpenSpec 1.8 compatibility change, and merge action updates only when full-SHA pinning and hosted CI pass; confirm obsolete Dependabot branches are removed by pull-request lifecycle.
- [x] 5.2 Record a real interactive clean-install Windows smoke test for Hub startup and folder selection, or narrow the public Windows support claim before release; rerun `npm run check:docs` against the selected claim.
- [ ] 5.3 Run `npm run verify:release`; verify package `0.1.0`, finalized changelog `0.1.0`, public main commit, green CI, platform evidence, repository tag protection, and clean tag namespace; create and push annotated immutable tag `v0.1.0`, then create one GitHub prerelease from that tag and the finalized changelog notes.
