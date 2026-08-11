import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { watch, type FSWatcher } from "node:fs";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { discoverGitSnapshot } from "./git.js";
import { WorkbenchError, type GitSnapshot } from "./types.js";

const MAX_OPEN_SPEC_ENTRIES = 10_000;
const MAX_OPEN_SPEC_FILE_BYTES = 2 * 1024 * 1024;
const MAX_OPEN_SPEC_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_CHANGED_PATHS = 12;
const FILESYSTEM_SETTLE_MS = 50;

export type SnapshotChangeReason = "source" | "head" | "head-and-source" | "worktree" | "unavailable" | "watcher-error";

export interface OpenSpecContentState {
  identity: string;
  entries: ReadonlyMap<string, string>;
}

export interface SnapshotChangeEvidence {
  paths?: string[];
  additionalPaths?: number;
  previousRevision?: string;
  revision?: string;
}

export async function openSpecContentState(root: string): Promise<OpenSpecContentState> {
  const hash = createHash("sha256");
  const fingerprints = new Map<string, string>();
  const openSpecRoot = path.join(root, "openspec");
  let entries = 0;
  let bytes = 0;

  const visit = async (absolute: string, relative: string): Promise<void> => {
    const info = await lstat(absolute);
    entries += 1;
    if (entries > MAX_OPEN_SPEC_ENTRIES) throw new WorkbenchError("OPEN_SPEC_CONTENT_LIMIT", "OpenSpec contains too many entries to read safely.", 413);
    if (info.isSymbolicLink()) {
      const target = await readlink(absolute);
      bytes += Buffer.byteLength(target);
      if (bytes > MAX_OPEN_SPEC_TOTAL_BYTES) throw new WorkbenchError("OPEN_SPEC_CONTENT_LIMIT", "OpenSpec content exceeds the safe reading limit.", 413);
      hash.update(`link\0${relative}\0${target}\0`);
      fingerprints.set(relative, `link:${createHash("sha256").update(target).digest("hex")}`);
      return;
    }
    if (info.isDirectory()) {
      hash.update(`directory\0${relative}\0`);
      fingerprints.set(relative, "directory");
      const children = (await readdir(absolute)).sort((left, right) => left.localeCompare(right, "en"));
      for (const child of children) await visit(path.join(absolute, child), path.posix.join(relative, child));
      return;
    }
    if (info.isFile()) {
      if (info.size > MAX_OPEN_SPEC_FILE_BYTES || bytes + info.size > MAX_OPEN_SPEC_TOTAL_BYTES) {
        throw new WorkbenchError("OPEN_SPEC_CONTENT_LIMIT", "OpenSpec content exceeds the safe reading limit.", 413);
      }
      const content = await readFile(absolute);
      bytes += content.length;
      hash.update(`file\0${relative}\0${content.length}\0`);
      hash.update(content);
      hash.update("\0");
      fingerprints.set(relative, `file:${content.length}:${createHash("sha256").update(content).digest("hex")}`);
      return;
    }
    hash.update(`other\0${relative}\0`);
    fingerprints.set(relative, `other:${info.mode}`);
  };

  await visit(openSpecRoot, "openspec");
  return { identity: hash.digest("hex"), entries: fingerprints };
}

export async function openSpecContentIdentity(root: string): Promise<string> {
  return (await openSpecContentState(root)).identity;
}

