## 1. Approval and Baseline

- [x] 1.1 Present the exact stable project/worktree routes, Hub-to-project navigation, artifact-anchor interaction, localized copy, focus behavior, and desktop/mobile placement to project owner; record explicit approval in this change before editing user-visible code, and verify the recorded decision with `npm run openspec -- validate harden-stable-project-navigation --strict --no-interactive`.
- [ ] 1.2 Add failing characterization fixtures for ephemeral child URL exposure, symlink-replaced registrations, permanent stale state, unbounded child lifetime, dark warning/danger contrast, and the local health-status matcher; run `npm test` and record that each new fixture fails for its intended pre-change reason while every unrelated existing test remains green.

## 2. Filesystem, Registry, and Compatibility Hardening

- [x] 2.1 Add a single registered-root revalidation boundary used by Hub listing, primary launch, and worktree resolution; cover unchanged roots, symlink substitution, missing roots, foreign worktree ids, and validation-to-handshake races with `npm test`, showing that no replacement target is launched.
- [x] 2.2 Make registry locks owner- and age-aware with conservative stale-lock recovery while preserving private permissions and atomic rename; run `npm test` and show recovery after a dead owner, refusal to displace a live owner, and concurrent mutation integrity.
- [x] 2.3 Replace the generic bounded Git helper with command-specific timeout/output handling and a streaming dirty-state check; run `npm test` and show distinct safe codes for invalid root, missing Git, timeout, overflow, and ordinary command failure without raw diagnostic leakage.
- [x] 2.4 Load and validate the bundled compatibility manifest at runtime, check the bounded project-local OpenSpec CLI version before interpreting project state, and select only its declared JSON adapter; run `npm test` and show OpenSpec 1.7 plus known doctor/list/status/validate shapes pass, absent or v1.6/v1.7/v1.8/v1.9 standards provenance does not gate access, and unsupported OpenSpec versions, malformed manifests, command failures, and unknown JSON shapes fail visibly with distinct safe states.

## 3. Freshness and Background Cost

- [x] 3.1 Add watcher acknowledgement so a complete successful snapshot rebuild advances the authoritative epoch and returns `stale: false`, while failed rebuilds remain stale; run `npm test` and show fresh-stale-fresh plus unavailable-stale scenarios.
- [x] 3.2 Make filesystem events the primary signal and run the ten-second fallback poll only while at least one event stream is active; run `npm test` and show no idle polling, missed-event detection during an active stream, and timer cleanup after disconnect and child close.

## 4. Hub-Owned Child Lifecycle

- [ ] 4.1 Refactor `WorkbenchLauncher` into the sole Hub lifecycle owner with per-worktree launch deduplication, verified identity publication, request/stream activity accounting, exit cleanup, and one bounded recovery attempt; verify concurrent-start and crash fixtures with `npm test`.
- [ ] 4.2 Implement ten-minute idle eviction that cannot terminate a child with an in-flight request or active SSE stream and that changes no repository or registry state; use a configurable test clock and run `npm test` to show boundary timing, race cancellation, graceful termination, and forced termination fallback.
- [x] 4.3 Remove nested branch-child launching from proxied workbench mode while preserving direct standalone capability mode; run `npm run test:e2e` and show that both modes open only existing worktrees and never switch branches or create worktrees.

## 5. Stable Same-Origin Proxy

- [x] 5.1 Add strict parsers and resolvers for `/projects/<project-id>/` and `/projects/<project-id>/worktrees/<worktree-id>/`, including canonical trailing-slash redirects that never contain a child port or token; run `npm test` and show valid, malformed, encoded-separator, unknown, removed, and unavailable route results.
- [x] 5.2 Add the sanitized Hub HTTP proxy with server-held bearer injection, public-prefix stripping, bounded ordinary bodies, hop-by-hop header removal, disconnect handling, and no credential persistence; run `npm run test:security` and show HTML, assets, APIs, direct-child denial, hostile Host/Origin/target/header cases, and browser-state token absence.
- [ ] 5.3 Add streaming SSE proxy support with backpressure, cancellation, activity accounting, and child restart recovery; run `npm run test:e2e` and show ready/stale events cross the stable origin, disconnect releases activity, and reopening an evicted route succeeds.
- [ ] 5.4 Intercept worktree-open mutations at the Hub, re-resolve membership from the registered repository, and return only the stable worktree path; run `npm run test:security` and show correct CSRF/fetch-metadata enforcement plus rejection without child launch.
- [x] 5.5 Add a validated public-base-path contract to generated workbench HTML and build every asset, API, event, and navigation URL from it without inline script or arbitrary response rewriting; run `npm run test:e2e` and show initial load, refresh, deep bookmark, linked worktree, and direct standalone paths all work.

