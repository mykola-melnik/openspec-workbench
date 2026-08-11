import manifestSource from "../compatibility.json" with { type: "json" };
import { safeReadProjectFile } from "./git.js";
import type { OpenSpecRunner } from "./types.js";
import { WorkbenchError } from "./types.js";

const RANGE_PATTERN = /^(\d+)\.(\d+)\.x$/u;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/u;
const KNOWN_ADAPTERS = new Set(["openspec-1.7"]);

interface CompatibilityManifest {
  version: 1;
  application: string;
  openspec: {
    supported: string[];
    adapters: Record<string, string>;
  };
  standards: {
    provenanceFile: string;
    required: false;
  };
  unknownFormatPolicy: "fail-closed";
}

export interface RuntimeCompatibility {
  openSpecVersion: string;
  jsonAdapter: string;
  standardsVersion: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.slice().sort().every((key, index) => actual[index] === key);
}

export function validateCompatibilityManifestForTesting(value: unknown): CompatibilityManifest {
  const root = object(value);
  const openspec = object(root?.openspec);
  const standards = object(root?.standards);
  const supported = openspec?.supported;
  const adapters = object(openspec?.adapters);
  const valid = root !== null
    && exactKeys(root, ["$schema", "application", "openspec", "standards", "unknownFormatPolicy", "version"])
    && root.version === 1
    && typeof root.application === "string"
    && root.application.length > 0
    && root.unknownFormatPolicy === "fail-closed"
    && openspec !== null
    && exactKeys(openspec, ["adapters", "supported"])
    && Array.isArray(supported)
    && supported.length > 0
    && supported.every((range) => typeof range === "string" && RANGE_PATTERN.test(range))
    && new Set(supported).size === supported.length
    && adapters !== null
    && exactKeys(adapters, supported as string[])
    && Object.values(adapters).every((adapter) => typeof adapter === "string" && KNOWN_ADAPTERS.has(adapter))
    && standards !== null
    && exactKeys(standards, ["provenanceFile", "required"])
    && typeof standards.provenanceFile === "string"
    && standards.provenanceFile.length > 0
    && !standards.provenanceFile.startsWith("/")
    && !standards.provenanceFile.split("/").includes("..")
    && standards.required === false;
  if (!valid) {
    throw new WorkbenchError("COMPATIBILITY_MANIFEST_INVALID", "The bundled compatibility manifest is invalid.", 500);
  }
  return value as CompatibilityManifest;
}

export const compatibilityManifest = validateCompatibilityManifestForTesting(manifestSource);

function rangeForVersion(version: string): string | null {
  const parsed = VERSION_PATTERN.exec(version);
  if (!parsed) return null;
  return compatibilityManifest.openspec.supported.find((range) => {
    const candidate = RANGE_PATTERN.exec(range);
    return candidate?.[1] === parsed[1] && candidate?.[2] === parsed[2];
  }) ?? null;
}

async function optionalStandardsVersion(root: string): Promise<string | null> {
  try {
    const raw = await safeReadProjectFile(root, compatibilityManifest.standards.provenanceFile);
    const value = raw?.trim() ?? "";
    return value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

export async function verifyOpenSpecCompatibility(root: string, runner: OpenSpecRunner): Promise<RuntimeCompatibility> {
  const openSpecVersion = await runner.version();
  const range = rangeForVersion(openSpecVersion);
  if (!range) {
    throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This project-local OpenSpec version is not supported.", 409);
  }
  const jsonAdapter = compatibilityManifest.openspec.adapters[range];
  if (!jsonAdapter || !KNOWN_ADAPTERS.has(jsonAdapter)) {
    throw new WorkbenchError("COMPATIBILITY_MANIFEST_INVALID", "The bundled compatibility manifest is invalid.", 500);
  }
  return {
    openSpecVersion,
    jsonAdapter,
    standardsVersion: await optionalStandardsVersion(root),
  };
}
