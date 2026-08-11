import { ukUA as copy } from "./locales.js";
import { arrangeChangeTree } from "./change-tree.js";
import { isArchiveReadyChange, isCompletedChange } from "./change-lifecycle.js";

type ChangeSummary = {
  id: string;
  title: string;
  status: string;
  completedTasks: number;
  totalTasks: number;
  dependsOn: string[];
  treeParentId: string | null;
};
type PlanSection = { id: string; title: string; body: string; sourcePath: string };
type PlanTask = { id: string; text: string; completed: boolean; sourcePath: string; line: number };
type Snapshot = {
  projectName: string;
  stale: boolean;
  openSpecHealthy: boolean;
  compatibility: "supported" | "unsupported";
  git: { branch: string | null; shortHead: string; dirty: boolean; detached: boolean; operation: string; worktreeId: string };
  changes: ChangeSummary[];
  branches: {
    recent: Branch[];
    all: Branch[];
  };
  translation: { enabled: boolean; message: string };
};
type Branch = {
  name: string;
  shortHead: string;
  updatedAt: string;
  current: boolean;
  worktreeId: string | null;
  openable: boolean;
  unavailableReason: string | null;
};
type Detail = ChangeSummary & {
  proposal: PlanSection[];
  design: PlanSection[];
  tasks: PlanTask[];
  malformedTaskLines: number[];
  artifacts: Array<{ id: string; status: string }>;
  validation: { state: string; message: string };
};
type TranslationResult = {
  values: Record<string, string>;
  states: Record<string, "cached" | "translated" | "rejected" | "missing" | "failed">;
  usage: { adapterId: string; cacheHits: number; translatedBlocks: number; rejectedBlocks: number; missingBlocks: number; failedBlocks: number; inputTokens: number; outputTokens: number; costUsd: number };
  diagnostic: string | null;
};
type Language = "uk" | "en" | "side";
type TranslationProvider = "none" | "agy" | "claude" | "codex" | "gemini" | "qwen" | "kimi" | "ollama";
type TranslationProviderId = Exclude<TranslationProvider, "none">;
type TranslationProviderDescriptor = {
  id: TranslationProviderId;
  displayName: string;
  processing: "remote-cli" | "local-model";
  destination: string;
  available: boolean;
  status: "available" | "unavailable" | "authentication-required" | "quota-limited";
  models: string[];
};
type TranslationProviderResponse = { providers: TranslationProviderDescriptor[] };
type ArtifactTabId = "proposal" | "tasks" | "design" | "verification";
type ActivityKind =
  | "source-change-detected"
  | "head-change-detected"
  | "snapshot-refresh-started"
  | "snapshot-refresh-completed"
  | "snapshot-refresh-failed"
  | "verification-started"
  | "verification-completed"
  | "verification-failed"
  | "translation-started"
  | "translation-completed"
  | "translation-failed";
type ActivityEntry = {
  id: number;
  at: string;
  kind: ActivityKind;
  data: { changeId?: string; providerId?: TranslationProviderId; paths?: string[]; additionalPaths?: number; previousRevision?: string; revision?: string; missingBlocks?: number; translatedBlocks?: number; failedBlocks?: number; validationState?: string; diagnostic?: string };
};
type ActivityResponse = { entries: ActivityEntry[]; limit: number; scope: "process" };
const API_TIMEOUT_MS = 45_000;

const elements = {
  app: required("app"),
  project: required("project-name"),
  home: required<HTMLAnchorElement>("brand-home"),
  provenance: required("provenance"),
  stale: required("stale-banner"),
  search: required<HTMLInputElement>("change-search"),
  sidebar: required("sidebar"),
  toggle: required<HTMLButtonElement>("change-list-toggle"),
  list: required("change-list"),
  state: required("state"),
  detail: required("change-detail"),
  language: required("language-switch"),
  translationProvider: required<HTMLSelectElement>("translation-provider"),
  translationProviderHelp: required("translation-provider-help"),
  translationProviderStatus: required("translation-provider-status"),
  ollamaSettings: required("ollama-model-settings"),
  ollamaModel: required<HTMLSelectElement>("ollama-model"),
  branchSelector: required<HTMLDetailsElement>("branch-selector"),
  branchSummary: required("branch-summary"),
  branchSearch: required<HTMLInputElement>("branch-search"),
  branchList: required("branch-list"),
  activityDetails: required<HTMLDetailsElement>("activity-details"),
  activitySummary: required("activity-summary"),
  activityList: required<HTMLOListElement>("activity-list"),
  activityLive: required("activity-live"),
};
const queryToken = new URL(location.href).searchParams.get("token") ?? "";
const publicBase = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
const stablePublicRoute = /^\/projects\/[A-Za-z0-9_-]{16,64}\//u.test(publicBase);
let token = stablePublicRoute ? "" : queryToken || sessionStorage.getItem("openspec-workbench-capability") || "";
let snapshot: Snapshot | null = null;
let selectedId: string | null = null;
let detail: Detail | null = null;
const languagePreferenceKey = "openspec-workbench-plan-language-v1";
const translationProviderPreferenceKey = "openspec-workbench-translation-provider-v1";
const ollamaModelPreferenceKey = "openspec-workbench-ollama-model-v1";
const providerIds = new Set<TranslationProvider>(["none", "agy", "claude", "codex", "gemini", "qwen", "kimi", "ollama"]);
let language: Language = readLanguagePreference();
let translationProvider: TranslationProvider = readTranslationProviderPreference();
let ollamaModel = readOllamaModelPreference();
let translationProviders: TranslationProviderDescriptor[] = [];
const translations = new Map<string, TranslationResult>();
const translationRequests = new Map<string, Promise<void>>();
const detailCache = new Map<string, Detail>();
const verificationRequests = new Map<string, Promise<void>>();
let translationNotice = "";
let activityEntries: ActivityEntry[] = [];
let lastSeenActivityId = 0;
let clientGeneration = 0;
let translationGeneration = 0;
let liveRefreshQueued = false;
let liveRefreshFailed = false;
let liveRefreshRequest: Promise<void> | null = null;
if (queryToken) sessionStorage.setItem("openspec-workbench-capability", queryToken);
history.replaceState(null, "", `${publicBase}${location.hash}`);

