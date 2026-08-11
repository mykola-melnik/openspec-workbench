# Contributing

Thank you for helping improve OpenSpec Workbench.

## Before starting

- Search existing issues and OpenSpec changes for overlapping work.
- Use an issue for bugs and small maintenance changes.
- Discuss user-visible UX, new integrations, security-boundary changes, and
  broad compatibility changes before implementation.
- Do not include private plans, credentials, capability URLs, personal paths,
  internal repository names, or machine-specific verification evidence.

## Development workflow

1. Use Node.js 20.20 or newer and install the locked dependencies with
   `npm ci`.
2. Create or update an English OpenSpec change for committed product work.
3. Keep the application read-only: it must not edit plans, switch branches,
   create worktrees, commit, push, or scan for repositories.
4. Put Ukrainian UI copy in translation catalogs rather than components or
   server routes.
5. Run `npm run verify`, `npm audit --audit-level=high`, and
   `npm run check:public` before opening a pull request.
6. Keep `PUBLICATION_MANIFEST.txt` sorted and update it whenever a public file
   is added, removed, or renamed.

## Pull requests

Keep changes focused and explain the user-visible outcome, security and
compatibility impact, and verification evidence. Link the owning OpenSpec
change when one exists. Generated release files must be rebuilt through the
repository scripts and committed whenever source, dependency, or build-tool
changes alter their bytes.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository and that you have the right to submit it.
