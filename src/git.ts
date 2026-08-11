import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { GitOperation, GitSnapshot, LocalBranch } from "./types.js";
import { WorkbenchError } from "./types.js";

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_OPEN_SPEC_CONFIG_BYTES = 256 * 1024;
const DEFAULT_GIT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_GIT_TIMEOUT_MS = 10_000;

interface GitExecutionConfig {
  executable: string;
  prefixArgs: readonly string[];
  maxBytes: number;
  timeoutMs: number;
}

interface GitCommandOptions {
  failureCode?: string;
  failureMessage?: string;
  allowedExitCodes?: readonly number[];
}

const defaultGitExecution: GitExecutionConfig = {
  executable: "git",
  prefixArgs: [],
  maxBytes: DEFAULT_GIT_MAX_BYTES,
  timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
};

function gitArguments(config: GitExecutionConfig, args: readonly string[]): string[] {
  return [...config.prefixArgs, "--no-optional-locks", "-c", "core.fsmonitor=false", ...args];
}

function unavailableGitError(): WorkbenchError {
  return new WorkbenchError("GIT_UNAVAILABLE", "Git is unavailable on this computer.", 503);
}

function timeoutGitError(): WorkbenchError {
  return new WorkbenchError("GIT_TIMEOUT", "Git inspection did not finish within the safety timeout.", 504);
}

function overflowGitError(): WorkbenchError {
  return new WorkbenchError("GIT_OUTPUT_LIMIT", "Git inspection exceeded the safe output limit.", 413);
}

async function git(
  root: string,
  args: readonly string[],
  options: GitCommandOptions = {},
  config: GitExecutionConfig = defaultGitExecution,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let overflowed = false;
    let outputBytes = 0;
    const stdout: Buffer[] = [];
    const child = spawn(config.executable, gitArguments(config, args), {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, config.timeoutMs);
    timer.unref();
    const collect = (chunk: Buffer, capture: boolean): void => {
      outputBytes += chunk.length;
      if (capture) stdout.push(chunk);
      if (outputBytes > config.maxBytes && !overflowed) {
        overflowed = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error.code === "ENOENT" ? unavailableGitError() : new WorkbenchError("GIT_COMMAND_FAILED", "Git inspection could not start.", 502));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (overflowed) {
        reject(overflowGitError());
        return;
      }
      if (timedOut) {
        reject(timeoutGitError());
        return;
      }
      if (code !== 0 && !options.allowedExitCodes?.includes(code ?? -1)) {
        reject(new WorkbenchError(
          options.failureCode ?? "GIT_COMMAND_FAILED",
          options.failureMessage ?? "Git could not complete the requested inspection.",
          options.failureCode === "INVALID_GIT_ROOT" ? 400 : 502,
        ));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
  });
}

async function gitDirty(root: string, config: GitExecutionConfig = defaultGitExecution): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stderrBytes = 0;
    const child = spawn(config.executable, gitArguments(config, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]), {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, config.timeoutMs);
    timer.unref();
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.once("data", () => {
      child.kill("SIGTERM");
      finish(true);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > config.maxBytes) child.kill("SIGKILL");
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error.code === "ENOENT" ? unavailableGitError() : new WorkbenchError("GIT_COMMAND_FAILED", "Git dirty-state inspection could not start.", 502));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (stderrBytes > config.maxBytes) reject(overflowGitError());
      else if (timedOut) reject(timeoutGitError());
      else if (code === 0) resolve(false);
      else reject(new WorkbenchError("GIT_COMMAND_FAILED", "Git could not inspect the worktree state.", 502));
    });
  });
}

