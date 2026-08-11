## Context

See `proposal.md` and the `project-registration-management` specification. The Hub currently reads a private version-1 registry populated by CLI commands. A registration id is derived from its canonical root, the trusted Hub permits only project-launch POST requests, and browser responses expose registered roots. The in-progress `harden-stable-project-navigation` change will make those ids stable route components and centralize child lifecycle ownership, but it intentionally excludes browser-accessible administrative APIs.

The selected folder is a new authority boundary. Browser folder APIs do not provide a canonical server-readable path, while accepting typed paths would let an HTTP request choose arbitrary local roots. The server must therefore own native selection, validation, candidate lifetime, and final mutation. Selection also precedes trust in project-local code, so preview validation cannot invoke the consumer's package scripts or optional Git integrations.

## Goals / Non-Goals

**Goals:**

- Provide the exact approved `Add project` and `Find new folder` Finder flows from `https://plans.internal`.
- Keep selected paths and candidate identities server-side until an explicitly confirmed registry mutation.
- Preserve stable project routes across legitimate moves while preventing stale-tab overwrite and obsolete-child reuse.
- Explain linked-worktree availability without creating, deleting, pruning, or switching anything.
- Keep the native boundary injectable and deterministic for automated verification.

**Non-Goals:**

- General remote filesystem administration or a browser path-entry API.
- A durable history of removed linked worktrees.
- Automatic proof that a moved or cloned repository is the same human project.
- Full compatibility execution before the user confirms trust in the selected folder.
- Cross-platform picker parity in this change.

## Decisions

### Deliver this as a dependent standalone change

Implementation begins after `harden-stable-project-navigation` establishes stable routes and Hub-owned child lifecycle. This avoids conflicting edits to Hub routing and makes child invalidation on rebind part of one clear lifecycle contract. Folding registration into that already broad hardening change was rejected because it reverses an explicit non-goal and adds a distinct mutation and native-GUI threat surface.

### Use an asynchronous server-held registration intent

The trusted Hub creates an intent for either `add` or `rebind`; rebind includes only the stable registration id and expected revision. Creation requires the ephemeral Hub CSRF value and returns an opaque intent id. One native picker runs at a time. The browser polls the intent until it reaches `preview`, `cancelled`, or a typed error state, then confirms only an edited label and the intent id.

Candidate roots, Git evidence, and selected paths live only in bounded in-memory intent state with a two-minute TTL. They are never accepted from browser JSON, query parameters, cookies, or route segments. Intents are single-use, session-bound, and lost safely on Hub restart. Confirmation re-runs canonical and structural validation, performs bounded confirmed-project compatibility checks, and commits through a registry compare-and-swap. A synchronous long-running POST was rejected because browser disconnect, picker cancellation, and Hub shutdown are harder to model safely.

The initial route family is:

- `POST /api/project-registration-intents` with `{ operation: "add" }` or `{ operation: "rebind", projectId, expectedRevision }`;
- `GET /api/project-registration-intents/<intent-id>` for bounded polling;
- `POST /api/project-registration-intents/<intent-id>/confirm` with `{ label }`;
- `DELETE /api/project-registration-intents/<intent-id>` to cancel an active intent.

All mutation bodies reject unknown fields, use a small explicit byte limit, and require JSON. Picker creation is available only in trusted-proxy mode. Exact Host, Origin, request-target, fetch-metadata, and application-header checks run before parsing an intent or launching a process. An ephemeral per-Hub-session anti-CSRF value is delivered through a same-origin bootstrap response and required in a header. This does not claim protection from another process running as the same macOS user; it protects the browser boundary already documented by the Hub threat model.

### Open the macOS chooser without automating Finder

