## ADDED Requirements

### Requirement: Ordinary launch opens the Projects Hub
The ordinary application launch SHALL open the Projects Hub as the single user-facing entrypoint and SHALL NOT implicitly treat the current working directory as a selected project.

#### Scenario: Fresh user starts the application
- **WHEN** a user runs `npm start` without any registered projects on a supported interactive desktop
- **THEN** the browser opens an empty Projects Hub with an available project-registration action

#### Scenario: Fresh user starts on an unsupported picker platform
- **WHEN** a user runs `npm start` where no native folder-picker adapter is supported
- **THEN** the browser opens the empty Projects Hub without a nonfunctional registration action and the documented CLI recovery commands remain available

#### Scenario: Existing user starts the application
- **WHEN** a user runs `npm start` with existing valid registrations
- **THEN** the Hub lists those registrations and opens each only through its isolated one-root child

#### Scenario: User needs advanced one-project launch
- **WHEN** an operator intentionally invokes the advanced standalone command with an explicit valid absolute canonical root
- **THEN** one isolated workbench starts for exactly that worktree without exposing Hub registration routes

### Requirement: Repository-pinned OpenSpec invocation is literal and cross-platform
The application SHALL invoke the selected project's declared `npm run openspec -- <args>` authority through a resolved JavaScript package-manager entry and the current Node executable, SHALL pass every OpenSpec argument as a literal process argument, and SHALL NOT directly invoke a package-manager batch shim, enable `shell: true`, or reconstruct command text. The trusted repository-owned npm script retains npm's normal platform execution semantics.

#### Scenario: Compatible project runs on Windows
- **WHEN** an interactive Windows user confirms or opens a project with the required local `openspec` script and supported pinned OpenSpec version
- **THEN** Workbench starts npm through Node without directly invoking `npm.cmd`, enabling `shell: true`, interpolating OpenSpec arguments, or reporting the removed `OPENSPEC_UNAVAILABLE` code

#### Scenario: Compatible project runs on macOS
- **WHEN** a macOS user confirms or opens the same compatible project
- **THEN** the same literal-argument contract preserves its pinned script behavior and supported JSON responses

#### Scenario: Package-manager JavaScript entry cannot be resolved
- **WHEN** the application cannot resolve an approved package-manager JavaScript entry for the current runtime
- **THEN** the project fails visibly with a runner-resolution diagnostic and the application does not fall back to a shell

#### Scenario: Project lacks the required script
- **WHEN** the selected project has no valid local `openspec` package script
- **THEN** the project fails visibly with a missing-script diagnostic before compatibility execution

#### Scenario: Project command fails or times out
- **WHEN** the resolved project command exits unsuccessfully, exceeds its output bound, or exceeds its time bound
- **THEN** the application reports the corresponding safe failure without guessing compatibility or mutating the project

### Requirement: Terminal loading failures are explicit
The Hub and isolated workbench SHALL replace every terminal initial-loading placeholder with either loaded content, a valid empty state, or a specific recoverable failure within a bounded time.

#### Scenario: Initial snapshot fails
- **WHEN** the project snapshot API returns a non-success response
- **THEN** the project header and status region show a safe diagnostic instead of remaining at `Loading`

#### Scenario: Initial request stalls
- **WHEN** an initial browser request does not complete within its client-side bound
- **THEN** the page stops indicating indefinite loading and offers a safe retryable failure state

#### Scenario: Child launch fails
- **WHEN** the Hub cannot start or identity-verify the selected one-root child
- **THEN** the project card returns to an actionable state and shows a specific launch failure

## MODIFIED Requirements

### Requirement: Workbench is scoped to one canonical Git worktree

The internal or advanced one-project workbench SHALL require an explicitly supplied absolute Git worktree root whose normalized path resolves to the canonical root, SHALL independently validate it before listening, and SHALL read no project artifact outside that root. A trailing separator or Windows path-case difference SHALL NOT make an otherwise identical root invalid; a symlink alias or different resolved location SHALL remain invalid.

#### Scenario: Start with a valid explicit worktree
- **WHEN** the Hub child launcher or an advanced operator supplies an absolute canonical repository root containing a valid OpenSpec installation
- **THEN** the workbench fixes its project root to that exact canonical worktree path and displays its path, branch, and current revision

#### Scenario: Start without an explicit root
- **WHEN** the internal one-project command has no `--root` or the flag has no value
- **THEN** startup fails with a safe diagnostic and no server remains listening

#### Scenario: Start with a relative or invalid root
- **WHEN** the supplied root is relative, missing, not canonical, not an exact Git top level, or lacks a valid OpenSpec installation
- **THEN** startup fails with a safe diagnostic and no server remains listening

#### Scenario: Path escapes the worktree
- **WHEN** a discovered or requested artifact resolves through traversal or a symbolic link outside the canonical worktree root
- **THEN** the workbench rejects the artifact and exposes no external file content

## REMOVED Requirements

### Requirement: Ordinary launch exposes only the current project

**Reason**: The implicit current-directory launch is ambiguous for installed users and caused the Workbench source repository to appear as an already selected project. The Hub is now the sole ordinary user entrypoint while one-root isolation remains internal.

**Migration**: Use `npm start` for the Projects Hub. Operators who intentionally need a standalone process must use the documented advanced command with an explicit absolute `--root`.
