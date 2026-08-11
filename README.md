# OpenSpec Workbench

[![CI](https://github.com/mykola-melnik/openspec-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/mykola-melnik/openspec-workbench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

OpenSpec Workbench is a read-only local web application for browsing Git-reviewed
OpenSpec plans, provenance, and task progress across explicitly registered
projects and existing Git worktrees.

> **Project status:** Beta. Interfaces and compatibility declarations may
> change before 1.0. OpenSpec Workbench is an unofficial community companion for
> [OpenSpec](https://github.com/Fission-AI/OpenSpec) and is not affiliated with
> or endorsed by Fission AI.

English repository artifacts remain authoritative. The application never
edits plans, changes branches, creates worktrees, commits, pushes, or scans the
computer for repositories.

Source content stays on the local machine unless the user explicitly selects a
translation provider. CLI providers may send screened prose to their configured
remote service; local Ollama remains loopback-only. See
[Ukrainian translation providers](#ukrainian-translation-providers) for the
full boundary.

## Requirements

- Node.js 20.20 or newer
- Git
- A current browser that sends Fetch Metadata headers on same-origin requests
- A project-local `npm run openspec -- <args>` command for each registered
  project

## Install

```bash
git clone https://github.com/mykola-melnik/openspec-workbench.git
cd openspec-workbench
npm ci
npm run verify
```

The application is installed once. Consumer repositories keep their own
OpenSpec and standards versions and receive no copy of this runtime.

## Start

```bash
npm start
```

The command starts the Projects Hub and prints a loopback-only capability URL.
Open that exact URL in the local browser, choose **Додати проєкт**, and select
the exact Git worktree root. The Hub starts empty on a clean installation and
never treats the Workbench checkout or current directory as a project.

The native folder chooser requires an active desktop session. The implementation
includes macOS and Windows adapters. macOS is the verified beta path; Windows
desktop support is provisional until a clean-install interactive smoke test is
recorded. Cancellation changes nothing. Linux hides native registration and
uses the CLI recovery commands below. Headless sessions on otherwise supported
platforms fail visibly and can use the same recovery path.

The launch token is removed from the address bar after the first authorized
load and retained only for that browser tab's session. Reloading that tab works:
the server may return the inert Hub shell without a token, while bootstrap and
every project API remain capability-protected. Opening or copying the tokenless
URL into a fresh tab shows `CAPABILITY_REQUIRED` and no project information. In
that case, use the latest complete URL printed by the running process.

## Projects Hub recovery commands

Ordinary desktop use does not require terminal registration. If the native
picker is unavailable, register and manage projects explicitly with:

```bash
npm run project:register -- --root /absolute/path/to/project --label "Project name"
npm run projects
npm run project:remove -- --project <project-id>
```

`npm run hub` remains an alias for the ordinary Hub startup:

```bash
npm run hub
```

The registry stores only a generated id, a user-authored label, and the
canonical project root in the operating system's private user state directory.
It stores no plan content, credentials, process URLs, or capabilities.

The Hub does not scan the filesystem. It launches a separate one-root process
for each selected project or existing worktree and validates that process's
identity before navigation.

### Optional managed-Mac local domain

The portable default is the loopback capability URL printed by `npm start`.
On an explicitly managed development Mac, Caddy can expose the Hub at
`https://plans.internal` and proxies it to the loopback-only
`127.0.0.1:4057` listener. PM2 runs the deterministic committed bundle with:

```bash
npm run hub:local
```

This explicit trusted-local-proxy mode removes the Hub capability from the
stable browser URL. It accepts only the exact `plans.internal` Host and
`https://plans.internal` Origin, emits no CORS permission, and requires the
application marker, `Sec-Fetch-Site: same-origin`, and a per-process CSRF token
for Hub mutations. Project and worktree content keeps a separate ephemeral
capability and one-root process.
The Hub proxy mode trusts the local operating-system user and operator-managed
proxy; it is not a sandbox against another process already running as that same
user. See [SECURITY.md](SECURITY.md) for the complete boundary.

This integration is optional and its Caddy/PM2 configuration is not installed
or managed by this repository. The registry remains explicit-only and
machine-local. Restarting the
`openspec-workbench` PM2 process or reloading Caddy does not scan or mutate consumer
repositories. To roll back the machine integration, stop only that process,
restore the operator's local configuration backup, and reload Caddy.

## Development

```bash
npm run build
npm run typecheck
npm test
npm run test:e2e
npm run verify:bundle
npm run check:public
npm run check:docs
npm audit --audit-level=high
```

Repository documentation is built with pinned MkDocs tooling:

```bash
python3 -m pip install --require-hashes --requirement requirements-docs.txt
npm run docs:build
```

The strict build writes only ignored derived output. See the
[documentation sources](docs/index.md), [release procedure](docs/release-operations.md),
and [changelog](CHANGELOG.md).

For diagnostics or integration work, an advanced one-project process remains
available and requires one explicit absolute canonical root:

```bash
npm run project -- --root /absolute/path/to/project
```

On Windows, quote the absolute path when it contains spaces:

```powershell
npm run project -- --root "C:\Users\Example\My Project"
```

Running the one-project role without a root, with a relative root, or through a
noncanonical alias fails before a listener is opened. This mode does not expose
Hub registration routes.

`PUBLICATION_MANIFEST.txt` is the exact sorted inventory for a public source
snapshot. When a tracked public file is added, removed, or renamed, update that
manifest in the same change; `npm run check:public` fails closed on any mismatch.
Dependency and build-tool updates must also run `npm run build` and commit the
matching `dist/` outputs before `npm run verify:bundle` can pass.

OpenSpec planning is repository-local:

```bash
npm run openspec -- list --json
npm run openspec:doctor
npm run openspec:validate
```

## Compatibility

Supported project-local OpenSpec CLI versions and JSON adapters are declared in
`compatibility.json`. Optional standards provenance never gates access. An
unsupported CLI version or unknown output shape fails closed with a visible
compatibility state; the application never guesses status or upgrades a
consumer project.

## Community and licensing

Contributions are welcome under [CONTRIBUTING.md](CONTRIBUTING.md). Please
follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and report vulnerabilities
privately as described in [SECURITY.md](SECURITY.md). The project is available
under the [MIT License](LICENSE); dependency and build-tool attribution is recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Register projects from the Hub

On the portable capability URL or optional trusted local site, use **Додати
проєкт** to open the native macOS picker or provisional Windows desktop picker.
Select the exact Git worktree root. The Hub first performs a
non-executing structural preview, shows the canonical folder, branch, worktree
kind, and an editable display name, and writes nothing until **Зареєструвати
проєкт** is confirmed.

Confirmation authorizes the bounded project-local OpenSpec compatibility
check. A compatible OpenSpec CLI and known JSON responses are required; no
central standards Markdown file is required, and `standards.version` is
optional provenance. The selected repository remains unchanged.

When a registered folder has moved or disappeared, use **Знайти нову папку**
on its card. The confirmation dialog shows the old and new locations. A
successful rebind preserves the stable project URL and display name unless the
name is edited. Branches remain visible independently; only branches with an
existing readable OpenSpec worktree can be opened, and the application never
checks out or creates one.

Use **Видалити з Hub** to remove an obsolete registration from the list. The
confirmation is explicit: only the machine-local registry record is removed;
the project folder, Git repository, worktrees, and OpenSpec files are not
changed or deleted.

The picker requires an active macOS login GUI session or interactive Windows
desktop session. Windows desktop support remains provisional until the recorded
clean-install smoke gate passes; Windows services, Session 0, and headless hosts
are not supported. Cancellation changes nothing. Permission, timeout,
incompatible OpenSpec, expired selection, and concurrent-update failures are
shown without exposing raw process diagnostics. The CLI registration commands
remain available as a recovery fallback, but are not required for ordinary
registration on the verified macOS path.

The structural folder preview does not execute project code. Confirmation and
subsequent plan reads do execute the selected repository's explicit
`npm run openspec -- <args>` script as the current local user. Workbench invokes
npm's validated JavaScript CLI through the running Node executable instead of a
Windows `.cmd` shim. Register only
repositories you trust to run code. This command is the consumer repository's
authority boundary; OpenSpec Workbench bounds its arguments, output, and time,
passes only a small runtime environment allowlist, and disables npm pre/post
hooks, but does not sandbox the repository-owned script from the current user's
filesystem permissions.

## Ukrainian translation providers

The selected **English**, **Українська**, or **Поруч** presentation is retained
as a browser-local preference. On reload, accepted matching translations are
restored from the private machine-local cache without launching a provider or
sending text anywhere. The selected provider is retained as a browser-local
preference. A new browser profile starts with no provider, while an existing
validated `agy` preference remains compatible. Uncached blocks retain the exact
English fallback until an available provider is explicitly selected.

The built-in choices are AGY, Claude Code, Codex CLI, Gemini CLI, Qwen Code,
Kimi Code, and local Ollama. Workbench does not install, upgrade, authenticate,
or purchase access to any of them. CLI providers reuse the current local user's
existing CLI authorization and may send screened blocks to their configured
remote model service. Settings disclose that destination before translation.
Ollama is different: it uses only the fixed `http://127.0.0.1:11434` endpoint
and an already installed model selected from Ollama's local model list. It does
not accept another host and never downloads a model.

Every CLI runs non-interactively from an owner-private empty temporary working
directory through a fixed provider profile. The shared runner uses no shell,
bounds arguments, time, stdout, and stderr, terminates the process tree, and
removes the temporary directory. Provider-specific safe, sandbox, no-tools,
no-customization, and no-session flags are applied where supported. Output must
match the strict translation schema and preserve protected technical tokens;
unexpected tool or approval events fail closed. No executable, arguments,
working directory, environment, endpoint, or model download can be supplied by
the browser.

Opening a plan while **Українська** or **Поруч** is selected automatically sends
only screened uncached blocks through the explicitly selected available
provider. **English** never launches translation. Safe UI messages distinguish
missing authorization, quota or balance limits, timeouts, output bounds, and
invalid output without exposing raw provider diagnostics. Successful blocks
remain provider-qualified in the private cache even when a later request fails.
The exact English artifact remains authoritative and is always available.

Plan source content is projected once per worktree watcher generation and
reused by detail, translation-cache, and translation requests. Proposal,
design, and tasks appear before strict status and validation finish; verification
updates from the shared background result. While a provider is active, the plan
header names it, shows the missing-block count, and keeps the exact English
source readable.

## Observable live activity

On a stable Hub worktree route, the project logo returns to the Projects Hub so
another registered project can be selected or added. A standalone workbench
keeps the logo bound to its current authorized worktree instead of attempting
to enter a Hub it does not own.

The **Activity** control shows up to 100 newest-first events observed by the
current one-root content process: OpenSpec source or HEAD changes, snapshot
refresh, strict verification, and selected-provider translation start and
terminal states.
A confirmed source-change event shows up to twelve sorted paths relative to the
worktree root and restricted to `openspec/`, plus a remaining-path count when
needed. A confirmed HEAD event shows only the previous and new short revisions.
Absolute paths, file content, and inferred authorship remain excluded.
The protected activity endpoint restores that process-local list after a page
reload, and the existing server-sent event stream delivers new entries to the
open page immediately.

After a confirmed watcher change, the open page marks its projection stale and
automatically requests a fresh authoritative snapshot. It updates the sidebar
and the currently selected plan in place, preserves the reading mode, and
coalesces changes that arrive while refresh is running. If the selected plan no
longer exists it selects the first remaining plan or shows the empty state. A
bounded refresh failure leaves the last safe projection visible and asks for a
manual page reload as fallback.

This list is operational feedback, not durable history or an audit log. It does
not expose hidden model reasoning, prompts, plan content, absolute paths, raw
diagnostics, capabilities, or credentials, and it does not attribute a file
change to AI or a person without authoritative evidence. Restarting the child
content process clears its activity list.

## Local state and rollback

On macOS, registry and accepted translation cache state live under
`~/Library/Application Support/OpenSpec Workbench/`. On Windows they live under
`%LOCALAPPDATA%\OpenSpec Workbench\`. Other platforms use their normal per-user
application state directory.

Rollback stops the local process and restores a preceding immutable
application version. It does not change project files, Git state, OpenSpec
artifacts, or standards pins.
