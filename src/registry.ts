import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { discoverGitSnapshot, inspectOpenSpecCandidate, type OpenSpecCandidate } from "./git.js";
import type { GitSnapshot } from "./types.js";
import { WorkbenchError } from "./types.js";

const REGISTRY_LOCK_STALE_MS = 30_000;
const MAX_REGISTERED_PROJECTS = 256;

export interface RegisteredProject {
  id: string;
  label: string;
  root: string;
  revision: number;
}

interface RegistryDocument {
  version: 2;
  projects: RegisteredProject[];
}

export function defaultWorkbenchStateDirectory(): string {
  if (process.env.OPEN_SPEC_WORKBENCH_STATE_DIR) return path.resolve(process.env.OPEN_SPEC_WORKBENCH_STATE_DIR);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "OpenSpec Workbench");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "OpenSpec Workbench");
  return path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "openspec-workbench");
}

function projectId(): string {
  return randomBytes(18).toString("base64url");
}

function normalizeLabel(value: string): string {
  const label = value.normalize("NFC").trim();
  if (!label || label.length > 120 || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/iu.test(label)) {
    throw new WorkbenchError("PROJECT_LABEL_INVALID", "Project labels must contain 1 to 120 printable characters.", 400);
  }
  return label;
}

export async function validateRegisteredProjectRoot(project: RegisteredProject): Promise<string> {
  const rootInfo = await lstat(project.root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new WorkbenchError("REGISTERED_ROOT_UNAVAILABLE", "The registered project root is no longer available.", 409);
    throw new WorkbenchError("REGISTERED_ROOT_UNAVAILABLE", "The registered project root cannot be inspected.", 409);
  });
  if (rootInfo.isSymbolicLink()) {
    throw new WorkbenchError("REGISTERED_ROOT_CHANGED", "The registered project root no longer resolves to its original canonical location.", 409);
  }
  if (!rootInfo.isDirectory()) {
    throw new WorkbenchError("REGISTERED_ROOT_UNAVAILABLE", "The registered project root is no longer available.", 409);
  }
  const canonical = await realpath(project.root).catch(() => {
    throw new WorkbenchError("REGISTERED_ROOT_UNAVAILABLE", "The registered project root is no longer available.", 409);
  });
  if (canonical !== project.root) {
    throw new WorkbenchError("REGISTERED_ROOT_CHANGED", "The registered project root no longer resolves to its original canonical location.", 409);
  }
  return canonical;
}

export async function validateRegisteredProject(project: RegisteredProject): Promise<GitSnapshot> {
  const canonical = await validateRegisteredProjectRoot(project);
  const git = await discoverGitSnapshot(canonical);
  if (git.root !== canonical) {
    throw new WorkbenchError("REGISTERED_ROOT_CHANGED", "The registered project root no longer identifies the registered OpenSpec worktree.", 409);
  }
  return git;
}

function assertConfirmedCandidate(expected: OpenSpecCandidate, actual: OpenSpecCandidate): void {
  if (expected.root !== actual.root
    || expected.repositoryId !== actual.repositoryId
    || expected.worktreeId !== actual.worktreeId
    || expected.head !== actual.head
    || expected.configIdentity !== actual.configIdentity) {
    throw new WorkbenchError("REGISTRATION_CANDIDATE_CHANGED", "The selected project changed before confirmation. Choose it again.", 409);
  }
}

