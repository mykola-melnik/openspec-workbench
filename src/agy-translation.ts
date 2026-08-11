import os from "node:os";
import path from "node:path";
import { runBoundedProcess } from "./bounded-process.js";
import { buildTranslationPrompt, classifyProviderFailure, nonNegativeInteger, TRANSLATION_OUTPUT_SCHEMA, validateTranslationPayload } from "./translation-contract.js";
import type { TranslationAdapter, TranslationAdapterUsage } from "./translation.js";
import { WorkbenchError } from "./types.js";

type AgyEnvelope = {
  status?: unknown;
  response?: unknown;
  structured_output?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
};

export function parseAgyTranslationOutput(stdout: string): { translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage } {
  let envelope: AgyEnvelope;
  try {
    envelope = JSON.parse(stdout) as AgyEnvelope;
  } catch {
    throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "AGY returned invalid structured output.", 502);
  }
  if (envelope.status !== "SUCCESS") throw new WorkbenchError("TRANSLATION_PROVIDER_FAILED", "AGY did not complete the translation.", 502);
  let structured = envelope.structured_output;
  if (!structured && typeof envelope.response === "string") {
    try { structured = JSON.parse(envelope.response) as unknown; } catch { structured = null; }
  }
  const payload = validateTranslationPayload(structured);
  return {
    translations: payload.translations,
    usage: {
      inputTokens: nonNegativeInteger(envelope.usage?.input_tokens),
      outputTokens: nonNegativeInteger(envelope.usage?.output_tokens),
      costUsd: 0,
    },
  };
}

export function classifyAgyFailureForTesting(stderr: string, timedOut = false): string {
  if (timedOut) return "TRANSLATION_PROVIDER_TIMEOUT";
  const error = new WorkbenchError("TRANSLATION_PROVIDER_FAILED", "AGY could not complete the translation.", 502) as WorkbenchError & { boundedStderr?: string };
  error.boundedStderr = stderr;
  return classifyProviderFailure(error).code;
}

export class AgyTranslationAdapter implements TranslationAdapter {
  readonly id = "agy-cli:structured:uk-v1";

  constructor(
    private readonly executable = process.env.OPEN_SPEC_WORKBENCH_AGY_BIN ?? (process.platform === "darwin" ? path.join(os.homedir(), ".local", "bin", "agy") : "agy"),
    private readonly model = process.env.OPEN_SPEC_WORKBENCH_AGY_MODEL ?? "gemini-3.6-flash-high",
    private readonly timeoutMs = 250_000,
    private readonly killGraceMs = 2_000,
  ) {}

  async translate(blocks: ReadonlyArray<{ id: string; text: string }>): Promise<{ translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage }> {
    const prompt = buildTranslationPrompt(blocks);
    try {
      const result = await runBoundedProcess({
        executable: this.executable,
        args: [
          "--mode", "plan",
          "--sandbox",
          "--disable-slash-commands",
          "--model", this.model,
          "--output-format", "json",
          "--json-schema", JSON.stringify(TRANSLATION_OUTPUT_SCHEMA),
          "--print-timeout", "4m0s",
          "--print", prompt,
        ],
        timeoutMs: this.timeoutMs,
        killGraceMs: this.killGraceMs,
      });
      return parseAgyTranslationOutput(result.stdout);
    } catch (error) {
      throw classifyProviderFailure(error);
    }
  }
}
