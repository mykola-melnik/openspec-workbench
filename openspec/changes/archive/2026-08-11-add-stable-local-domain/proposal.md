## Why

The Hub currently exposes an ephemeral loopback capability URL that changes on
every restart, so it cannot be used like the other persistent local products on
this Mac. A stable locally trusted domain should make the read-only project
catalogue reliably available without weakening the isolated capability model
for project content.

## What Changes

- Add an explicit trusted-local-proxy Hub mode for the approved
  `https://plans.internal` origin while binding only to `127.0.0.1:4057`.
- Serve the Hub at the bare stable domain without a persistent token in browser
  history, bookmarks, logs, or machine configuration.
- Require exact Host and Origin validation, same-origin mutation headers,
  fetch-metadata checks, no CORS, and loopback-only socket ownership.
- Keep every project and worktree content process isolated behind its existing
  ephemeral capability and canonical one-root authority.
- Add the standalone application to the machine-level Caddy and PM2 stack with
  local TLS, login restoration, isolated restart, and health checks.
- Preserve explicit-only project registration, read-only repository behavior,
  and machine-local derived state.

The change does not add repository discovery, plan editing, branch switching,
new product data, a hosted service, or a remote translation provider.

## Capabilities

### New Capabilities

- `stable-local-domain`: Stable trusted-proxy access to the read-only Hub and
  its machine-level Caddy/PM2 lifecycle.

### Modified Capabilities

None.

## Impact

- Application: Hub server/client security boundary, CLI options, package
  scripts, deterministic bundle, security fixtures, and operation docs.
- Machine infrastructure: `<managed-local-dev-root>` Caddy route, PM2
  process, environment path map, command allowlist, health checks, README, and
  one `plans.internal` loopback entry in `/etc/hosts`.
- Network: reserves loopback upstream port `4057` and local HTTPS hostname
  `plans.internal`; Caddy remains the only listener on ports 80/443.
- Consumers: no package, standards pin, OpenSpec artifact, Git state, product
  route, or deployment change.
- Release: application changes remain on a reviewed feature branch; no tag,
  merge, or push is implied by the local installation.
