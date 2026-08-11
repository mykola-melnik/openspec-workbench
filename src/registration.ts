import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { inspectOpenSpecCandidate, type OpenSpecCandidate } from "./git.js";
import { WorkbenchLauncher } from "./launcher.js";
import { createPinnedOpenSpecRunner } from "./openspec.js";
import { ProjectRegistry, type RegisteredProject } from "./registry.js";
import { verifyOpenSpecCompatibility } from "./compatibility.js";
import { WorkbenchError } from "./types.js";

export interface FolderPicker {
  pick(): Promise<string | null>;
  close?(): Promise<void>;
}

const PICKER_CANCELLED = "__OPENSPEC_PICKER_CANCELLED__";
const PICKER_SOURCE = `try
  set selectedFolder to choose folder with prompt "Choose an OpenSpec project folder"
  return POSIX path of selectedFolder
on error number -128
  return "${PICKER_CANCELLED}"
end try`;

export function decodeMacFolderPickerOutputForTesting(stdout: string): string | null {
  const value = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
  if (value === PICKER_CANCELLED) return null;
  if (value.startsWith("/") && value.length > 0) return value;
  throw new WorkbenchError("PICKER_OUTPUT_INVALID", "The native folder chooser returned an invalid selection.", 502);
}

export class MacFolderPicker implements FolderPicker {
  private child: ReturnType<typeof spawn> | null = null;

  async pick(): Promise<string | null> {
    if (process.platform !== "darwin") throw new WorkbenchError("PICKER_UNSUPPORTED", "Native folder selection is supported on macOS only.", 501);
    if (this.child) throw new WorkbenchError("PICKER_BUSY", "A folder chooser is already open.", 409);
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let overflow = false;
      let timedOut = false;
      const child = spawn("/usr/bin/osascript", ["-e", PICKER_SOURCE], { stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 2 * 60_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > 64 * 1024) {
          overflow = true;
          child.kill("SIGKILL");
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_096); });
      child.once("error", () => {
        clearTimeout(timer);
        this.child = null;
        reject(new WorkbenchError("PICKER_UNAVAILABLE", "The native folder chooser could not start.", 503));
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        this.child = null;
        if (overflow) return reject(new WorkbenchError("PICKER_OUTPUT_LIMIT", "The native folder chooser returned too much data.", 502));
        if (timedOut) return reject(new WorkbenchError("PICKER_TIMEOUT", "The native folder chooser timed out.", 504));
        if (code !== 0 && /not authorized|not permitted|permission/iu.test(stderr)) return reject(new WorkbenchError("PICKER_PERMISSION_DENIED", "macOS denied access to the selected folder.", 403));
        if (code !== 0 && /connection invalid|not running|no user interaction/iu.test(stderr)) return reject(new WorkbenchError("NO_GUI_SESSION", "No interactive macOS session is available for folder selection.", 503));
        if (code !== 0) return reject(new WorkbenchError("PICKER_FAILED", "The native folder chooser could not complete.", 502));
        try { resolve(decodeMacFolderPickerOutputForTesting(stdout)); }
        catch (error) { reject(error); }
      });
    });
  }

  async close(): Promise<void> {
    if (this.child?.exitCode === null && this.child.signalCode === null) this.child.kill("SIGTERM");
  }
}

type Operation = "add" | "rebind";
type IntentState = "selecting" | "preview" | "cancelled" | "error" | "completed" | "consumed";

interface RegistrationIntent {
  id: string;
  operation: Operation;
  projectId: string | null;
  expectedRevision: number | null;
  createdAt: number;
  state: IntentState;
  candidate: OpenSpecCandidate | null;
  error: { code: string; message: string } | null;
  result: RegisteredProject | null;
  cleanupWarning: boolean;
}

export interface PublicRegistrationIntent {
  id: string;
  operation: Operation;
  state: IntentState;
  preview: null | {
    root: string;
    detectedName: string;
    branch: string | null;
    detached: boolean;
    kind: "primary" | "linked";
  };
  error: { code: string; message: string } | null;
  result: RegisteredProject | null;
  cleanupWarning: boolean;
}

export class RegistrationIntents {
  private readonly intents = new Map<string, RegistrationIntent>();
  private activePicker: string | null = null;

  constructor(private readonly picker: FolderPicker = new MacFolderPicker(), private readonly ttlMs = 2 * 60_000) {}

