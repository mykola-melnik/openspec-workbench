## Verification evidence

Verified locally on 2026-07-31.

- `npm run verify`: OpenSpec doctor healthy, 2 strict changes valid,
  TypeScript clean, 28 tests passed, and the committed deterministic bundle
  matched a clean rebuild.
- `caddy validate --config <managed-local-dev-root>/Caddyfile --adapter caddyfile`:
  `Valid configuration`. The command was run with administrative read access
  because the existing local Caddy intermediate certificate is root-owned.
- `lsof -nP -iTCP:4057 -sTCP:LISTEN`: the Hub owns only
  `127.0.0.1:4057`.
- PM2: `openspec-workbench` is online in namespace `tools`; its output identifies
  `https://plans.internal/`. `dev-apps save` persisted the process list.
- Resolver: `plans.internal` resolves to `127.0.0.1` through the single new
  `/etc/hosts` entry.
- Live HTTPS: `/` and `/api/projects` returned 200; the explicit registry
  returned exactly one available `reference consumer` project.
- Live negative checks: hostile Host returned 403, hostile Origin returned
  403, and a project-launch POST without same-origin authority returned 403.
- Live isolated launch: the approved project POST returned 200; the child
  identity endpoint returned 401 without its capability and 200 with it after
  a three-second stability interval.
- `dev-router status`: every configured local HTTPS route, including
  `openspec-workbench`, reported `OK` after the Caddy reload.
- reference consumer remained clean at `<unchanged-consumer-head>`;
  `standards.version` and the exact `.standards` tag remained `v1.8.0`.

Rollback material is retained at
`/private/tmp/local-dev-openspec-workbench-backup.kmOrew`. It contains the six
changed `local-dev` files and the preceding `/etc/hosts`.
