## Verification Evidence

Verified on 2026-08-03 without release activation:

- `npm run openspec -- validate harden-stable-project-navigation --strict --no-interactive` — passed.
- `npm run openspec:doctor` — healthy with no status findings.
- `npm run openspec:validate` — 4 changes passed, 0 failed.
- `npm run typecheck` — passed.
- `npm test` — 44 tests passed, 0 failed.
- `npm run test:e2e` — 11 tests passed, 0 failed when run with the required loopback permission.
- `npm run test:security` — 3 selected hostile/trusted tests passed, 0 failed, 8 unrelated tests skipped.
- `npm run test:contrast` — 2 WCAG contrast tests passed, 0 failed.
- `npm run verify:bundle` — passed twice with identical hashes: `server.mjs` `4775cfb261beb4cc2c8a01ba56499e8428a1eb915202fcc598e34ea76dceaf17`; `testing.mjs` `288b9ae9ec7b17c632ca855de79eb62ca01d75c4a5a6a2432ad82e8cda44866e`.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — passed.

The first sandboxed `npm run test:e2e` attempt was denied permission to bind `127.0.0.1`; the same unchanged suite passed outside the filesystem sandbox with loopback-only permission. This was an execution-policy limitation, not a test failure.

No release was published or activated, no PM2 process or router configuration was changed, and no commit, push, merge, or tag was created.

## Integrated review evidence — 2026-08-10

The cumulative local delivery was reviewed from an isolated bundle with initial
baseline diff digest
`74298d189d7a5f90e7a0de8d67bb5690a81e26b5270e3864304ca5a8b2099904`.
The two bounded correction patches had SHA-256 digests
`8655e060d052333b4e8b2f895295feaf263074adf79d3db558572ac5fa64faac`
and
`9dc1907d110c8e7ded6379e5a31807f2ad6abb74a8e6c1cfcfb9e48f3a2d6c93`.

- Claude Code `claude-opus-5`, high effort, completed one initial review and
  two bounded correction resumes. Final verdict: `APPROVED`; findings C-001
  through C-011 are closed.
- Independent integrated review with `gpt-5.6-terra`, high effort, completed
  after the same two correction rounds. Final verdict: `APPROVED`; the stable
  routing, registration TOCTOU, translation-generation, privacy-screening,
  compatibility-state, AGY disclosure, and activity-state findings are closed.
- The challenger panel recorded DeepSeek `ACCEPT`; its single low-confidence
  path-normalization claim was rejected against deterministic URL parsing and
  hostile-route evidence. Kimi and Qwen outputs were not accepted as reviews
  because their adapters changed their isolated copies and triggered the
  read-only mutation guard.

Final deterministic gates passed after all corrections:

- `npm run verify` — passed: OpenSpec doctor healthy, 7/7 strict changes,
  TypeScript, 72/72 tests, 4 selected security tests, 2/2 contrast tests, and
  bundle verification.
- `npm audit --audit-level=high` — 0 vulnerabilities.
- `git diff --check` — passed.
- Final bundle hashes: `server.mjs`
  `cf460438347806be4549f138d3bcc57fb2ff91c82c6d8d490a2408473ec3bc02`;
  `testing.mjs`
  `ca2763483f1b24d86ad78c6178431068d9f1692ae61b805a4ead14f1a5bbdc92`.

No release was published or activated, and no PM2 process, router
configuration, consumer repository, push, merge, or tag was changed during
this review campaign.

## Visual acceptance follow-up — 2026-08-11

project owner confirmed that he personally reviewed the live Workbench navigation and
artifact interaction and accepted the current desktop and narrow-width visual
behavior as working as intended. This closes the visual walkthrough portions
of tasks 6.1 and 6.2; release publication, machine integration, reboot, and
rollback evidence remain separate open work.
