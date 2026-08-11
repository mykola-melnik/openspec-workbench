import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverGitSnapshot } from "./git.js";
import { WorkbenchError } from "./types.js";

export interface ChildIdentity {
  root: string;
  repositoryId: string;
  worktreeId: string;
  head: string;
}

export interface LaunchedWorkbench {
  url: string;
  origin: string;
  token: string;
  identity: ChildIdentity;
}

interface MachineLaunch extends LaunchedWorkbench {
  pid: number;
}

interface ChildEntry {
  process: ChildProcess;
  launch: LaunchedWorkbench;
  activeRequests: number;
  activeStreams: number;
  lastActivity: number;
  generation: number;
  evictionTimer: NodeJS.Timeout | null;
}

export class WorkbenchLauncher {
  private readonly children = new Map<string, ChildEntry>();
  private readonly pending = new Map<string, Promise<LaunchedWorkbench>>();
  private readonly pendingRoots = new Map<string, Promise<LaunchedWorkbench>>();

  constructor(
    private readonly runtimePath = fileURLToPath(import.meta.url),
    private readonly idleMs = 10 * 60_000,
  ) {}

  async launch(inputRoot: string): Promise<LaunchedWorkbench> {
    const live = [...this.children.values()].find((entry) => entry.launch.identity.root === inputRoot && entry.process.exitCode === null && entry.process.signalCode === null);
    if (live) return live.launch;
    const pendingRoot = this.pendingRoots.get(inputRoot);
    if (pendingRoot) return pendingRoot;
    const launch = this.launchVerified(inputRoot);
    this.pendingRoots.set(inputRoot, launch);
    try {
      return await launch;
    } finally {
      if (this.pendingRoots.get(inputRoot) === launch) this.pendingRoots.delete(inputRoot);
    }
  }

  private async launchVerified(inputRoot: string): Promise<LaunchedWorkbench> {
    const expected = await discoverGitSnapshot(inputRoot);
    const existing = this.children.get(expected.worktreeId);
    if (existing && existing.process.exitCode === null && existing.process.signalCode === null) return existing.launch;
    const pending = this.pending.get(expected.worktreeId);
    if (pending) return pending;
    const launch = this.start(expected);
    this.pending.set(expected.worktreeId, launch);
    try {
      return await launch;
    } finally {
      if (this.pending.get(expected.worktreeId) === launch) this.pending.delete(expected.worktreeId);
    }
  }

