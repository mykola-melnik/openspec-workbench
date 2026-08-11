import { buildTranslationPrompt, emptyUsage, parseJsonPayload, TRANSLATION_OUTPUT_SCHEMA } from "./translation-contract.js";
import type { TranslationAdapter, TranslationAdapterUsage } from "./translation.js";
import { WorkbenchError } from "./types.js";

export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

type Fetcher = typeof fetch;

function validateLoopbackOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Ollama must use the fixed loopback origin.");
  return parsed.origin;
}

async function boundedText(response: Response, maximum = MAX_RESPONSE_BYTES): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximum)) throw new WorkbenchError("TRANSLATION_OUTPUT_LIMIT", "Ollama exceeded the response limit.", 502);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new WorkbenchError("TRANSLATION_OUTPUT_LIMIT", "Ollama exceeded the response limit.", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function ollamaRequest(fetcher: Fetcher, origin: string, pathname: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${origin}${pathname}`, { ...init, redirect: "error", signal: controller.signal });
    if (!response.ok) throw new WorkbenchError("TRANSLATION_PROVIDER_FAILED", "Ollama could not complete the request.", 502);
    return response;
  } catch (error) {
    if (error instanceof WorkbenchError) throw error;
    if (controller.signal.aborted) throw new WorkbenchError("TRANSLATION_PROVIDER_TIMEOUT", "Ollama did not complete within the allowed time.", 504);
    throw new WorkbenchError("TRANSLATION_ADAPTER_UNAVAILABLE", "Ollama is not available on the local loopback endpoint.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export function validateOllamaModel(value: string): string {
  const normalized = value.normalize("NFC");
  if (!MODEL_ID.test(normalized)) throw new WorkbenchError("TRANSLATION_MODEL_UNSUPPORTED", "The selected Ollama model is not supported.", 400);
  return normalized;
}

export async function discoverOllamaModels(fetcher: Fetcher = fetch, origin = OLLAMA_ORIGIN, timeoutMs = 1_000): Promise<string[]> {
  const safeOrigin = validateLoopbackOrigin(origin);
  try {
    const response = await ollamaRequest(fetcher, safeOrigin, "/api/tags", { method: "GET", headers: { Accept: "application/json" } }, timeoutMs);
    const body = JSON.parse(await boundedText(response, 256 * 1024)) as { models?: unknown };
    if (!Array.isArray(body.models)) return [];
    const models = body.models.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return [];
      try { return [validateOllamaModel((item as { name: string }).name)]; } catch { return []; }
    });
    return [...new Set(models)].sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    return [];
  }
}

export class OllamaTranslationAdapter implements TranslationAdapter {
  readonly id: string;
  private readonly origin: string;

  constructor(
    readonly model: string,
    private readonly fetcher: Fetcher = fetch,
    origin = OLLAMA_ORIGIN,
    private readonly timeoutMs = 250_000,
  ) {
    this.model = validateOllamaModel(model);
    this.origin = validateLoopbackOrigin(origin);
    this.id = `ollama:structured:uk-v1:${this.model}`;
  }

  async translate(blocks: ReadonlyArray<{ id: string; text: string }>): Promise<{ translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage }> {
    const prompt = buildTranslationPrompt(blocks);
    const response = await ollamaRequest(this.fetcher, this.origin, "/api/chat", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: TRANSLATION_OUTPUT_SCHEMA,
        messages: [{ role: "user", content: prompt }],
        options: { temperature: 0 },
      }),
    }, this.timeoutMs);
    let envelope: { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown };
    try { envelope = JSON.parse(await boundedText(response)) as typeof envelope; }
    catch (error) {
      if (error instanceof WorkbenchError) throw error;
      throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Ollama returned invalid structured output.", 502);
    }
    if (typeof envelope.message?.content !== "string") throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "Ollama omitted the translation response.", 502);
    const payload = parseJsonPayload(envelope.message.content);
    const usage = emptyUsage();
    usage.inputTokens = Number.isInteger(envelope.prompt_eval_count) && (envelope.prompt_eval_count as number) >= 0 ? envelope.prompt_eval_count as number : 0;
    usage.outputTokens = Number.isInteger(envelope.eval_count) && (envelope.eval_count as number) >= 0 ? envelope.eval_count as number : 0;
    return { translations: payload.translations, usage };
  }
}
