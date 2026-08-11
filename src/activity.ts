import { EventEmitter } from "node:events";

export const activityKinds = [
  "source-change-detected",
  "head-change-detected",
  "snapshot-refresh-started",
  "snapshot-refresh-completed",
  "snapshot-refresh-failed",
  "verification-started",
  "verification-completed",
  "verification-failed",
  "translation-started",
  "translation-completed",
  "translation-failed",
] as const;

export type ActivityKind = typeof activityKinds[number];
export type ActivityDiagnostic =
  | "TRANSLATION_ADAPTER_UNAVAILABLE"
  | "TRANSLATION_PROVIDER_AUTH_REQUIRED"
  | "TRANSLATION_PROVIDER_QUOTA"
  | "TRANSLATION_PROVIDER_TIMEOUT"
  | "TRANSLATION_OUTPUT_LIMIT"
  | "TRANSLATION_OUTPUT_INVALID"
  | "TRANSLATION_REQUEST_TOO_LARGE"
  | "TRANSLATION_FAILED";

export interface ActivityData {
  changeId?: string;
  providerId?: "agy" | "claude" | "codex" | "gemini" | "qwen" | "kimi" | "ollama";
  paths?: string[];
  additionalPaths?: number;
  previousRevision?: string;
  revision?: string;
  missingBlocks?: number;
  translatedBlocks?: number;
  failedBlocks?: number;
  validationState?: "valid" | "invalid" | "unavailable" | "unsupported";
  diagnostic?: ActivityDiagnostic;
}

export interface ActivityEntry {
  id: number;
  at: string;
  kind: ActivityKind;
  data: ActivityData;
}

const CHANGE_ID = /^[a-z0-9][a-z0-9._-]{0,254}$/u;
const REVISION = /^[a-f0-9]{7,12}$/u;
const MAX_ACTIVITY_PATHS = 12;
const MAX_ACTIVITY_PATH_BYTES = 1_024;
const MAX_ACTIVITY_COUNT = 1_000_000;

function boundedCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ACTIVITY_COUNT) throw new Error("Activity counts must be bounded non-negative integers.");
  return value;
}

function boundedOpenSpecPaths(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ACTIVITY_PATHS) throw new Error("Activity paths must use the bounded list shape.");
  const paths = value.map((item) => {
    if (typeof item !== "string") throw new Error("Activity paths must be strings.");
    const normalized = item.normalize("NFC");
    const segments = normalized.split("/");
    if ((normalized !== "openspec" && !normalized.startsWith("openspec/"))
      || normalized.includes("\\")
      || Buffer.byteLength(normalized, "utf8") > MAX_ACTIVITY_PATH_BYTES
      || segments.some((segment) => !segment || segment === "." || segment === "..")
      || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(normalized)) {
      throw new Error("Activity paths must stay inside the relative OpenSpec tree.");
    }
    return normalized;
  });
  if (new Set(paths).size !== paths.length) throw new Error("Activity paths must not contain duplicates.");
  return paths;
}

function sanitizeData(data: ActivityData): ActivityData {
  if (data.changeId !== undefined && !CHANGE_ID.test(data.changeId)) throw new Error("Activity change identifiers must use the supported bounded shape.");
  const sanitized: ActivityData = {};
  if (data.changeId !== undefined) sanitized.changeId = data.changeId;
  if (data.providerId !== undefined) {
    if (!(asProviderIds as readonly string[]).includes(data.providerId)) throw new Error("Activity provider identifiers must use the closed shape.");
    sanitized.providerId = data.providerId;
  }
  if (data.paths !== undefined) sanitized.paths = boundedOpenSpecPaths(data.paths)!;
  if (data.additionalPaths !== undefined) sanitized.additionalPaths = boundedCount(data.additionalPaths)!;
  if ((data.previousRevision === undefined) !== (data.revision === undefined)
    || data.previousRevision !== undefined && !REVISION.test(data.previousRevision)
    || data.revision !== undefined && !REVISION.test(data.revision)) {
    throw new Error("Activity revisions must use a complete bounded hexadecimal pair.");
  }
  if (data.previousRevision !== undefined) sanitized.previousRevision = data.previousRevision;
  if (data.revision !== undefined) sanitized.revision = data.revision;
  if (data.missingBlocks !== undefined) sanitized.missingBlocks = boundedCount(data.missingBlocks)!;
  if (data.translatedBlocks !== undefined) sanitized.translatedBlocks = boundedCount(data.translatedBlocks)!;
  if (data.failedBlocks !== undefined) sanitized.failedBlocks = boundedCount(data.failedBlocks)!;
  if (data.validationState !== undefined) {
    if (!(["valid", "invalid", "unavailable", "unsupported"] as const).includes(data.validationState)) throw new Error("Activity validation states must use the closed shape.");
    sanitized.validationState = data.validationState;
  }
  if (data.diagnostic !== undefined) {
    const diagnostics: ActivityDiagnostic[] = [
      "TRANSLATION_ADAPTER_UNAVAILABLE",
      "TRANSLATION_PROVIDER_AUTH_REQUIRED",
      "TRANSLATION_PROVIDER_QUOTA",
      "TRANSLATION_PROVIDER_TIMEOUT",
      "TRANSLATION_OUTPUT_LIMIT",
      "TRANSLATION_OUTPUT_INVALID",
      "TRANSLATION_REQUEST_TOO_LARGE",
      "TRANSLATION_FAILED",
    ];
    if (!diagnostics.includes(data.diagnostic)) throw new Error("Activity diagnostics must use the closed shape.");
    sanitized.diagnostic = data.diagnostic;
  }
  return sanitized;
}

export class ActivityJournal extends EventEmitter {
  readonly limit: number;
  #entries: ActivityEntry[] = [];
  #nextId = 1;

  constructor(limit = 100, private readonly now: () => Date = () => new Date()) {
    super();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new Error("Activity retention must be between 1 and 1000 entries.");
    this.limit = limit;
  }

  append(kind: ActivityKind, data: ActivityData = {}): ActivityEntry {
    if (!activityKinds.includes(kind)) throw new Error("Activity kinds must use the closed shape.");
    const entry = { id: this.#nextId, at: this.now().toISOString(), kind, data: sanitizeData(data) };
    this.#nextId += 1;
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.splice(0, this.#entries.length - this.limit);
    this.emit("entry", entry);
    return entry;
  }

  list(): ActivityEntry[] {
    return [...this.#entries].reverse().map((entry) => ({ ...entry, data: { ...entry.data, ...(entry.data.paths ? { paths: [...entry.data.paths] } : {}) } }));
  }
}

export function activityDiagnostic(value: string | null | undefined): ActivityDiagnostic {
  if (value === "TRANSLATION_ADAPTER_UNAVAILABLE" || value === "TRANSLATION_PROVIDER_AUTH_REQUIRED" || value === "TRANSLATION_PROVIDER_QUOTA" || value === "TRANSLATION_PROVIDER_TIMEOUT" || value === "TRANSLATION_OUTPUT_LIMIT" || value === "TRANSLATION_OUTPUT_INVALID" || value === "TRANSLATION_REQUEST_TOO_LARGE") return value;
  return "TRANSLATION_FAILED";
}

const asProviderIds = ["agy", "claude", "codex", "gemini", "qwen", "kimi", "ollama"] as const;
