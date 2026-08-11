## Why

OpenSpec plans are authoritative and reviewable in Git, but their Markdown
layout does not give project owner a fast Ukrainian overview of direction, active work,
and task progress across day-to-day worktrees. A dedicated machine-local
read-only workbench can make those plans easier to consume without creating a
second planning system or coupling the application lifecycle to any consumer's
standards pin.

## What Changes

- Move the prototype from the unreleased standards feature branch into the
  dedicated `solo/openspec-workbench` repository as the sole application source.
- Install or clone one machine-local application instance with its own version,
  update, rollback, and loopback launch lifecycle. A bookmarkable stable local
  address remains a follow-up to the verified migration.
- Provide one loopback-only workbench server per Git worktree with a fixed,
  canonical repository root.
- Keep ordinary launch scoped to the current project while adding an optional
  Projects Hub that lists only explicitly registered machine-local projects
  and opens each project or worktree in an isolated one-root process.
- Show the current branch plus up to five recently updated local branches for
  the current repository; open only branches that already have a worktree and
  never switch branches or create worktrees from the UI.
- Show branch, revision, dirty-state provenance, OpenSpec changes, artifact
  summaries, and task progress from the selected worktree.
- Keep English OpenSpec files as the only authoritative state while offering a
  clearly marked Ukrainian derived reading view for essential planning blocks.
- Cache translations locally by content and translation-contract version;
  never write translated plans into a consumer repository.
- Keep only the integration contract, compatibility metadata, and conformance
  expectations in central standards; do not distribute application source or
  runtime through each consumer's `.standards` checkout.
- Give both Hub and project browser tabs one recognizable application identity
  through the approved self-contained OpenSpec circle-and-check favicon.
- Apply the approved shared visual system to the Hub and project shells: a
  forest-green application frame, mint verified and selected states, and
  neutral reading surfaces in automatic light and dark appearance without
  changing navigation, copy, interaction, or responsive information order.
- Release the application independently and verify it against one consumer
  before broader machine-local registration.

The MVP is read-only. It does not add comments, edit OpenSpec files, switch Git
branches, create worktrees, commit, push, scan the computer for repositories,
aggregate several worktrees into one mutable content runtime, or replace the
OpenSpec CLI.

## Capabilities

### New Capabilities

- `openspec-workbench`: Local, worktree-scoped, provenance-aware rendering of
  OpenSpec plans and task progress with an optional Ukrainian derived view.

### Modified Capabilities

None.

## Impact

- Application repository: standalone Node toolchain metadata, OpenSpec
  workflow, source, tests, deterministic build, release artifacts, and local
  installation documentation.
- Central repository: integration contract, compatibility metadata, and
  conformance fixtures only; no duplicated application runtime.
- Consumers: explicit machine-local registration only; existing standards
  pins, OpenSpec files, dependencies, and product runtimes remain unchanged.
- Runtime boundary: local Node process bound only to loopback, with strict
  filesystem containment, Markdown sanitization, Host/Origin validation, and
  no external page resources.
- Navigation boundary: project registration is explicit machine-local state;
  the Hub is a launcher/catalogue, not a multi-root content reader, and branch
  navigation never changes Git state.
- Presentation boundary: the Hub and workbench share one accessible brand
  system while long-form plan content stays on neutral high-contrast surfaces;
  the approved redesign changes no product authority or interaction contract.
- Translation boundary: English source blocks remain authoritative; Ukrainian
  translations are derived through the installed AGY CLI after disclosure that
  screened plan text is sent to Gemini/Google and while the reader's persisted
  non-English mode is active. Accepted translations are cached in private
  machine-local state.
- Compatibility: the workbench must declare and test supported standards and
  OpenSpec version pairs. Unknown formats fail visibly instead of guessing.
- Release: application tags are immutable and independent from standards tags;
  rollback restores the preceding machine-local application version without
  changing any consumer repository.
