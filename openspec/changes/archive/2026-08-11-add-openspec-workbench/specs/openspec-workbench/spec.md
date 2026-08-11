## Purpose

Provides a safe local reading surface for Git-reviewed OpenSpec plans, worktree
provenance, and task progress without replacing English repository artifacts as
the authoritative planning state.

## ADDED Requirements

### Requirement: Workbench is scoped to one canonical Git worktree

The workbench SHALL resolve one canonical Git worktree root at startup and
SHALL read no project artifact outside that root.

#### Scenario: Start inside a valid worktree
- **WHEN** a user starts the workbench for a repository containing a valid OpenSpec root
- **THEN** the workbench fixes its project root to the canonical worktree path and displays that path, branch, and current revision

#### Scenario: Start outside a valid worktree
- **WHEN** the supplied root is not a Git worktree with a valid OpenSpec installation
- **THEN** startup fails with a safe diagnostic and no server remains listening

#### Scenario: Path escapes the worktree
- **WHEN** a discovered or requested artifact resolves through traversal or a symbolic link outside the canonical worktree root
- **THEN** the workbench rejects the artifact and exposes no external file content

### Requirement: Workbench presents branch-specific OpenSpec truth

The workbench SHALL derive its change list, artifact availability, validation
state, and progress from the selected worktree's pinned OpenSpec workflow and
files without inventing a second status model.

#### Scenario: View the worktree overview
- **WHEN** the workbench loads a valid worktree
- **THEN** it shows active and completed changes with artifact availability and completed-versus-total task counts for that worktree only

#### Scenario: View a change
- **WHEN** the user opens a listed change
- **THEN** the workbench shows its proposal summary, goals, non-goals, decisions, risks, tasks, and verification availability while preserving links to the exact English source artifacts

#### Scenario: Unsupported OpenSpec output
- **WHEN** the pinned CLI returns an unknown or incompatible format
- **THEN** the workbench reports the compatibility problem and does not guess statuses or progress

### Requirement: Workbench exposes worktree provenance and stale state

Every rendered snapshot SHALL identify its worktree, branch or detached state,
revision, and dirty state. A change of Git HEAD SHALL invalidate the snapshot
instead of silently presenting it as current.

#### Scenario: Files change without a branch switch
- **WHEN** an OpenSpec artifact changes inside the bound worktree
- **THEN** the workbench invalidates the affected derived view and refreshes its provenance-aware snapshot

#### Scenario: Filesystem notification without a content change
- **WHEN** the watcher receives a filesystem notification but the bounded OpenSpec content identity and Git state are unchanged
- **THEN** the workbench keeps the current snapshot valid and does not show a stale warning

#### Scenario: Git HEAD changes
- **WHEN** the worktree switches branch, rebases, or advances to another revision while the page is open
- **THEN** the workbench marks the current page stale, identifies the new Git state, and requires a refresh before presenting it as current

#### Scenario: Detached or transitional Git state
- **WHEN** the worktree is detached or a merge, rebase, or bisect is in progress
- **THEN** the workbench displays that state prominently and remains read-only

### Requirement: MVP cannot mutate planning or Git state

The MVP SHALL perform no repository write, Git state change, branch operation,
commit, push, or mutation of OpenSpec artifacts.

#### Scenario: Use every MVP control
- **WHEN** a user navigates, filters, changes reading language, or refreshes the workbench
- **THEN** the consumer repository's tracked and untracked filesystem state and Git references remain unchanged

#### Scenario: Runtime state is created
- **WHEN** the workbench stores a cache, process registration, or user preference
- **THEN** it writes only to the approved machine-local state directory and never under the consumer worktree or pinned `.standards` checkout

### Requirement: Local web boundary is closed by default

The workbench SHALL listen only on loopback and SHALL protect project content
from cross-origin access, hostile Markdown, path disclosure, and external
resource loading.

#### Scenario: Local authorized browser opens the workbench
- **WHEN** the launch URL carries the current local session capability and a valid Host and Origin
- **THEN** the server renders sanitized project content without requesting external page resources

#### Scenario: Non-loopback or cross-origin request arrives
- **WHEN** a request targets a non-loopback binding, invalid Host, invalid Origin, or missing session capability
- **THEN** the server rejects it without exposing project metadata or content

