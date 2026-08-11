export interface ChangeProgress {
  status: string;
  completedTasks: number;
  totalTasks: number;
}

const COMPLETED_STATUSES = new Set(["complete", "completed", "archived"]);

export function isCompletedChange(change: Pick<ChangeProgress, "status">): boolean {
  return COMPLETED_STATUSES.has(change.status.toLocaleLowerCase("en"));
}

export function isArchiveReadyChange(change: ChangeProgress): boolean {
  return !isCompletedChange(change) && change.totalTasks > 0 && change.completedTasks === change.totalTasks;
}
