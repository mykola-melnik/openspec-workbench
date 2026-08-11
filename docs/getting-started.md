# Getting started

## Requirements

- Node.js 20.20 or newer
- Git
- A current browser that sends Fetch Metadata headers on same-origin requests
- A trusted project with a project-local `npm run openspec -- <args>` command

## Install

```bash
git clone https://github.com/mykola-melnik/openspec-workbench.git
cd openspec-workbench
npm ci
npm run verify
```

## Start the Projects Hub

```bash
npm start
```

Open the complete loopback capability URL printed by the process. Choose
**Додати проєкт**, select the exact Git worktree root, inspect the structural
preview, and confirm registration. The Hub starts empty on a clean installation
and never infers the current Workbench checkout as a project.

The macOS picker is the verified beta path. A Windows desktop adapter is
implemented but remains provisional until its clean-install interactive smoke
test is recorded. Linux does not show the native registration control. Headless
Windows, services, Session 0, and other sessions where a supported picker cannot
open fail visibly and use the CLI recovery commands.

## Recovery commands

```bash
npm run project:register -- --root /absolute/path/to/project --label "Project name"
npm run projects
npm run project:remove -- --project <project-id>
```

An advanced one-project process is available only with an explicit canonical
root:

```bash
npm run project -- --root /absolute/path/to/project
```

Omitting `--root` or supplying a relative or noncanonical path fails before a
listener opens.
