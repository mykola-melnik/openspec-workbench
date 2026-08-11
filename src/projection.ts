import path from "node:path";
import type { BranchNavigation, ChangeDetail, ChangeSummary, GitSnapshot, OpenSpecRunner, PlanSection, PlanTask, WorkbenchSnapshot } from "./types.js";
import { WorkbenchError } from "./types.js";
import { safeReadProjectFile } from "./git.js";
import { verifyOpenSpecCompatibility } from "./compatibility.js";
import { adaptArtifactStatus, adaptChangeList, adaptDoctor, adaptValidation } from "./openspec.js";

function readableName(id: string): string {
  return id.split(/[-_]/u).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function normalizeBody(lines: string[]): string {
  return lines.join("\n").trim();
}

export function parseSections(content: string | null, sourcePath: string): PlanSection[] {
  if (!content) return [];
  const result: PlanSection[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of content.split(/\r?\n/u)) {
    const heading = /^(#{2,3})\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      if (current) {
        result.push({ id: current.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-"), title: current.title, body: normalizeBody(current.lines), sourcePath });
      }
      current = { title: heading[2] ?? "Section", lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    result.push({ id: current.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-"), title: current.title, body: normalizeBody(current.lines), sourcePath });
  }
  return result;
}

export function parseTasks(content: string | null, sourcePath: string): { tasks: PlanTask[]; malformedTaskLines: number[] } {
  if (!content) return { tasks: [], malformedTaskLines: [] };
  const tasks: PlanTask[] = [];
  const malformedTaskLines: number[] = [];
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = /^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/u.exec(line);
    if (match) {
      const raw = match[2] ?? "";
      const idMatch = /^(\d+(?:\.\d+)*)\s+(.+)$/u.exec(raw);
      tasks.push({
        id: idMatch?.[1] ?? `line-${index + 1}`,
        text: idMatch?.[2] ?? raw,
        completed: (match[1] ?? "").toLowerCase() === "x",
        sourcePath,
        line: index + 1,
      });
    } else if (/^\s*-\s*\[[^\]]*\]/u.test(line)) {
      malformedTaskLines.push(index + 1);
    }
  }
  return { tasks, malformedTaskLines };
}

async function projectName(root: string): Promise<string> {
  const packageJson = await safeReadProjectFile(root, "package.json");
  if (packageJson) {
    try {
      const name = (JSON.parse(packageJson) as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) return name;
    } catch {
      // A malformed package file should not hide otherwise readable plans.
    }
  }
  return path.basename(root);
}

function dependencyBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!/^\s*(?:[-*+]\s+)?(?:\*\*)?(?:(?:the\s+)?change\s+)?(?:depends\s+on|dependencies)(?:\*\*)?(?::|\b)/iu.test(line)) continue;
    const block = [line];
    while (index + 1 < lines.length && /^\s{2,}\S/u.test(lines[index + 1] ?? "") && !/^\s*[-*+]\s+/u.test(lines[index + 1] ?? "")) {
      index += 1;
      block.push(lines[index] ?? "");
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

export function parseExplicitChangeDependencies(content: string | null, knownIds: ReadonlySet<string>, ownId: string): string[] {
  if (!content) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const block of dependencyBlocks(content)) {
    for (const match of block.matchAll(/`([a-z0-9][a-z0-9._-]*)`/gu)) {
      const id = match[1];
      if (!id || id === ownId || !knownIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function cycleNodes(changes: ChangeSummary[]): Set<string> {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const completed = new Set<string>();
  const active: string[] = [];
  const activePositions = new Map<string, number>();
  const cycles = new Set<string>();

  function visit(id: string): void {
    const cycleStart = activePositions.get(id);
    if (cycleStart !== undefined) {
      for (const cycleId of active.slice(cycleStart)) cycles.add(cycleId);
      return;
    }
    if (completed.has(id)) return;
    activePositions.set(id, active.length);
    active.push(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    active.pop();
    activePositions.delete(id);
    completed.add(id);
  }

  for (const change of changes) visit(change.id);
  return cycles;
}

export function deriveTreeParents(changes: ChangeSummary[]): ChangeSummary[] {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const cycles = cycleNodes(changes);
  return changes.map((change) => {
    if (cycles.has(change.id) || !change.dependsOn[0]) return { ...change, treeParentId: null };
    const visited = new Set([change.id]);
    let ancestorId: string | undefined = change.dependsOn[0];
    while (ancestorId) {
      if (visited.has(ancestorId) || cycles.has(ancestorId)) return { ...change, treeParentId: null };
      visited.add(ancestorId);
      const ancestor = byId.get(ancestorId);
      const nextId: string | undefined = ancestor?.dependsOn[0];
      if (!nextId) return { ...change, treeParentId: ancestorId };
      ancestorId = nextId;
    }
    return { ...change, treeParentId: null };
  });
}

export async function listChanges(root: string, runner: OpenSpecRunner): Promise<ChangeSummary[]> {
  const flat = adaptChangeList(await runner.run(["list", "--json"])).map((change) => ({
    ...change,
    title: readableName(change.title),
    dependsOn: [] as string[],
    treeParentId: null,
  }));
  const knownIds = new Set(flat.map((change) => change.id));
  const dependencies = await Promise.all(flat.map(async (change) => {
    const proposalPath = path.posix.join("openspec", "changes", change.id, "proposal.md");
    let proposal: string | null = null;
    try {
      proposal = await safeReadProjectFile(root, proposalPath);
    } catch {
      return [];
    }
    return parseExplicitChangeDependencies(proposal, knownIds, change.id);
  }));
  return deriveTreeParents(flat.map((change, index) => ({ ...change, dependsOn: dependencies[index] ?? [] })));
}

export async function buildSnapshot(
  root: string,
  git: GitSnapshot,
  runner: OpenSpecRunner,
  stale = false,
  branches: BranchNavigation = { recent: [], all: [] },
): Promise<WorkbenchSnapshot> {
  let compatibility: WorkbenchSnapshot["compatibility"] = "supported";
  let openSpecHealthy = false;
  let changes: ChangeSummary[] = [];
  try {
    await verifyOpenSpecCompatibility(root, runner);
    changes = await listChanges(root, runner);
    openSpecHealthy = adaptDoctor(await runner.run(["doctor", "--json"])).healthy;
  } catch (error) {
    if (error instanceof WorkbenchError && error.code === "OPENSPEC_VERSION_UNSUPPORTED") {
      compatibility = "unsupported";
      openSpecHealthy = false;
      changes = [];
    } else throw error;
  }
  const { root: _root, gitDir: _gitDir, commonGitDir: _commonGitDir, ...publicGit } = git;
  return {
    projectName: await projectName(root),
    git: publicGit,
    generatedAt: new Date().toISOString(),
    stale,
    openSpecHealthy,
    compatibility,
    changes,
    branches,
    translation: {
      enabled: true,
      mode: "provider-registry",
      message: "Ukrainian translation uses an explicitly selected supported local CLI or local Ollama model while a saved non-English reading mode is active.",
    },
  };
}

function assertChangeId(changeId: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,254}$/u.test(changeId)) {
    throw new WorkbenchError("INVALID_CHANGE_ID", "The requested change name is invalid.", 400);
  }
}

export async function buildChangePreview(root: string, summary: ChangeSummary): Promise<ChangeDetail> {
  assertChangeId(summary.id);
  const base = path.posix.join("openspec", "changes", summary.id);
  const proposalPath = path.posix.join(base, "proposal.md");
  const designPath = path.posix.join(base, "design.md");
  const tasksPath = path.posix.join(base, "tasks.md");
  const [proposal, design, taskContent] = await Promise.all([
    safeReadProjectFile(root, proposalPath),
    safeReadProjectFile(root, designPath),
    safeReadProjectFile(root, tasksPath),
  ]);
  const parsedTasks = parseTasks(taskContent, tasksPath);
  return {
    ...summary,
    title: readableName(summary.title || summary.id),
    proposal: parseSections(proposal, proposalPath),
    design: parseSections(design, designPath),
    tasks: parsedTasks.tasks,
    malformedTaskLines: parsedTasks.malformedTaskLines,
    artifacts: [],
    validation: { state: "pending", message: "Strict OpenSpec verification is running in the background." },
    completedTasks: parsedTasks.tasks.filter((task) => task.completed).length,
    totalTasks: parsedTasks.tasks.length,
  };
}

export async function buildChangeVerification(root: string, changeId: string, runner: OpenSpecRunner): Promise<Pick<ChangeDetail, "artifacts" | "validation">> {
  assertChangeId(changeId);
  let validation: ChangeDetail["validation"];
  const [statusValue, validationValue] = await Promise.all([
    runner.run(["status", "--change", changeId, "--json"]),
    runner.run(["validate", changeId, "--strict", "--json", "--no-interactive"]).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    ),
  ]);
  if ("value" in validationValue) validation = adaptValidation(validationValue.value);
  else if (validationValue.error instanceof WorkbenchError && validationValue.error.code === "OPENSPEC_UNAVAILABLE") validation = { state: "unavailable", message: "Strict validation is currently unavailable." };
  else throw validationValue.error;
  return { artifacts: adaptArtifactStatus(statusValue), validation };
}

export async function buildChangeDetail(root: string, changeId: string, runner: OpenSpecRunner): Promise<ChangeDetail> {
  assertChangeId(changeId);
  await verifyOpenSpecCompatibility(root, runner);
  const all = await listChanges(root, runner);
  const summary = all.find((item) => item.id === changeId);
  if (!summary) throw new WorkbenchError("CHANGE_NOT_FOUND", "The requested OpenSpec change does not exist.", 404);
  const [preview, verification] = await Promise.all([
    buildChangePreview(root, summary),
    buildChangeVerification(root, changeId, runner),
  ]);
  return {
    ...preview,
    ...verification,
  };
}
