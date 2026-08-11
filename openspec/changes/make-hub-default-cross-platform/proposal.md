## Why

A fresh Windows user can currently run the application and receive a standalone project shell that silently treats the Workbench repository as the selected project, exposes no project-registration action, and then fails because the repository-pinned OpenSpec command is invoked through a platform-incompatible `npm` executable path. The public application needs one obvious Hub-first launch that can register and open projects safely on both macOS and Windows.

## What Changes

- **BREAKING** Make `npm start` launch the Projects Hub instead of implicitly binding a standalone workbench to the current directory.
- Retain the one-root workbench only as an internal and advanced isolation command that requires an explicit absolute canonical `--root` and fails before listening when the root is missing or invalid.
- Allow the loopback capability-protected Hub, not only the managed HTTPS Hub, to create and confirm server-held registration intents after capability, exact Host/Origin, application-header, fetch-metadata, and CSRF checks.
- Add a bounded native Windows folder picker alongside the existing macOS picker without accepting browser-supplied filesystem paths or scanning for repositories.
- Replace direct package-manager shim execution with `process.execPath` execution of the resolved npm JavaScript CLI and literal arguments. Workbench does not construct shell text; npm retains its normal platform semantics for the trusted repository-owned `scripts.openspec` entry.
- Distinguish runner-resolution, missing-script, process-failure, timeout, and compatibility failures and ensure a terminal API failure never leaves the project shell at `Loading`.
- Preserve the managed `https://plans.internal` mode, explicit registry semantics, one-root child isolation, capability separation, and read-only consumer-repository boundary.

Non-goals:

- Accepting typed or browser-supplied filesystem paths, scanning the computer for projects, or auto-registering the current directory.
- Removing the internal one-root process model or widening a child process to multiple repositories.
- Adding LAN, remote, multi-user, Windows service, or headless folder-selection support.
- Executing package-manager command shims through `cmd.exe`, a shell, or interpolated command text.
- Modifying consumer repositories, Git state, worktrees, branches, OpenSpec artifacts, or dependency pins.

## Capabilities

### New Capabilities

- `cross-platform-hub-onboarding`: Portable capability-protected Hub registration and native macOS/Windows folder selection with server-held paths and bounded local authority.

### Modified Capabilities

- `openspec-workbench`: Changes the ordinary launch from implicit current-project mode to Hub-first mode, makes standalone roots explicit, makes pinned OpenSpec invocation cross-platform without a package-manager shim, and requires terminal loading failures to become visible diagnostics.

## Impact

- Application: package scripts, CLI routing, Hub bootstrap and mutation authorization, registration-intent ownership, native picker adapters, OpenSpec runner resolution, client failure rendering, localization, tests, documentation, and committed deterministic bundles.
- Security: the portable Hub capability becomes mutation authority, so bootstrap authentication, exact loopback Host and Origin enforcement, per-process CSRF, same-capability intent binding, no-CORS policy, inert CSP, no-referrer policy, and Hub-role-only route mounting remain fail-closed requirements.
- Platform compatibility: macOS managed-domain behavior remains supported; interactive Windows desktop sessions gain native selection and direct npm JavaScript CLI invocation; unsupported or headless sessions fail visibly.
- Consumer impact: existing registrations remain machine-local and compatible; ordinary `npm start` changes meaning, while advanced one-project invocation remains available only with an explicit root. No consumer files or Git/OpenSpec state are changed.
- Release: ship through the deterministic beta release flow after the dependent Hub registration behavior is verified; document the command migration, preserve the preceding bundle for rollback, and make no deployment, tag, push, or consumer activation without separate authorization.