function digest(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

async function resolveGitPath(root: string, value: string): Promise<string> {
  return realpath(path.isAbsolute(value) ? value : path.resolve(root, value));
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectOperation(gitDir: string): Promise<GitOperation> {
  if (await exists(path.join(gitDir, "MERGE_HEAD"))) return "merge";
  if (await exists(path.join(gitDir, "rebase-merge")) || await exists(path.join(gitDir, "rebase-apply"))) return "rebase";
  if (await exists(path.join(gitDir, "BISECT_LOG"))) return "bisect";
  return "normal";
}

export interface OpenSpecCandidate {
  root: string;
  gitDir: string;
  commonGitDir: string;
  repositoryId: string;
  worktreeId: string;
  branch: string | null;
  head: string;
  configIdentity: string;
  kind: "primary" | "linked";
}

async function openSpecConfigIdentity(root: string): Promise<string> {
  const configPath = path.join(root, "openspec", "config.yaml");
  const before = await lstat(configPath).catch(() => null);
  if (!before?.isFile() || before.isSymbolicLink()) {
    throw new WorkbenchError("OPEN_SPEC_REQUIRED", "This worktree does not contain a readable OpenSpec configuration.", 400);
  }
  if (before.size > MAX_OPEN_SPEC_CONFIG_BYTES) {
    throw new WorkbenchError("OPEN_SPEC_CONFIG_TOO_LARGE", "The OpenSpec configuration exceeds the safe inspection limit.", 413);
  }
  const resolved = await realpath(configPath).catch(() => {
    throw new WorkbenchError("OPEN_SPEC_REQUIRED", "This worktree does not contain a readable OpenSpec configuration.", 400);
  });
  assertContained(root, resolved);
  const contents = await readFile(resolved).catch(() => {
    throw new WorkbenchError("OPEN_SPEC_REQUIRED", "This worktree does not contain a readable OpenSpec configuration.", 400);
  });
  const after = await lstat(configPath).catch(() => null);
  if (!after?.isFile() || after.isSymbolicLink()
    || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new WorkbenchError("REGISTRATION_CANDIDATE_CHANGED", "The selected project changed during inspection. Choose it again.", 409);
  }
  return digest(`${resolved}\0${before.dev}\0${before.ino}\0${before.size}\0${before.mtimeMs}\0${createHash("sha256").update(contents).digest("hex")}`, 32);
}

export async function inspectOpenSpecCandidate(inputRoot: string): Promise<OpenSpecCandidate> {
  const inputInfo = await lstat(inputRoot).catch(() => {
    throw new WorkbenchError("INVALID_ROOT", "The selected project directory does not exist.", 400);
  });
  if (inputInfo.isSymbolicLink() || !inputInfo.isDirectory()) throw new WorkbenchError("INVALID_ROOT", "Select the exact project worktree folder.", 400);
  const requested = await realpath(inputRoot);
  const root = await realpath(await git(requested, ["rev-parse", "--show-toplevel"], {
    failureCode: "INVALID_GIT_ROOT",
    failureMessage: "The selected directory is not a readable Git worktree.",
  }));
  if (root !== requested) throw new WorkbenchError("PROJECT_ROOT_REQUIRED", "Select the exact Git worktree root, not a folder inside it.", 400);
  const configIdentity = await openSpecConfigIdentity(root);
  const gitDir = await resolveGitPath(root, await git(root, ["rev-parse", "--git-dir"]));
  const commonGitDir = await resolveGitPath(root, await git(root, ["rev-parse", "--git-common-dir"]));
  const head = await git(root, ["rev-parse", "HEAD"]);
  const branch = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowedExitCodes: [1] }) || null;
  return {
    root,
    gitDir,
    commonGitDir,
    repositoryId: digest(commonGitDir),
    worktreeId: digest(`${commonGitDir}\0${gitDir}\0${root}`),
    branch,
    head,
    configIdentity,
    kind: gitDir === commonGitDir ? "primary" : "linked",
  };
}

export async function discoverGitSnapshot(inputRoot: string): Promise<GitSnapshot> {
  const requested = await realpath(inputRoot).catch(() => {
    throw new WorkbenchError("INVALID_ROOT", "The selected project directory does not exist.", 400);
  });
  const root = await realpath(await git(requested, ["rev-parse", "--show-toplevel"], {
    failureCode: "INVALID_GIT_ROOT",
    failureMessage: "The selected directory is not a readable Git worktree.",
  }));
  await access(path.join(root, "openspec", "config.yaml"), constants.R_OK).catch(() => {
    throw new WorkbenchError("OPEN_SPEC_REQUIRED", "This project does not contain openspec/config.yaml.", 400);
  });

  const gitDir = await resolveGitPath(root, await git(root, ["rev-parse", "--git-dir"]));
  const commonGitDir = await resolveGitPath(root, await git(root, ["rev-parse", "--git-common-dir"]));
  const head = await git(root, ["rev-parse", "HEAD"]);
  const branchOutput = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowedExitCodes: [1] });
  const dirty = await gitDirty(root);
  const operation = await detectOperation(gitDir);
  const branch = branchOutput || null;

  return {
    root,
    gitDir,
    commonGitDir,
    repositoryId: digest(commonGitDir),
    worktreeId: digest(`${commonGitDir}\0${gitDir}\0${root}`),
    branch,
    head,
    shortHead: head.slice(0, 10),
    dirty,
    detached: branch === null,
    operation,
    epoch: digest(`${gitDir}\0${head}\0${dirty}\0${operation}`, 24),
  };
}

export async function runGitCommandForTesting(
  executable: string,
  prefixArgs: readonly string[],
  root: string,
  args: readonly string[],
  limits: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  return git(root, args, {}, {
    executable,
    prefixArgs,
    maxBytes: limits.maxBytes ?? DEFAULT_GIT_MAX_BYTES,
    timeoutMs: limits.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
  });
}

