import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChangeDetail } from "./types.js";
import { WorkbenchError } from "./types.js";

export interface MaskedText {
  value: string;
  tokens: ReadonlyMap<string, string>;
}

const PROTECTED_PATTERNS: RegExp[] = [
  /```[\s\S]*?```/gu,
  /`[^`\n]+`/gu,
  /\b(?:MUST|SHALL|SHOULD|MAY|GIVEN|WHEN|THEN|AND)\b/gu,
  /\b[a-z]{2}(?:-[A-Z]{2})\b/gu,
  /(?:^|\s)(?:\.?\.?\/)?(?:[\w.-]+\/)+[\w.*-]+/gmu,
  /\b[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+\b/gu,
];

export function maskProtectedText(source: string): MaskedText {
  const tokens = new Map<string, string>();
  let value = source;
  let index = 0;
  for (const pattern of PROTECTED_PATTERNS) {
    value = value.replace(pattern, (match) => {
      const leading = match.match(/^\s/u)?.[0] ?? "";
      const protectedValue = match.slice(leading.length);
      const token = `⟦OWB_${String(index).padStart(4, "0")}⟧`;
      index += 1;
      tokens.set(token, protectedValue);
      return `${leading}${token}`;
    });
  }
  return { value, tokens };
}

export function restoreProtectedText(translated: string, masked: MaskedText): string {
  let value = translated;
  for (const [token, original] of masked.tokens) {
    const occurrences = value.split(token).length - 1;
    if (occurrences !== 1) throw new Error("Protected translation tokens did not round-trip exactly.");
    value = value.replace(token, original);
  }
  if (/⟦OWB_\d{4}⟧/u.test(value)) throw new Error("Unknown protected translation token returned.");
  return value;
}

export function translationCacheKey(input: {
  source: string;
  locale: string;
  glossaryVersion: string;
  promptVersion: string;
  parserVersion: string;
  adapterId: string;
}): string {
  const normalized = input.source.replace(/\r\n/gu, "\n").normalize("NFC");
  return createHash("sha256").update(JSON.stringify({ ...input, source: normalized })).digest("hex");
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*\S+/iu,
  /\b(?:ghp|github_pat|sk)-[A-Za-z0-9_-]{16,}\b/u,
];

const DENIED_PATH_PATTERNS = [
  /file:\/\/\/(?:Users|Volumes|home|private|var)\//iu,
  /(?<![A-Za-z0-9._~:/-])\/(?:Users|Volumes|home|private|var)\//u,
  /file:\/\/\/[A-Za-z]:[\\/]/iu,
  /(?<![A-Za-z0-9._~:/-])[A-Za-z]:[\\/]/u,
];

export function screenTranslationBlock(source: string): { allowed: boolean; reason: string | null } {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(source)) return { allowed: false, reason: "possible-secret" };
  }
  for (const pattern of DENIED_PATH_PATTERNS) {
    if (pattern.test(source)) return { allowed: false, reason: "denied-path" };
  }
  return { allowed: true, reason: null };
}

export function defaultTranslationStateDirectory(): string {
  if (process.env.OPEN_SPEC_WORKBENCH_STATE_DIR) return path.resolve(process.env.OPEN_SPEC_WORKBENCH_STATE_DIR);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "OpenSpec Workbench", "translations");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "OpenSpec Workbench", "translations");
  return path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "openspec-workbench", "translations");
}

export class TranslationCache {
  constructor(private readonly directory = defaultTranslationStateDirectory()) {}

  async get(key: string): Promise<string | null> {
    if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("Invalid translation cache key.");
    try {
      const value = JSON.parse(await readFile(path.join(this.directory, `${key}.json`), "utf8")) as { value?: unknown };
      return typeof value.value === "string" ? value.value : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async put(key: string, value: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("Invalid translation cache key.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const target = path.join(this.directory, `${key}.json`);
    const temporary = path.join(this.directory, `.${key}.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify({ value }) + "\n", { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}

export interface TranslationAdapterUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TranslationAdapter {
  readonly id: string;
  translate(blocks: ReadonlyArray<{ id: string; text: string }>): Promise<{ translations: Array<{ id: string; text: string }>; usage: TranslationAdapterUsage }>;
  close?(): Promise<void>;
}

type BlockState = "cached" | "translated" | "rejected" | "missing" | "failed";

export type TranslationDiagnostic =
  | "TRANSLATION_ADAPTER_UNAVAILABLE"
  | "TRANSLATION_PROVIDER_AUTH_REQUIRED"
  | "TRANSLATION_PROVIDER_QUOTA"
  | "TRANSLATION_PROVIDER_TIMEOUT"
  | "TRANSLATION_OUTPUT_LIMIT"
  | "TRANSLATION_OUTPUT_INVALID"
  | "TRANSLATION_REQUEST_TOO_LARGE"
  | "TRANSLATION_ADAPTER_FAILED";

export interface TranslatedChange {
  values: Record<string, string>;
  states: Record<string, BlockState>;
  diagnostic: TranslationDiagnostic | null;
  usage: TranslationAdapterUsage & { adapterId: string; cacheHits: number; translatedBlocks: number; rejectedBlocks: number; missingBlocks: number; failedBlocks: number };
}

