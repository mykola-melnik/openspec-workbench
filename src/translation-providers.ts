import os from "node:os";
import path from "node:path";
import { AgyTranslationAdapter } from "./agy-translation.js";
import { probeExecutable, runBoundedProcess } from "./bounded-process.js";
import { CliTranslationAdapter, type CliProviderId } from "./cli-translation.js";
import { discoverOllamaModels, OllamaTranslationAdapter, validateOllamaModel } from "./ollama-translation.js";
import type { TranslationAdapter } from "./translation.js";
import { WorkbenchError } from "./types.js";

export const translationProviderIds = ["agy", "claude", "codex", "gemini", "qwen", "kimi", "ollama"] as const;
export type TranslationProviderId = typeof translationProviderIds[number];
export type TranslationProviderPreference = "none" | TranslationProviderId;
export type TranslationProcessing = "remote-cli" | "local-model";

export interface TranslationProviderPublic {
  id: TranslationProviderId;
  displayName: string;
  processing: TranslationProcessing;
  destination: string;
  available: boolean;
  status: "available" | "unavailable" | "authentication-required" | "quota-limited";
  models: string[];
}

interface ProviderDefinition {
  id: TranslationProviderId;
  displayName: string;
  processing: TranslationProcessing;
  destination: string;
  executable?: string;
  probeArgs?: readonly string[];
}

function defaultExecutable(id: Exclude<TranslationProviderId, "ollama">): string {
  const environmentKey = `OPEN_SPEC_WORKBENCH_${id.toUpperCase()}_BIN`;
  const override = process.env[environmentKey];
  if (override) return override;
  if (process.platform !== "darwin") return id;
  if (id === "agy" || id === "codex" || id === "qwen") return path.join(os.homedir(), ".local", "bin", id);
  if (id === "kimi") return path.join(os.homedir(), ".kimi-code", "bin", "kimi");
  if (id === "claude") return "/opt/homebrew/bin/claude";
  return id;
}

const providerDefinitions: readonly ProviderDefinition[] = [
  { id: "agy", displayName: "AGY", processing: "remote-cli", destination: "Gemini / Google", executable: defaultExecutable("agy") },
  { id: "claude", displayName: "Claude Code", processing: "remote-cli", destination: "Claude / Anthropic", executable: defaultExecutable("claude") },
  { id: "codex", displayName: "Codex CLI", processing: "remote-cli", destination: "Codex / OpenAI", executable: defaultExecutable("codex") },
  { id: "gemini", displayName: "Gemini CLI", processing: "remote-cli", destination: "Gemini / Google", executable: defaultExecutable("gemini") },
  { id: "qwen", displayName: "Qwen Code", processing: "remote-cli", destination: "Qwen / Alibaba Cloud", executable: defaultExecutable("qwen") },
  { id: "kimi", displayName: "Kimi Code", processing: "remote-cli", destination: "Kimi / Moonshot AI", executable: defaultExecutable("kimi"), probeArgs: ["--help"] },
  { id: "ollama", displayName: "Ollama", processing: "local-model", destination: "This computer" },
] as const;

export function isTranslationProviderId(value: unknown): value is TranslationProviderId {
  return typeof value === "string" && (translationProviderIds as readonly string[]).includes(value);
}

export function isTranslationProviderPreference(value: unknown): value is TranslationProviderPreference {
  return value === "none" || isTranslationProviderId(value);
}

export interface TranslationProviderSelection {
  provider: TranslationProviderId;
  model?: string;
}

export class TranslationProviderRegistry {
  #catalogue: { expiresAt: number; value: TranslationProviderPublic[] } | null = null;
  #runtimeStatus = new Map<TranslationProviderId, TranslationProviderPublic["status"]>();

  constructor(private readonly agyOverride?: TranslationAdapter) {}

  async catalogue(force = false): Promise<TranslationProviderPublic[]> {
    const now = Date.now();
    if (!force && this.#catalogue && this.#catalogue.expiresAt > now) return this.#catalogue.value.map((item) => ({ ...item, models: [...item.models] }));
    const values = await Promise.all(providerDefinitions.map(async (definition): Promise<TranslationProviderPublic> => {
      if (definition.id === "ollama") {
        const models = await discoverOllamaModels();
        const available = models.length > 0;
        return { ...definition, available, status: available ? this.#runtimeStatus.get(definition.id) ?? "available" : "unavailable", models };
      }
      let available = definition.id === "agy" && this.agyOverride !== undefined;
      if (!available && definition.executable) {
        if (definition.id === "kimi") {
          try {
            const help = await runBoundedProcess({ executable: definition.executable, args: definition.probeArgs ?? ["--version"], timeoutMs: 5_000, maxStdoutBytes: 128 * 1024, maxStderrBytes: 128 * 1024 });
            const text = `${help.stdout}\n${help.stderr}`;
            available = text.includes("--agent-file") && text.includes("--skills-dir") && text.includes("stream-json");
          } catch { available = false; }
        } else {
          available = await probeExecutable(definition.executable);
        }
      }
      return { id: definition.id, displayName: definition.displayName, processing: definition.processing, destination: definition.destination, available, status: available ? this.#runtimeStatus.get(definition.id) ?? "available" : "unavailable", models: [] };
    }));
    this.#catalogue = { expiresAt: now + 15_000, value: values };
    return values.map((item) => ({ ...item, models: [...item.models] }));
  }

  reportDiagnostic(provider: TranslationProviderId, diagnostic: string | null): void {
    if (diagnostic === "TRANSLATION_PROVIDER_AUTH_REQUIRED") this.#runtimeStatus.set(provider, "authentication-required");
    else if (diagnostic === "TRANSLATION_PROVIDER_QUOTA") this.#runtimeStatus.set(provider, "quota-limited");
    else if (diagnostic === null) this.#runtimeStatus.set(provider, "available");
    this.#catalogue = null;
  }

  async resolve(selection: TranslationProviderSelection, requireAvailable = true): Promise<TranslationAdapter> {
    if (!isTranslationProviderId(selection.provider)) throw new WorkbenchError("TRANSLATION_PROVIDER_UNSUPPORTED", "The selected translation provider is not supported.", 400);
    const catalogue = await this.catalogue();
    const descriptor = catalogue.find((item) => item.id === selection.provider);
    if (requireAvailable && !descriptor?.available) throw new WorkbenchError("TRANSLATION_ADAPTER_UNAVAILABLE", "The selected translation provider is not available.", 503);
    if (selection.provider === "ollama") {
      if (typeof selection.model !== "string") throw new WorkbenchError("TRANSLATION_MODEL_REQUIRED", "Select an installed Ollama model.", 400);
      const model = validateOllamaModel(selection.model);
      if (requireAvailable && !descriptor?.models.includes(model)) throw new WorkbenchError("TRANSLATION_MODEL_UNSUPPORTED", "The selected Ollama model is not installed.", 400);
      return new OllamaTranslationAdapter(model);
    }
    if (selection.model !== undefined) throw new WorkbenchError("TRANSLATION_MODEL_UNSUPPORTED", "This provider does not accept a browser-selected model.", 400);
    if (selection.provider === "agy") return this.agyOverride ?? new AgyTranslationAdapter();
    const definition = providerDefinitions.find((item) => item.id === selection.provider);
    if (!definition?.executable) throw new WorkbenchError("TRANSLATION_ADAPTER_UNAVAILABLE", "The selected translation provider is not available.", 503);
    return new CliTranslationAdapter(selection.provider as CliProviderId, definition.executable);
  }

  async close(): Promise<void> {
    await this.agyOverride?.close?.();
  }
}
