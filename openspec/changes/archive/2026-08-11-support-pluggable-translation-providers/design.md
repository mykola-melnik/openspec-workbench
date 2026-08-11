## Context

See `proposal.md` and `specs/pluggable-translation-providers/spec.md`. The current server constructs one `AgyTranslationAdapter` and one `TranslationService` per isolated worktree child. The browser already persists a provider id, the translation cache already includes `adapterId`, and all accepted output already passes block-id, token, secret, path, and size checks. However, the provider type is a single-value `"agy"`, the server rejects every other id, diagnostics and activity copy name AGY directly, and the settings control has one option.

The application is local and read-only with respect to consumer repositories, but translation necessarily sends selected plan blocks to the chosen model boundary. CLI authentication belongs to each installed tool. Provider preferences are derived machine-local state, never Git-reviewed planning state.

Official headless contracts currently provide bounded non-interactive output for AGY, Claude Code, Codex CLI, Gemini CLI, Qwen Code, and Kimi Code. Ollama exposes a fixed loopback API suitable for local structured output.

## Goals / Non-Goals

**Goals:**

- Make provider discovery and selection deterministic, explicit, local, and provider neutral.
- Reuse installed CLI authentication without copying credentials or opening login flows.
- Prevent provider choice from granting repository, shell, edit, browser, plugin, skill, hook, or arbitrary MCP authority.
- Keep one validated translation contract and provider-qualified cache semantics across all adapters.
- Preserve exact English content and safe cached output through every unavailable, unauthenticated, quota, timeout, and invalid-response state.

**Non-Goals:**

- A generic agent gateway, arbitrary executable form, model benchmark, provider installer, account manager, or billing console.
- Passing the consumer root, OpenSpec files, filenames, Git data, or application capabilities to a provider.
- Sharing provider preferences between machines.
- Treating model output, reasoning, or usage estimates as authoritative planning evidence.

## Decisions

### Use one closed provider registry and one adapter contract

Introduce a registry with the public ids `agy`, `claude`, `codex`, `gemini`, `qwen`, `kimi`, and `ollama`. Each descriptor owns a localized-copy key, processing class, remote destination key, availability probe, adapter factory, configuration state, and versioned adapter id. The browser receives only descriptor data and never executable paths, arguments, environment, secrets, or raw probe output.

`TranslationService` becomes request-scoped by selected adapter rather than process-scoped to AGY. The protected cache-only and translate routes both validate a provider id, resolve its descriptor, and construct or reuse only that adapter. Shared in-flight work is keyed by watcher generation, change id, and adapter id so switching providers cannot join another provider's request.

A generic command adapter configured from the UI was rejected because it would turn a read-only viewer into an arbitrary local command runner. Dynamically loading third-party adapter code was rejected for the first public release because it adds code-signing, update, sandbox, and supply-chain ownership.

### Probe installation without inference or authentication

CLI availability uses a fixed executable candidate and a short `--version` process with ignored stdin, bounded output, no shell, and a non-consumer working directory. Environment overrides remain startup-only test/operator inputs and are never returned to the browser. A successful version probe means installed, not authenticated; authentication is classified only from a real explicit translation request.

Ollama is available only when its fixed loopback endpoint responds within a short bound and at least one locally installed model can satisfy the configured model id. Discovery never downloads a model, opens a browser, or sends plan content.

Running each provider's interactive login or a zero-content model prompt was rejected because discovery must be side-effect free and must not consume quota.

### Execute CLI adapters from an empty application-owned workspace

Every request creates an owner-private temporary directory containing only the generated JSON schema or agent profile required by that adapter. The subprocess `cwd` is that directory, never the consumer root. Arguments are arrays passed directly to `spawn` with `shell: false`; stdin is ignored or receives only the bounded prompt where required. The runner owns stdout/stderr caps, timeout, abort state, and process-group termination. Temporary files are removed after the process settles.

Provider profiles are fixed and versioned:

| Provider | Headless/output profile | Isolation profile |
| --- | --- | --- |
| AGY | print, JSON schema, JSON envelope | plan mode, sandbox, slash commands disabled |
| Claude | print, JSON schema, JSON envelope | safe mode, no tools, no MCP, no session persistence, customizations disabled |
| Codex | `exec`, output schema, final-message file | ephemeral, read-only sandbox, ignore rules/config, empty working root |
| Gemini | prompt, JSON output | sandbox, empty working root, fixed settings without extensions/MCP |
| Qwen | prompt, JSON output | safe mode, sandbox, empty working root |
| Kimi | prompt, stream-JSON final response | application-owned agent profile excluding built-in tools and empty skills directory |

The common prompt treats blocks as inert data, forbids tools and commentary, requires every id exactly once, and preserves protected tokens. Provider parsers extract only the final structured payload and normalized usage. A tool event, approval request, missing id, duplicate id, extra field, token corruption, unexpected stream event, or trailing unparsed output fails closed.

Relying only on the prompt was rejected because prompt text is not a security boundary. Reusing the consumer directory in read-only mode was rejected because plan content outside the selected blocks would still become discoverable.