function readLanguagePreference(): Language {
  try {
    const stored = localStorage.getItem(languagePreferenceKey);
    return stored === "uk" || stored === "side" || stored === "en" ? stored : "en";
  } catch {
    return "en";
  }
}

function setLanguage(nextLanguage: Language): void {
  language = nextLanguage;
  try { localStorage.setItem(languagePreferenceKey, nextLanguage); } catch { /* Browser storage is an optional preference boundary. */ }
  updateLanguageButtons();
}

function readTranslationProviderPreference(): TranslationProvider {
  try {
    const value = localStorage.getItem(translationProviderPreferenceKey);
    return isTranslationProviderPreference(value) ? value : "none";
  } catch {
    return "none";
  }
}

function setTranslationProvider(nextProvider: TranslationProvider): void {
  translationProvider = nextProvider;
  elements.translationProvider.value = nextProvider;
  try { localStorage.setItem(translationProviderPreferenceKey, nextProvider); } catch { /* Browser storage is an optional preference boundary. */ }
  updateTranslationProviderUi();
}

function isTranslationProviderPreference(value: unknown): value is TranslationProvider {
  return typeof value === "string" && providerIds.has(value as TranslationProvider);
}

function readOllamaModelPreference(): string {
  try {
    const value = localStorage.getItem(ollamaModelPreferenceKey) ?? "";
    return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value) ? value : "";
  } catch {
    return "";
  }
}

function setOllamaModel(value: string): void {
  ollamaModel = value;
  elements.ollamaModel.value = value;
  try { localStorage.setItem(ollamaModelPreferenceKey, value); } catch { /* Browser storage is an optional preference boundary. */ }
}

function selectedProviderDescriptor(): TranslationProviderDescriptor | null {
  return translationProvider === "none" ? null : translationProviders.find((provider) => provider.id === translationProvider) ?? null;
}

function selectedProviderName(): string {
  return selectedProviderDescriptor()?.displayName ?? copy.translationProviderNone;
}

function translationIdentity(changeId: string): string {
  return `${changeId}:${translationProvider}:${translationProvider === "ollama" ? ollamaModel : ""}`;
}

function currentTranslation(changeId: string): TranslationResult | undefined {
  return translations.get(translationIdentity(changeId));
}

function providerCanTranslate(): boolean {
  const provider = selectedProviderDescriptor();
  return Boolean(provider?.available && (provider.id !== "ollama" || provider.models.includes(ollamaModel)));
}

function updateTranslationProviderUi(): void {
  const descriptor = selectedProviderDescriptor();
  elements.translationProviderHelp.textContent = descriptor === null
    ? copy.translationProviderHelpNone
    : descriptor.processing === "local-model"
      ? copy.translationProviderHelpLocal(descriptor.displayName)
      : copy.translationProviderHelpRemote(descriptor.displayName, descriptor.destination);
  elements.translationProviderStatus.textContent = descriptor === null
    ? ""
    : descriptor.status === "authentication-required"
      ? copy.translationProviderAuthRequired(descriptor.displayName)
      : descriptor.status === "quota-limited"
        ? copy.translationProviderQuota(descriptor.displayName)
        : descriptor.available ? copy.translationProviderAvailable : copy.translationProviderUnavailable;
  elements.ollamaSettings.hidden = descriptor?.id !== "ollama";
}

function renderProviderCatalogue(): void {
  elements.translationProvider.replaceChildren();
  const none = document.createElement("option");
  none.value = "none";
  none.textContent = copy.translationProviderNone;
  elements.translationProvider.append(none);
  for (const provider of translationProviders) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.available ? provider.displayName : `${provider.displayName} · ${copy.translationProviderUnavailableSuffix}`;
    option.disabled = !provider.available && provider.id !== translationProvider;
    elements.translationProvider.append(option);
  }
  elements.translationProvider.value = translationProvider;
  elements.ollamaModel.replaceChildren();
  const ollama = translationProviders.find((provider) => provider.id === "ollama");
  for (const model of ollama?.models ?? []) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    elements.ollamaModel.append(option);
  }
  if (ollama?.models.length) {
    if (!ollama.models.includes(ollamaModel)) setOllamaModel(ollama.models[0]!);
    else elements.ollamaModel.value = ollamaModel;
  } else {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = copy.ollamaNoModels;
    elements.ollamaModel.append(option);
    setOllamaModel("");
  }
  updateTranslationProviderUi();
}

function applyLocale(): void {
  required("skip-link").textContent = copy.skipLink;
  required("topbar").setAttribute("aria-label", copy.projectContext);
  elements.project.textContent = copy.loading;
  elements.home.href = stablePublicRoute ? "/" : `${publicBase}?token=${encodeURIComponent(token)}`;
  elements.home.setAttribute("aria-label", stablePublicRoute ? copy.backToProjects : copy.currentWorkbenchHome);
  elements.sidebar.setAttribute("aria-label", copy.changesRegion);
  elements.toggle.textContent = copy.plansShow;
  required("change-search-label").textContent = copy.planSearch;
  elements.search.placeholder = copy.planSearchPlaceholder;
  elements.list.setAttribute("aria-label", copy.changeList);
  elements.language.setAttribute("aria-label", copy.planLanguage);
  required("language-uk").textContent = copy.ukrainian;
  required("language-en").textContent = copy.english;
  required("language-side").textContent = copy.sideBySide;
  required("translation-settings-summary").textContent = copy.translationSettings;
  required("translation-provider-label").textContent = copy.translationProvider;
  required("ollama-model-label").textContent = copy.ollamaModel;
  renderProviderCatalogue();
  elements.state.textContent = copy.readingPlans;
  elements.branchSummary.textContent = copy.branches;
  required("branch-search-label").textContent = copy.branchSearch;
  elements.branchSearch.placeholder = copy.branchSearchPlaceholder;
  required("activity-note").textContent = copy.activityNote;
  renderActivity();
}

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing application element: ${id}`);
  return element as T;
}

function el<K extends keyof HTMLElementTagNameMap>(name: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function localizedApiError(error: unknown, fallback: string = copy.readFailure): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : fallback;
  if (error.code === "CAPABILITY_REQUIRED") return copy.missingCapability;
  if (error.code === "REQUEST_TIMEOUT") return copy.requestTimedOut;
  if (error.code === "NETWORK_UNAVAILABLE") return copy.networkUnavailable;
  if (error.code === "OPENSPEC_RUNNER_UNAVAILABLE") return copy.openSpecRunnerUnavailable;
  if (error.code === "OPENSPEC_SCRIPT_MISSING") return copy.openSpecScriptMissing;
  if (error.code === "OPENSPEC_COMMAND_FAILED") return copy.openSpecCommandFailed;
  if (error.code === "OPENSPEC_TIMEOUT") return copy.openSpecTimedOut;
  if (error.code === "OPENSPEC_OUTPUT_LIMIT") return copy.openSpecOutputLimit;
  if (["OPENSPEC_VERSION_UNSUPPORTED", "OPENSPEC_OUTPUT_INVALID"].includes(error.code)) return copy.unsupported;
  return fallback;
}

async function api<T>(path: string, options: string | { method?: string; body?: Record<string, unknown> } = "GET"): Promise<T> {
  const method = typeof options === "string" ? options : options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === "POST") headers["X-OpenSpec-Client"] = "1";
  const requestBody = typeof options === "object" ? options.body : undefined;
  if (requestBody) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${publicBase}${path.replace(/^\//u, "")}`, {
        method,
        headers,
        signal: controller.signal,
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
      });
    } catch {
      throw new ApiError(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE", timedOut ? copy.requestTimedOut : copy.networkUnavailable);
    }
    let responseBody: T & { error?: { code?: string; message?: string } };
    try {
      responseBody = await response.json() as T & { error?: { code?: string; message?: string } };
    } catch {
      throw new ApiError("RESPONSE_INVALID", copy.readFailure);
    }
    if (!response.ok) throw new ApiError(responseBody.error?.code ?? "UNKNOWN", responseBody.error?.message ?? copy.readFailure);
    return responseBody;
  } finally {
    window.clearTimeout(timeout);
  }
}

