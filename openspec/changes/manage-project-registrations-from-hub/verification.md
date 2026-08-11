## Verification Evidence

Verified on 2026-08-03 without release activation:

- `npm run openspec -- validate manage-project-registrations-from-hub --strict --no-interactive` — passed.
- `npm run typecheck` — passed.
- `npm test` — 44 tests passed, 0 failed, including add, immediate rename, rebind, single-use confirmation, and confirmation-time OpenSpec configuration substitution.
- `npm run test:e2e` — 11 tests passed, 0 failed when run with the required loopback permission.
- `npm run test:security` — trusted registration and hostile request coverage passed.
- `npm run test:contrast` — 2 tests passed, 0 failed.
- `/usr/bin/osascript -l JavaScript -e 'JSON.stringify(Path("<consumer-worktree>").toString())'` — returned the exact JSON-safe POSIX path `"<consumer-worktree>"`.
- `npm run verify:bundle` — passed twice with identical hashes: `server.mjs` `4775cfb261beb4cc2c8a01ba56499e8428a1eb915202fcc598e34ea76dceaf17`; `testing.mjs` `288b9ae9ec7b17c632ca855de79eb62ca01d75c4a5a6a2432ad82e8cda44866e`.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — passed.

reference consumer was inspected read-only at `<consumer-worktree>`. The final runtime snapshot reported `projectName: "example-project"`, `compatibility: "supported"`, `openSpecHealthy: true`, `stale: false`, branch `main`, an unchanged short HEAD, and 42 changes. Its Git status was clean before and after, full HEAD remained `<unchanged-consumer-head>`, and `standards.version` remained `v1.9.0`.

The real foreground Standard Additions picker under the managed PM2 login session and the live `https://plans.internal` flow remain activation-stage checks because they require a user-visible GUI session and separate explicit runtime activation authorization. The implementation uses an injected picker and its automated fake adapter for deterministic add/rebind coverage.

During the initial pre-activation verification, no live registry migration, release publication, PM2 restart, router change, consumer-repository mutation, commit, push, merge, or tag was performed. The later authorized activation evidence is recorded below.

## Activation Evidence

project owner authorized live activation on 2026-08-03 after confirming that the feature had to be active for browser verification.

- A private rollback directory was created at `<application-state>/backups/<activation-id>` with mode `0700`; its registry, ecosystem configuration, current bundle copy, and previous committed runtime archive have owner-only file permissions.
- The pre-activation registry backup SHA-256 is `<unchanged-registry-sha256>` and the previous committed runtime archive SHA-256 is `<previous-runtime-sha256>`.
- The activated deterministic `server.mjs` SHA-256 is `4775cfb261beb4cc2c8a01ba56499e8428a1eb915202fcc598e34ea76dceaf17`.
- Only PM2 application `openspec-workbench` restarted: its PID changed from `3978` to `95588`; every other managed application retained its preceding PID and remained `online`. The PM2 list was saved successfully.
- `https://plans.internal/` returned HTTP 200 with the expected CSP and contained `button#add-project` plus the registration dialog. `/api/bootstrap` returned `registrationAvailable: true`.
- A browser DOM walkthrough showed the localized `Додати проєкт` action and the unavailable reference consumer card's localized `Знайти нову папку` action. The live page was left open for project owner.
- A hostile loopback Host request returned HTTP 403 `HOST_REJECTED`; an unauthorized live registration POST returned HTTP 403 `MUTATION_AUTHORITY_REJECTED` without opening the picker.
- The live registry SHA-256 remained `<unchanged-registry-sha256>`; no live add or rebind was submitted during activation verification.
- reference consumer remained clean at HEAD `<unchanged-consumer-head>` with `standards.version` `v1.9.0`.

Task 7.3 remains unchecked until the user completes one real native folder selection and confirmation from the live Hub; activation, visibility, authority rejection, process isolation, backup, and rollback inputs are verified.

## Live Picker and Timeout Follow-up

project owner's first live selection on 2026-08-03 exposed two issues: the JXA Standard Additions panel appeared too slowly, and the cold project-local OpenSpec version command exceeded its 10-second bound. The failed confirmation did not mutate the registry.

- The picker now uses the lower-overhead fixed AppleScript Standard Additions form and removes exactly one `osascript` line terminator from its single absolute POSIX result. Parser fixtures pass for spaces, Unicode, embedded newlines, cancellation, and malformed relative output.
- A non-interactive AppleScript POSIX-path check completed in 0.20 seconds on the managed Mac.
- The project-local OpenSpec version boundary is now 30 seconds; other bounded projection commands remain at 30 seconds. A regression fixture proves timeout classification at a short injected bound and successful completion at a sufficient bound.
- Hub API error codes now map to localized Ukrainian picker, OpenSpec timeout, compatibility, expiry, duplicate, and conflict messages instead of exposing the English server message to the user.
- `npm run typecheck` passed, `npm test` passed 46/46, `npm run test:contrast` passed 2/2, strict change validation passed, and bundle verification passed with `server.mjs` SHA-256 `cf691dc93fa08faa740d9ff60704bd36059d3a1b907da90796ed6f0c59aa35a3` and `testing.mjs` SHA-256 `aac7a1240de2f56bfcb7e7c1a3000a57acb64b71c0e50b590c505f24fe0e11bd`.
- Only `openspec-workbench` restarted for the follow-up (`95588` to `45064`); all other managed PIDs remained unchanged and online.
- The live Hub serves the new localized client and still reports `registrationAvailable: true`.
- The registry SHA-256 remained `<unchanged-registry-sha256>`; reference consumer remained clean at HEAD `<unchanged-consumer-head>` with `standards.version` `v1.9.0`.

## Visual acceptance follow-up — 2026-08-11

project owner confirmed that he personally reviewed the live Hub registration and
rebind experience and accepted the current desktop, narrow-width, interaction,
and error-state presentation as working as intended. This closes tasks 6.1,
6.2, and 6.3. The managed-Mac smoke script, release publication evidence, and
rollback proof remain separate open work.
