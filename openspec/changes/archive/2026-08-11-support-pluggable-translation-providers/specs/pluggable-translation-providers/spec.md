## Purpose

Lets each reader safely choose a supported local CLI or local Ollama model for derived Ukrainian plan translation without weakening repository isolation or exact-English fallback.

## ADDED Requirements

### Requirement: Workbench exposes a closed translation-provider catalogue
The Workbench SHALL expose only the built-in provider ids `agy`, `claude`, `codex`, `gemini`, `qwen`, `kimi`, and `ollama`, SHALL classify each as local CLI or local model, and SHALL report bounded configured and availability states without sending plan text or launching a model inference.

#### Scenario: Installed CLI is discovered
- **WHEN** the protected provider catalogue is requested and a supported executable passes its bounded non-inference probe
- **THEN** the settings UI shows that provider as available with its localized destination and provider type

#### Scenario: Supported CLI is absent
- **WHEN** a supported executable is not found or its bounded probe cannot complete
- **THEN** the provider remains visible as unavailable with safe setup guidance and cannot be selected for a new translation request

#### Scenario: Ollama has no installed model
- **WHEN** the fixed loopback Ollama endpoint is unavailable or it reports no installed model
- **THEN** Ollama remains visible as unavailable and no model is downloaded or invoked

#### Scenario: Unknown provider is requested
- **WHEN** a browser supplies a provider id outside the closed catalogue
- **THEN** the server rejects it without executing a process, making a network request, or reflecting the value into diagnostics

### Requirement: Reader explicitly selects the translation provider
The Workbench SHALL default a new browser profile to no provider, SHALL preserve a validated existing AGY preference, SHALL persist later non-secret provider ids in browser-local preferences, and SHALL require an available selected provider before translating an uncached block.

#### Scenario: New reader opens Ukrainian presentation
- **WHEN** no provider preference exists and a reader selects Ukrainian or side-by-side presentation
- **THEN** cached translations may render but uncached English blocks remain exact and no provider receives them until the reader selects a provider

#### Scenario: Existing AGY reader upgrades
- **WHEN** the validated stored provider preference is `agy`
- **THEN** AGY remains selected and existing AGY-qualified cache entries remain reusable

#### Scenario: Reader changes provider
- **WHEN** the reader selects a different available provider in settings
- **THEN** the new provider id is persisted, provider-specific disclosure updates immediately, and later uncached translation requests use only that provider

#### Scenario: Reader opens translation settings
- **WHEN** the reader opens the translation settings panel
- **THEN** the panel overlays plan content, provides enough width for its localized copy, and keeps provider disclosure inside the panel rather than duplicating it beside the language controls, while global header menus remain above it

#### Scenario: Reader opens a global header menu
- **WHEN** Activity or Branches is opened while the translation settings control is visible
- **THEN** the global header panel overlays the translation settings trigger and panel without clipped or interleaved controls

#### Scenario: Reader has not selected Ollama
- **WHEN** the selected provider is not Ollama
- **THEN** no Ollama model label, selector, placeholder, or model-availability message is shown

#### Scenario: Reader selects Ollama
- **WHEN** Ollama is selected
- **THEN** the model control appears inside translation settings and offers only the bounded discovered local models

#### Scenario: Stored provider becomes unavailable
- **WHEN** the selected CLI is removed, loses configuration, or fails its availability probe
- **THEN** exact English and accepted cache entries remain visible while new translation stays disabled with safe provider-specific guidance

### Requirement: Translation egress is explicit and provider specific
Before an uncached translation request can run, the Workbench SHALL identify the selected provider, whether processing is local or remote, the external service that may receive screened text, and whether CLI account authorization is required. Selecting English SHALL never invoke a provider.

#### Scenario: Reader selects a remote CLI provider
- **WHEN** Claude, Codex, Gemini, Qwen, Kimi, or AGY is selected
- **THEN** settings state that screened plan blocks are passed through that local CLI to its configured remote model service before any automatic missing-block request starts, without repeating that disclosure outside the settings panel

#### Scenario: Reader selects Ollama
- **WHEN** Ollama is selected with an installed local model
- **THEN** settings identify local processing and the Workbench does not send the request to a Workbench-owned remote endpoint

#### Scenario: Reader switches to English
- **WHEN** English presentation is selected
- **THEN** no cache miss launches a CLI or API translation request

### Requirement: Supported CLI adapters execute through bounded fixed profiles
Each CLI adapter SHALL launch its fixed executable without a shell, from an application-owned non-consumer working directory, with a bounded prompt, timeout, output, environment, and process tree. It SHALL disable repository context, skills, plugins, hooks, MCP servers, file, shell, edit, browsing, and session persistence where the supported CLI provides controls, and SHALL accept only a validated provider-specific structured result containing the requested translation ids.

#### Scenario: CLI returns a valid result
- **WHEN** the selected installed CLI completes within bounds and its final structured response round-trips every requested id and protected token
- **THEN** accepted Ukrainian blocks are returned with bounded usage and the provider-qualified adapter id

#### Scenario: CLI attempts tool use or customization
- **WHEN** the provider emits a tool event, requests approval, loads disallowed project customization, or returns content outside its final response contract
- **THEN** the request fails closed, the process tree is terminated, and no tool result or raw diagnostic reaches the browser

#### Scenario: CLI hangs or exceeds output bounds
- **WHEN** the CLI exceeds its timeout or stdout/stderr limit
- **THEN** the full process tree is terminated and the browser receives only the allowlisted timeout or provider-failure category

#### Scenario: Executable path is manipulated
- **WHEN** a browser attempts to supply an executable, argument, working directory, environment variable, or shell fragment
- **THEN** the server rejects the request and uses no browser-controlled process configuration

### Requirement: Translation cache remains provider qualified and reusable
The Workbench SHALL key accepted translations by normalized English source, locale, prompt and parser versions, and provider adapter id. It SHALL reuse matching entries across sessions without launching that provider and SHALL NOT silently relabel one provider's output as another provider's result.

#### Scenario: Matching provider cache exists
- **WHEN** the selected provider has an accepted cache entry for the exact source and contract versions
- **THEN** the Ukrainian block renders from private cache without CLI or API execution

#### Scenario: Reader switches providers
- **WHEN** a source is cached under another provider but not under the newly selected provider
- **THEN** the exact English fallback remains available and the newly selected provider may translate it as a separate cache identity

#### Scenario: One block fails validation
- **WHEN** a provider returns several translations and one block violates token or round-trip validation
- **THEN** accepted blocks are cached independently while the invalid block retains exact English and a bounded failed count

### Requirement: Provider progress and failures remain neutral and safe
The Workbench SHALL identify the selected provider in visible progress and activity events, SHALL use provider-neutral closed diagnostic categories with localized provider-specific guidance, and SHALL NOT expose prompts, reasoning, tool events, command lines, stderr, secrets, account identifiers, absolute paths, or raw API responses.

#### Scenario: Translation starts and completes
- **WHEN** any selected provider begins and settles a missing-block request
- **THEN** the plan and activity feed show its display name, bounded block counts, and observed lifecycle without attributing repository edits to that provider

#### Scenario: Authentication or quota fails
- **WHEN** a CLI reports an authentication, balance, quota, or rate-limit condition
- **THEN** exact English and accepted cache entries remain visible with safe guidance for the selected provider

#### Scenario: Page reloads during or after work
- **WHEN** the browser reloads
- **THEN** the selected provider preference and accepted cache results are restored while raw provider execution state is not reconstructed in the browser