#### Scenario: Artifact contains active HTML or unsafe links
- **WHEN** an OpenSpec artifact contains scripts, event handlers, unsafe URL schemes, or externally loaded media
- **THEN** the renderer removes or neutralizes the unsafe content while preserving readable source text

### Requirement: Browser tabs expose a stable OpenSpec identity

The Hub and every isolated project workbench SHALL use the same self-contained
OpenSpec circle-and-check favicon without loading an external resource.

#### Scenario: Open the Hub or a project workbench
- **WHEN** the browser renders either application shell
- **THEN** its tab identifies OpenSpec Workbench with the approved circle-and-check favicon

### Requirement: Hub and workbench share an accessible visual system

The Hub and every isolated project workbench SHALL share the approved
forest-green, mint, and neutral visual system while preserving the existing
information architecture, Ukrainian copy, interaction model, and read-only
authority boundaries.

#### Scenario: Render the application in light or dark appearance
- **WHEN** the browser selects either supported color scheme
- **THEN** structural chrome reflects the OpenSpec mark, verified and selected states remain distinguishable without color alone, and plan prose stays on a neutral high-contrast reading surface

#### Scenario: Render the application at narrow width
- **WHEN** the viewport narrows to 320 CSS pixels
- **THEN** the approved content order, navigation controls, complete labels, and touch targets remain available without horizontal page overflow

### Requirement: English artifacts remain authoritative

The workbench SHALL treat committed and working-tree English OpenSpec artifacts
as the sole source of planning truth. Ukrainian content SHALL be labelled as a
derived reading aid and SHALL never be written back as an authoritative plan.

#### Scenario: Switch between reading modes
- **WHEN** a Ukrainian translation is available for a supported planning block
- **THEN** the user can view Ukrainian, exact English, or a side-by-side presentation with source path and revision provenance

#### Scenario: Translation is unavailable
- **WHEN** no approved translation adapter is configured or translation fails validation
- **THEN** the exact English source remains readable and the workbench explains that the Ukrainian derived view is unavailable

### Requirement: Ukrainian translation is selective and content-addressed

The workbench SHALL translate only supported essential planning blocks on
demand or when visibly requested, SHALL preserve protected technical tokens,
and SHALL reuse a local cache until an input to the translation contract
changes.

#### Scenario: Read the essential overview in Ukrainian
- **WHEN** the user requests the Ukrainian view for a change
- **THEN** the workbench translates the change title, motivation, goals, non-goals, task text, key decisions, and risks without automatically translating code, commands, paths, identifiers, or verification logs

#### Scenario: Reopen an unchanged translated block
- **WHEN** source content, locale, glossary, prompt contract, parser version, and translation adapter identity are unchanged
- **THEN** the workbench serves the cached Ukrainian block without another translation request

#### Scenario: Source or translation contract changes
- **WHEN** any content-addressing input changes
- **THEN** the prior translation is marked stale and only affected blocks require regeneration

#### Scenario: Protected technical token changes during translation
- **WHEN** translated output does not preserve every protected code span, identifier, path, locale marker, or normative keyword
- **THEN** the workbench rejects that translation and displays the English source for the block

### Requirement: AGY translation uses an explicit persisted reading preference

The workbench SHALL disclose that screened plan text is sent through the
installed AGY CLI to Gemini/Google, SHALL treat the reader's persisted Ukrainian
or side-by-side mode plus selected provider as authorization for automatic
translation of eligible uncached blocks, SHALL send only server-derived
screened blocks from the selected change, and SHALL run AGY without
file-reading, editing, or tool authority. It SHALL NOT interrupt later plan
navigation with a repeated transmission prompt.

#### Scenario: Local translation is not requested
- **WHEN** the workbench renders a project before the user requests Ukrainian or side-by-side mode
- **THEN** it downloads no translation model and sends no project content to AGY, Gemini, Google, or another external service

#### Scenario: Selected block fails privacy screening
- **WHEN** a block matches a denied path or secret-screening rule
- **THEN** the workbench does not translate the block and falls back to the English view

#### Scenario: User enables the AGY adapter
- **WHEN** the user selects Ukrainian or side-by-side reading with AGY configured after seeing the transmission disclosure
- **THEN** the workbench persists that preference, translates only screened uncached blocks from the selected server projection through schema-constrained AGY output, and caches only validated translations in private machine-local state

