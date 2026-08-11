## 1. Public Source Audit

- [x] 1.1 Add a fail-closed `npm run check:public` script that inspects tracked publication inputs for prohibited private URLs, personal filesystem roots, private consumer evidence, runtime identifiers, and high-confidence credential patterns; prove both clean-pass and disposable injected-failure behavior without printing file contents.
- [x] 1.2 Sanitize durable documentation, agent guidance, compatibility metadata, tests, and current/archived OpenSpec artifacts so `npm run check:public` reports zero prohibited markers while preserving generic security fixtures and intentional optional `plans.internal` deployment documentation.

## 2. Legal and Community Metadata

- [x] 2.1 Add the MIT `LICENSE`, package license metadata, public project status, unofficial OpenSpec relationship disclosure, and portable-versus-managed feature guidance; verify all root links and commands from a clean-tree reading path.
- [x] 2.2 Add `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `THIRD_PARTY_NOTICES.md`, and GitHub issue/pull-request templates with private vulnerability reporting guidance and no personal contact details.
- [x] 2.3 Expand `.gitignore` for local settings, environment files, IDE state, coverage, and temporary publication artifacts; prove `git ls-files` contains none of the excluded local-only files.

## 3. Deterministic Distribution and GitHub Automation

- [x] 3.1 Preserve dependency legal comments in deterministic bundle output, regenerate release artifacts, and run `npm run verify:bundle`; record byte-identical bundle verification and retained legal-notice evidence.
- [x] 3.2 Add least-privilege GitHub CI and conservative Dependabot configuration; validate the workflow syntax and prove it runs `npm ci`, `npm run verify`, `npm audit --audit-level=high`, and no push, tag, deployment, or consumer-write step.
- [x] 3.3 Add `npm run check:public` to the canonical verification path and update durable verification documentation so local and GitHub gates use the same public-readiness authority.

## 4. Local Release Gate

- [x] 4.1 Run `npm run openspec:validate`, `npm run verify`, `npm audit --audit-level=high`, `npm run check:public`, and `git diff --check`; record exact passing counts, bundle hashes, audit outcome, and tracked-tree scan outcome in `verification.md`.
- [x] 4.2 Review `git diff --cached --check` when a publication snapshot is staged and manually inspect the complete selected diff for secrets, private provenance, dependency/license integrity, English durable prose, and absence of consumer product changes; leave staging, commit, and external writes unperformed during preparation.

## 5. Destination-Dependent Publication

- [x] 5.1 After project owner supplies the final GitHub owner/repository URL, update README clone links, package repository/homepage/bugs metadata, compatibility schema identifiers, security links, and repository badges together; rerun all gates from task 4.1.
- [x] 5.2 Confirm ownership and licensing authority, run a dedicated secret/history scanner over the exact clean-snapshot object graph, and prove the private commits and author-email provenance are absent.
- [x] 5.3 Prepare a separate clean main-branch snapshot and present its exact destination, root commit, tree hash, scan evidence, and diff for explicit authorization; do not add a remote, push, tag, create a release, deploy, publish to npm, or change a consumer repository without that authorization.
