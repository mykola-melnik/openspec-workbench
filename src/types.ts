export type GitOperation = "normal" | "merge" | "rebase" | "bisect";

export interface GitSnapshot {
  root: string;
  gitDir: string;
  commonGitDir: string;
  repositoryId: string;
  worktreeId: string;
  branch: string | null;
  head: string;
  shortHead: string;
  dirty: boolean;
  detached: boolean;
  operation: GitOperation;
  epoch: string;
}

export interface LocalBranch {
  name: string;
  head: string;
  shortHead: string;
  updatedAt: string;
  current: boolean;
  worktreeId: string | null;
  worktreeRoot: string | null;
  openable: boolean;
  unavailableReason: string | null;
}

export interface BranchNavigation {
  recent: Array<Omit<LocalBranch, "worktreeRoot">>;
  all: Array<Omit<LocalBranch, "worktreeRoot">>;
}

export interface ChangeSummary {
  id: string;
  title: string;
  status: string;
  completedTasks: number;
  totalTasks: number;
  updatedAt: string | null;
  dependsOn: string[];
  treeParentId: string | null;
}

export interface PlanSection {
  id: string;
  title: string;
  body: string;
  sourcePath: string;
}

export interface PlanTask {
  id: string;
  text: string;
  completed: boolean;
  sourcePath: string;
  line: number;
}

export interface ValidationSummary {
  state: "pending" | "valid" | "invalid" | "unavailable" | "unsupported";
  message: string;
}

export interface ChangeDetail extends ChangeSummary {
  proposal: PlanSection[];
  design: PlanSection[];
  tasks: PlanTask[];
  malformedTaskLines: number[];
  artifacts: Array<{ id: string; status: string }>;
  validation: ValidationSummary;
}

export interface WorkbenchSnapshot {
  projectName: string;
  git: Omit<GitSnapshot, "root" | "gitDir" | "commonGitDir">;
  generatedAt: string;
  stale: boolean;
  openSpecHealthy: boolean;
  compatibility: "supported" | "unsupported";
  changes: ChangeSummary[];
  branches: BranchNavigation;
  translation: {
    enabled: boolean;
    mode: "english-fallback" | "provider-registry";
    message: string;
  };
}

export interface OpenSpecRunner {
  version(): Promise<string>;
  run(args: readonly string[]): Promise<unknown>;
}

export class WorkbenchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "WorkbenchError";
  }
}