#### Scenario: Persisted non-English mode opens another plan
- **WHEN** Ukrainian or side-by-side mode remains selected and the reader opens another plan
- **THEN** the workbench automatically translates its eligible uncached blocks through the persisted provider without another prompt

#### Scenario: User selects English
- **WHEN** the reader switches the persisted presentation mode to English
- **THEN** later plan navigation sends no plan text for translation and the exact English view remains available

#### Scenario: Translation adapter is unavailable
- **WHEN** AGY availability, authentication, quota, network, schema validation, or protected-token validation fails
- **THEN** affected blocks fall back visibly to English, no invalid translation is cached, and other source content remains readable

### Requirement: Standalone distribution is reproducible and versioned

The application repository SHALL produce a self-contained, independently
versioned runtime installed once per machine. Central standards SHALL contain
only the integration contract and compatibility metadata; consumer
`.standards` checkouts SHALL NOT contain or install the application runtime.

#### Scenario: Install one compatible application version
- **WHEN** the user installs or updates an immutable OpenSpec Workbench release
- **THEN** one machine-local runtime can open every explicitly registered compatible project without copying application source into those projects

#### Scenario: Registered projects use different standards pins
- **WHEN** two registered projects use different supported standards or OpenSpec versions
- **THEN** the application selects the declared compatibility adapter for each isolated project instance and preserves each project's pin unchanged

#### Scenario: A project version is unsupported
- **WHEN** a registered project reports a standards or OpenSpec version outside the application's supported compatibility matrix
- **THEN** the application shows that project as incompatible and does not guess, mutate, or upgrade it

#### Scenario: Application rolls back
- **WHEN** the local application is stopped or restored to its preceding version
- **THEN** no consumer standards pin, authoritative OpenSpec artifact, or product state requires migration or recovery

### Requirement: Ordinary launch exposes only the current project

The workbench SHALL keep its normal launch scoped to the explicitly supplied
current project and SHALL NOT discover or display other repositories on the
computer.

#### Scenario: Launch from a project root
- **WHEN** the user starts the ordinary workbench from one project
- **THEN** only that project's selected worktree, branches, plans, and provenance are available

#### Scenario: Other repositories exist on the computer
- **WHEN** unregistered repositories exist beside or outside the selected project
- **THEN** the workbench neither scans nor displays them

### Requirement: Optional Hub navigates explicit projects through isolated instances

The optional Projects Hub SHALL list only projects explicitly registered in
machine-local state and SHALL open every project or worktree through an
isolated one-root workbench instance.

#### Scenario: Open an explicitly registered project
- **WHEN** the user selects a valid registered project in the Hub
- **THEN** the Hub opens or launches an isolated loopback instance whose canonical root is that project and whose capability is not stored in the registry

#### Scenario: Unregistered project exists
- **WHEN** a valid OpenSpec repository exists on the computer but is not explicitly registered
- **THEN** it is absent from the Hub and no filesystem discovery is attempted

#### Scenario: Registered root is invalid or moved
- **WHEN** a registered root is missing, escaped through a symbolic link, incompatible, or no longer a valid OpenSpec worktree
- **THEN** the Hub shows it as unavailable and neither reads another root nor repairs the entry automatically

### Requirement: Branch navigation is read-only and worktree-aware

Each project instance SHALL show the current branch plus no more than five
recently updated local branches by default, SHALL make remaining local branches
searchable, and SHALL open plan content only from branches that already own a
valid Git worktree.

#### Scenario: Recent local branches are available
- **WHEN** the selected repository has more than one local branch
- **THEN** the selector keeps the current branch visible and presents up to five other local branches ordered by recent commit activity

#### Scenario: Search for another local branch
- **WHEN** the user searches for a local branch outside the default recent set
- **THEN** matching local branches appear without fetching remotes or changing Git state

#### Scenario: Selected branch has an existing worktree
- **WHEN** the user opens a branch mapped by Git to another valid worktree of the same repository
- **THEN** an isolated one-root workbench for that worktree opens with its own capability and provenance

#### Scenario: Selected branch has no worktree
- **WHEN** a local branch has no existing worktree
- **THEN** the selector explains that it cannot be opened and performs no checkout, switch, worktree creation, or repository write