const activityKindSet = new Set<ActivityKind>([
  "source-change-detected",
  "head-change-detected",
  "snapshot-refresh-started",
  "snapshot-refresh-completed",
  "snapshot-refresh-failed",
  "verification-started",
  "verification-completed",
  "verification-failed",
  "translation-started",
  "translation-completed",
  "translation-failed",
]);

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActivityEntry>;
  if (!Number.isSafeInteger(candidate.id) || (candidate.id ?? 0) < 1 || typeof candidate.at !== "string" || Number.isNaN(Date.parse(candidate.at))) return false;
  if (typeof candidate.kind !== "string" || !activityKindSet.has(candidate.kind as ActivityKind)) return false;
  if (!candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as ActivityEntry["data"];
  if (data.changeId !== undefined && (typeof data.changeId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,254}$/u.test(data.changeId))) return false;
  if (data.providerId !== undefined && !isTranslationProviderPreference(data.providerId)) return false;
  if (data.paths !== undefined && (!Array.isArray(data.paths) || data.paths.length > 12 || new Set(data.paths).size !== data.paths.length || data.paths.some((item) => typeof item !== "string" || item !== item.normalize("NFC") || !isSafeActivityPath(item)))) return false;
  if (data.additionalPaths !== undefined && (!Number.isSafeInteger(data.additionalPaths) || data.additionalPaths < 0 || data.additionalPaths > 1_000_000)) return false;
  if ((data.previousRevision === undefined) !== (data.revision === undefined)) return false;
  if (data.previousRevision !== undefined && (typeof data.previousRevision !== "string" || !/^[a-f0-9]{7,12}$/u.test(data.previousRevision))) return false;
  if (data.revision !== undefined && (typeof data.revision !== "string" || !/^[a-f0-9]{7,12}$/u.test(data.revision))) return false;
  return true;
}

function isSafeActivityPath(value: string): boolean {
  const segments = value.split("/");
  return (value === "openspec" || value.startsWith("openspec/"))
    && !value.includes("\\")
    && new TextEncoder().encode(value).length <= 1_024
    && !segments.some((segment) => !segment || segment === "." || segment === "..")
    && !/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(value);
}

function activityMessage(entry: ActivityEntry): string {
  const changeId = entry.data.changeId ?? "OpenSpec";
  const provider = entry.data.providerId ? translationProviders.find((item) => item.id === entry.data.providerId)?.displayName ?? entry.data.providerId : copy.translationProvider;
  if (entry.kind === "source-change-detected") return copy.activitySourceChanged(entry.data.paths ?? [], entry.data.additionalPaths ?? 0);
  if (entry.kind === "head-change-detected") return copy.activityHeadChanged(entry.data.previousRevision ?? "", entry.data.revision ?? "");
  if (entry.kind === "snapshot-refresh-started") return copy.activitySnapshotStarted;
  if (entry.kind === "snapshot-refresh-completed") return copy.activitySnapshotCompleted;
  if (entry.kind === "snapshot-refresh-failed") return copy.activitySnapshotFailed;
  if (entry.kind === "verification-started") return copy.activityVerificationStarted(changeId);
  if (entry.kind === "verification-completed") return copy.activityVerificationCompleted(changeId);
  if (entry.kind === "verification-failed") return copy.activityVerificationFailed(changeId);
  if (entry.kind === "translation-started") return copy.activityTranslationStarted(provider, changeId, entry.data.missingBlocks ?? 0);
  if (entry.kind === "translation-completed") return copy.activityTranslationCompleted(provider, changeId, entry.data.translatedBlocks ?? 0);
  return copy.activityTranslationFailed(provider, changeId);
}

function activityTone(kind: ActivityKind): string {
  if (kind.endsWith("-failed")) return "failed";
  if (kind.endsWith("-started")) return "active";
  return "completed";
}

function renderActivity(): void {
  elements.activityList.replaceChildren();
  for (const entry of activityEntries) {
    const item = el("li", `activity-item ${activityTone(entry.kind)}`);
    const time = el("time", undefined, new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(entry.at)));
    time.dateTime = entry.at;
    time.setAttribute("aria-label", copy.activityTime(time.textContent ?? ""));
    item.append(time, el("span", undefined, activityMessage(entry)));
    elements.activityList.append(item);
  }
  if (!activityEntries.length) elements.activityList.append(el("li", "activity-empty", copy.activityEmpty));
  const unseen = activityEntries.filter((entry) => entry.id > lastSeenActivityId).length;
  elements.activitySummary.textContent = copy.activityCount(elements.activityDetails.open ? 0 : unseen);
}

