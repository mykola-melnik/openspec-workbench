# workbench-home-navigation Specification

## Purpose

Provides an obvious, accessible way to leave a project view for the Projects Hub without weakening standalone capability navigation.

## Requirements

### Requirement: Project brand navigates to the appropriate home
The Workbench SHALL render its project-view brand as a keyboard-operable home link. On a stable Hub project or worktree route the link SHALL navigate to the same-origin Projects Hub root. On a standalone capability route the link SHALL remain within the current isolated worktree and SHALL NOT imply that project registration is available.

#### Scenario: Reader returns from a stable project route
- **WHEN** a reader activates the brand from a stable project or worktree route
- **THEN** the browser navigates to the Projects Hub root where registered projects can be selected or another project can be added

#### Scenario: Reader uses keyboard navigation
- **WHEN** keyboard focus reaches the project brand and the reader activates it
- **THEN** the same context-appropriate home navigation occurs with a localized accessible name and visible focus

#### Scenario: Standalone worktree has no Hub authority
- **WHEN** the Workbench was opened through its standalone capability URL
- **THEN** the brand remains within that isolated worktree and does not expose a Hub route, another project, or a capability not already authorized for that page

#### Scenario: Stable project is no longer registered
- **WHEN** the reader follows the brand after the current stable project registration becomes unavailable
- **THEN** the Projects Hub still opens independently and shows its current safe registration state