function changedOpenSpecPaths(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((relative) => before.get(relative) !== after.get(relative))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export class SnapshotWatcher extends EventEmitter {
  #watchers: FSWatcher[] = [];
  #timer: NodeJS.Timeout | null = null;
  #filesystemTimer: NodeJS.Timeout | null = null;
  #filesystemCheckRunning = false;
  #filesystemCheckPending = false;
  #closed = false;
  #epoch: string;
  #head: string;
  #contentIdentity: string;
  #contentEntries: ReadonlyMap<string, string>;
  #observedEpoch: string;
  #observedHead: string;
  #observedContentIdentity: string;
  #generation = 0;
  #pollingClients = 0;
  #pollingGeneration = 0;
  #unavailable = false;

  private constructor(private readonly snapshot: GitSnapshot, private readonly pollMs: number, content: OpenSpecContentState, unavailable = false) {
    super();
    this.#epoch = snapshot.epoch;
    this.#head = snapshot.head;
    this.#contentIdentity = content.identity;
    this.#contentEntries = content.entries;
    this.#observedEpoch = snapshot.epoch;
    this.#observedHead = snapshot.head;
    this.#observedContentIdentity = content.identity;
    this.#unavailable = unavailable;
  }

  static async create(snapshot: GitSnapshot, pollMs = 10_000): Promise<SnapshotWatcher> {
    try {
      return new SnapshotWatcher(snapshot, pollMs, await openSpecContentState(snapshot.root));
    } catch (error) {
      if (error instanceof WorkbenchError && error.code === "OPEN_SPEC_CONTENT_LIMIT") return new SnapshotWatcher(snapshot, pollMs, { identity: "", entries: new Map() }, true);
      throw error;
    }
  }

  start(): void {
    const targets = [
      { target: path.join(this.snapshot.root, "openspec"), recursive: true, changed: () => this.#queueFilesystemCheck() },
      { target: path.join(this.snapshot.gitDir, "HEAD"), recursive: false, changed: () => void this.poll() },
    ];
    for (const { target, recursive, changed } of targets) {
      try {
        const watcher = watch(target, { recursive }, changed);
        watcher.on("error", () => this.#markChanged("watcher-error"));
        this.#watchers.push(watcher);
      } catch {
        // Polling below remains the portable missed-event fallback.
      }
    }
  }

  get generation(): number {
    return this.#generation;
  }

  acknowledge(snapshot: GitSnapshot, generation: number, content: string | OpenSpecContentState): boolean {
    if (this.#closed || generation !== this.#generation || snapshot.root !== this.snapshot.root) return false;
    const contentIdentity = typeof content === "string" ? content : content.identity;
    this.#epoch = snapshot.epoch;
    this.#head = snapshot.head;
    this.#contentIdentity = contentIdentity;
    if (typeof content !== "string") this.#contentEntries = content.entries;
    this.#observedEpoch = snapshot.epoch;
    this.#observedHead = snapshot.head;
    this.#observedContentIdentity = contentIdentity;
    this.#unavailable = false;
    return true;
  }

  retainPolling(): () => void {
    if (this.#closed) return () => undefined;
    this.#pollingClients += 1;
    if (!this.#timer) {
      const pollingGeneration = ++this.#pollingGeneration;
      this.#timer = setInterval(() => void this.poll(pollingGeneration), this.pollMs);
      this.#timer.unref();
    }
    let retained = true;
    return () => {
      if (!retained) return;
      retained = false;
      this.#pollingClients = Math.max(0, this.#pollingClients - 1);
      if (this.#pollingClients === 0 && this.#timer) {
        clearInterval(this.#timer);
        this.#timer = null;
        this.#pollingGeneration += 1;
      }
    };
  }

  async poll(pollingGeneration?: number): Promise<void> {
    if (this.#closed) return;
    try {
      const [current, content] = await Promise.all([
        discoverGitSnapshot(this.snapshot.root),
        openSpecContentState(this.snapshot.root),
      ]);
      if (pollingGeneration !== undefined && pollingGeneration !== this.#pollingGeneration) return;
      this.#observe(current.epoch, current.head, content);
    } catch {
      if (pollingGeneration !== undefined && pollingGeneration !== this.#pollingGeneration) return;
      this.#markChanged("unavailable");
    }
  }

  #queueFilesystemCheck(): void {
    if (this.#closed) return;
    this.#filesystemCheckPending = true;
    if (this.#filesystemTimer) clearTimeout(this.#filesystemTimer);
    this.#filesystemTimer = setTimeout(() => {
      this.#filesystemTimer = null;
      void this.#runFilesystemChecks();
    }, FILESYSTEM_SETTLE_MS);
    this.#filesystemTimer.unref();
  }

  async #runFilesystemChecks(): Promise<void> {
    if (this.#closed || this.#filesystemCheckRunning) return;
    this.#filesystemCheckRunning = true;
    try {
      while (!this.#closed && this.#filesystemCheckPending) {
        this.#filesystemCheckPending = false;
        const content = await openSpecContentState(this.snapshot.root);
        this.#observe(this.#observedEpoch, this.#observedHead, content);
      }
    } catch {
      this.#markChanged("unavailable");
    } finally {
      this.#filesystemCheckRunning = false;
      if (this.#filesystemCheckPending) this.#queueFilesystemCheck();
    }
  }

  #observe(epoch: string, head: string, content: OpenSpecContentState): void {
    const recovered = this.#unavailable;
    this.#unavailable = false;
    const observationChanged = epoch !== this.#observedEpoch || content.identity !== this.#observedContentIdentity;
    const worktreeChanged = epoch !== this.#epoch;
    const headChanged = head !== this.#head;
    const sourceChanged = content.identity !== this.#contentIdentity;
    const changedPaths = sourceChanged ? changedOpenSpecPaths(this.#contentEntries, content.entries) : [];
    this.#observedEpoch = epoch;
    this.#observedHead = head;
    this.#observedContentIdentity = content.identity;
    if (recovered) {
      this.#markChanged("worktree");
      return;
    }
    if (!observationChanged) return;
    if (headChanged || sourceChanged) {
      const evidence: SnapshotChangeEvidence = {};
      if (sourceChanged) {
        evidence.paths = changedPaths.slice(0, MAX_CHANGED_PATHS);
        evidence.additionalPaths = Math.max(0, changedPaths.length - MAX_CHANGED_PATHS);
      }
      if (headChanged) {
        evidence.previousRevision = this.#head.slice(0, 10);
        evidence.revision = head.slice(0, 10);
      }
      this.#markChanged(headChanged && sourceChanged ? "head-and-source" : headChanged ? "head" : "source", evidence);
    }
    else if (worktreeChanged) this.#markChanged("worktree");
  }

  #markChanged(reason: SnapshotChangeReason, evidence: SnapshotChangeEvidence = {}): void {
    if (!this.#closed) {
      if (reason === "unavailable") {
        if (this.#unavailable) return;
        this.#unavailable = true;
      }
      this.#generation += 1;
      this.emit("change", reason, evidence);
    }
  }

  close(): void {
    this.#closed = true;
    for (const watcher of this.#watchers) watcher.close();
    this.#watchers = [];
    if (this.#timer) clearInterval(this.#timer);
    if (this.#filesystemTimer) clearTimeout(this.#filesystemTimer);
    this.#timer = null;
    this.#filesystemTimer = null;
    this.#filesystemCheckPending = false;
    this.#pollingClients = 0;
    this.#pollingGeneration += 1;
  }
}