### Use Ollama's fixed loopback API for local structured translation

The Ollama descriptor is grouped with provider choices but uses `http://127.0.0.1:11434` rather than an agentic CLI. The endpoint is fixed in code, redirects are disabled, addresses other than loopback are rejected, response size/time are bounded, and the request asks a configured installed model for the same JSON schema. The UI can choose only a model returned by the bounded local model list; it cannot submit a host or arbitrary model download request.

Invoking `ollama run` was rejected because its ordinary CLI output does not provide the same reliable schema and usage boundary. Supporting remote Ollama hosts was deferred because it would require SSRF, TLS, authentication, and disclosure rules equivalent to a generic endpoint feature.

### Keep selection non-secret and make no-provider the safe default

The existing versioned browser-local provider preference expands to the closed provider ids plus `none`. A missing new preference resolves to `none`, except the existing exact `agy` value remains valid for upgrade compatibility. The language preference remains independent: Ukrainian and side-by-side modes can show exact English while provider setup is incomplete.

Provider selection updates disclosure before any automatic missing-block request. Selecting a provider is the user's durable authorization to send future screened cache misses through that provider while the non-English mode remains active. The user can switch to `none` or English at any time; in-flight work may complete server-side but generation/provider guards prevent it from replacing a newer selection.

Auto-selecting the first installed CLI was rejected because installation does not equal consent to send plan text.

### Keep provider configuration contextual and contained

The translation settings trigger owns a single overlay panel above the plan surface. The panel has a bounded responsive width large enough for localized provider guidance and a stacking layer above the title and artifact content, but below the global header and its Activity and Branches panels. Provider disclosure appears only inside that panel; the persistent language-control row does not repeat the same egress sentence.

The Ollama model field is conditional configuration, not a global translation setting. Its label, selector, placeholder, and model-status copy render only while Ollama is selected. Other providers show only their own availability and disclosure state.

Keeping the Ollama control permanently visible was rejected because it falsely suggests that every provider requires an Ollama model. Repeating disclosure beside the language controls was rejected because it adds noise after the reader has already made a durable provider choice and can reopen settings when needed.

### Preserve provider-qualified cache and neutralize runtime copy

Keep `adapterId` in the cache key and include adapter contract version and configured model identity where output behavior changes. Switching providers therefore does not silently reuse or relabel another provider's result. Accepted blocks remain independently durable and exact English remains the fallback.

Client and activity copy use the provider descriptor's localized display name. Diagnostics become provider-neutral categories such as unavailable, authentication-required, quota-or-balance, timeout, invalid-output, and failed; provider-specific guidance is chosen only from the closed id. Raw stderr and API responses remain server-only bounded classification input and are discarded.

Provider-neutral cache sharing was rejected because a user switching providers may be explicitly seeking different output quality and because provenance would become ambiguous.

## Risks / Trade-offs

- [A CLI changes flags or output shape] → Version each adapter profile, parse fail-closed, run fixture contracts, and mark the provider unavailable or failed rather than guessing.
- [A CLI still loads user customization] → Combine provider safe flags with an empty working root, empty fixed settings, disabled tool lists, bounded event parsing, and no consumer path in the process environment or prompt.
- [A provider can read the user's home through its own runtime] → Pass only the minimum authentication-bearing environment/home required by that CLI, disable tools, and document that the installed CLI remains part of the trusted computing base.
- [Kimi or Qwen lacks a complete no-tools flag] → Use fixed safe/agent profiles, empty roots, fail on tool events, and keep the adapter disabled if the installed version cannot prove the required profile.
- [Provider switching duplicates cost] → Keep cache provenance correct and expose cache/missing counts before a new provider runs.
- [Seven adapters increase maintenance] → Share one bounded runner and validation envelope while keeping small provider-specific argument builders/parsers and official-contract fixtures.
- [Availability checks slow page load] → Cache short probe results, perform them concurrently with a small bound, and render the rest of the Workbench before provider status settles.

## Migration Plan

1. Introduce provider-neutral types, diagnostics, registry, fixture runner, and cache routing while preserving the AGY adapter id and current translation behavior for stored AGY users.
2. Add provider catalogue and no-provider UI state, then implement CLI adapters behind availability probes.
3. Add fixed-loopback Ollama model discovery, selection, and translation support.
4. Update the contained overlay settings, contextual Ollama control, settings-only disclosure, progress, activity, documentation, and public setup guidance.
5. Run strict OpenSpec validation, typecheck, all unit/E2E/security/contrast/bundle checks, dependency audit, fixture contracts for every provider, and installed `--version` smoke probes without sending plan text.
6. Restart only `openspec-workbench`; verify AGY plus at least one alternative installed CLI, provider switching, unavailable providers, no-provider behavior, Ollama unavailable behavior, and responsive settings.

Rollback restores the preceding deterministic bundle. New provider-qualified cache files and browser-local preferences are inert to older versions; no consumer migration exists.
