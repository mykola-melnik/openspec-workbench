## Context

See `proposal.md` for motivation and `specs/change-dependency-navigation/spec.md` for observable behavior. The OpenSpec CLI list response is intentionally flat, while authoritative consumer proposals sometimes contain explicit change identifiers in dependency declarations. The Workbench already reads proposal files through a canonical-root containment boundary and renders active and completed groups in the browser.

## Goals / Non-Goals

**Goals:**

- Produce deterministic, additive dependency metadata from confirmed current change identifiers.
- Render a compact maximum two-level tree without duplicating selectable changes.
- Keep status grouping, search reachability, accessibility, localization, and narrow-screen containment intact.
- Make parsing and tree placement independently testable.

**Non-Goals:**

- Model arbitrary dependency graphs or transitive planning semantics.
- Treat capabilities, filenames, prose similarity, or implementation ordering as change dependencies.
- Add dependency editing or any consumer repository mutation.
- Change the OpenSpec CLI contract.

## Decisions

### Parse only dependency declarations containing exact code identifiers

The projection will inspect proposal Markdown line blocks beginning with a strict dependency marker such as `Depends on`, `The change depends on`, or `Dependencies:`. Only backticked tokens that exactly equal another identifier in the current CLI change list will be accepted. This intentionally misses informal dependencies rather than creating false hierarchy. Parsing arbitrary prose or fuzzy-matching titles was rejected because the UI would present inference as planning truth.

Proposal reads will continue through the contained project-file reader. Missing or unreadable proposals produce no relationships for that change.

### Publish additive direct and display-parent metadata

Each change summary will expose `dependsOn`, an ordered unique list of confirmed direct identifiers, plus `treeParentId`, an optional derived display parent. Direct facts and display placement remain separate so the client can explain a flattened chain without claiming the displayed ancestor is the direct dependency. Existing fields and routes remain unchanged.

The projection will choose the first declared direct dependency as the primary path, preserving source order. It will walk that path to the top-level ancestor and assign at most one display parent. Any detected cycle clears display parents for every involved node. This yields deterministic two-level placement while retaining all direct dependencies for labels.

### Apply status and filter visibility in the client

The client will place a change under `treeParentId` only when that parent is present in the same rendered status group and survives the current search. Otherwise the change remains top-level and its direct-dependency label still explains the relationship. Children are emitted once immediately after their visible display parent, in original snapshot order.

This client-side visibility rule avoids duplicating a completed parent in the active section and ensures a search match is never hidden merely because its parent does not match.

### Use semantic wrappers and CSS tree connectors

Each selectable plan remains a button. A lightweight list-item wrapper supplies the child indentation, connector line, and dependency metadata. Ukrainian copy will be added to the locale catalog rather than embedded in the component. The child offset will use a bounded value and a reduced narrow-screen value so button width cannot overflow the sidebar.

## Risks / Trade-offs

- [Consumer authors express a real dependency without the strict marker or exact code identifier] → Leave it flat; the safe failure mode is omission, and authors can make the declaration explicit later.
- [A proposal uses an exact change identifier in unrelated text near a marker] → Limit recognition to the marker's Markdown block and require code formatting plus current-list membership.
- [Multiple parents make a single tree position incomplete] → Render once under the deterministic primary path and label the additional count.
- [Status changes move a child away from its parent] → Preserve active/completed truth and keep the direct-dependency label visible at the child's top-level position.
- [Malformed cycles create unstable ordering] → Detect cycles and leave all participating nodes flat.
- [Additional proposal reads increase snapshot time] → Read small proposal files concurrently and perform only linear bounded parsing over current changes.

## Migration Plan

Build and test the additive snapshot and client changes, then restart only the `openspec-workbench` application process. Existing projects require no migration. Rollback is the previous application build/process version; consumer files and local project registrations are unchanged.