Use an injected picker interface whose macOS adapter launches `/usr/bin/osascript` directly with fixed AppleScript source and no shell. The script uses Standard Additions `choose folder`, never `Finder` or `System Events`, and returns one absolute POSIX path. The adapter removes exactly the one line terminator added by `osascript`, so spaces, Unicode, and embedded or trailing newlines remain unambiguous, while an impossible relative sentinel represents cancellation. The adapter maps cancellation, no GUI session, permission denial, timeout, process failure, and shutdown to typed safe results; it enforces a singleton, a bounded timeout, and child cleanup.

The original implementation used JavaScript for Automation and JSON output. The first live managed-Mac trial showed an unacceptable delay before the panel appeared, so the fixed Standard Additions AppleScript form replaced JXA. This retains the same authority and encoding guarantees with a smaller startup boundary. A project-local OpenSpec version check separately allows 30 seconds for a cold package-manager launch; projection commands retain their existing 30-second bound.

A compiled Swift/AppKit helper could provide stronger panel integration, but it would add a compiler/platform artifact to the deterministic Node bundle and installation requirements. It remains a fallback only if a managed-Mac spike proves the Standard Additions adapter cannot reliably foreground under the actual PM2 login session. Browser directory APIs and typed path input were rejected because neither establishes the canonical server-readable root required by Git and OpenSpec.

### Separate structural preview from trusted compatibility execution

`inspectCandidateRoot` is distinct from the ordinary projection snapshot. It requires the selected canonical folder to equal the Git top-level exactly, rejects a top-level symlink or path substitution, verifies `openspec/config.yaml` is a readable contained regular file, and uses bounded Git commands with optional locks and configured filesystem monitors disabled. It does not run `git status`, hooks, package scripts, or the project-local OpenSpec command.

The preview states only that an OpenSpec worktree was structurally found and displays the canonical path, detected safe name, branch or detached state, and primary/linked worktree kind. Explicit confirmation authorizes bounded compatibility execution. The root and structural evidence are checked again immediately before compatibility and immediately before the registry rename so a changed candidate fails closed.

### Migrate the registry to stable identity plus revision

Registry version 2 stores `{ id, label, root, revision }`. New ids are random opaque values independent of paths. The v1 reader maps existing records to v2 in memory while preserving their current ids, labels, and roots; it writes v2 only during an authorized mutation. Validation requires the stored root itself to remain a non-symlink canonical Git top level but no longer derives identity from the root.

Add and rebind reject a canonical root already owned by another registration. Rebind uses compare-and-swap over id, expected revision, and preceding root, increments revision, and preserves the label unless the user edits it. The confirmation names the operation honestly: it redirects a stable registration slot to the reviewed worktree. Git evidence may help display whether the candidate resembles the previous repository, but it cannot silently prove identity across every move, clone, or reinitialization.

After commit, the Hub invalidates any child and pending launch for the preceding
registration revision. A cleanup failure is reported as a safe warning while
the committed registration remains authoritative, matching removal semantics.
Stable routing resolves and revalidates the current revision before publishing
a child, preventing an in-flight old root from becoming authoritative after
rebind.

Removal uses the same owner-aware mutation lock and compare-and-swap boundary. `ProjectRegistry.remove` accepts only a stable id and expected revision, returns the removed trusted record, and commits the registry before the launcher invalidates the preceding root. The Hub exposes bodyless `DELETE /api/projects/<project-id>` with the expected numeric revision in a quoted `If-Match` header; it rejects request bodies and query parameters, so no root or path can enter the removal contract. A committed removal is authoritative even if child cleanup later reports a warning. Re-registering the folder through the existing picker is the recovery path; the Hub never invokes filesystem deletion APIs for project removal.

### Keep worktree truth derived from current Git state

The registered root is one selected Git worktree, not the whole filesystem and not a promise that every branch has plans. Branch navigation continues to enumerate local branches and maps only fresh, same-common-Git-directory worktree records that independently pass OpenSpec structural validation. A linked worktree can therefore be available, unavailable because it is missing or lacks OpenSpec, or absent after Git removes its record. A surviving branch remains visible even when it has no openable worktree.

