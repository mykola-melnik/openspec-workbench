## Context

See `proposal.md` for motivation. The current checkout combines application source with durable planning and verification evidence collected on a private development machine. The runtime itself is designed for one canonical worktree, loopback-only serving, capability URLs, and machine-local derived state; publication must not weaken those boundaries or expose unrelated consumer repositories.

The private Git history also contains author email addresses and earlier machine-specific evidence. Sanitizing only the current tree would therefore be insufficient if the existing object graph were pushed to a public remote.

## Goals / Non-Goals

**Goals:**

- Produce a repeatably verifiable public source tree with no private operational provenance.
- Add the legal, community, security, dependency-attribution, and CI metadata expected of a public repository.
- Preserve the deterministic release and its existing runtime/security behavior.
- Make portability limits and optional managed-Mac integration explicit.
- Define a clean-snapshot handoff that can be completed after the GitHub URL is supplied.

**Non-Goals:**

- Changing UI layout, localized copy, interaction, navigation, or responsive behavior.
- Renaming the npm package before the final GitHub identity is known.
- Removing the intentional `plans.internal` deployment option from product code.
- Publishing to npm, creating a GitHub repository, adding a remote, pushing, tagging, deploying, or modifying a consumer repository.
- Rewriting or deleting the private repository's local history.

## Decisions

### 1. Publish an MIT-licensed clean snapshot

The public project will use the MIT License, matching the permissive model used by upstream OpenSpec and fitting a small developer tool intended for broad reuse. A root `LICENSE` file and package metadata will be authoritative. This is a project licensing choice, not legal advice; the owner must confirm they hold the rights to publish before any push.

The public GitHub repository will start from a clean snapshot commit rather than receive the current private Git graph. The existing checkout remains the private development repository, so rollback is simply abandoning the prepared snapshot or deleting the not-yet-published temporary worktree. Alternatives considered were pushing the complete history or rewriting it in place; both create unnecessary privacy and recovery risk.

### 2. Sanitize durable content, not intentional product configuration

Tracked documentation and OpenSpec artifacts will replace real paths, private Git hosts, unrelated consumer names, exact process identifiers, and machine evidence with portable terms such as `<consumer-worktree>` or clearly synthetic fixture values. Source and tests may retain absolute-path examples only when the paths are generic and required to verify containment behavior.

The managed local-domain feature remains supported. `plans.internal` is an intentional configurable deployment example, so it may remain in code and user documentation when labeled as optional rather than portable default behavior. This avoids conflating a product feature with leaked private provenance.

### 3. Make readiness executable

A purpose-specific repository script will inspect tracked publication inputs for prohibited private markers and high-confidence credential forms. It will emit file-relative diagnostics only, fail closed, and be included in the canonical verification command. The check complements, but does not replace, GitHub secret scanning or a dedicated pre-publication history scanner.

The script's allowlist will be narrow and explicit for synthetic security fixtures. Broad regex exclusions are rejected because they would make future regressions invisible.

### 4. Use existing verification as the CI authority

GitHub Actions will use a clean checkout, the repository-pinned Node release, `npm ci`, `npm run verify`, and `npm audit --audit-level=high`. Automation receives only read access to repository contents and will not contain deployment credentials. Dependency update configuration will target npm and GitHub Actions on a conservative schedule.

The application continues to treat Git-reviewed English OpenSpec files as authoritative; CI only validates them. No plan mutation, branch switching, consumer discovery, external deployment, or release publishing occurs in the workflow.

### 5. Preserve legal material in bundled output

The deterministic build will retain end-of-file legal comments instead of discarding them. A generated or maintained third-party notice will identify bundled runtime dependencies and license sources without copying large license texts unnecessarily. Bundle fixtures and hashes will be regenerated and verified.

### 6. Resolve destination-dependent links together

The confirmed public destination is `https://github.com/mykola-melnik/openspec-workbench`. Repository, homepage, issue, security, badge, clone, and compatibility-schema links are updated as one verified set so no stale placeholder or private remote is published.

## Risks / Trade-offs

- [A private marker is missed by pattern matching] -> Combine tracked-tree scanning, manual diff review, a dedicated history scan before push, and GitHub secret scanning after publication.
- [Sanitization weakens useful verification evidence] -> Preserve the invariant and command outcome while removing host-specific paths, PIDs, hashes, and consumer names.
- [Clean history loses development chronology] -> Keep the private repository intact; publish concise release notes and the archived OpenSpec design record as the durable public rationale.
- [MIT licensing is incompatible with ownership obligations] -> Block publication until the owner confirms the right to license all original material and reviews bundled third-party notices.
- [Legal-comment retention changes deterministic hashes] -> Rebuild all release outputs, update committed hashes through the existing build workflow, and run `verify:bundle` twice.
- [Public CI behaves differently on Linux] -> Keep platform-sensitive behavior behind existing adapters/fixtures and record any managed-Mac-only verification as a separate manual release gate.

## Migration Plan

1. Add and validate this OpenSpec change.
2. Sanitize the tracked tree and add public metadata, checks, CI, and notices.
3. Run the complete local verification, dependency audit, diff check, and public-readiness scan.
4. Record the final GitHub URL in destination-dependent metadata and repeat every gate.
5. Create a separate clean publication checkout containing only the approved tree; confirm its object graph excludes the private history.
6. Present the final diff, scan evidence, ownership gate, and exact destination for explicit authorization.
7. Only after authorization, push the clean main branch. Tags, releases, npm publication, deployment, and consumer upgrades remain separate explicit actions.

Rollback before publication is to discard the temporary public snapshot. Rollback after publication is a new corrective commit or, for a confirmed secret exposure, GitHub's documented sensitive-data removal procedure plus credential rotation; ordinary public history will not be rewritten casually.