function mergeActivity(entry: ActivityEntry, announce = false): void {
  if (activityEntries.some((candidate) => candidate.id === entry.id)) return;
  activityEntries = [...activityEntries, entry].sort((left, right) => right.id - left.id).slice(0, 100);
  if (elements.activityDetails.open) lastSeenActivityId = Math.max(lastSeenActivityId, entry.id);
  renderActivity();
  if (announce && (entry.kind === "translation-started" || entry.kind === "translation-failed" || entry.kind === "verification-started" || entry.kind === "verification-failed" || entry.kind === "snapshot-refresh-failed")) {
    elements.activityLive.textContent = activityMessage(entry);
  }
}

async function loadActivity(): Promise<void> {
  try {
    const response = await api<ActivityResponse>("api/activity");
    activityEntries = response.entries.filter(isActivityEntry).sort((left, right) => right.id - left.id).slice(0, 100);
  } catch {
    activityEntries = [];
  }
  renderActivity();
}

function connectEvents(): Promise<void> {
  const eventUrl = `${publicBase}api/events${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const events = new EventSource(eventUrl);
  const ready = new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 500);
    events.addEventListener("ready", finish, { once: true });
    events.addEventListener("error", finish, { once: true });
  });
  events.addEventListener("stale", () => {
    if (!snapshot) return;
    snapshot.stale = true;
    liveRefreshFailed = false;
    renderHeader();
    queueLiveRefresh();
  });
  events.addEventListener("activity", (event) => {
    try {
      const entry = JSON.parse((event as MessageEvent<string>).data) as unknown;
      if (isActivityEntry(entry)) mergeActivity(entry, true);
    } catch {
      // The closed activity schema fails inertly.
    }
  });
  return ready;
}

function queueLiveRefresh(): void {
  liveRefreshQueued = true;
  if (liveRefreshRequest) return;
  liveRefreshRequest = (async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      liveRefreshQueued = false;
      try {
        const previousSelection = selectedId;
        const refreshed = await api<Snapshot>("api/snapshot");
        snapshot = refreshed;
        clientGeneration += 1;
        detailCache.clear();
        translations.clear();
        translationRequests.clear();
        verificationRequests.clear();
        detail = null;
        translationNotice = "";
        liveRefreshFailed = false;
        renderHeader();
        renderBranches();
        renderChangeList();
        const nextSelection = previousSelection && refreshed.changes.some((change) => change.id === previousSelection)
          ? previousSelection
          : refreshed.changes[0]?.id ?? null;
        if (nextSelection) {
          await selectChange(nextSelection);
        } else {
          selectedId = null;
          elements.detail.hidden = true;
          elements.state.hidden = false;
          elements.state.textContent = copy.empty;
          renderChangeList();
        }
        if (!refreshed.stale && !liveRefreshQueued) return;
      } catch {
        liveRefreshFailed = true;
        if (snapshot) snapshot.stale = true;
        renderHeader();
        return;
      }
    }
    liveRefreshQueued = false;
    liveRefreshFailed = true;
    if (snapshot) snapshot.stale = true;
    renderHeader();
  })().finally(() => {
    liveRefreshRequest = null;
    if (liveRefreshQueued) queueLiveRefresh();
  });
}

function visibleBranches(): Branch[] {
  if (!snapshot) return [];
  const query = elements.branchSearch.value.trim().toLocaleLowerCase();
  return query
    ? snapshot.branches.all.filter((branch) => branch.name.toLocaleLowerCase().includes(query))
    : snapshot.branches.recent;
}

async function openBranch(branch: Branch, button: HTMLButtonElement): Promise<void> {
  if (!branch.worktreeId || branch.current) return;
  button.disabled = true;
  button.textContent = copy.opening;
  try {
    const projectMatch = /^\/projects\/([A-Za-z0-9_-]{16,64})\//u.exec(publicBase);
    if (projectMatch) {
      location.assign(`/projects/${encodeURIComponent(projectMatch[1] ?? "")}/worktrees/${encodeURIComponent(branch.worktreeId)}/`);
    } else {
      const launch = await api<{ url: string }>(`api/worktree/${encodeURIComponent(branch.worktreeId)}/open`, "POST");
      location.assign(launch.url);
    }
    button.textContent = copy.openAgain;
  } catch (error) {
    button.textContent = copy.tryAgain;
    elements.stale.hidden = false;
    elements.stale.textContent = error instanceof Error ? error.message : copy.worktreeOpenFailure;
  } finally {
    button.disabled = false;
  }
}

function renderBranches(): void {
  if (!snapshot) return;
  elements.branchList.replaceChildren();
  const branches = visibleBranches();
  for (const branch of branches) {
    const row = el("article", branch.openable ? "branch-row" : "branch-row unavailable");
    row.setAttribute("role", "listitem");
    const text = el("div", "branch-copy");
    text.append(el("strong", undefined, branch.name), el("span", "branch-meta", `${branch.shortHead} · ${branch.updatedAt || copy.unknownDate}`));
    if (!branch.openable) text.append(el("span", "branch-reason", copy.noWorktree));
    const button = el("button", undefined, branch.current ? copy.currentBranch : branch.openable ? copy.openPlans : copy.unavailable);
    button.type = "button";
    button.disabled = branch.current || !branch.openable;
    button.addEventListener("click", () => void openBranch(branch, button));
    row.append(text, button);
    elements.branchList.append(row);
  }
  if (!branches.length) elements.branchList.append(el("p", "muted", copy.noBranchResults));
  elements.branchSummary.textContent = snapshot.git.branch ? copy.branchSummary(snapshot.git.branch) : copy.detachedBranches;
}

function appendDefinition(term: string, value: string, tone?: string): void {
  const group = el("div", tone ? `provenance-item ${tone}` : "provenance-item");
  group.append(el("dt", undefined, term), el("dd", undefined, value));
  elements.provenance.append(group);
}

function renderHeader(): void {
  if (!snapshot) return;
  elements.project.textContent = snapshot.projectName;
  elements.provenance.replaceChildren();
  appendDefinition("Worktree", snapshot.git.worktreeId.slice(0, 8));
  appendDefinition(copy.branch, snapshot.git.branch ?? "Detached HEAD", snapshot.git.detached ? "warning" : undefined);
  appendDefinition(copy.revision, snapshot.git.shortHead);
  appendDefinition(copy.state, snapshot.git.dirty ? copy.dirty : copy.clean, snapshot.git.dirty ? "warning" : "success");
  if (snapshot.git.operation !== "normal") appendDefinition("Git", snapshot.git.operation, "warning");
  const bannerMessages = [];
  if (snapshot.stale) bannerMessages.push(liveRefreshFailed ? copy.liveRefreshFailed : copy.stale);
  if (!snapshot.openSpecHealthy) bannerMessages.push(copy.doctorUnhealthy);
  elements.stale.hidden = bannerMessages.length === 0;
  elements.stale.textContent = bannerMessages.join(" ");
}

function filteredChanges(): ChangeSummary[] {
  const query = elements.search.value.trim().toLocaleLowerCase("uk");
  return snapshot?.changes.filter((change) => `${change.title} ${change.id}`.toLocaleLowerCase("uk").includes(query)) ?? [];
}

function renderChangeList(): void {
  elements.list.replaceChildren();
  const titles = new Map(snapshot?.changes.map((change) => [change.id, change.title]) ?? []);
  const visible = filteredChanges();
  const groups = [
    { title: copy.active, items: visible.filter((item) => !isCompletedChange(item) && !isArchiveReadyChange(item)), archiveReady: false },
    { title: copy.readyToArchive, items: visible.filter(isArchiveReadyChange), archiveReady: true },
    { title: copy.completed, items: visible.filter(isCompletedChange), archiveReady: false },
  ];
  for (const group of groups) {
    if (!group.items.length) continue;
    const section = el("section", "change-group");
    section.append(el("h2", undefined, group.title));
    const tree = el("div", "change-tree");
    tree.setAttribute("role", "list");
    for (const row of arrangeChangeTree(group.items)) {
      const change = row.change;
      const item = el("div", row.child ? "change-tree-row child" : "change-tree-row");
      item.setAttribute("role", "listitem");
      item.dataset.treeLevel = row.child ? "2" : "1";
      if (row.child && change.treeParentId) item.dataset.parentChangeId = change.treeParentId;
      const button = el("button", change.id === selectedId ? "change-card selected" : "change-card");
      button.type = "button";
      button.dataset.changeId = change.id;
      button.setAttribute("aria-current", change.id === selectedId ? "page" : "false");
      button.append(el("span", "change-title", change.title), el("span", "change-id", change.id));
      const progress = change.totalTasks ? copy.taskCount(change.completedTasks, change.totalTasks) : copy.noTasks;
      button.append(el("span", "change-progress", progress));
      if (group.archiveReady) button.append(el("span", "change-lifecycle", copy.archiveReadyCue));
      if (change.dependsOn.length) {
        const primaryTitle = titles.get(change.dependsOn[0] ?? "") ?? change.dependsOn[0] ?? "";
        const dependencyText = [
          copy.dependsOn(primaryTitle),
          change.dependsOn.length > 1 ? copy.additionalDependencies(change.dependsOn.length - 1) : "",
        ].filter(Boolean).join(" · ");
        button.append(el("span", "change-dependency", dependencyText));
      }
      button.addEventListener("click", () => void selectChange(change.id));
      item.append(button);
      tree.append(item);
    }
    section.append(tree);
    elements.list.append(section);
  }
  if (!elements.list.childElementCount) elements.list.append(el("p", "muted", copy.noSearchResults));
  const expanded = elements.toggle.getAttribute("aria-expanded") === "true";
  elements.toggle.textContent = copy.plansToggle(filteredChanges().length, expanded);
}

function translationFor(id: string): { value: string | null; state: TranslationResult["states"][string] | null } {
  const result = selectedId ? currentTranslation(selectedId) : undefined;
  return { value: result?.values[id] ?? null, state: result?.states[id] ?? null };
}

function fallbackNotice(state: TranslationResult["states"][string] | null): HTMLElement {
  if (state === "missing" || state === null) return el("p", "translation-unavailable", copy.translationNotCached);
  if (state === "rejected") return el("p", "translation-unavailable", copy.translationRejected);
  const diagnostic = selectedId ? currentTranslation(selectedId)?.diagnostic ?? null : null;
  return el("p", "translation-unavailable", translationDiagnosticCopy(diagnostic));
}

function translationDiagnosticCopy(diagnostic: string | null): string {
  const provider = selectedProviderName();
  if (diagnostic === "TRANSLATION_ADAPTER_UNAVAILABLE") return copy.translationProviderRunUnavailable(provider);
  if (diagnostic === "TRANSLATION_PROVIDER_AUTH_REQUIRED") return copy.translationProviderAuthRequired(provider);
  if (diagnostic === "TRANSLATION_PROVIDER_QUOTA") return copy.translationProviderQuota(provider);
  if (diagnostic === "TRANSLATION_PROVIDER_TIMEOUT") return copy.translationProviderTimeout(provider);
  if (diagnostic === "TRANSLATION_OUTPUT_LIMIT" || diagnostic === "TRANSLATION_OUTPUT_INVALID") return copy.translationProviderInvalidOutput(provider);
  if (diagnostic === "TRANSLATION_REQUEST_TOO_LARGE") return copy.translationTooLarge;
  return copy.translationFailed;
}

function translationResultNotice(result: TranslationResult): string {
  const provider = selectedProviderName();
  if (result.diagnostic) return translationDiagnosticCopy(result.diagnostic);
  if (result.usage.missingBlocks > 0) return copy.translationCachePartial(provider, result.usage.cacheHits, result.usage.missingBlocks);
  if (result.usage.translatedBlocks === 0 && result.usage.cacheHits > 0) return copy.translationCacheRestored(provider, result.usage.cacheHits);
  return copy.translationUsage(provider, result.usage.translatedBlocks, result.usage.cacheHits, result.usage.rejectedBlocks, result.usage.failedBlocks, result.usage.inputTokens, result.usage.outputTokens);
}

function sectionCard(section: PlanSection, group: "proposal" | "design", index: number): HTMLElement {
  const card = el("section", "plan-section");
  const titleTranslation = translationFor(`${group}:${index}:title`);
  card.append(el("h3", undefined, language === "uk" && titleTranslation.value ? titleTranslation.value : section.title));
  const bodyTranslation = translationFor(`${group}:${index}:body`);
  if (language === "side") {
    const columns = el("div", "translation-columns");
    const derived = el("section", "translation-pane");
    derived.append(el("h4", undefined, titleTranslation.value ?? copy.ukrainian));
    if (bodyTranslation.value) {
      const translated = el("pre", "plan-copy", bodyTranslation.value);
      translated.setAttribute("lang", "uk");
      derived.append(translated);
    } else if (section.body) {
      derived.append(fallbackNotice(bodyTranslation.state));
      const fallback = el("pre", "plan-copy", section.body || "—");
      fallback.setAttribute("lang", "en");
      derived.append(fallback);
    } else {
      derived.append(el("pre", "plan-copy", "—"));
    }
    const sourcePane = el("section", "translation-pane");
    sourcePane.append(el("h4", undefined, section.title));
    const sideSource = el("pre", "plan-copy", section.body || "—");
    sideSource.setAttribute("lang", "en");
    sourcePane.append(sideSource);
    columns.append(derived, sourcePane);
    card.append(columns, el("p", "source-path", section.sourcePath));
    return card;
  }
  if (language === "uk") {
    if (bodyTranslation.value) {
      const translated = el("pre", "plan-copy", bodyTranslation.value);
      translated.setAttribute("lang", "uk");
      card.append(translated, el("p", "source-path", section.sourcePath));
      return card;
    }
    if (section.body) card.append(fallbackNotice(bodyTranslation.state));
  }
  const source = el("pre", "plan-copy", section.body || "—");
  source.setAttribute("lang", "en");
  card.append(source, el("p", "source-path", section.sourcePath));
  return card;
}

function renderTasks(tasks: PlanTask[]): HTMLElement {
  const section = el("section", "task-section artifact-panel");
  const heading = el("h2", undefined, copy.tasks);
  section.append(heading);
  const list = el("ol", "task-list");
  for (const [index, task] of tasks.entries()) {
    const item = el("li", task.completed ? "done" : "pending");
    const marker = el("span", "task-marker", task.completed ? "✓" : "○");
    marker.setAttribute("aria-hidden", "true");
    const translated = translationFor(`task:${index}`).value;
    const text = language === "en" || !translated ? task.text : translated;
    const textWrap = el("span", "task-text", text);
    if (language === "side" && translated) textWrap.append(el("span", "task-source", task.text));
    item.append(marker, el("span", "task-id", task.id), textWrap);
    item.setAttribute("aria-label", `${task.completed ? copy.done : copy.pending}: ${task.id} ${text}`);
    list.append(item);
  }
  section.append(tasks.length ? list : el("p", "muted", copy.noPlanTasks));
  return section;
}

function artifactTabFromHash(available: ArtifactTabId[]): ArtifactTabId {
  const match = /^#artifact-(proposal|tasks|design|verification)$/u.exec(location.hash);
  const requested = match?.[1] as ArtifactTabId | undefined;
  return requested && available.includes(requested) ? requested : available[0] ?? "verification";
}

function renderDetail(): void {
  if (!detail || !snapshot) return;
  elements.state.hidden = true;
  elements.detail.hidden = false;
  elements.detail.replaceChildren();
  const heading = el("header", "detail-header");
  const translatedTitle = translationFor("title").value;
  heading.append(el("p", "eyebrow", detail.id), el("h2", undefined, language === "en" || !translatedTitle ? detail.title : translatedTitle));
  const progress = detail.totalTasks ? Math.round(detail.completedTasks / detail.totalTasks * 100) : 0;
  const progressWrap = el("div", "progress-wrap");
  const bar = el("progress") as HTMLProgressElement;
  bar.max = Math.max(detail.totalTasks, 1);
  bar.value = detail.completedTasks;
  progressWrap.append(bar, el("span", undefined, copy.progress(detail.completedTasks, detail.totalTasks, progress)));
  heading.append(progressWrap);
  if (language !== "en") {
    heading.append(el("p", "translation-derived", copy.translationDerived));
    if (translationNotice) heading.append(el("p", "translation-usage", translationNotice));
    if (selectedId && translationRequests.has(translationIdentity(selectedId))) {
      const missing = currentTranslation(selectedId)?.usage.missingBlocks ?? 0;
      const provider = selectedProviderName();
      const pending = el("div", "translation-pending");
      pending.setAttribute("role", "status");
      pending.setAttribute("aria-live", "polite");
      pending.append(el("span", "translation-spinner"), el("strong", undefined, copy.translationPendingTitle(provider)), el("span", undefined, copy.translationPending(provider, missing)));
      heading.append(pending);
    }
  }
  elements.detail.append(heading);

  const overview = el("section", "content-stack artifact-panel");
  const overviewHeading = el("h2", undefined, copy.planOverview);
  overview.append(overviewHeading);
  for (const [index, section] of detail.proposal.entries()) overview.append(sectionCard(section, "proposal", index));

  const tasks = renderTasks(detail.tasks);
  const designSection = el("section", "content-stack artifact-panel");
  const designHeading = el("h2", undefined, copy.design);
  designSection.append(designHeading);
  for (const [index, section] of detail.design.entries()) designSection.append(sectionCard(section, "design", index));

  const verification = el("section", "verification artifact-panel");
  const verificationHeading = el("h2", undefined, copy.verification);
  verification.append(verificationHeading);
  verification.append(el("p", `validation-${detail.validation.state}`, detail.validation.state === "pending" ? copy.verificationPending : detail.validation.message));
  const artifactList = el("ul");
  for (const artifact of detail.artifacts) artifactList.append(el("li", undefined, `${artifact.id}: ${artifact.status}`));
  verification.append(artifactList);
  if (detail.malformedTaskLines.length) verification.append(el("p", "warning-text", `${copy.malformedCheckboxes}: ${detail.malformedTaskLines.join(", ")}`));

  const artifactTargets: Array<{ id: ArtifactTabId; label: string; target: string; available: boolean; panel: HTMLElement }> = [
    { id: "proposal", label: copy.overview, target: "artifact-proposal", available: detail.proposal.length > 0, panel: overview },
    { id: "tasks", label: copy.tasks, target: "artifact-tasks", available: detail.tasks.length > 0 || detail.artifacts.some((item) => item.id === "tasks" && item.status !== "skipped"), panel: tasks },
    { id: "design", label: copy.design, target: "artifact-design", available: detail.design.length > 0, panel: designSection },
    { id: "verification", label: copy.verification, target: "artifact-verification", available: true, panel: verification },
  ];
  const availableTabs = artifactTargets.filter((artifact) => artifact.available);
  const activeTab = artifactTabFromHash(availableTabs.map((artifact) => artifact.id));
  const requestedArtifact = /^#artifact-(proposal|tasks|design|verification)$/u.test(location.hash);
  const activeTarget = artifactTargets.find((artifact) => artifact.id === activeTab)!.target;
  if (requestedArtifact && location.hash !== `#${activeTarget}`) history.replaceState(null, "", `#${activeTarget}`);
  const tabs = el("nav", "artifact-tabs");
  tabs.setAttribute("aria-label", copy.artifacts);
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-orientation", "horizontal");
  const tabButtons = new Map<ArtifactTabId, HTMLButtonElement>();
  const activateTab = (next: ArtifactTabId, recordHistory: boolean, focus: boolean): void => {
    for (const artifact of artifactTargets) {
      const selected = artifact.id === next && artifact.available;
      artifact.panel.hidden = !selected;
      const button = tabButtons.get(artifact.id);
      if (button) {
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
    }
    const selectedArtifact = artifactTargets.find((artifact) => artifact.id === next);
    if (recordHistory && selectedArtifact && location.hash !== `#${selectedArtifact.target}`) history.pushState(null, "", `#${selectedArtifact.target}`);
    if (focus) tabButtons.get(next)?.focus();
  };
  for (const artifact of artifactTargets) {
    if (artifact.available) {
      const button = el("button", undefined, artifact.label) as HTMLButtonElement;
      button.type = "button";
      button.id = `artifact-tab-${artifact.id}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", artifact.target);
      button.addEventListener("click", () => activateTab(artifact.id, true, false));
      button.addEventListener("keydown", (event) => {
        const current = availableTabs.findIndex((candidate) => candidate.id === artifact.id);
        let next = current;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % availableTabs.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + availableTabs.length) % availableTabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = availableTabs.length - 1;
        else return;
        event.preventDefault();
        activateTab(availableTabs[next]!.id, true, true);
      });
      tabButtons.set(artifact.id, button);
      tabs.append(button);
    } else {
      const unavailable = el("span", "artifact-unavailable", copy.artifactUnavailable(artifact.label));
      unavailable.setAttribute("role", "tab");
      unavailable.setAttribute("aria-disabled", "true");
      tabs.append(unavailable);
    }
  }
  elements.detail.append(tabs);
  for (const artifact of artifactTargets) {
    if (!artifact.available) continue;
    artifact.panel.id = artifact.target;
    artifact.panel.setAttribute("role", "tabpanel");
    artifact.panel.setAttribute("aria-labelledby", `artifact-tab-${artifact.id}`);
    artifact.panel.tabIndex = 0;
    elements.detail.append(artifact.panel);
  }
  activateTab(activeTab, false, false);
}

async function selectChange(id: string): Promise<void> {
  const generation = clientGeneration;
  selectedId = id;
  renderChangeList();
  const cachedDetail = detailCache.get(id);
  if (cachedDetail) {
    detail = cachedDetail;
    translationNotice = currentTranslation(id) ? translationResultNotice(currentTranslation(id)!) : "";
    renderDetail();
  } else {
    elements.state.hidden = false;
    elements.state.textContent = copy.readingChange;
    elements.detail.hidden = true;
  }
  try {
    if (!cachedDetail) {
      const loaded = await api<Detail>(`/api/change/${encodeURIComponent(id)}`);
      if (generation !== clientGeneration) return;
      detailCache.set(id, loaded);
      if (selectedId !== id) return;
      detail = loaded;
    }
    translationNotice = currentTranslation(id) ? translationResultNotice(currentTranslation(id)!) : "";
    renderDetail();
    elements.sidebar.dataset.collapsed = "true";
    elements.toggle.setAttribute("aria-expanded", "false");
    renderChangeList();
    if (detail?.validation.state === "pending") void refreshVerification(id);
    if (language !== "en" && translationProvider !== "none" && !currentTranslation(id)) {
      await restoreCachedTranslation(id);
      if (selectedId !== id || generation !== clientGeneration) return;
      renderDetail();
    }
    if (language !== "en" && providerCanTranslate() && (currentTranslation(id)?.usage.missingBlocks ?? 0) > 0) void completeMissingTranslation(id);
  } catch (error) {
    if (generation !== clientGeneration) return;
    elements.state.textContent = localizedApiError(error, copy.planReadFailure);
  }
}

async function refreshVerification(changeId: string): Promise<void> {
  const generation = clientGeneration;
  const existing = verificationRequests.get(changeId);
  if (existing) return existing;
  const request = (async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const updated = await api<Detail>(`/api/change/${encodeURIComponent(changeId)}`);
      if (generation !== clientGeneration) return;
      detailCache.set(changeId, updated);
      if (selectedId === changeId) {
        detail = updated;
        renderDetail();
      }
      if (updated.validation.state !== "pending") return;
    }
  })().catch(() => undefined);
  verificationRequests.set(changeId, request);
  try {
    await request;
  } finally {
    if (verificationRequests.get(changeId) === request) verificationRequests.delete(changeId);
  }
}

function updateLanguageButtons(): void {
  for (const candidate of elements.language.querySelectorAll<HTMLButtonElement>("button")) candidate.setAttribute("aria-pressed", String(candidate.dataset.language === language));
}

async function requestTranslation(nextLanguage: "uk" | "side"): Promise<void> {
  if (!detail || !selectedId) return;
  setLanguage(nextLanguage);
  if (translationProvider === "none") {
    translationNotice = copy.translationDisclosureNone;
    renderDetail();
    return;
  }
  if (!currentTranslation(selectedId)) await restoreCachedTranslation(selectedId);
  const cached = currentTranslation(selectedId);
  if (!cached || cached.usage.missingBlocks > 0) {
    if (providerCanTranslate()) await completeMissingTranslation(selectedId);
    else {
      translationNotice = copy.translationProviderUnavailable;
      renderDetail();
    }
  } else {
    translationNotice = translationResultNotice(cached);
    renderDetail();
  }
}

async function completeMissingTranslation(changeId: string): Promise<void> {
  if (!providerCanTranslate()) return;
  const generation = clientGeneration;
  const providerGeneration = translationGeneration;
  const requestKey = translationIdentity(changeId);
  const existing = translationRequests.get(requestKey);
  if (existing) return existing;
  const request = (async () => {
    if (selectedId === changeId) {
      elements.state.hidden = false;
      elements.state.textContent = copy.translating(selectedProviderName());
    }
    try {
      const result = await translateThroughProvider(changeId);
      if (generation !== clientGeneration || providerGeneration !== translationGeneration) return;
      translations.set(requestKey, result);
      const descriptor = selectedProviderDescriptor();
      if (descriptor) {
        if (result.diagnostic === "TRANSLATION_PROVIDER_AUTH_REQUIRED") descriptor.status = "authentication-required";
        else if (result.diagnostic === "TRANSLATION_PROVIDER_QUOTA") descriptor.status = "quota-limited";
        else if (result.diagnostic === null) descriptor.status = "available";
        updateTranslationProviderUi();
      }
      if (selectedId === changeId) translationNotice = translationResultNotice(result);
    } catch {
      if (generation === clientGeneration && providerGeneration === translationGeneration && selectedId === changeId) translationNotice = copy.translationFailed;
    } finally {
      if (generation === clientGeneration && providerGeneration === translationGeneration && selectedId === changeId) elements.state.hidden = true;
    }
  })();
  translationRequests.set(requestKey, request);
  if (selectedId === changeId) renderDetail();
  try {
    await request;
  } finally {
    if (translationRequests.get(requestKey) === request) translationRequests.delete(requestKey);
    if (selectedId === changeId) renderDetail();
  }
}

async function restoreCachedTranslation(changeId: string): Promise<void> {
  if (translationProvider === "none") return;
  const generation = clientGeneration;
  const providerGeneration = translationGeneration;
  const requestKey = translationIdentity(changeId);
  try {
    const query = new URLSearchParams({ provider: translationProvider });
    if (translationProvider === "ollama") query.set("model", ollamaModel);
    const result = await api<TranslationResult>(`/api/change/${encodeURIComponent(changeId)}/translation?${query.toString()}`);
    if (generation !== clientGeneration || providerGeneration !== translationGeneration) return;
    translations.set(requestKey, result);
    translationNotice = translationResultNotice(result);
  } catch {
    if (generation !== clientGeneration || providerGeneration !== translationGeneration) return;
    translations.delete(requestKey);
    translationNotice = copy.translationCacheReadFailed;
  }
}

function translateThroughProvider(changeId: string): Promise<TranslationResult> {
  if (translationProvider === "none") return Promise.reject(new Error(copy.translationProviderHelpNone));
  return api<TranslationResult>(`/api/change/${encodeURIComponent(changeId)}/translation`, { method: "POST", body: { provider: translationProvider, ...(translationProvider === "ollama" ? { model: ollamaModel } : {}) } });
}

async function start(): Promise<void> {
  if (!token && !stablePublicRoute) throw new Error(copy.missingCapability);
  const [nextSnapshot, providerResponse] = await Promise.all([api<Snapshot>("api/snapshot"), api<TranslationProviderResponse>("api/translation/providers")]);
  snapshot = nextSnapshot;
  translationProviders = providerResponse.providers.filter((provider) => isTranslationProviderPreference(provider.id));
  renderProviderCatalogue();
  await Promise.all([loadActivity(), connectEvents()]);
  renderHeader();
  renderBranches();
  renderChangeList();
  elements.app.setAttribute("aria-busy", "false");
  if (snapshot.compatibility === "unsupported") {
    elements.state.textContent = copy.unsupported;
    return;
  }
  if (!snapshot.changes.length) {
    elements.state.textContent = copy.empty;
    return;
  }
  await selectChange(snapshot.changes[0]!.id);
}

elements.search.addEventListener("input", renderChangeList);
elements.branchSearch.addEventListener("input", renderBranches);
window.addEventListener("popstate", () => {
  if (detail) renderDetail();
});
elements.activityDetails.addEventListener("toggle", () => {
  if (elements.activityDetails.open) lastSeenActivityId = Math.max(lastSeenActivityId, activityEntries[0]?.id ?? 0);
  renderActivity();
});
elements.translationProvider.addEventListener("change", () => {
  const next = elements.translationProvider.value;
  if (!isTranslationProviderPreference(next)) return;
  translationGeneration += 1;
  setTranslationProvider(next);
  translationNotice = next === "none" ? copy.translationDisclosureNone : "";
  if (selectedId && language !== "en" && next !== "none") {
    void (async () => {
      await restoreCachedTranslation(selectedId!);
      if ((currentTranslation(selectedId!)?.usage.missingBlocks ?? 0) > 0 && providerCanTranslate()) await completeMissingTranslation(selectedId!);
      renderDetail();
    })();
  } else renderDetail();
});
elements.ollamaModel.addEventListener("change", () => {
  const descriptor = translationProviders.find((provider) => provider.id === "ollama");
  if (!descriptor?.models.includes(elements.ollamaModel.value)) return;
  translationGeneration += 1;
  setOllamaModel(elements.ollamaModel.value);
  if (selectedId && language !== "en" && translationProvider === "ollama") {
    void (async () => {
      await restoreCachedTranslation(selectedId!);
      if ((currentTranslation(selectedId!)?.usage.missingBlocks ?? 0) > 0) await completeMissingTranslation(selectedId!);
      renderDetail();
    })();
  }
});
elements.toggle.addEventListener("click", () => {
  const expanded = elements.toggle.getAttribute("aria-expanded") === "true";
  elements.toggle.setAttribute("aria-expanded", String(!expanded));
  elements.sidebar.dataset.collapsed = String(expanded);
  renderChangeList();
});
elements.language.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-language]");
  if (!button) return;
  const nextLanguage = button.dataset.language as typeof language;
  if (nextLanguage === "en") {
    setLanguage("en");
    renderDetail();
    return;
  }
  void requestTranslation(nextLanguage);
});

applyLocale();
updateLanguageButtons();
setTranslationProvider(translationProvider);
void start().catch((error: unknown) => {
  elements.app.setAttribute("aria-busy", "false");
  elements.project.textContent = copy.projectUnavailable;
  elements.detail.hidden = true;
  elements.state.hidden = false;
  elements.state.textContent = localizedApiError(error, copy.startupFailure);
});