Discovery uses the NUL-delimited Git worktree format and accounts for detached, locked, prunable, missing-directory, duplicate-branch, Unicode, and newline-path cases. Raw linked-worktree paths remain internal. The Hub never creates tombstones, borrows OpenSpec files from the registered worktree, or mutates Git to repair an unavailable branch.

### Make the approved flow accessible and localized

The Hub header places `Add project` as its primary catalogue action. The preview is a labelled dialog with focus containment, canonical path and validation summary, an editable display-name field, `Register` or `Update project`, and `Cancel`. An unavailable card replaces the disabled dead end with `Find new folder`; available cards retain normal open behavior. Progress and result messages use polite live regions, focus returns to the initiating control after cancellation/error, and the layout remains usable at narrow widths.

All exact Ukrainian copy is stored in the translation catalogue. The implementation must present the copy and responsive placement for final visual confirmation before marking the UX task complete.

Every project card also exposes a secondary `Remove from Hub` action. Its labelled confirmation names the registered project and states that the folder, Git repository, worktrees, and OpenSpec files remain unchanged. Confirmation is destructive only to machine-local navigation state, returns focus predictably, and refreshes the registry list without reloading the page.

## Risks / Trade-offs

- **PM2 may not own an active Aqua session, or the panel may appear behind another Space** → Verify the real managed-Mac login launch context, prefer the lower-overhead AppleScript Standard Additions adapter after the JXA live delay, surface `NO_GUI_SESSION`, keep an actionable browser status, and retain the Swift helper as a documented fallback decision.
- **Selecting protected Desktop, Documents, or iCloud content may succeed while Node cannot read it** → Perform post-picker access checks and map `EPERM` to a permission-specific state without requesting broader access automatically.
- **A malicious selected repository could execute code through OpenSpec or Git integration** → Perform structural preview without consumer code, require explicit confirmation before bounded compatibility execution, disable optional Git integrations, and keep raw diagnostics server-side.
- **The candidate may change between selection and commit** → Store evidence in the intent, revalidate at confirmation and pre-rename, then fail without partial mutation.
- **Rebind may intentionally point a stable bookmark at a different repository** → Show old and new roots, avoid false identity claims, and require explicit confirmation.
- **A stale tab may overwrite a newer registry value** → Require expected revision and use compare-and-swap under the existing owner-aware registry lock.
- **Registry migration could strand existing projects** → Preserve v1 ids in memory, write v2 atomically only on mutation, retain a rollback-compatible backup, and test partial-write recovery.
- **Native picker endpoints expand the trusted local attack surface** → Restrict them to trusted mode, apply authority checks before work, use short-lived server state, bound and rate-limit requests, and retain the documented same-user local threat boundary.

## Migration Plan

1. Complete and verify `harden-stable-project-navigation`, including stable routing, compatibility boundaries, child lifecycle ownership, and deterministic release activation.
2. Characterize the existing v1 registry and Hub security behavior; add failing intent, picker, candidate, migration, rebind, linked-worktree, accessibility, and hostile-request fixtures.
3. Verify a direct Standard Additions picker spike under the actual PM2 login session without changing the live registry. If foregrounding or output safety fails, update this design and tasks before choosing the Swift fallback.
4. Implement the registry v2 reader/writer and compare-and-swap operations with temporary-state migration and rollback tests.
5. Implement the injected picker, structural inspector, ephemeral intent state machine, trusted endpoints, and child-revision invalidation.
6. Implement the approved localized Hub interactions and run automated plus browser accessibility/responsive checks.
7. Verify the deterministic bundle, OpenSpec artifacts, security suite, and real managed-Mac picker flow against temporary registry state.
8. Publish and activate only with separate authorization; retain the preceding release and registry backup. Rollback restores the preceding runtime, whose v1 reader cannot consume v2, together with the pre-migration registry backup as one operation.

No consumer repository, Git state, worktree, plan, branch, standards pin, Caddy route, or unrelated PM2 process is changed by migration or rollback.
