# OpenSpec Workbench planning

OpenSpec is the repository-local source of truth for planned changes to the
standalone OpenSpec Workbench application. Git-reviewed English artifacts remain
authoritative; the rendered local view is never a second planning system.

## Layout

- `specs/<capability>/spec.md` — current approved capability contract.
- `changes/<change-name>/` — proposal, delta specs, design, tasks, and
  verification for proposed or active work.
- `changes/archive/` — completed change history.
- `config.yaml` — central repository context and authoring rules.

This repository owns the application implementation. Central standards own the
integration contract, while consumer repositories retain their independent
OpenSpec installation and immutable `standards.version` pin.

## Artifact language

Write every proposal, specification, design, task, and verification note in
English. Exact localized UI copy may appear only on a line explicitly marked
with its locale, for example `uk-UA: "Плани"`.

## Commands

Use the exact repository-pinned CLI:

```bash
npm run openspec -- <args>
npm run openspec:doctor
npm run openspec:validate
npm run verify
```

Pure tooling or documentation work may declare `skip_specs: true` only when it
changes no observable capability requirement. User-visible behavior requires
delta specs and project owner's explicit UX approval before implementation.
