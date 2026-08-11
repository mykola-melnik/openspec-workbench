## Context

See `proposal.md` for motivation and the `openspec-workbench` delta spec for
observable behavior. Consumer projects keep immutable, gitignored standards
checkouts and repository-local Git-reviewed OpenSpec plans. The workbench is a
projection over that state, not a replacement planning application.

The prototype was implemented only on an unreleased standards feature branch.
Before any consumer adoption, application ownership moves to the dedicated
`solo/openspec-workbench` repository. The standards repository retains the
integration contract but no application source or runtime.

## Goals / Non-Goals

**Goals:**

- Ship one reproducible, independently versioned machine-local runtime.
- Keep the runtime fixed to one canonical worktree root and one Git snapshot
  epoch at a time.
- Make the common single-project path the default while offering optional
  navigation across explicitly registered projects and existing worktrees.
- Reuse the consumer's pinned OpenSpec CLI for authoritative change/status
  discovery while rendering repository artifacts for human reading.
- Provide a Ukrainian-first reading surface without duplicating plans in Git.
- Make local-server, filesystem, Markdown, translation, and release boundaries
  executable rather than convention-only.

**Non-Goals:**

- Editing, commenting, applying patches, committing, pushing, or switching Git
  branches.
- A mutable server that owns several worktrees or repositories.
- Automatic repository discovery, branch switching, or worktree creation.
- A new plan database, hosted service, or production route inside a consumer
  product.
- Silent remote translation or automatic translation of whole repositories.
- Reimplementing OpenSpec validation, evidence ownership, or artifact status
  rules in the UI.

## Decisions

### Own the application in a dedicated repository

Source, tests, build tooling, OpenSpec artifacts, and self-contained release
runtime live in `solo/openspec-workbench`. The application is cloned or installed
once per machine and has its own immutable versions, update path, and rollback.
No consumer installs dependencies or stores application state inside
`.standards`.

Central standards owns only the versioned integration contract, compatibility
metadata, and conformance expectations. This separates the machine-scoped Hub
from per-project standards pins and avoids selecting an arbitrary consumer
checkout as the source of a shared runtime. Keeping application source in
standards was rejected after the product evolved from an ephemeral one-root
tool into a persistent multi-project launcher with an independent lifecycle.

### Bind one server process to one worktree

The launcher resolves `realpath(root)`, the common Git directory, worktree
identity, branch or detached state, HEAD SHA, and dirty state before listening.
The canonical root is immutable for the process lifetime. Git commands use
argument arrays and a fixed working directory; no shell command construction
is allowed.

The client receives a snapshot epoch containing worktree identity, HEAD ref,
and HEAD SHA. Watchers cover `openspec/**` and the worktree-specific HEAD, with
a low-frequency revision poll as a missed-event fallback. HEAD changes make
the rendered snapshot visibly stale. Filesystem notifications are treated as
change hints rather than proof: the watcher confirms a bounded content digest
of regular files and symbolic-link identities below `openspec/` before it
invalidates a page. This avoids false stale banners from non-authoritative
metadata or watcher events while still detecting repeated edits in an already
dirty worktree. A future hub may list and link isolated
instances, but it will not share their mutable root or cache identity.

One multi-root content process was rejected because a request parameter would choose
the filesystem authority for every read and future write. Per-worktree
processes make the safest root selection structural.

### Keep project and branch navigation outside content authority

Ordinary launch remains `--root <current-project>` and shows no other project.
An optional Hub reads a versioned machine-local registry containing only a
user-authored label and canonical root for each explicitly registered project.
It never scans parent directories, searches the computer for repositories,
reads OpenSpec artifacts, proxies project content, or stores plan data.

The Hub may start the reviewed immutable runtime with a fixed argument array
for a registered root. Each child selects its own port and capability and
retains the existing one-root filesystem, snapshot, cache, and compatibility
boundaries. Capabilities remain in memory and per-tab session state, never in
the registry or logs. Manual one-root URLs remain a fallback.

Inside a project instance, branch metadata comes from fixed-cwd argument-array
Git commands. The selector keeps the current branch visible, then shows at
most five other local branches ordered by committer date; search can reveal
the remaining local branches. `git worktree list --porcelain` establishes
which branches already have an independently readable worktree. Selecting an
existing worktree opens or launches its isolated instance. A branch without a
worktree stays visible but disabled with an explanation. The runtime never
runs `git switch`, `git checkout`, `git worktree add`, or a remote fetch.

