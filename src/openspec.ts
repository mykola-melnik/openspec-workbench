import { execFile as execFileCallback } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import type { OpenSpecRunner } from "./types.js";
import { WorkbenchError } from "./types.js";

const execFile = promisify(execFileCallback);
const SAFE_PROJECT_ENV_KEYS = [
  "HOME",
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
] as const;
const PACKAGE_JSON_LIMIT = 1024 * 1024;

function projectCommandEnvironment(root: string, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_PROJECT_ENV_KEYS) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  environment.HOME = os.homedir();
  environment.PATH = process.env.PATH ?? "";
  environment.PWD = root;
  environment.BROWSER = platform === "win32" ? "NUL" : "/usr/bin/false";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.NO_COLOR = "1";
  environment.npm_config_ignore_scripts = "true";
  return environment;
}

function extractJson(output: string): unknown {
  const value = output.trim();
  if (!value) {
    throw new WorkbenchError("OPENSPEC_OUTPUT_INVALID", "OpenSpec returned an unreadable response.", 502);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new WorkbenchError("OPENSPEC_OUTPUT_INVALID", "OpenSpec returned invalid JSON.", 502);
  }
}

function classifyCommandError(error: unknown): WorkbenchError {
  if (error instanceof WorkbenchError) return error;
  const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals | null };
  if (candidate.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new WorkbenchError("OPENSPEC_OUTPUT_LIMIT", "The project-local OpenSpec command exceeded its output limit.", 502);
  }
  if (candidate.killed || candidate.signal === "SIGTERM") {
    return new WorkbenchError("OPENSPEC_TIMEOUT", "The project-local OpenSpec command timed out.", 503);
  }
  if (candidate.code === "ENOENT") {
    return new WorkbenchError("OPENSPEC_RUNNER_UNAVAILABLE", "The local npm JavaScript runner is unavailable.", 503);
  }
  return new WorkbenchError("OPENSPEC_COMMAND_FAILED", "The repository-pinned OpenSpec command failed.", 502);
}

async function assertOpenSpecScript(root: string): Promise<void> {
  const packagePath = path.join(root, "package.json");
  let bytes: Buffer;
  try {
    const info = await lstat(packagePath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > PACKAGE_JSON_LIMIT) throw new Error("invalid package metadata");
    bytes = await readFile(packagePath);
  } catch {
    throw new WorkbenchError("OPENSPEC_SCRIPT_MISSING", "The selected project does not declare a local openspec script.", 409);
  }
  try {
    const value = JSON.parse(bytes.toString("utf8")) as { scripts?: { openspec?: unknown } };
    if (typeof value.scripts?.openspec !== "string" || value.scripts.openspec.trim().length < 1 || value.scripts.openspec.length > 4_096 || value.scripts.openspec.includes("\0")) throw new Error("invalid script");
  } catch {
    throw new WorkbenchError("OPENSPEC_SCRIPT_MISSING", "The selected project does not declare a local openspec script.", 409);
  }
}

async function validNpmCli(candidate: string | undefined): Promise<string | null> {
  if (!candidate || !path.isAbsolute(candidate) || !/(?:^|[\\/])npm-cli\.(?:c?js|mjs)$/iu.test(candidate)) return null;
  try {
    const candidateInfo = await lstat(candidate);
    if (!candidateInfo.isFile() || candidateInfo.isSymbolicLink()) return null;
    const canonical = await realpath(candidate);
    const info = await lstat(canonical);
    return info.isFile() && !info.isSymbolicLink() ? canonical : null;
  } catch {
    return null;
  }
}

