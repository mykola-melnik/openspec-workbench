# Verification

Verified on 2026-07-31 from the standards branch
`codex/add-openspec-workbench` and the application branch
`codex/migrate-openspec-workbench`.

## Standalone application gate

- `npm run openspec:doctor` — healthy with zero findings.
- `npm run openspec:validate` — 1 item passed, 0 failed.
- `npm run typecheck` — passed with zero diagnostics.
- `npm test` — 21 tests passed, 0 failed, including compatibility manifest,
  OpenSpec 1.7 adapters, unknown-format rejection, explicit registry,
  branch/worktree isolation, security, translation boundaries, and UI contracts.
- `npm run verify:bundle` — deterministic rebuild passed with hashes:
  - `server.mjs`: `7736be5912166da9581e84995dd1c2224e7b16d6346ce101338868e99d93b9ac`
  - `testing.mjs`: `79e11191ef53881a246cbe637ed8ac429228515396c88133bfa9c4f742c1b21f`
- `npm run test:e2e` — 6 tests passed, 0 failed outside the filesystem
  sandbox because the suite must bind to `127.0.0.1`. It covered capability,
  Host, Origin, traversal, standalone launch, explicit Hub registration,
  differing standards pins, child identity, CLI registration, and read-only
  branch navigation.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — passed.

## Real reference consumer no-mutation proof

The standalone runtime launched directly from the application repository with
reference consumer as its fixed root. `/api/snapshot` reported:

- project: `example-project`;
- branch: `main`;
- HEAD: `<unchanged-consumer-head>`;
- dirty: `false`;
- compatibility: `supported`;
- OpenSpec changes: 32;
- local branches: `main`, `codex/warehouse`, `codex/workforce`, and
  `codex/valvix`.

Before and after startup, snapshot reading, and shutdown:

- reference consumer Git status remained clean and HEAD unchanged;
- reference consumer `.standards` status remained clean at exact tag `v1.8.0`;
- no consumer file, dependency, standards pin, product route, Git ref,
  translation cache, tag, or deployment changed.

## Central standards gate

- `npm run openspec:doctor` — healthy with zero findings.
- `npm run openspec:validate` — 1 item passed, 0 failed.
- `npm test` — 27 tests passed, 0 failed after updating the installation-kit
  contract fixture for standalone ownership.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — passed.
- Application source, runtime, build scripts, and application-specific package
  commands were removed from the unreleased branch. The exact deleted files
  remain recoverable from commit `f7ed1f6`.
- `common/openspec-workbench.md` remains as the central integration and
  conformance contract, and the kit points to `solo/openspec-workbench`.

## Final visual acceptance and refreshed release gate

project owner confirmed on 2026-08-11 that he personally reviewed the live OpenSpec
Workbench, including its desktop and narrow-screen presentation, and accepted
the current visual behavior as working as intended. No translated private plan
content was stored in Git.

The refreshed application gate passed on the same date:

- `npm run verify` — OpenSpec doctor healthy, all 8 active changes passed strict
  validation, TypeScript passed, 80 tests passed, 4 focused security tests
  passed, 2 contrast tests passed, and the deterministic bundle matched.
- `npm audit --audit-level=high` — 0 vulnerabilities.
- `git diff --check` — passed.

The disposable multi-project and multi-worktree coverage and the recorded real
reference consumer no-mutation proof remain the release evidence for task 9.7. No
application or standards tag, push, merge, deployment, or consumer upgrade was
performed as part of this acceptance.
