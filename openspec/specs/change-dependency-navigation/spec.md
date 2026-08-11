# change-dependency-navigation Specification

## Purpose

Make explicit OpenSpec change sequencing visible in the existing read-only plan list while preserving authoritative files, safe filesystem boundaries, and predictable navigation.

## Requirements

### Requirement: Derive only confirmed change dependencies
The Workbench SHALL derive a dependency only from an explicit dependency declaration in a change proposal whose referenced identifier exactly matches another change returned by the same OpenSpec snapshot. It SHALL NOT infer dependencies from similar names, capability references, general prose, or unresolved identifiers.

#### Scenario: Exact identifier in an explicit declaration
- **WHEN** a proposal dependency declaration names a currently listed change by its exact identifier
- **THEN** the snapshot reports that identifier as a direct dependency of the declaring change

#### Scenario: Incidental change reference
- **WHEN** a proposal mentions another change outside an explicit dependency declaration
- **THEN** the Workbench does not derive a dependency from that mention

#### Scenario: Unknown identifier
- **WHEN** an explicit dependency declaration references an identifier that is not in the current OpenSpec change list
- **THEN** the Workbench omits that unresolved reference from the derived dependency relationship

### Requirement: Present a two-level dependency tree
The Workbench SHALL present changes once within the existing active and completed sections. When a confirmed parent is visible in the same section, the dependent change SHALL be indented beneath that parent, and the presentation SHALL never exceed two visual levels.

#### Scenario: Parent and child share a section
- **WHEN** a parent and its dependent change are both visible in the active section or both visible in the completed section
- **THEN** the dependent change appears once, directly after the parent group, with a visible tree indentation and dependency label

#### Scenario: Dependency chain exceeds two nodes
- **WHEN** confirmed dependencies form a chain longer than two changes
- **THEN** the Workbench preserves each change once and flattens descendants under a deterministic top-level ancestor while retaining their direct dependency label

#### Scenario: Parent belongs to another status section
- **WHEN** a confirmed parent is not in the dependent change's active or completed section
- **THEN** the dependent change remains top-level in its own section and visibly identifies the confirmed dependency

### Requirement: Preserve navigation under filtering and ambiguous graphs
Filtering or malformed dependency structures SHALL NOT make matching changes unreachable. Additional parents SHALL be represented without duplicating the dependent change, and cycles SHALL remain flat.

#### Scenario: Search matches only a child
- **WHEN** the search query matches a dependent change but not its parent
- **THEN** the matching change remains visible as a top-level search result with its dependency label

#### Scenario: Multiple confirmed parents
- **WHEN** a change has more than one confirmed direct dependency
- **THEN** the Workbench displays the change once under a deterministic primary parent and indicates the additional dependency count

#### Scenario: Dependency cycle
- **WHEN** confirmed declarations form a dependency cycle
- **THEN** every involved change remains available at the top level and the Workbench does not invent a parent-child order

### Requirement: Preserve read-only and compatibility boundaries
Dependency navigation SHALL use contained reads below the canonical worktree root, SHALL add no consumer mutations, and SHALL preserve a flat usable list for projects that have no recognized dependency metadata.

#### Scenario: Project without recognized dependencies
- **WHEN** no current proposal contains a recognized dependency declaration
- **THEN** the existing active and completed lists remain flat and fully navigable

#### Scenario: Proposal cannot be read safely
- **WHEN** a proposal is absent, unreadable, or rejected by the contained file-reading boundary
- **THEN** the Workbench omits derived dependencies for that proposal without reading outside the canonical worktree or modifying consumer files

#### Scenario: Narrow viewport
- **WHEN** the sidebar is shown on a narrow supported viewport
- **THEN** tree indentation and dependency labels remain within the viewport without horizontal overflow