export function npmCliCandidatesForTesting(
  platform: NodeJS.Platform,
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
): Array<string | undefined> {
  if (platform === "win32") {
    return [npmExecPath, path.win32.join(path.win32.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js")];
  }
  return [npmExecPath, path.posix.resolve(path.posix.dirname(nodeExecutable), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
}

async function resolveNpmCli(explicit: string | undefined, platform: NodeJS.Platform): Promise<string> {
  const candidates = explicit === undefined
    ? npmCliCandidatesForTesting(platform)
    : [explicit];
  for (const candidate of candidates) {
    const resolved = await validNpmCli(candidate);
    if (resolved) return resolved;
  }
  throw new WorkbenchError("OPENSPEC_RUNNER_UNAVAILABLE", "The local npm JavaScript runner is unavailable.", 503);
}

async function executePinned(
  root: string,
  args: readonly string[],
  limits: { maxBuffer: number; timeout: number },
  npmCliPath: string | undefined,
  platform: NodeJS.Platform,
): Promise<string> {
  try {
    await assertOpenSpecScript(root);
    const npmCli = await resolveNpmCli(npmCliPath, platform);
    const { stdout } = await execFile(process.execPath, [npmCli, "run", "--silent", "openspec", "--", ...args], {
      cwd: root,
      encoding: "utf8",
      env: projectCommandEnvironment(root, platform),
      maxBuffer: limits.maxBuffer,
      timeout: limits.timeout,
    });
    return stdout;
  } catch (error) {
    throw classifyCommandError(error);
  }
}

export function createPinnedOpenSpecRunner(
  root: string,
  limits: { versionTimeoutMs?: number; commandTimeoutMs?: number; npmCliPath?: string; platform?: NodeJS.Platform } = {},
): OpenSpecRunner {
  let versionPromise: Promise<string> | null = null;
  return {
    async version() {
      if (!versionPromise) {
        versionPromise = executePinned(root, ["--version"], { maxBuffer: 64 * 1024, timeout: limits.versionTimeoutMs ?? 30_000 }, limits.npmCliPath, limits.platform ?? process.platform)
          .then((output) => {
            const version = output.trim();
            if (!/^\d+\.\d+\.\d+$/u.test(version)) {
              throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "The project-local OpenSpec version response is not supported.", 409);
            }
            return version;
          })
          .catch((error) => {
            versionPromise = null;
            throw error;
          });
      }
      return versionPromise;
    },
    async run(args) {
      return extractJson(await executePinned(root, args, { maxBuffer: 8 * 1024 * 1024, timeout: limits.commandTimeoutMs ?? 30_000 }, limits.npmCliPath, limits.platform ?? process.platform));
    },
  };
}

export interface AdaptedListItem {
  id: string;
  title: string;
  status: string;
  completedTasks: number;
  totalTasks: number;
  updatedAt: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function adaptChangeList(value: unknown): AdaptedListItem[] {
  const root = record(value);
  const candidates = Array.isArray(value) ? value : Array.isArray(root?.changes) ? root.changes : null;
  if (!candidates) {
    throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec list format is not supported.", 409);
  }
  return candidates.map((candidate) => {
    const item = record(candidate);
    const id = string(item?.id) ?? string(item?.name);
    if (!item || !id) {
      throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec change format is not supported.", 409);
    }
    const progress = record(item.progress) ?? record(item.tasks);
    return {
      id,
      title: string(item.title) ?? id.replaceAll("-", " "),
      status: string(item.status) ?? "active",
      completedTasks: number(item.completedTasks) ?? number(progress?.completed) ?? 0,
      totalTasks: number(item.totalTasks) ?? number(progress?.total) ?? 0,
      updatedAt: string(item.updatedAt) ?? string(item.lastModified) ?? string(item.updated) ?? null,
    };
  });
}

export function adaptArtifactStatus(value: unknown): Array<{ id: string; status: string }> {
  const root = record(value);
  const raw = root?.artifacts;
  if (!Array.isArray(raw)) {
    throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec status format is not supported.", 409);
  }
  return raw.map((candidate) => {
    const item = record(candidate);
    const id = string(item?.id) ?? string(item?.name);
    if (!item || !id) {
      throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec artifact format is not supported.", 409);
    }
    return { id, status: string(item.status) ?? "unknown" };
  });
}

export function adaptValidation(value: unknown): { state: "valid" | "invalid"; message: string } {
  const root = record(value);
  const items = Array.isArray(root?.items) ? root.items : null;
  const summary = record(root?.summary);
  const totals = record(summary?.totals);
  const valid = typeof root?.valid === "boolean"
    ? root.valid
    : typeof root?.success === "boolean"
      ? root.success
      : typeof totals?.failed === "number"
        ? totals.failed === 0 && (items === null || items.every((item) => record(item)?.valid === true))
        : null;
  if (valid === null) {
    throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec validation format is not supported.", 409);
  }
  return { state: valid ? "valid" : "invalid", message: valid ? "Strict validation passed." : "Strict validation reported findings." };
}

export function adaptDoctor(value: unknown): { healthy: boolean } {
  const root = record(value);
  const rootStatus = record(root?.root);
  if (typeof rootStatus?.healthy !== "boolean") {
    throw new WorkbenchError("OPENSPEC_VERSION_UNSUPPORTED", "This OpenSpec doctor format is not supported.", 409);
  }
  return { healthy: rootStatus.healthy };
}
