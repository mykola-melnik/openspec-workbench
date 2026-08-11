## Context

See `proposal.md` and the `stable-local-domain` specification. The Hub currently
uses the same ephemeral capability model as project content. This Mac already
has one loopback-only Caddy router with local TLS and one PM2 user process list
for persistent local applications. Caddy preserves the original Host when
proxying HTTP upstreams.

The Hub lists explicit machine-local registrations and launches one-root child
processes. Starting a child is a bounded local mutation even though neither the
Hub nor child writes repository state, so stable-domain POST requests require a
stronger same-origin check than reads.

## Goals / Non-Goals

**Goals:**

- Make `https://plans.internal` survive Hub and login restarts.
- Keep Caddy as the only owner of local HTTPS and PM2 as the only persistent
  application supervisor.
- Preserve exact Host/Origin validation inside the Hub.
- Preserve ephemeral capabilities and one-root authority for project content.
- Provide deterministic negative tests and a reversible machine configuration.

**Non-Goals:**

- Authenticating different operating-system users or defending against
  malware already running as the same macOS user.
- Exposing the Hub to the LAN, internet, containers, or remote devices.
- Giving the stable origin direct access to project artifacts.
- Adding repository discovery, browser-side registration, plan editing, or a
  persistent application credential.

## Decisions

### Reserve port 4057 and the plans.internal origin

The standalone Hub binds exactly `127.0.0.1:4057`. The machine Caddy route owns
`https://plans.internal` and forwards only to that loopback upstream. PM2 owns
one `openspec-workbench` process using the committed deterministic runtime.

Port 4057 was selected from project owner's requested 4000-range after verifying it was
not listening. Dynamic or per-restart ports were rejected because Caddy and
PM2 need a stable upstream. Ports 4000, 4101, 4102, and 4107 were rejected as
already occupied.

### Add an explicit trusted-local-proxy Hub mode

The CLI accepts a fixed port and an exact public HTTPS origin. When that mode is
active, the Hub root and read APIs do not require a bearer capability. The Hub
instead accepts only the public origin's exact Host and either an absent Origin
for top-level/read navigation or the exact public Origin. It ignores forwarded
host headers and rejects absolute-form foreign request targets.

Capability-in-URL was rejected for the stable Hub because browser history,
bookmarks, screenshots, logs, and restart rotation make it both less usable and
more leak-prone. A persistent cookie or disk secret was rejected because it
adds rotation and CSRF complexity without creating a meaningful boundary
against same-user local processes.

### Treat project launch as a same-origin mutation

The project-launch POST requires the exact public Origin and a custom
`X-OpenSpec-Client: 1` header that a cross-origin HTML form cannot set. If
`Sec-Fetch-Site` is present, only `same-origin` or `none` is accepted. A missing
Origin is rejected for POST even though it remains valid for GET/HEAD.

All responses keep no-store, restrictive CSP, no CORS, no-referrer, same-origin
opener/resource policy, and inert content. OPTIONS receives no CORS permission.

### Keep content processes on the existing capability boundary

Trusted proxy mode applies only to the catalogue Hub. The launcher still
starts an ephemeral-port child with a random capability, performs the existing
identity handshake, and returns only that verified URL. The public origin is
never passed to a child and never selects a filesystem root.

### Keep machine infrastructure outside the application repository

Portable application behavior and tests live in `solo/openspec-workbench`. The
machine-specific Caddy, PM2, path mapping, command allowlist, and health check
remain under `<managed-local-dev-root>`, matching every other local
product. Before applying edits, the affected unversioned infrastructure files
and `/etc/hosts` are copied to a dated temporary backup for rollback. The host
file receives only `127.0.0.1 plans.internal`, matching the existing local
domain resolution pattern.

## Risks / Trade-offs

- **A same-user local process can forge Host and Origin on loopback** → Accept
  this explicit threat boundary; persistent secrets would be readable by the
  same user and would not close it.
- **A broad Caddy route could bypass hostname isolation** → Add one exact host
  block, validate the complete Caddyfile, and test the public URL plus hostile
  Host requests against the upstream.
- **A future Hub mutation may accidentally use GET** → Keep the method allowlist
  and negative tests; every new mutation requires its own OpenSpec security
  review.
- **PM2 restores a stale build** → Run the committed `hub:local` command from
  the explicit checkout path, rebuild deterministically before restart, and
  verify the live revision operationally.
- **Machine infrastructure is not currently a Git repository** → Create a
  recoverable temporary backup before replacement and record exact changed
  files and validation evidence.

## Migration Plan

1. Implement and verify trusted-local-proxy behavior in an isolated application
   worktree; rebuild the committed runtime.
2. Back up the active machine Caddy, PM2, path-map, wrapper, and README files.
3. Add the exact host mapping, domain route, port, application path, PM2
   process, allowlist, and health check to the backed-up machine configuration.
4. Validate the full Caddyfile and application tests before replacing active
   machine files.
5. Switch the persistent application checkout to the verified feature branch,
   reload Caddy, start only `openspec-workbench`, save PM2 state, and verify the public
   HTTPS address plus negative security cases.
6. Reconfirm that reference consumer and its standards checkout are unchanged.

Rollback stops `openspec-workbench`, restores the backed-up machine files, reloads
Caddy, and returns the application checkout to its preceding branch. No
consumer data migration is required.
