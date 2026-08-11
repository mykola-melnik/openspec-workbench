## Context

See `proposal.md`. The application already separates a machine-local catalogue from capability-protected one-root child processes, and the child launcher already uses `process.execPath`, the currently loaded server module, literal arguments, and an identity handshake. The failures are at the public entrypoint, portable registration gate, macOS-only picker selection, package-manager shim execution, and terminal loading presentation.

This change depends on `manage-project-registrations-from-hub` for server-held intents, structural candidate inspection, explicit confirmation, stable registry identity, and child invalidation. It must preserve the managed `https://plans.internal` route while making the portable loopback capability Hub a complete onboarding surface.

## Goals / Non-Goals

**Goals:**

- Make Hub-first launch the only ordinary user journey without weakening per-worktree child isolation.
- Make portable registration authoritative only after the exact Hub capability and same-origin mutation checks pass.
- Support native selection in interactive macOS and Windows desktop sessions without moving path authority into the browser.
- Preserve the existing project-local `npm run openspec -- ...` contract while removing Workbench's direct `.cmd` invocation and command-text construction from the Windows path.
- Turn every terminal initial load failure into a bounded visible state.

**Non-Goals:**

- Replacing the local web application with Electron, Tauri, or another desktop shell.
- Supporting remote pickers, services, Session 0, typed paths, automatic discovery, or package installation.
- Changing the OpenSpec JSON compatibility matrix or consumer ownership boundary.

## Decisions

### Make the Hub the default CLI role and keep one-root serving explicit

`npm start` will build and run the server with `--hub`; `npm run hub` remains a compatibility alias. The standalone role remains available through an advanced script and the Hub launcher, but CLI parsing requires exactly one absolute `--root` value before `startWorkbench` can bind. Lexically harmless syntax such as a trailing separator and Windows path-case differences is normalized before comparing with `realpath`; symlink aliases and roots that resolve elsewhere still fail. `startWorkbench` continues to canonicalize and validate independently, so a compromised or buggy parent cannot widen the child's root.

Removing the one-root server was rejected because it is the isolation boundary that prevents the Hub from becoming multi-root content authority. Keeping the current cwd fallback was rejected because an installed Workbench checkout is not a user-selected consumer project.

### Authenticate portable bootstrap before exposing mutation state

The Hub will keep exact `127.0.0.1:<port>` Host validation and no CORS. In portable mode, the root query capability is stored in session storage, removed from browser history, and then required as a bearer token for bootstrap and every API request. The root document is an inert static shell and may be returned without a query capability so the authorized tab can reload after URL cleanup; it contains no project, registration, or mutation state. Bootstrap moves behind capability authentication and returns the per-process random CSRF value only to an authorized client.

Every POST or DELETE will require the exact authority Origin, `X-OpenSpec-Client`, non-cross-site fetch metadata, and `X-OpenSpec-CSRF`. Trusted-proxy reads retain their existing no-token behavior and exact public Host/Origin rules. Registration routes remain implemented only by `startHub`; the shared server bundle does not make them reachable from `startWorkbench` children. CSP remains external-resource-free and `Referrer-Policy: no-referrer` remains mandatory.

Deriving CSRF from the capability was rejected as unnecessary coupling: an independently random per-process value is safe once bootstrap itself is capability-authenticated, rotates with the process, and is never returned to an unauthenticated caller.

### Reuse server-held intents in portable mode

Portable and trusted Hub modes will share the existing opaque 192-bit intent id, two-minute TTL, singleton picker, single-use confirmation transition, structural preview, confirmation-time reinspection, compatibility verification, and compare-and-swap registry mutation. Since a Hub process has one capability and portable callers must present it on every intent request, the process capability is the intent's session boundary; another local tab without the capability cannot read or redeem the intent.

No route accepts a filesystem path. The picker result remains in server memory and is converted into a public preview only after exact Git-root and contained `openspec/config.yaml` inspection.

### Add a fixed Windows native picker adapter