The registry is machine-local navigation state rather than a project or plan
database. Registration is a deliberate CLI action outside the read-only plan
surface. Missing, moved, symlink-escaped, incompatible, or no-longer-OpenSpec
roots fail visibly and are never repaired automatically.

The machine-local Hub owns its launch lifecycle and private in-memory
capability. A persistent stable address and secret are deferred to a separate
security design. The Hub still never becomes filesystem content authority:
registered projects open through isolated one-root child processes with
ephemeral capabilities and identity handshakes. The persistent secret,
registry, and child capabilities are absent from Git and logs.

### Delegate authoritative status to the pinned OpenSpec CLI

The workbench invokes the consumer's canonical repository command for JSON
list, status, and validation data and validates the returned schema against an
explicit compatibility adapter. It reads Markdown only for presentation and
task text; it does not infer artifact validity or replace central evidence
checks. Unknown output versions stop the affected projection with a clear
compatibility state.

A copied status parser was rejected because it would become a second OpenSpec
contract and drift across standards releases.

### Use a loopback capability URL and a deny-by-default renderer

The server binds to `127.0.0.1` on an available port and generates an
unguessable per-process capability in the launch URL. It validates Host and
Origin, disables permissive CORS, serves no external client resources, applies
a restrictive Content Security Policy, and returns no raw filesystem errors.

Every artifact path is canonicalized and checked beneath the fixed worktree
root after symlink resolution. Markdown is parsed without executing embedded
HTML; unsafe schemes, active attributes, and remote media are neutralized.
Security fixtures exercise traversal, symlink escape, malicious Markdown,
invalid Origin/Host, and missing capability cases.

Binding to all interfaces, trusting localhost without a capability, and using
raw HTML rendering were rejected because the server exposes private plans.

### Treat Ukrainian as block-level derived state

The parser segments supported planning prose into stable semantic blocks.
Before translation it masks fenced and inline code, paths, identifiers,
permission keys, locale markers, normative keywords, and structured syntax.
The result is accepted only when every protected token round-trips exactly.

Initial automatic scope is limited to change title, motivation, goals,
non-goals, task text, decisions, and risks. Other blocks translate only on
explicit request. English, Ukrainian, and side-by-side views always retain
source path and snapshot provenance.

The cache key covers normalized block content, locale, glossary version,
prompt-contract version, parser version, and adapter identity. Local cache
storage lives in the platform-appropriate user state directory. The storage
format stays behind an interface; content-addressed files are sufficient for
the MVP, while SQLite remains an allowed later implementation when cross-block
queries justify it.

Committed translated plan copies were rejected because they create two sources
of truth. Translating whole files or repositories was rejected for cost,
latency, privacy, and invalidation reasons.

### Make translation adapters explicit

The first functional adapter invokes the already installed and authenticated
AGY CLI in non-interactive plan+sandbox mode, disables slash-command expansion,
requests schema-constrained JSON, and gives the model no file or mutation
authority. The server derives blocks from the current fixed-root projection;
the browser never supplies arbitrary text for external transmission.

The translation settings disclose that screened plan text is sent through AGY
to Gemini/Google and that internet access and account quota are required. A
persisted Ukrainian or side-by-side mode with AGY selected authorizes automatic
translation of eligible uncached blocks during later plan navigation, without
a repeated modal prompt. The server masks protected tokens, validates exact
round trips, and stores accepted translations in a private machine-local
content-addressed cache. No local language model is downloaded, and no Claude
or Anthropic fallback exists.

The English workbench remains fully useful when English mode is selected, AGY
is unavailable or out of quota, the network fails, output validation fails, or
a protected token changes. Adapter failure cannot invalidate the source view.

### Separate UI approval from implementation

Before building the user-visible layout, present a concrete desktop/mobile
wireframe covering the project header, worktree provenance, change list,
change summary, task progress, language modes, stale state, and error states.
Implementation begins only after project owner explicitly approves that hierarchy and
interaction model.

### Use one self-contained application mark

The Hub and isolated project shells share the approved OpenSpec mark: an open
circle paired with a green check on the existing dark-green application tile.
The mark is stored as a local SVG and linked from both HTML shells, so it stays
recognizable at browser-tab size without adding an external request or changing
the application's security policy. Alternative OS monogram, angle-bracket,
document, split-view, and layered-plan directions were reviewed and rejected
for this release after project owner selected the circle-and-check direction.

