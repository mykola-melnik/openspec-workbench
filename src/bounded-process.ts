import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { WorkbenchError } from "./types.js";

const MAX_ARGUMENT_BYTES = 128 * 1024;
const SAFE_ENV_KEYS = ["HOME", "PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const;

export interface BoundedProcessFile {
  path: string;
  content: string;
  mode?: number;
}

export interface BoundedProcessOptions {
  executable: string;
  args: readonly string[] | ((workspace: string) => readonly string[]);
  files?: readonly BoundedProcessFile[];
  readFiles?: readonly string[];
  stdin?: string;
  timeoutMs?: number;
  killGraceMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  signal?: AbortSignal;
  environment?: Readonly<Record<string, string>>;
}

export interface BoundedProcessResult {
  stdout: string;
  stderr: string;
  files: ReadonlyMap<string, string>;
}

function safeRelativeFile(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(value) || value.includes("//")) throw new Error("Process fixture paths must use the bounded relative shape.");
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) throw new Error("Process fixture paths must remain inside the private workspace.");
  return normalized;
}

function boundedEnvironment(workspace: string, additions: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  environment.HOME = os.homedir();
  environment.PATH = process.env.PATH ?? "";
  environment.PWD = workspace;
  environment.BROWSER = process.platform === "win32" ? "NUL" : "/usr/bin/false";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.NO_COLOR = "1";
  for (const [key, value] of Object.entries(additions)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(key) || Buffer.byteLength(value, "utf8") > 8 * 1024) throw new Error("Process environment additions must use the fixed bounded shape.");
    environment[key] = value;
  }
  return environment;
}

function terminateProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when a process group is already gone.
    }
  }
  try { child.kill(signal); } catch { /* The process already settled. */ }
}

export async function runBoundedProcess(options: BoundedProcessOptions): Promise<BoundedProcessResult> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "openspec-workbench-translation-"));
  await chmod(workspace, 0o700);
  try {
    for (const file of options.files ?? []) {
      const relative = safeRelativeFile(file.path);
      const target = path.join(workspace, relative);
      if (path.dirname(target) !== workspace) throw new Error("Nested process fixture paths are not supported.");
      await writeFile(target, file.content, { encoding: "utf8", mode: file.mode ?? 0o600, flag: "wx" });
    }
    const args = [...(typeof options.args === "function" ? options.args(workspace) : options.args)];
    if (!options.executable || options.executable.includes("\0") || args.some((argument) => typeof argument !== "string" || argument.includes("\0"))) throw new Error("Process invocation must use bounded string arguments.");
    if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_ARGUMENT_BYTES) throw new WorkbenchError("TRANSLATION_REQUEST_TOO_LARGE", "The selected plan is too large to translate in one request.", 413);
    const timeoutMs = options.timeoutMs ?? 250_000;
    const killGraceMs = options.killGraceMs ?? 2_000;
    const maxStdoutBytes = options.maxStdoutBytes ?? 2 * 1024 * 1024;
    const maxStderrBytes = options.maxStderrBytes ?? 64 * 1024;
    return await new Promise<BoundedProcessResult>((resolve, reject) => {
      const child = spawn(options.executable, args, {
        cwd: workspace,
        detached: process.platform !== "win32",
        env: boundedEnvironment(workspace, options.environment),
        shell: false,
        stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let failure: WorkbenchError | null = null;
      let killTimer: NodeJS.Timeout | null = null;
      const terminate = () => {
        terminateProcessTree(child, "SIGTERM");
        if (!killTimer) {
          killTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL"), killGraceMs);
          killTimer.unref();
        }
      };
      const fail = (error: WorkbenchError) => {
        if (!failure) failure = error;
        terminate();
      };
      const timeout = setTimeout(() => fail(new WorkbenchError("TRANSLATION_PROVIDER_TIMEOUT", "The selected provider did not complete within the allowed time.", 504)), timeoutMs);
      timeout.unref();
      const onAbort = () => fail(new WorkbenchError("TRANSLATION_PROVIDER_FAILED", "The translation request was cancelled.", 499));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout!.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxStdoutBytes) fail(new WorkbenchError("TRANSLATION_OUTPUT_LIMIT", "The selected provider exceeded the translation output limit.", 502));
        else stdout.push(chunk);
      });
      child.stderr!.on("data", (chunk: Buffer) => {
        if (stderrBytes >= maxStderrBytes) return;
        const bounded = chunk.subarray(0, maxStderrBytes - stderrBytes);
        stderrBytes += bounded.length;
        stderr.push(bounded);
      });
      child.once("error", (error: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error.code === "E2BIG"
          ? new WorkbenchError("TRANSLATION_REQUEST_TOO_LARGE", "The selected plan is too large to translate in one request.", 413)
          : new WorkbenchError("TRANSLATION_ADAPTER_UNAVAILABLE", "The selected provider is not available on this computer.", 503));
      });
      child.once("close", async (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        options.signal?.removeEventListener("abort", onAbort);
        if (failure) {
          reject(failure);
          return;
        }
        if (code !== 0) {
          const error = new WorkbenchError("TRANSLATION_PROVIDER_FAILED", "The selected provider could not complete the request.", 502);
          (error as WorkbenchError & { boundedStderr?: string }).boundedStderr = Buffer.concat(stderr).toString("utf8");
          reject(error);
          return;
        }
        try {
          const files = new Map<string, string>();
          for (const file of options.readFiles ?? []) {
            const relative = safeRelativeFile(file);
            files.set(relative, await readFile(path.join(workspace, relative), "utf8"));
          }
          resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), files });
        } catch {
          reject(new WorkbenchError("TRANSLATION_OUTPUT_INVALID", "The selected provider did not return the required output.", 502));
        }
      });
      if (options.stdin !== undefined) child.stdin?.end(options.stdin, "utf8");
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function probeExecutable(executable: string, args: readonly string[] = ["--version"], timeoutMs = 1_500): Promise<boolean> {
  try {
    await runBoundedProcess({ executable, args, timeoutMs, killGraceMs: 100, maxStdoutBytes: 32 * 1024, maxStderrBytes: 32 * 1024 });
    return true;
  } catch {
    return false;
  }
}
