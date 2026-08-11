## 1. Provider-Neutral Translation Core

- [x] 1.1 Add the closed `none`, `agy`, `claude`, `codex`, `gemini`, `qwen`, `kimi`, and `ollama` provider types, public descriptors, processing classifications, closed diagnostics, and validation tests.
- [x] 1.2 Refactor translation routing so cache lookup, in-flight work, result provenance, and generation guards are keyed by the selected versioned adapter while preserving existing AGY cache identity.
- [x] 1.3 Implement a shared bounded subprocess runner with no shell, an owner-private empty working root, fixed startup environment policy, stdout/stderr/time limits, abort handling, process-tree termination, cleanup, and hostile fixture coverage.
- [x] 1.4 Add short cached non-inference availability probes for the fixed supported executable candidates and prove that catalogue discovery cannot launch inference, authentication, a browser, or browser-supplied process configuration.

## 2. Fixed CLI Adapters

- [x] 2.1 Extract the common inert-data translation prompt, strict JSON schema, protected-token validation, usage normalization, and provider-neutral error classifier from the AGY implementation.
- [x] 2.2 Migrate AGY to the shared runner without changing its versioned cache identity, and add fixture tests for valid output, authentication, quota, timeout, tool events, malformed output, and process cleanup.
- [x] 2.3 Implement fixed safe-profile adapters and fixture contracts for Claude Code and Codex CLI, including disabled tools, repository context, MCP/customization, and session persistence.
- [x] 2.4 Implement fixed safe-profile adapters and fixture contracts for Gemini CLI and Qwen Code, including sandboxed empty settings and rejection of unexpected stream or tool events.
- [x] 2.5 Implement the Kimi Code adapter with an application-owned no-tools agent profile and empty skills directory, and keep it unavailable when the installed version cannot prove the required profile.

## 3. Local Ollama Adapter

- [x] 3.1 Add bounded discovery for the fixed `http://127.0.0.1:11434` endpoint and return only validated installed model ids without redirects, downloads, arbitrary hosts, or raw diagnostics.
- [x] 3.2 Add browser-local Ollama model selection restricted to the discovered allowlist and include the selected model in the versioned adapter/cache identity.
- [x] 3.3 Implement bounded structured Ollama translation and hostile local-server tests for timeout, response size, redirects, invalid schema, missing ids, and protected-token corruption.

## 4. Protected Routes and User Interface

- [x] 4.1 Add protected provider-catalogue data and validate the selected closed provider on cache-only and translation routes before constructing any adapter.
- [x] 4.2 Replace the AGY-only settings control with the approved provider selector, no-provider state, availability/configuration status, Ollama model selector, and localized provider-specific disclosure and setup guidance.
- [x] 4.3 Persist validated provider and Ollama model preferences across reloads, migrate an existing `agy` preference unchanged, and prove that English mode or `none` never launches provider work.
- [x] 4.4 Make translation progress, counters, activity events, and failures provider neutral while displaying the selected provider name and excluding prompts, reasoning, commands, paths, stderr, account data, and raw responses.
- [x] 4.5 Cover provider switching during in-flight work, unavailable stored providers, cached-only rendering, reload restoration, keyboard access, narrow layouts, and exact-English fallback in UI and end-to-end tests.
- [x] 4.6 Keep the Ollama model control hidden unless Ollama is selected, widen and layer the settings panel above plan content, remove the duplicated disclosure outside settings, and add focused UI-contract coverage.
- [x] 4.7 Restore the global header stacking order so Activity and Branches panels always overlay translation settings, with focused regression coverage.

## 5. Documentation and Verification

- [x] 5.1 Document the seven optional providers, installation/authentication ownership, local-versus-remote processing, no-provider default, Ollama loopback restriction, cache provenance, and the absence of automatic installs or consumer-repository writes.
- [x] 5.2 Run `npm run openspec -- validate support-pluggable-translation-providers --strict --no-interactive` and retain evidence that the proposal, specification, design, and task list pass strict validation.
- [x] 5.3 Run `npm run typecheck`, `npm test`, `npm run test:security`, and `npm run test:contrast`; retain evidence for type safety, provider contracts, hostile input isolation, browser behavior, accessibility, and visual contrast.
- [x] 5.4 Run `npm run verify:bundle` and `npm audit --audit-level=high`; retain deterministic bundle evidence and confirm that no high-severity dependency finding was introduced.
- [x] 5.5 Run bounded installed-tool `--version` probes without plan text, restart only the local `openspec-workbench` runtime, and verify provider selection, AGY compatibility, one available alternative CLI, unavailable providers, Ollama-unavailable behavior, persisted selection, and provider-visible background progress on `plans.internal`.
- [x] 5.6 Re-run the affected type, UI, contrast, bundle, and strict OpenSpec gates; restart only `openspec-workbench` and verify the corrected settings interaction on `plans.internal`.
- [x] 5.7 Re-run affected gates, restart only `openspec-workbench`, and verify Activity plus translation settings layering together on `plans.internal`.
