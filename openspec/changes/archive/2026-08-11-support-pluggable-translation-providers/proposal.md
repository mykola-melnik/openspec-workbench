## Why

The Workbench currently presents a provider setting but accepts only AGY, so a public release would require every reader to install and authorize one private-default CLI. Readers need to choose a supported local CLI or local model runtime that they already trust, while the Workbench preserves its read-only repository boundary and makes text egress visible.

## What Changes

- Replace the AGY-only selector with a localized translation-provider registry that reports configured, available, unavailable, and authentication-required states without launching a model or sending plan text during discovery.
- Support built-in adapters for AGY, Claude Code, Codex CLI, Gemini CLI, Qwen Code, Kimi Code, and local Ollama, using each installed tool's bounded non-interactive mode and one validated translation envelope.
- Default a new installation to no remote provider. Preserve an existing validated AGY preference, and persist later provider choices as browser-local non-secret ids.
- Require an explicit provider selection before uncached text leaves the machine. Show provider-specific disclosure, destination, local-versus-remote classification, configuration state, and safe failure guidance only inside translation settings. Keep provider-specific fields contextual, including hiding the Ollama model control unless Ollama is selected, and render the settings panel above plan content with enough width for its copy.
- Preserve screened block input, technical-token masking, strict output validation, exact English fallback, provider-qualified cache identity, bounded process/network execution, and automatic reuse of accepted cached translations.
- Do not accept arbitrary shell commands, executable arguments, endpoints, headers, or environment variables from the browser.

Non-goals:

- Installing, upgrading, authenticating, or purchasing access to third-party CLIs and model services.
- Exposing a generic command runner, plugin marketplace, remote model API, arbitrary OpenAI-compatible endpoint, or model-comparison benchmark.
- Writing translations or provider preferences into consumer repositories.
- Guaranteeing that every provider account or model supports Ukrainian equally well.

Compatibility impact is additive for plan projection and cache data. Existing exact English plans, stable URLs, OpenSpec versions, AGY cache entries, and a stored `agy` preference remain valid. New provider cache entries remain isolated by adapter id and version.

The security boundary remains loopback-only and capability protected. CLI adapters receive only screened translation blocks, run without a shell from a non-consumer working directory with provider-specific tools and customization disabled where supported, and expose only allowlisted diagnostics. Ollama requests remain fixed to a bounded loopback endpoint.

Release strategy: ship the registry and adapters disabled unless detected or configured, verify every adapter against fixture executables plus installed-tool smoke checks that do not transmit plan text, restart only the local `openspec-workbench` runtime for controlled evidence, and retain the preceding deterministic bundle for rollback. No consumer repository, deployment, tag, push, or provider installation is implied.

## Capabilities

### New Capabilities

- `pluggable-translation-providers`: Safe discovery, selection, configuration, execution, disclosure, diagnostics, and caching for supported local CLI and Ollama translation providers.

### Modified Capabilities

None.

## Impact

- Application UI: overlay translation settings, contextual provider status and Ollama model selection, settings-only disclosure, progress, and provider-neutral activity copy.
- Runtime: provider registry, CLI adapters, fixed-loopback Ollama adapter, availability probes, request routing, safe diagnostics, and provider-qualified cache behavior.
- Security and privacy: bounded subprocess profiles, tool/customization suppression, non-consumer working directories, loopback-only Ollama access, no arbitrary command execution, and explicit egress disclosure.
- Tests and documentation: fixture adapters, hostile provider payloads, local API/CLI timeout and output bounds, authorization failures, provider switching, cache isolation, responsive settings, and public installation guidance.
- External systems: optional user-installed AGY, Claude Code, Codex CLI, Gemini CLI, Qwen Code, Kimi Code, or Ollama; none becomes an application dependency.