  start(operation: Operation, projectId: string | null, expectedRevision: number | null): PublicRegistrationIntent {
    this.expire();
    if (this.activePicker) throw new WorkbenchError("PICKER_BUSY", "A folder chooser is already open.", 409);
    if (operation === "rebind" && (!projectId || !Number.isInteger(expectedRevision) || (expectedRevision ?? 0) < 1)) {
      throw new WorkbenchError("REGISTRATION_INTENT_INVALID", "Rebinding requires the current project revision.", 400);
    }
    if (operation === "add" && (projectId !== null || expectedRevision !== null)) throw new WorkbenchError("REGISTRATION_INTENT_INVALID", "Adding a project does not accept an existing project identity.", 400);
    const intent: RegistrationIntent = {
      id: randomBytes(24).toString("base64url"), operation, projectId, expectedRevision,
      createdAt: Date.now(), state: "selecting", candidate: null, error: null, result: null, cleanupWarning: false,
    };
    this.intents.set(intent.id, intent);
    this.activePicker = intent.id;
    void this.select(intent);
    return this.public(intent);
  }

  private async select(intent: RegistrationIntent): Promise<void> {
    try {
      const selected = await this.picker.pick();
      if (intent.state !== "selecting") return;
      if (selected === null) intent.state = "cancelled";
      else {
        intent.candidate = await inspectOpenSpecCandidate(selected);
        intent.state = "preview";
      }
    } catch (error) {
      const mapped = error instanceof WorkbenchError ? error : new WorkbenchError("PICKER_FAILED", "The folder could not be inspected.", 502);
      intent.error = { code: mapped.code, message: mapped.message };
      intent.state = "error";
    } finally {
      if (this.activePicker === intent.id) this.activePicker = null;
    }
  }

  get(id: string): PublicRegistrationIntent {
    this.expire();
    const intent = this.intents.get(id);
    if (!intent) throw new WorkbenchError("REGISTRATION_INTENT_NOT_FOUND", "This folder selection has expired.", 404);
    return this.public(intent);
  }

  cancel(id: string): PublicRegistrationIntent {
    const intent = this.intents.get(id);
    if (!intent) throw new WorkbenchError("REGISTRATION_INTENT_NOT_FOUND", "This folder selection has expired.", 404);
    if (intent.state === "completed" || intent.state === "consumed") throw new WorkbenchError("REGISTRATION_INTENT_CONSUMED", "This folder selection was already used.", 409);
    intent.state = "cancelled";
    return this.public(intent);
  }

  async confirm(id: string, label: string, registry: ProjectRegistry, launcher: WorkbenchLauncher): Promise<PublicRegistrationIntent> {
    this.expire();
    const intent = this.intents.get(id);
    if (!intent) throw new WorkbenchError("REGISTRATION_INTENT_NOT_FOUND", "This folder selection has expired.", 404);
    if (intent.state !== "preview" || !intent.candidate) throw new WorkbenchError("REGISTRATION_INTENT_CONSUMED", "This folder selection cannot be confirmed.", 409);
    intent.state = "consumed";
    try {
      const before = await inspectOpenSpecCandidate(intent.candidate.root);
      this.assertUnchanged(intent.candidate, before);
      await verifyOpenSpecCompatibility(before.root, createPinnedOpenSpecRunner(before.root));
      const after = await inspectOpenSpecCandidate(intent.candidate.root);
      this.assertUnchanged(before, after);
      let project: RegisteredProject;
      if (intent.operation === "add") {
        project = await registry.register(after.root, label, after);
      } else {
        const rebound = await registry.rebind(intent.projectId ?? "", intent.expectedRevision ?? 0, after.root, label, after);
        try {
          await launcher.invalidateRoot(rebound.previous.root);
        } catch {
          intent.cleanupWarning = true;
        }
        project = rebound.project;
      }
      intent.result = project;
      intent.state = "completed";
      return this.public(intent);
    } catch (error) {
      const mapped = error instanceof WorkbenchError
        ? error
        : new WorkbenchError("REGISTRATION_CONFIRM_FAILED", "The selected project could not be registered.", 500);
      intent.error = { code: mapped.code, message: mapped.message };
      intent.state = "error";
      throw mapped;
    }
  }

  private assertUnchanged(expected: OpenSpecCandidate, actual: OpenSpecCandidate): void {
    if (expected.root !== actual.root || expected.repositoryId !== actual.repositoryId || expected.worktreeId !== actual.worktreeId || expected.head !== actual.head || expected.configIdentity !== actual.configIdentity) {
      throw new WorkbenchError("REGISTRATION_CANDIDATE_CHANGED", "The selected project changed before confirmation. Choose it again.", 409);
    }
  }

  private public(intent: RegistrationIntent): PublicRegistrationIntent {
    return {
      id: intent.id,
      operation: intent.operation,
      state: intent.state,
      preview: intent.candidate ? {
        root: intent.candidate.root,
        detectedName: path.basename(intent.candidate.root),
        branch: intent.candidate.branch,
        detached: intent.candidate.branch === null,
        kind: intent.candidate.kind,
      } : null,
      error: intent.error,
      result: intent.result,
      cleanupWarning: intent.cleanupWarning,
    };
  }

  private expire(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, intent] of this.intents) if (intent.createdAt < cutoff) this.intents.delete(id);
  }

  async close(): Promise<void> {
    await this.picker.close?.();
    this.intents.clear();
  }
}
