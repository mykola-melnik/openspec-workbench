## 1. Stable Hub Runtime

- [x] 1.1 Add fixed-port and exact-public-origin CLI options while preserving the existing capability-protected Hub mode; verify with `npm test` that legacy Hub and child isolation tests remain green.
- [x] 1.2 Implement trusted-local-proxy request validation for exact Host, Origin, mutation client header, fetch metadata, absolute request targets, and no-CORS response policy; verify positive and hostile cases with deterministic E2E tests in `npm test`.
- [x] 1.3 Add the committed `hub:local` runtime command and rebuild `dist/`; verify with `npm run build` and confirm the command binds only `127.0.0.1:4057` for `https://plans.internal`.

## 2. Operations and Documentation

- [x] 2.1 Document the stable local-domain lifecycle, trust boundary, explicit project registration, and rollback path in the standalone application README.
- [x] 2.2 Create a recoverable backup of every affected unversioned machine-infrastructure file, then add the exact Caddy route, PM2 process, path mapping, wrapper allowlist, and health check under `<managed-local-dev-root>`.
- [x] 2.3 Validate the complete machine configuration with the existing Caddy and local-dev validation commands before activating it; evidence must show a valid Caddyfile and an isolated `openspec-workbench` process definition.

## 3. Activation and Verification

- [x] 3.1 Switch the permanent standalone checkout to the verified feature branch, start only the `openspec-workbench` PM2 process, reload Caddy, and save the PM2 process list without restarting unrelated applications.
- [x] 3.2 Register reference consumer explicitly and verify `https://plans.internal`, its project API, hostile Host/Origin requests, missing mutation headers, and child capability isolation with reproducible HTTP checks.
- [x] 3.3 Reconfirm that reference consumer, its standards pin, and unrelated supervised applications were not mutated; record the backup location, live URL, process status, and verification evidence.

## 4. Change Completion

- [x] 4.1 Run `npm run openspec -- validate add-stable-local-domain --strict`, review the scoped Git diff, and commit only the verified standalone application changes without pushing, merging, or tagging.