  private async start(expected: Awaited<ReturnType<typeof discoverGitSnapshot>>): Promise<LaunchedWorkbench> {
    const child = spawn(process.execPath, [this.runtimePath, "--root", expected.root, "--machine"], {
      cwd: expected.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const machine = await this.readMachineLaunch(child).catch((error) => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      throw error;
    });
    if (!child.pid || machine.pid !== child.pid) {
      child.kill("SIGTERM");
      throw new WorkbenchError("CHILD_IDENTITY_MISMATCH", "The launched workbench identity could not be verified.", 502);
    }
    const identityResponse = await fetch(`${machine.origin}/api/identity`, {
      headers: { Authorization: `Bearer ${machine.token}` },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (!identityResponse?.ok) {
      child.kill("SIGTERM");
      throw new WorkbenchError("CHILD_HANDSHAKE_FAILED", "The launched workbench did not complete its identity handshake.", 502);
    }
    const identity = await identityResponse.json() as ChildIdentity;
    if (identity.root !== expected.root || identity.repositoryId !== expected.repositoryId || identity.worktreeId !== expected.worktreeId || identity.head !== expected.head) {
      child.kill("SIGTERM");
      throw new WorkbenchError("CHILD_IDENTITY_MISMATCH", "The launched workbench identity did not match the selected worktree.", 502);
    }
    const launch = { url: machine.url, origin: machine.origin, token: machine.token, identity };
    const entry: ChildEntry = {
      process: child,
      launch,
      activeRequests: 0,
      activeStreams: 0,
      lastActivity: Date.now(),
      generation: 0,
      evictionTimer: null,
    };
    this.children.set(expected.worktreeId, entry);
    child.once("exit", () => {
      if (this.children.get(expected.worktreeId) === entry) this.children.delete(expected.worktreeId);
      if (entry.evictionTimer) clearTimeout(entry.evictionTimer);
    });
    this.scheduleEviction(expected.worktreeId, entry);
    return launch;
  }

  async acquire(inputRoot: string, stream = false): Promise<{ launch: LaunchedWorkbench; release(): void }> {
    const launch = await this.launch(inputRoot);
    const entry = this.children.get(launch.identity.worktreeId);
    if (!entry) throw new WorkbenchError("CHILD_UNAVAILABLE", "The selected worktree process is unavailable.", 503);
    if (entry.evictionTimer) {
      clearTimeout(entry.evictionTimer);
      entry.evictionTimer = null;
    }
    entry.generation += 1;
    if (stream) entry.activeStreams += 1;
    else entry.activeRequests += 1;
    let released = false;
    return {
      launch,
      release: () => {
        if (released) return;
        released = true;
        if (stream) entry.activeStreams = Math.max(0, entry.activeStreams - 1);
        else entry.activeRequests = Math.max(0, entry.activeRequests - 1);
        entry.lastActivity = Date.now();
        entry.generation += 1;
        this.scheduleEviction(launch.identity.worktreeId, entry);
      },
    };
  }

  private scheduleEviction(worktreeId: string, entry: ChildEntry): void {
    if (entry.activeRequests || entry.activeStreams || this.children.get(worktreeId) !== entry) return;
    if (entry.evictionTimer) clearTimeout(entry.evictionTimer);
    const generation = entry.generation;
    const remaining = Math.max(0, this.idleMs - (Date.now() - entry.lastActivity));
    entry.evictionTimer = setTimeout(() => {
      entry.evictionTimer = null;
      if (this.children.get(worktreeId) !== entry || entry.generation !== generation || entry.activeRequests || entry.activeStreams) return;
      void this.stopEntry(worktreeId, entry);
    }, remaining);
    entry.evictionTimer.unref();
  }

  async invalidate(worktreeId: string): Promise<void> {
    const entry = this.children.get(worktreeId);
    if (entry) await this.stopEntry(worktreeId, entry);
  }

  async invalidateRoot(root: string): Promise<void> {
    const entries = [...this.children.entries()].filter(([, entry]) => entry.launch.identity.root === root);
    await Promise.all(entries.map(([worktreeId, entry]) => this.stopEntry(worktreeId, entry)));
  }

  private async stopEntry(worktreeId: string, entry: ChildEntry): Promise<void> {
    if (this.children.get(worktreeId) === entry) this.children.delete(worktreeId);
    if (entry.evictionTimer) clearTimeout(entry.evictionTimer);
    const child = entry.process;
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill("SIGTERM");
    });
  }

  private async readMachineLaunch(child: ChildProcess): Promise<MachineLaunch> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => reject(new WorkbenchError("CHILD_START_TIMEOUT", "The selected worktree did not start in time.", 504)), 10_000);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        const line = stdout.split("\n").find(Boolean);
        if (!line) return;
        try {
          const value = JSON.parse(line) as Partial<MachineLaunch>;
          if (typeof value.url !== "string" || typeof value.origin !== "string" || typeof value.token !== "string" || typeof value.pid !== "number") return;
          clearTimeout(timer);
          resolve(value as MachineLaunch);
        } catch {
          // Wait for one complete machine-readable line.
        }
      });
      child.stderr?.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-2_048); });
      child.once("error", (error) => {
        clearTimeout(timer);
        const code = (error as NodeJS.ErrnoException).code ?? "process-error";
        reject(new WorkbenchError("CHILD_START_FAILED", `The selected worktree could not start: ${code}.`, 502));
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new WorkbenchError("CHILD_START_FAILED", `The selected worktree process exited before startup (${code ?? "signal"}${stderr ? ", diagnostic available" : ""}).`, 502));
      });
    });
  }

  async close(): Promise<void> {
    const entries = [...this.children.entries()];
    this.children.clear();
    this.pendingRoots.clear();
    await Promise.all(entries.map(([worktreeId, entry]) => this.stopEntry(worktreeId, entry)));
  }
}
