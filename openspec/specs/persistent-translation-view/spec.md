# persistent-translation-view Specification

## Purpose

Preserve the reader's preferred plan language and translation CLI, reuse accepted machine-local translations safely across reloads, and keep failures understandable.

## Requirements

### Requirement: Persist the presentation language
The Workbench SHALL store the selected English, Ukrainian, or side-by-side presentation mode as a browser-local preference and restore a valid stored value on later page loads. Invalid or unavailable browser storage SHALL fall back to English without blocking the page.

#### Scenario: Side-by-side mode survives reload
- **WHEN** the reader selects side-by-side mode and reloads the Workbench
- **THEN** side-by-side remains selected

#### Scenario: Stored preference is invalid
- **WHEN** browser-local storage contains an unsupported language value
- **THEN** the Workbench starts in English and remains usable

### Requirement: Restore cached translations without remote execution
For a non-English presentation, the Workbench SHALL read accepted translations from private machine-local cache without invoking AGY and without requiring transmission consent. Missing cache entries SHALL fall back to English as not-yet-translated rather than as failures.

#### Scenario: Every selected-plan block is cached
- **WHEN** a selected plan is opened in Ukrainian or side-by-side mode and every eligible block is cached
- **THEN** the cached translation appears without invoking AGY or showing the consent dialog

#### Scenario: Only some blocks are cached
- **WHEN** a selected plan has cached and uncached eligible blocks
- **THEN** cached blocks appear, uncached blocks use exact English fallback, and uncached blocks are not labeled as failed

#### Scenario: Application process restarts
- **WHEN** the Workbench process restarts after accepted translations were cached
- **THEN** matching unchanged source blocks remain available from cache

### Requirement: Persist the translation provider
The Workbench SHALL provide a settings control for choosing an available translation CLI, persist the validated choice as a browser-local preference, and default to the configured AGY CLI. Unsupported stored values SHALL fall back to AGY.

#### Scenario: AGY is configured by default
- **WHEN** a reader has not selected a translation provider
- **THEN** settings show AGY as the active translation CLI

#### Scenario: Provider preference survives reload
- **WHEN** a reader selects an available translation CLI and reloads the Workbench
- **THEN** the selected provider remains active

### Requirement: Translate uncached blocks in the persisted non-English mode
The Workbench SHALL invoke the configured translation CLI only for eligible uncached blocks whenever a plan opens while Ukrainian or side-by-side presentation is selected or restored. It SHALL not require a second language click or show an intermediate provider or transmission prompt. Successful blocks SHALL be cached independently so they remain reusable even if later blocks or requests fail.

#### Scenario: Reader opens another plan in side-by-side mode
- **WHEN** side-by-side mode is selected and the reader opens a plan with uncached blocks
- **THEN** only uncached eligible blocks are sent through the configured CLI and successful translations are stored in the private cache without another language click

#### Scenario: Reload restores side-by-side content
- **WHEN** side-by-side mode is restored during page reload
- **THEN** cached translations render immediately and uncached eligible blocks are translated automatically through the persisted provider

### Requirement: Use the authorized local AGY profile safely
The AGY process SHALL run non-interactively with the current macOS user's home profile, bounded time and output, no file-reading or edit authority, and browser-based authentication disabled. It SHALL never expose raw stderr, credentials, provider payloads, or local paths to the browser.

#### Scenario: Existing AGY authorization is valid
- **WHEN** the installed AGY CLI can use the current user's authorized profile
- **THEN** translation proceeds without starting a new authentication flow

#### Scenario: AGY requires authentication
- **WHEN** AGY reports that authentication is missing or expired
- **THEN** the Workbench stops the request and shows a safe localized authentication-required message without opening an authorization browser

#### Scenario: AGY quota or rate limit is reached
- **WHEN** AGY reports a quota or rate-limit failure
- **THEN** cached translations remain visible and the Workbench shows a safe localized quota message

#### Scenario: AGY times out or returns invalid output
- **WHEN** the bounded AGY process times out or violates the required translation structure
- **THEN** cached translations remain visible and the Workbench shows the corresponding safe localized failure category

### Requirement: Reuse one plan projection per worktree generation
The Workbench SHALL derive readable plan content once per plan and watcher generation, reuse that projection for the detail and translation routes, and avoid repeating OpenSpec compatibility, list, status, or validation commands during cache restoration and translation. The Hub SHALL also reuse a verified stable project/worktree route and live child binding for the unchanged registration revision while cheaply preserving canonical-root checks. Strict status and validation SHALL complete in the background and update the selected plan without blocking its readable English content.

#### Scenario: Reader opens an uncached plan
- **WHEN** the reader selects a plan that has not been projected in the current worktree generation
- **THEN** proposal, design, and tasks render from contained source reads before background strict verification completes

#### Scenario: Translation follows plan selection
- **WHEN** cache restoration or AGY translation begins for the selected plan
- **THEN** both operations reuse the existing plan projection without launching another OpenSpec status or validation command

#### Scenario: Reader reopens a projected plan
- **WHEN** the reader returns to a plan before the watcher generation changes
- **THEN** its cached projection appears without repeating source or OpenSpec command work

#### Scenario: Stable Hub route handles another plan request
- **WHEN** the registered project revision and canonical root are unchanged and its child process is live
- **THEN** the Hub reuses the verified worktree route and child binding without repeating full Git branch and identity discovery

#### Scenario: Authoritative files change
- **WHEN** the watcher reports a new worktree generation
- **THEN** cached plan projections are invalidated and the existing visible stale-state behavior remains authoritative

### Requirement: Show active AGY progress inside the plan
The Workbench SHALL show a visible in-plan status while AGY is translating, including the number of missing blocks, an explanation that exact English remains available, and an indication that the plan will update automatically. The status SHALL clear when translation succeeds or fails.

#### Scenario: Automatic translation is running
- **WHEN** a selected plan has missing eligible blocks and its AGY request is active
- **THEN** a visible live status identifies AGY, reports the missing-block count, and remains next to the plan heading until completion
