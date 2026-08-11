# Verification

Date: 2026-08-11

## Local documentation and release gates

- `node --test test/docs-contract.test.mjs` passed 8 focused cases covering consistent metadata, stale startup instructions, version drift, finalized dates, missing and escaping MkDocs targets, malformed changelog structure, and publication omissions.
- `npm run check:docs` passed with commands, versions, navigation, changelog, and publication inventory in agreement.
- MkDocs 1.6.1 was installed in a git-ignored local virtual environment from `requirements-docs.txt`; `.codex-runtime/mkdocs-venv/bin/python -m mkdocs build --strict` completed without warnings and wrote only `.workbench-docs-site/`.
- `npm run check:github` passed with full-SHA actions, workflow-level `contents: read`, no job permission overrides, and no write, tag, release, publication, or deployment commands.
- `npm run check:public` passed with 172 publication files before this verification note was added; the manifest was then updated and rechecked.
- `npm audit --audit-level=high` reported zero vulnerabilities.

## Initial integrated application gates

The figures in this section describe the initial candidate checkpoint and are
superseded by the correction checkpoint below; they are retained as historical
evidence rather than claims about the final committed bundle.

- `npm run openspec:validate` passed 13 strict specs and changes with zero failures.
- `npm run verify` passed outside the restricted network sandbox because the E2E suite requires temporary loopback listeners. Evidence included 91/91 core, compatibility, UI, and E2E tests; 5/5 selected security tests; 2/2 contrast tests; 13/13 public and documentation tests; documentation, public-tree, and GitHub configuration checks; and byte-identical deterministic bundle verification.
- At that initial checkpoint, the verified bundle hashes were:
  - `server.mjs`: `5107d19c100b27aff5749a881e1f7d59cab8500949c632434a2f4f9d9cc8bc97`
  - `testing.mjs`: `0ea438e370c8d54de5dc28330772cbb6ba9e64e792988e2e1aa20645a63f07a3`
  - `LICENSE`: `bdfcaab84b5617bf39f179357057399e02e42078de8c3fe9baa90bbcf40f671e`
  - `THIRD_PARTY_NOTICES.md`: `5cd6463a7a8e6cc57157820bbda4ed26c787ffff1b999644c5d051ba96e561d2`

## Release gate disposition

- Public Windows documentation now describes the implemented desktop adapter as provisional. This satisfies the release claim gate without pretending that the pending clean-install interactive smoke test has occurred.
- An isolated git-ignored clone was created from public `main` at `eed10738a3aa605b6ffcd2eaf3144f1e9748b66d`. The candidate was applied as one normal child commit with the public noreply author identity; its two reachable commits excluded the private development graph, its tree matched the approved private candidate exactly, and `npm ci`, `npm run verify`, and the strict MkDocs build passed inside that clone.
- At local candidate verification time, the public GitHub repository was at commit `eed10738a3aa605b6ffcd2eaf3144f1e9748b66d` and its five CI runs had failed before executing steps. The run annotation reported an account billing lock, so hosted CI and external release operations were still pending at that checkpoint.
- At the same checkpoint, the available in-app browser session was not signed in to GitHub and the local `gh` CLI was unavailable. No GitHub pull request, branch, tag, release, billing, or repository setting had been changed by the local implementation phase.

## Claude finding correction evidence

This public-release verification file owns the integrated evidence for the
release candidate and its dependent Hub change; the Hub correction does not
create a second verification authority.

- A correction pass addressed the independent Claude Opus 5 findings before public synchronization: tokenless authorized-tab reload now serves only the inert Hub shell while bootstrap remains bearer-protected; explicit roots normalize harmless trailing separators and Windows path case while still rejecting aliases; unsupported picker platforms do not expose a nonfunctional registration action; and injected picker processes cannot bypass the platform guard.
- The OpenSpec and public security wording now distinguishes Workbench's literal `shell: false` npm JavaScript CLI invocation from npm's normal platform semantics for the trusted repository-owned `scripts.openspec` entry.
- `requirements-docs.in` pins the direct MkDocs requirement and `requirements-docs.txt` now locks all 17 resolved packages with artifact hashes. Installation with `--require-hashes` succeeded in an ignored Python 3.12 environment, and the strict MkDocs 1.6.1 build completed without warnings.
- The development documentation gate no longer advertises a pending tag. A future pending package version compares from the latest finalized release, while `npm run check:release` fails closed until the package-version heading has a real date and canonical tag links. The release-specific `npm run verify:release` also includes the strict MkDocs build.
- `npm run verify` passed outside the restricted listener sandbox with 13/13 OpenSpec validations, 93/93 application tests, 5/5 selected security tests, 2/2 contrast tests, 15/15 public/documentation tests, all repository checks, and deterministic bundle hashes `fde4052b79424751f273671c746ad99ae0e09496bbd08a68973e936073c6509b` for `server.mjs` and `8f44d743cd33dbd4d437bcaf4f8e051cb24b9311204b8e1434a09b16e1e7c01d` for `testing.mjs`.
- `npm audit --audit-level=high` reported zero vulnerabilities. The release-only gate was also exercised in the current pre-tag state and correctly failed only because `0.1.0` is still marked `Pending`; hosted CI, tag protection, tag creation, and release creation remain external blocked gates rather than locally claimed successes.

## Final documentation correction checkpoint

- The final low-severity correction documented the Fetch Metadata browser requirement in both entry points, extended the drift gate to the MkDocs getting-started page and patch-level Node minimums, and made latest-finalized-release selection independent of changelog heading order.
- `node --test test/docs-contract.test.mjs` passed 12/12 focused cases. The complete `npm run verify` then passed with 13/13 OpenSpec validations, 93/93 application tests, 5/5 selected security tests, 2/2 contrast tests, and 17/17 public/documentation tests plus all documentation, public-tree, GitHub-configuration, and deterministic-bundle gates.
- The hash-locked MkDocs 1.6.1 strict build passed again without warnings. Runtime bundle hashes remained `fde4052b79424751f273671c746ad99ae0e09496bbd08a68973e936073c6509b` for `server.mjs` and `8f44d743cd33dbd4d437bcaf4f8e051cb24b9311204b8e1434a09b16e1e7c01d` for `testing.mjs` because the final correction changed documentation checks and evidence only.

## Independent final review

- Claude Opus 5 reviewed the isolated public candidate `8a5d732b4fa82bc6933efc19ea1113c4d015683e` at tree `bac389e4464192e09fe072ca05488c07490b6872` with high reasoning effort.
- The initial review and two delta-only correction rounds used the same campaign. The final structured verdict was `APPROVED`, with stable findings C-001 through C-015 all `CLOSED` and no open blocking or non-blocking findings.
- The reviewer explicitly approved a private `main` commit and one normal non-force public `main` synchronization commit. This review did not approve a tag or release; those operations remain gated by finalized changelog metadata, hosted CI, and the other external prerequisites recorded above.