export async function detectGitDirtyForTesting(
  executable: string,
  prefixArgs: readonly string[],
  root: string,
  limits: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  return gitDirty(root, {
    executable,
    prefixArgs,
    maxBytes: limits.maxBytes ?? DEFAULT_GIT_MAX_BYTES,
    timeoutMs: limits.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
  });
}

interface WorktreeRecord {
  root: string;
  head: string;
  branch: string | null;
}

const MAX_DISCOVERED_WORKTREES = 256;
const WORKTREE_INSPECTION_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, map: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await map(values[index]!);
    }
  }));
  return results;
}

function parseWorktrees(output: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  for (const block of output.split(/\n\n+/u)) {
    let root = "";
    let head = "";
    let branch: string | null = null;
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) root = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length);
      else if (line.startsWith("branch refs/heads/")) branch = line.slice("branch refs/heads/".length);
    }
    if (root && head) records.push({ root, head, branch });
    if (records.length > MAX_DISCOVERED_WORKTREES) {
      throw new WorkbenchError("GIT_OUTPUT_LIMIT", "The repository contains too many worktrees to inspect safely.", 413);
    }
  }
  return records;
}

export async function discoverLocalBranches(inputRoot: string): Promise<LocalBranch[]> {
  const current = await discoverGitSnapshot(inputRoot);
  const [refsOutput, worktreesOutput] = await Promise.all([
    git(current.root, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)",
      "refs/heads",
    ]),
    git(current.root, ["worktree", "list", "--porcelain"]),
  ]);
  const worktreeByBranch = new Map<string, { root: string; worktreeId: string }>();
  const records = parseWorktrees(worktreesOutput).filter((record): record is WorktreeRecord & { branch: string } => record.branch !== null);
  const inspected = await mapWithConcurrency(records, WORKTREE_INSPECTION_CONCURRENCY, async (record) => {
    try {
      const candidate = await inspectOpenSpecCandidate(record.root);
      if (candidate.commonGitDir !== current.commonGitDir || candidate.branch !== record.branch || candidate.head !== record.head) return null;
      return { branch: record.branch, root: candidate.root, worktreeId: candidate.worktreeId };
    } catch {
      // Git may retain a stale or non-OpenSpec worktree entry. It remains visible but unavailable.
      return null;
    }
  });
  for (const worktree of inspected) if (worktree) worktreeByBranch.set(worktree.branch, { root: worktree.root, worktreeId: worktree.worktreeId });

  return refsOutput.split("\n").filter(Boolean).map((line) => {
    const [name = "", head = "", updatedAt = ""] = line.split("\0");
    const worktree = worktreeByBranch.get(name);
    const currentBranch = current.branch === name;
    return {
      name,
      head,
      shortHead: head.slice(0, 10),
      updatedAt,
      current: currentBranch,
      worktreeId: worktree?.worktreeId ?? null,
      worktreeRoot: worktree?.root ?? null,
      openable: Boolean(worktree),
      unavailableReason: worktree ? null : "No existing readable OpenSpec worktree",
    };
  });
}

export function projectBranchNavigation(branches: readonly LocalBranch[]): { recent: Array<Omit<LocalBranch, "worktreeRoot">>; all: Array<Omit<LocalBranch, "worktreeRoot">> } {
  const sanitize = ({ worktreeRoot: _worktreeRoot, ...branch }: LocalBranch) => branch;
  const current = branches.find((branch) => branch.current);
  const others = branches.filter((branch) => !branch.current).slice(0, 5);
  return {
    recent: [...(current ? [current] : []), ...others].map(sanitize),
    all: branches.map(sanitize),
  };
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new WorkbenchError("PATH_OUTSIDE_ROOT", "The requested artifact is outside the selected project.", 400);
}

export async function safeReadProjectFile(root: string, relativePath: string): Promise<string | null> {
  if (path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) {
    throw new WorkbenchError("INVALID_ARTIFACT_PATH", "The requested artifact path is invalid.", 400);
  }
  const rootReal = await realpath(root);
  const unresolved = path.resolve(rootReal, relativePath);
  assertContained(rootReal, unresolved);
  try {
    const linkInfo = await lstat(unresolved);
    if (!linkInfo.isFile() && !linkInfo.isSymbolicLink()) return null;
    const resolved = await realpath(unresolved);
    assertContained(rootReal, resolved);
    const info = await stat(resolved);
    if (!info.isFile()) return null;
    if (info.size > MAX_ARTIFACT_BYTES) {
      throw new WorkbenchError("ARTIFACT_TOO_LARGE", "The requested artifact is too large to display.", 413);
    }
    return await readFile(resolved, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof WorkbenchError) throw error;
    throw new WorkbenchError("ARTIFACT_UNREADABLE", "The requested artifact cannot be read.", 400);
  }
}