### Extend the mark into a calm tool visual system

The approved redesign keeps the existing information architecture, copy,
navigation, dialogs, and responsive behavior while making the Hub and project
shells visibly related to the application mark. A solid forest-green
`#173f35` application frame anchors both shells. Mint `#70e1b7` is reserved for
the mark, focus treatment, verified completion, and selected states on dark
surfaces; light-mode text and controls use darker accessible greens instead of
mint text. Long-form plans remain on neutral warm-light or deep-graphite
surfaces with restrained dividers and a document-first reading width.

The Hub stays comparatively spacious and project-oriented, while the
workbench stays denser and document-oriented. Both reuse the same mark,
radii, focus language, provenance chips, and open-circle/check geometry.
System light and dark appearance remain automatic. At narrow widths the
existing collapsed plan navigation and single-column content order remain the
controlling responsive behavior. project owner approved the interactive Project/Hub
and light/dark mockup before implementation. A neutral-only editorial
direction was rejected as insufficiently connected to the mark, and a layered
glass direction was rejected for readability, contrast, and small-screen
complexity.

## Risks / Trade-offs

- **Application drifts from the standards contract** → Run cross-repository
  contract fixtures for every supported standards/OpenSpec pair and publish an
  explicit compatibility matrix.
- **Independent release introduces supply-chain ambiguity** → Use immutable
  application tags, deterministic bundles, recorded checksums, and a retained
  preceding version for rollback; never execute a floating `latest` command.
- **CLI JSON changes** → Version adapters and fixtures against every supported
  OpenSpec/standards pair; fail visibly on unknown output.
- **Dirty or rapidly changing worktree yields inconsistent reading** → Attach
  an epoch to every snapshot, invalidate on file/HEAD changes, and never imply
  a dirty snapshot is committed truth.
- **Localhost content leaks through browser or Markdown behavior** → Capability
  URL, Host/Origin enforcement, CSP, no external assets, sanitizer fixtures,
  and fixed filesystem root.
- **Translation changes technical meaning** → Mask protected tokens, validate
  round trips, keep exact English one click away, and label translation as
  derived.
- **Translation consumes excessive tokens** → Translate essential visible
  blocks only, cache by content, and display cache/provider usage.
- **Remote provider receives private plans** → Default to English/no egress,
  disclose the provider boundary beside the persisted setting, screen secrets
  and denied paths, and send only eligible uncached blocks from the selected
  plan while a non-English mode remains active.
- **Hub concentrates knowledge of local project paths** → Store only explicit
  labels and canonical roots in private machine-local state; never store plan
  content, capabilities, or scan results.
- **A stale registry entry or reused port opens the wrong instance** → Require
  an identity handshake matching repository/worktree identity before linking
  and show mismatches as unavailable.
- **Branch navigation is mistaken for Git control** → Label branches without
  worktrees as not openable and test that every navigation interaction leaves
  refs, index, tracked files, and untracked files unchanged.
- **The application is hard to distinguish among local tabs** → Use the same
  approved high-contrast favicon in the Hub and every project shell and cover
  both links in the UI contract.
- **Brand color overwhelms long-form plans** → Limit forest green to structural
  chrome and selected context, keep plan surfaces neutral, and reserve mint for
  high-signal states whose meaning also has text or shape.
- **The redesign regresses dark or narrow layouts** → Exercise semantic color
  contrast and 320-pixel responsive contracts for both shells before the live
  reference consumer review.

## Migration Plan

1. Preserve the verified prototype as migration input while updating the
   existing artifacts to the dedicated-repository ownership boundary.
2. Bootstrap `solo/openspec-workbench` with the standalone toolchain and copy the
   source, tests, build, documentation, and application OpenSpec history.
3. Build and test the standalone runtime against disposable fixtures and the
   unchanged reference consumer worktree.
4. Remove application source, runtime, and application release scripts from
   the unreleased standards branch; retain only the integration contract and
   compatibility metadata.
5. Re-run both repositories' validation and no-mutation evidence before
   publishing any application release.
6. Obtain explicit approval for the first translation adapter and final visual
   acceptance before the first application tag.

Rollback stops the standalone process or restores its preceding application
version. No consumer standards pin changes, and the MVP owns no authoritative
or migration-requiring project data.