const TRANSLATION_DIAGNOSTICS = new Set<TranslationDiagnostic>([
  "TRANSLATION_ADAPTER_UNAVAILABLE",
  "TRANSLATION_PROVIDER_AUTH_REQUIRED",
  "TRANSLATION_PROVIDER_QUOTA",
  "TRANSLATION_PROVIDER_TIMEOUT",
  "TRANSLATION_OUTPUT_LIMIT",
  "TRANSLATION_OUTPUT_INVALID",
  "TRANSLATION_REQUEST_TOO_LARGE",
  "TRANSLATION_ADAPTER_FAILED",
]);

function safeTranslationDiagnostic(error: unknown): TranslationDiagnostic {
  if (error instanceof WorkbenchError && TRANSLATION_DIAGNOSTICS.has(error.code as TranslationDiagnostic)) return error.code as TranslationDiagnostic;
  return "TRANSLATION_ADAPTER_FAILED";
}

function changeBlocks(detail: ChangeDetail): Array<{ id: string; source: string }> {
  return [
    { id: "title", source: detail.title },
    ...detail.proposal.flatMap((section, index) => [
      { id: `proposal:${index}:title`, source: section.title },
      { id: `proposal:${index}:body`, source: section.body },
    ]),
    ...detail.tasks.map((task, index) => ({ id: `task:${index}`, source: task.text })),
    ...detail.design.flatMap((section, index) => [
      { id: `design:${index}:title`, source: section.title },
      { id: `design:${index}:body`, source: section.body },
    ]),
  ].filter((block) => block.source.trim().length > 0);
}

export class TranslationService {
  constructor(private readonly adapter: TranslationAdapter, private readonly cache = new TranslationCache()) {}

  status(): { enabled: boolean; adapterId: string } {
    return { enabled: true, adapterId: this.adapter.id };
  }

  async cachedChange(detail: ChangeDetail): Promise<TranslatedChange> {
    return this.projectChange(detail, false);
  }

  async translateChange(detail: ChangeDetail): Promise<TranslatedChange> {
    return this.projectChange(detail, true);
  }

  private async projectChange(detail: ChangeDetail, invokeAdapter: boolean): Promise<TranslatedChange> {
    const values: Record<string, string> = {};
    const states: Record<string, BlockState> = {};
    const pending: Array<{ id: string; masked: MaskedText; key: string }> = [];
    let cacheHits = 0;
    let rejectedBlocks = 0;
    for (const block of changeBlocks(detail)) {
      if (!/[\p{L}\p{N}]/u.test(block.source)) {
        values[block.id] = block.source;
        states[block.id] = "cached";
        cacheHits += 1;
        continue;
      }
      const screening = screenTranslationBlock(block.source);
      if (!screening.allowed) {
        states[block.id] = "rejected";
        rejectedBlocks += 1;
        continue;
      }
      const key = translationCacheKey({ source: block.source, locale: "uk-UA", glossaryVersion: "1", promptVersion: "uk-v1", parserVersion: "1", adapterId: this.adapter.id });
      const cached = await this.cache.get(key);
      if (cached !== null) {
        values[block.id] = cached;
        states[block.id] = "cached";
        cacheHits += 1;
        continue;
      }
      pending.push({ id: block.id, masked: maskProtectedText(block.source), key });
    }
    let adapterUsage: TranslationAdapterUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    let translatedBlocks = 0;
    let diagnostic: TranslationDiagnostic | null = null;
    if (pending.length && invokeAdapter) {
      try {
        const result = await this.adapter.translate(pending.map((block) => ({ id: block.id, text: block.masked.value })));
        adapterUsage = result.usage;
        const expected = new Set(pending.map((block) => block.id));
        const returned = new Map<string, string>();
        for (const item of result.translations) {
          if (!expected.has(item.id) || returned.has(item.id)) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The translation response did not match the requested blocks.", 502);
          returned.set(item.id, item.text);
        }
        if (returned.size !== expected.size) throw new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The translation response omitted a requested block.", 502);
        for (const block of pending) {
          try {
            const restored = restoreProtectedText(returned.get(block.id) ?? "", block.masked);
            values[block.id] = restored;
            states[block.id] = "translated";
            await this.cache.put(block.key, restored);
            translatedBlocks += 1;
          } catch {
            states[block.id] = "failed";
          }
        }
      } catch (error) {
        for (const block of pending) states[block.id] = "failed";
        diagnostic = safeTranslationDiagnostic(error);
      }
    } else if (pending.length) {
      for (const block of pending) states[block.id] = "missing";
    }
    const failedBlocks = Object.values(states).filter((state) => state === "failed").length;
    if (invokeAdapter && failedBlocks > 0 && diagnostic === null) diagnostic = "TRANSLATION_OUTPUT_INVALID";
    const missingBlocks = Object.values(states).filter((state) => state === "missing" || state === "failed").length;
    return { values, states, diagnostic, usage: { ...adapterUsage, adapterId: this.adapter.id, cacheHits, translatedBlocks, rejectedBlocks, missingBlocks, failedBlocks } };
  }

  async close(): Promise<void> {
    await this.adapter.close?.();
  }
}