Select the picker by `process.platform`. The Windows adapter directly spawns the built-in Windows PowerShell executable with `shell: false`, `-NoProfile`, `-NonInteractive`, and `-STA`, and one fixed script containing no request-derived value. The script checks for an interactive user session, opens one `System.Windows.Forms.FolderBrowserDialog`, and writes either a cancellation sentinel or the selected absolute path encoded as UTF-8 base64. The Node adapter bounds stdout/stderr, decodes one value, validates the absolute Windows shape, enforces the existing two-minute timeout, and kills the helper on timeout or Hub shutdown.

PowerShell path input, interpolated scripts, `cmd.exe`, browser directory handles, and typed paths were rejected. A compiled helper would improve native integration but adds a new build artifact and remains a future fallback if live Windows verification exposes a PowerShell/WinForms limitation.

### Run npm's JavaScript CLI through Node, never its platform shim

The consumer package script remains the trust boundary documented by the application. The runner first reads the canonical project's bounded `package.json` and fails with `OPENSPEC_SCRIPT_MISSING` if the exact `scripts.openspec` entry is absent or invalid. It then resolves an approved npm JavaScript CLI path from the application launch environment (`npm_execpath`) or a bounded platform installation candidate, validates an absolute regular JavaScript file, and executes:

```text
process.execPath <npm-cli.js> run --silent openspec -- <literal args...>
```

This preserves custom repository-owned scripts and npm semantics while preventing Workbench from invoking the Windows `.cmd` shim or constructing shell text. On every platform, the Node-driven JavaScript CLI is required. Resolution failure is reported as `OPENSPEC_RUNNER_UNAVAILABLE`; Workbench never falls back to `powershell -Command npm`, `shell: true`, a native `npm` shim, or reconstructed command text. The repository-owned npm script remains trusted code and retains npm's normal platform script semantics, including npm's use of the platform command interpreter.

Directly resolving only `@fission-ai/openspec/bin/openspec.js` was rejected because the published contract intentionally delegates to a project-local npm script, which may be a reviewed wrapper while still returning the supported JSON shapes.

### Make failures typed from runner to client

Runner resolution, missing script, process spawn, non-zero exit, timeout, output limit, unsupported version, and invalid JSON remain distinct safe `WorkbenchError` codes. Registration maps them to actionable localized states. The project client applies a bounded timeout to initial JSON requests; its top-level failure handler replaces both the project-title placeholder and status region, clears `aria-busy`, and does not leave `Loading` as terminal content. Existing project-open controls restore their enabled retry state after child launch or handshake failure.

## Risks / Trade-offs

- [Windows PowerShell or WinForms is unavailable or blocked by policy] → Fail visibly without a shell fallback, preserve CLI registration as recovery, and perform a real interactive Windows smoke test before release.
- [An unauthenticated caller probes bootstrap for mutation state] → Place bootstrap after capability authentication in portable mode and add hostile-request tests proving no CSRF or availability disclosure.
- [A future mutation route forgets one authority check] → Centralize POST/DELETE authority validation before route-specific parsing and cover every mutation family in security tests.
- [The npm JavaScript CLI path differs across Node distributions] → Prefer validated `npm_execpath`, cover standard Windows and Unix layouts, expose a runner-resolution diagnostic, and never trade failure visibility for shell execution.
- [Changing `npm start` surprises beta users] → Keep `npm run hub` as an alias, document the advanced explicit-root command, and print the new Hub banner without auto-registering cwd.
- [Client request timeout races a slow but valid OpenSpec command] → Set the browser bound above the server's bounded compatibility/projection command window and keep retries idempotent.

## Migration Plan

1. Complete the dependent registration and stable-navigation boundaries or characterize their current verified interfaces before overlapping edits.
2. Add failing CLI-role, portable-authority, child-route-negative, picker, runner, and loading-state tests.
3. Implement Hub-first CLI parsing and portable bootstrap/mutation authorization without enabling the Windows picker yet.
4. Implement and unit-test the Windows picker and direct npm JavaScript CLI runner, then verify macOS behavior remains unchanged.
5. Update localized copy, README, public manifest if needed, and deterministic `dist/` outputs.
6. Run strict OpenSpec validation, typecheck, complete tests, security tests, public checks, bundle verification, and dependency audit; perform a real Windows interactive smoke test before claiming Windows release support.
7. Publish or activate only with separate authorization. Rollback restores the preceding deterministic bundle and command documentation; registry format and consumer repositories require no rollback.
