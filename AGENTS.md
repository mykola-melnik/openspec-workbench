# OpenSpec Workbench agent instructions

OpenSpec Workbench is a standalone read-only local application. Read `README.md`,
`openspec/README.md`, and the active OpenSpec change before planned work.

## Language

- Communicate with the repository owner in the language used by the request.
- Write code, documentation, plans, tests, comments, identifiers, and commit
  messages in English.
- Keep Ukrainian product copy in translation catalogs; do not hardcode it in
  components or server routes.

## Product boundaries

- Git-reviewed English OpenSpec files remain the only authoritative planning
  state.
- Never edit plans, switch branches, create worktrees, commit, push, or scan
  the computer for repositories from the UI.
- Keep each content process bound to one canonical worktree root.
- Keep the Hub outside content authority and register projects explicitly.
- Bind only to loopback and preserve capability, Host, Origin, CSP, path
  containment, and inert rendering protections.
- Store derived state only in the private machine-local application directory.
- Fail visibly on unknown OpenSpec or standards formats instead of guessing.

## Workflow

- New committed product work starts as an OpenSpec change.
- The repository owner controls user-visible UX decisions; obtain explicit approval before changing
  layout, navigation, copy, interaction, or responsive behavior.
- Use repository scripts for build and verification.
- Do not tag, merge, deploy, or change consumer repositories without explicit
  authorization.