## 6. Approved Read-Only UX and Accessibility

- [x] 6.1 After task 1.1 approval, change Hub project selection and branch selection to navigate only to the approved stable routes, preserving full project/branch labels and visible unavailable reasons; run `npm run test:e2e` and the approved browser walkthrough to show desktop and narrow-width behavior.
- [x] 6.2 After task 1.1 approval, replace artifact status-only badges with keyboard-operable anchors to rendered Proposal, Design, Tasks, and other supported sections, leaving missing artifacts non-interactive; run `npm test` and the approved keyboard walkthrough to show focus movement, reading position, full labels, and no filesystem URL exposure.
- [x] 6.3 Define approved semantic light/dark tokens for normal, muted, link, focus, warning, danger, and disabled states and add `npm run test:contrast`; show the command passes WCAG 2.1 AA thresholds for Hub and project fixtures at supported color schemes.
- [x] 6.4 Update Ukrainian locale-catalog entries and accessible labels for the approved navigation and recovery states without hardcoding product copy in components; run `npm run typecheck` and `npm test` and show locale-contract fixtures pass.

## 7. Release and Machine Integration

- [ ] 7.1 Add a deterministic `npm run release:publish -- --revision <revision>` workflow that verifies and publishes only runtime artifacts plus compatibility metadata into a revision-addressed private application release directory and atomically maintains a stable `current` pointer; run it against a temporary state directory and show deterministic checksums, private permissions, and retained preceding release.
- [ ] 7.2 Extend bundle verification to reject source-checkout-dependent paths, missing compatibility metadata, unexpected files, and nondeterministic output; run `npm run verify:bundle` twice and show identical verified manifests.
- [ ] 7.3 Create a durable machine-configuration backup with path/checksum manifest, correct the local router health matcher so only HTTP 2xx/3xx is healthy, and update `local-dev` PM2 configuration to use the stable verified release entrypoint; run `<managed-local-dev-root>/dev-router validate` and a fixture health check showing 200/302 pass while 403/500 fail before activating anything.
- [ ] 7.4 Update the application and local-dev documentation for stable project bookmarks, idle restart behavior, release activation, health diagnosis, retained rollback, and the unchanged consumer boundary; verify command examples and paths with `npm run verify` plus `<managed-local-dev-root>/dev-router validate`.

## 8. Full Verification and Controlled Activation

- [x] 8.1 Run `npm run openspec -- validate harden-stable-project-navigation --strict --no-interactive`, `npm run typecheck`, `npm test`, `npm run test:security`, `npm run test:contrast`, `npm run verify:bundle`, and `npm audit`; record exact passing evidence and the reviewed scoped diff without marking activation complete.
- [ ] 8.2 With separate explicit activation authorization, publish the verified revision, switch only the OpenSpec Workbench `current` release, restart only `openspec-workbench`, save the PM2 list, and run `<managed-local-dev-root>/dev-apps health`; evidence must show unrelated PM2 applications were not restarted.
- [ ] 8.3 Verify `https://plans.internal`, a primary project bookmark, a linked-worktree bookmark, idle eviction/recovery, reboot-compatible lazy start, hostile Host/Origin/CSRF cases, direct-child denial, and absence of token/port exposure; record that reference consumer files, Git status, OpenSpec artifacts, and `standards.version` are unchanged.
- [x] 8.4 Review the final OpenSpec artifacts and verification evidence, commit only this repository's verified changes on the feature branch, and leave push, merge, tag, consumer changes, and older-release deletion unperformed pending explicit authorization.