function parseLock(value: string): { pid: number; createdAt: number } | null {
  try {
    const parsed = JSON.parse(value) as { pid?: unknown; createdAt?: unknown };
    if (!Number.isInteger(parsed.pid) || (parsed.pid as number) <= 0 || typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) return null;
    return { pid: parsed.pid as number, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function parseRegistry(raw: string): RegistryDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new WorkbenchError("REGISTRY_INVALID", "The local project registry is not valid JSON.", 500);
  }
  const version = (value as { version?: unknown } | null)?.version;
  if (!value || typeof value !== "object" || (version !== 1 && version !== 2) || !Array.isArray((value as { projects?: unknown }).projects)) {
    throw new WorkbenchError("REGISTRY_VERSION_UNSUPPORTED", "The local project registry version is not supported.", 500);
  }
  const rawProjects = (value as { projects: Array<Record<string, unknown>> }).projects;
  if (rawProjects.length > MAX_REGISTERED_PROJECTS) {
    throw new WorkbenchError("REGISTRY_CAPACITY_EXCEEDED", "The local project registry exceeds the supported project limit.", 500);
  }
  if (!rawProjects.every((item) => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.root === "string" && (version === 1 || Number.isInteger(item.revision) && (item.revision as number) > 0))) {
    throw new WorkbenchError("REGISTRY_INVALID", "The local project registry contains an invalid entry.", 500);
  }
  return {
    version: 2,
    projects: rawProjects.map((item) => ({ id: item.id as string, label: item.label as string, root: item.root as string, revision: version === 1 ? 1 : item.revision as number })),
  };
}

export class ProjectRegistry {
  readonly file: string;
  private readonly lockFile: string;

  constructor(readonly directory = defaultWorkbenchStateDirectory()) {
    this.file = path.join(directory, "projects.json");
    this.lockFile = path.join(directory, "projects.lock");
  }

  async list(): Promise<RegisteredProject[]> {
    try {
      return parseRegistry(await readFile(this.file, "utf8")).projects;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async register(inputRoot: string, requestedLabel?: string, expectedCandidate?: OpenSpecCandidate): Promise<RegisteredProject> {
    let project: RegisteredProject | null = null;
    await this.mutate(async (document) => {
      const candidate = expectedCandidate ? await inspectOpenSpecCandidate(expectedCandidate.root) : null;
      if (candidate && expectedCandidate) assertConfirmedCandidate(expectedCandidate, candidate);
      const root = candidate?.root ?? await realpath((await discoverGitSnapshot(inputRoot)).root);
      const fallbackLabel = path.basename(root);
      const label = normalizeLabel(requestedLabel ?? fallbackLabel);
      project = { id: projectId(), label, root, revision: 1 };
      if (document.projects.some((item) => item.root === root)) {
        throw new WorkbenchError("PROJECT_ALREADY_REGISTERED", "This worktree is already registered.", 409);
      }
      if (document.projects.length >= MAX_REGISTERED_PROJECTS) {
        throw new WorkbenchError("REGISTRY_CAPACITY_REACHED", "The local project registry has reached its supported project limit.", 409);
      }
      return { version: 2, projects: [...document.projects, project].sort((left, right) => left.label.localeCompare(right.label)) };
    });
    if (!project) throw new WorkbenchError("REGISTRY_UPDATE_FAILED", "The project registration could not be updated.", 500);
    return project;
  }

  async rebind(id: string, expectedRevision: number, inputRoot: string, requestedLabel?: string, expectedCandidate?: OpenSpecCandidate): Promise<{ project: RegisteredProject; previous: RegisteredProject }> {
    let result: { project: RegisteredProject; previous: RegisteredProject } | null = null;
    await this.mutate(async (document) => {
      const candidate = expectedCandidate ? await inspectOpenSpecCandidate(expectedCandidate.root) : null;
      if (candidate && expectedCandidate) assertConfirmedCandidate(expectedCandidate, candidate);
      const root = candidate?.root ?? await realpath((await discoverGitSnapshot(inputRoot)).root);
      const previous = document.projects.find((item) => item.id === id);
      if (!previous) throw new WorkbenchError("PROJECT_NOT_REGISTERED", "The selected project is not registered.", 404);
      if (previous.revision !== expectedRevision) throw new WorkbenchError("REGISTRY_CONFLICT", "The project registration changed in another tab.", 409);
      if (document.projects.some((item) => item.id !== id && item.root === root)) throw new WorkbenchError("PROJECT_ALREADY_REGISTERED", "This worktree is already registered.", 409);
      const label = normalizeLabel(requestedLabel ?? previous.label);
      const project = { ...previous, root, label, revision: previous.revision + 1 };
      result = { project, previous };
      return { version: 2, projects: document.projects.map((item) => item.id === id ? project : item).sort((left, right) => left.label.localeCompare(right.label)) };
    });
    if (!result) throw new WorkbenchError("REGISTRY_UPDATE_FAILED", "The project registration could not be updated.", 500);
    return result;
  }

  async remove(id: string, expectedRevision?: number): Promise<RegisteredProject> {
    let removed: RegisteredProject | null = null;
    await this.mutate((document) => {
      const project = document.projects.find((item) => item.id === id);
      if (!project) throw new WorkbenchError("PROJECT_NOT_REGISTERED", "The selected project is not registered.", 404);
      if (expectedRevision !== undefined && project.revision !== expectedRevision) {
        throw new WorkbenchError("REGISTRY_CONFLICT", "The project registration changed in another tab.", 409);
      }
      removed = project;
      return { version: 2, projects: document.projects.filter((item) => item.id !== id) };
    });
    if (!removed) throw new WorkbenchError("REGISTRY_UPDATE_FAILED", "The project registration could not be removed.", 500);
    return removed;
  }

  private async mutate(update: (document: RegistryDocument) => RegistryDocument | Promise<RegistryDocument>): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    let lock: Awaited<ReturnType<typeof open>> | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        lock = await open(this.lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (await this.recoverStaleLock()) continue;
        await delay(25);
      }
    }
    if (!lock) throw new WorkbenchError("REGISTRY_BUSY", "The local project registry is busy. Try again.", 503);
    try {
      await lock.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`, "utf8");
      await lock.sync();
      const current = { version: 2 as const, projects: await this.list() };
      const next = await update(current);
      const temporary = path.join(this.directory, `.projects.${process.pid}.${Date.now()}.tmp`);
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.file);
      await chmod(this.file, 0o600);
    } finally {
      await lock.close();
      await rm(this.lockFile, { force: true });
    }
  }

  private async recoverStaleLock(): Promise<boolean> {
    const before = await stat(this.lockFile).catch(() => null);
    if (!before) return true;
    const owner = parseLock(await readFile(this.lockFile, "utf8").catch(() => ""));
    if (!owner || Date.now() - owner.createdAt < REGISTRY_LOCK_STALE_MS || processIsAlive(owner.pid)) return false;
    const after = await stat(this.lockFile).catch(() => null);
    if (!after || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) return false;
    await rm(this.lockFile, { force: true });
    return true;
  }

  async permissions(): Promise<{ directory: number; file: number | null }> {
    await access(this.directory, constants.R_OK);
    const directoryMode = (await stat(this.directory)).mode & 0o777;
    const fileMode = await stat(this.file).then((value) => value.mode & 0o777).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    return { directory: directoryMode, file: fileMode };
  }
}
