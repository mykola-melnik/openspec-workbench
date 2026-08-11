# Candidate release notes: v0.1.0

Status: proposed only. No application tag or deployment is created by this
change.

## Added

- Standalone read-only OpenSpec Workbench source, tests, deterministic build, and
  self-contained Node runtime.
- One-process-per-worktree Git provenance, plan navigation, exact task progress,
  strict validation projection, and stale-snapshot signaling.
- Loopback capability URLs, fixed-root filesystem containment, Host/Origin/CSP
  protections, inert repository-text rendering, and safe diagnostics.
- Explicit private machine-local project registration and a Hub that launches
  identity-checked isolated one-root processes without scanning repositories or
  proxying plan content.
- Current-plus-five-recent local branch navigation, full local search, and
  opening of only already existing readable OpenSpec worktrees.
- Ukrainian-first application chrome with exact English source fallback and a
  user-confirmed AGY CLI translator with explicit Gemini/Google transmission,
  protected-token validation, and private local caching.
- A compatibility manifest declaring OpenSpec `1.7.x`, standards `1.6.x` through
  `1.8.x`, and fail-closed behavior for unknown formats.

## Install and run

```bash
git clone https://github.com/mykola-melnik/openspec-workbench.git
cd openspec-workbench
npm install
npm run verify
npm run start -- --root /absolute/path/to/project
```

Optional Hub commands:

```bash
node dist/server.mjs register --root /absolute/path/to/project --label "Project name"
node dist/server.mjs projects
node dist/server.mjs remove --project <project-id>
npm run hub
```

## Consumer impact

The application is installed once per machine. It does not change consumer
dependencies, standards pins, OpenSpec artifacts, product routes, or Git state.
Rollback stops the process or restores a preceding application version.
