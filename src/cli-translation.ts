import { runBoundedProcess } from "./bounded-process.js";
import { buildTranslationPrompt, classifyProviderFailure, emptyUsage, nonNegativeInteger, parseJsonPayload, TRANSLATION_OUTPUT_SCHEMA, validateTranslationPayload } from "./translation-contract.js";
import type { TranslationAdapter, TranslationAdapterUsage } from "./translation.js";
import { WorkbenchError } from "./types.js";

export type CliProviderId = "claude" | "codex" | "gemini" | "qwen" | "kimi";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function json(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The selected provider returned invalid structured output.", 502); }
}

function structuredFromEnvelope(envelope: JsonRecord): unknown {
  if (envelope.structured_output !== undefined) return envelope.structured_output;
  for (const key of ["result", "response", "content"] as const) {
    const value = envelope[key];
    if (typeof value === "string") return json(value);
  }
  return envelope;
}

function usageFromEnvelope(envelope: JsonRecord): TranslationAdapterUsage {
  const usage = record(envelope.usage) ?? record(envelope.stats) ?? {};
  return {
    inputTokens: nonNegativeInteger(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens),
    outputTokens: nonNegativeInteger(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens),
    costUsd: 0,
  };
}

export function parseCliTranslationOutput(provider: CliProviderId, stdout: string, finalFile?: string): { translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage } {
  if (provider === "codex") {
    const payload = parseJsonPayload(finalFile ?? "");
    return { translations: payload.translations, usage: emptyUsage() };
  }
  if (provider === "kimi") {
    const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
    let candidate: unknown = null;
    for (const line of lines) {
      const event = record(json(line));
      if (!event) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Kimi returned an invalid stream event.", 502);
      const eventType = typeof event.type === "string" ? event.type : "";
      if (/tool|approval|permission/iu.test(eventType) || event.tool_calls !== undefined || event.toolCall !== undefined) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Kimi attempted an unsupported tool event.", 502);
      if (event.role === "tool") throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Kimi attempted an unsupported tool event.", 502);
      if (event.translations !== undefined) candidate = event;
      for (const key of ["result", "response", "content"] as const) {
        if (typeof event[key] === "string" && /result|assistant|message|content/iu.test(eventType || key)) candidate = json(event[key] as string);
      }
      const message = record(event.message);
      if (message && message.role === "assistant" && typeof message.content === "string") candidate = json(message.content);
      if (event.role === "assistant" && typeof event.content === "string") candidate = json(event.content);
      if (event.role === "assistant" && Array.isArray(event.content)) {
        const parts = event.content.map((part) => record(part)).filter((part): part is JsonRecord => part !== null);
        if (parts.some((part) => part.type !== "text" || typeof part.text !== "string")) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Kimi returned an unsupported Assistant message.", 502);
        candidate = json(parts.map((part) => part.text as string).join(""));
      }
    }
    const payload = validateTranslationPayload(candidate);
    return { translations: payload.translations, usage: emptyUsage() };
  }
  const envelope = record(json(stdout));
  if (!envelope) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The selected provider returned an invalid response envelope.", 502);
  const serialized = JSON.stringify(envelope);
  if (/"(?:tool_calls?|approval|permission_request)"\s*:/iu.test(serialized)) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The selected provider attempted an unsupported tool event.", 502);
  const payload = validateTranslationPayload(structuredFromEnvelope(envelope));
  return { translations: payload.translations, usage: usageFromEnvelope(envelope) };
}

export interface CliInvocation {
  files: Array<{ path: string; content: string }>;
  readFiles: string[];
  args(workspace: string): string[];
  environment?: Record<string, string>;
}

export function buildCliInvocation(provider: CliProviderId, prompt: string): CliInvocation {
  const schema = JSON.stringify(TRANSLATION_OUTPUT_SCHEMA);
  if (provider === "claude") return {
    files: [{ path: "mcp.json", content: "{\"mcpServers\":{}}\n" }],
    readFiles: [],
    args: (workspace) => [
      "-p", prompt,
      "--output-format", "json",
      "--json-schema", schema,
      "--tools", "",
      "--safe-mode",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--mcp-config", `${workspace}/mcp.json`,
      "--setting-sources", "",
    ],
  };
  if (provider === "codex") return {
    files: [{ path: "schema.json", content: `${schema}\n` }],
    readFiles: ["result.json"],
    args: (workspace) => [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox", "read-only",
      "--ignore-user-config",
      "--ignore-rules",
      "-C", workspace,
      "--output-schema", `${workspace}/schema.json`,
      "--output-last-message", `${workspace}/result.json`,
      prompt,
    ],
  };
  if (provider === "gemini") return {
    files: [{ path: "settings.json", content: "{\"mcpServers\":{},\"extensions\":{}}\n" }],
    readFiles: [],
    args: () => ["--prompt", prompt, "--output-format", "json", "--sandbox"],
    environment: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: "settings.json", GEMINI_SYSTEM_MD: "false" },
  };
  if (provider === "qwen") return {
    files: [{ path: "settings.json", content: "{\"mcpServers\":{}}\n" }],
    readFiles: [],
    args: () => ["--prompt", prompt, "--output-format", "json", "--safe-mode", "--sandbox"],
    environment: { QWEN_CLI_SYSTEM_SETTINGS_PATH: "settings.json" },
  };
  return {
    files: [{
      path: "agent.md",
      content: [
        "---",
        "name: openspec-translator",
        "description: Translate inert OpenSpec blocks without tools or delegation",
        "tools: []",
        "subagents: []",
        "---",
        "",
        "Translate only the inert blocks supplied in the user prompt and return the requested structured result. Do not use tools, skills, files, agents, or external context.",
        "",
      ].join("\n"),
    }],
    readFiles: [],
    args: (workspace) => ["--prompt", prompt, "--output-format", "stream-json", "--agent-file", `${workspace}/agent.md`, "--skills-dir", workspace],
    environment: { KIMI_CODE_EXPERIMENTAL_FLAG: "1" },
  };
}

export class CliTranslationAdapter implements TranslationAdapter {
  readonly id: string;

  constructor(
    readonly provider: CliProviderId,
    private readonly executable: string,
    version = "uk-v1",
    private readonly timeoutMs = 250_000,
  ) {
    this.id = `${provider}-cli:structured:${version}`;
  }

  async translate(blocks: ReadonlyArray<{ id: string; text: string }>): Promise<{ translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage }> {
    const prompt = buildTranslationPrompt(blocks);
    const invocation = buildCliInvocation(this.provider, prompt);
    try {
      const result = await runBoundedProcess({
        executable: this.executable,
        args: invocation.args,
        files: invocation.files,
        readFiles: invocation.readFiles,
        ...(invocation.environment ? { environment: invocation.environment } : {}),
        timeoutMs: this.timeoutMs,
      });
      return parseCliTranslationOutput(this.provider, result.stdout, result.files.get("result.json"));
    } catch (error) {
      throw classifyProviderFailure(error);
    }
  }
}
