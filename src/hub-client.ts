import { ukUA as copy } from "./locales.js";

type Project = { id: string; label: string; root: string; revision: number; available: boolean; reason: string | null };
type RegistrationIntent = {
  id: string;
  operation: "add" | "rebind";
  state: "selecting" | "preview" | "cancelled" | "error" | "completed" | "consumed";
  preview: null | { root: string; detectedName: string; branch: string | null; detached: boolean; kind: "primary" | "linked" };
  error: { code: string; message: string } | null;
  result: Project | null;
  cleanupWarning: boolean;
};

const state = required("state");
const projects = required("projects");
const addProject = required<HTMLButtonElement>("add-project");
const dialog = required<HTMLDialogElement>("registration-dialog");
const form = required<HTMLFormElement>("registration-form");
const dialogTitle = required("registration-title");
const dialogSummary = required("registration-summary");
const dialogDetails = required("registration-details");
const labelText = required("registration-label-text");
const labelInput = required<HTMLInputElement>("registration-label");
const dialogError = required("registration-error");
const cancelButton = required<HTMLButtonElement>("registration-cancel");
const confirmButton = required<HTMLButtonElement>("registration-confirm");
const removalDialog = required<HTMLDialogElement>("removal-dialog");
const removalForm = required<HTMLFormElement>("removal-form");
const removalTitle = required("removal-title");
const removalSummary = required("removal-summary");
const removalSafety = required("removal-safety");
const removalError = required("removal-error");
const removalCancel = required<HTMLButtonElement>("removal-cancel");
const removalConfirm = required<HTMLButtonElement>("removal-confirm");
const queryToken = new URL(location.href).searchParams.get("token") ?? "";
const token = queryToken || sessionStorage.getItem("openspec-workbench-hub-capability") || "";
let csrf = "";
let activeIntent: RegistrationIntent | null = null;
let initiatingControl: HTMLElement | null = null;
let removalProject: Project | null = null;
if (queryToken) sessionStorage.setItem("openspec-workbench-hub-capability", queryToken);
history.replaceState(null, "", "/");

required("hub-skip-link").textContent = copy.hubSkipLink;
required("hub-title").textContent = copy.hubTitle;
required("hub-description").textContent = copy.hubDescription;
projects.setAttribute("aria-label", copy.hubProjectsRegion);
state.textContent = copy.hubReadingRegistry;
addProject.textContent = copy.addProject;
labelText.textContent = copy.projectNameLabel;
cancelButton.textContent = copy.cancel;
removalTitle.textContent = copy.removeProjectTitle;
removalSafety.textContent = copy.removeProjectSafety;
removalCancel.textContent = copy.cancel;
removalConfirm.textContent = copy.removeFromHub;

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing Hub element: ${id}`);
  return found as T;
}

function element<K extends keyof HTMLElementTagNameMap>(name: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(name);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function localizedError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : fallback;
  if (["PICKER_UNSUPPORTED", "PICKER_UNAVAILABLE", "PICKER_FAILED", "PICKER_OUTPUT_INVALID", "PICKER_OUTPUT_LIMIT"].includes(error.code)) return copy.pickerUnavailable;
  if (error.code === "NO_GUI_SESSION") return copy.pickerNoGuiSession;
  if (error.code === "PICKER_BUSY") return copy.pickerBusy;
  if (error.code === "PICKER_TIMEOUT") return copy.pickerTimedOut;
  if (error.code === "PICKER_PERMISSION_DENIED") return copy.pickerPermissionDenied;
  if (["INVALID_ROOT", "INVALID_GIT_ROOT", "PROJECT_ROOT_REQUIRED", "OPEN_SPEC_REQUIRED", "OPEN_SPEC_CONFIG_TOO_LARGE"].includes(error.code)) return copy.invalidOpenSpecFolder;
  if (error.code === "PROJECT_ALREADY_REGISTERED") return copy.projectAlreadyRegistered;
  if (error.code === "OPENSPEC_TIMEOUT") return copy.openSpecTimedOut;
  if (error.code === "OPENSPEC_RUNNER_UNAVAILABLE") return copy.openSpecRunnerUnavailable;
  if (error.code === "OPENSPEC_SCRIPT_MISSING") return copy.openSpecScriptMissing;
  if (error.code === "OPENSPEC_COMMAND_FAILED") return copy.openSpecCommandFailed;
  if (error.code === "OPENSPEC_OUTPUT_LIMIT") return copy.openSpecOutputLimit;
  if (["OPENSPEC_VERSION_UNSUPPORTED", "COMPATIBILITY_MANIFEST_INVALID", "OPENSPEC_OUTPUT_INVALID"].includes(error.code)) return copy.compatibilityFailure;
  if (["REGISTRATION_INTENT_NOT_FOUND", "REGISTRATION_INTENT_CONSUMED"].includes(error.code)) return copy.registrationExpired;
  if (["REGISTRY_CONFLICT", "REGISTRATION_CANDIDATE_CHANGED"].includes(error.code)) return copy.registrationConflict;
  return error.message || fallback;
}

async function api<T>(path: string, options: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === "POST" || method === "DELETE") {
    headers["X-OpenSpec-Client"] = "1";
    if (csrf) headers["X-OpenSpec-CSRF"] = csrf;
  }
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  const body = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiError(body.error?.code ?? "UNKNOWN", body.error?.message ?? copy.hubActionFailure);
  return body;
}

async function openProject(project: Project, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = copy.opening;
  try {
    const launch = await api<{ path?: string; url?: string }>(`/api/project/${encodeURIComponent(project.id)}/open`, { method: "POST" });
    const target = launch.path ?? launch.url;
    if (!target) throw new Error(copy.hubOpenFailure);
    location.assign(target);
  } catch (error) {
    state.hidden = false;
    state.textContent = localizedError(error, copy.hubOpenFailure);
    button.textContent = copy.tryAgain;
    button.disabled = false;
  }
}

function detail(term: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(element("dt", undefined, term), element("dd", undefined, value));
  return fragment;
}

async function waitForPreview(id: string): Promise<RegistrationIntent> {
  for (;;) {
    const intent = await api<RegistrationIntent>(`/api/project-registration-intents/${encodeURIComponent(id)}`);
    if (intent.state !== "selecting") return intent;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function beginRegistration(operation: "add" | "rebind", project: Project | null, control: HTMLElement): Promise<void> {
  initiatingControl = control;
  control.setAttribute("aria-disabled", "true");
  state.hidden = false;
  state.textContent = copy.choosingFolder;
  try {
    const body: Record<string, unknown> = operation === "add"
      ? { operation }
      : { operation, projectId: project?.id, expectedRevision: project?.revision };
    const started = await api<RegistrationIntent>("/api/project-registration-intents", { method: "POST", body });
    const intent = await waitForPreview(started.id);
    activeIntent = intent;
    if (intent.state === "cancelled") {
      state.textContent = copy.selectionCancelled;
      return;
    }
    if (intent.state === "error" || !intent.preview) throw new ApiError(intent.error?.code ?? "UNKNOWN", intent.error?.message ?? copy.selectionFailed);
    dialogTitle.textContent = operation === "add" ? copy.registerProject : copy.updateProject;
    dialogSummary.textContent = operation === "add" ? copy.registrationPreview : copy.rebindPreview;
    const details = [
      ...(project ? [detail(copy.previousFolder, project.root)] : []),
      detail(copy.folder, intent.preview.root),
      detail(copy.branch, intent.preview.branch ?? copy.detachedHead),
      detail(copy.worktreeKind, intent.preview.kind === "primary" ? copy.primaryWorktree : copy.linkedWorktree),
    ];
    dialogDetails.replaceChildren(...details);
    labelInput.value = project?.label ?? intent.preview.detectedName;
    dialogError.textContent = "";
    confirmButton.textContent = operation === "add" ? copy.registerProject : copy.updateProject;
    dialog.showModal();
    labelInput.focus();
  } catch (error) {
    state.textContent = localizedError(error, copy.selectionFailed);
  } finally {
    control.removeAttribute("aria-disabled");
  }
}

async function confirmRegistration(): Promise<void> {
  if (!activeIntent) return;
  confirmButton.disabled = true;
  confirmButton.textContent = copy.registering;
  dialogError.textContent = "";
  try {
    const completed = await api<RegistrationIntent>(`/api/project-registration-intents/${encodeURIComponent(activeIntent.id)}/confirm`, {
      method: "POST",
      body: { label: labelInput.value },
    });
    activeIntent = completed;
    dialog.close();
    state.textContent = completed.cleanupWarning ? copy.rebindCleanupWarning : completed.operation === "add" ? copy.registered : copy.updated;
    await renderProjects();
  } catch (error) {
    dialogError.textContent = localizedError(error, copy.registrationFailed);
  } finally {
    confirmButton.disabled = false;
    initiatingControl?.focus();
  }
}

async function cancelRegistration(): Promise<void> {
  const intent = activeIntent;
  activeIntent = null;
  dialog.close();
  if (intent) await api(`/api/project-registration-intents/${encodeURIComponent(intent.id)}`, { method: "DELETE" }).catch(() => undefined);
  initiatingControl?.focus();
}

function beginRemoval(project: Project, control: HTMLButtonElement): void {
  removalProject = project;
  initiatingControl = control;
  removalSummary.textContent = copy.removeProjectSummary(project.label);
  removalError.textContent = "";
  removalConfirm.textContent = copy.removeFromHub;
  removalDialog.showModal();
  removalCancel.focus();
}

function cancelRemoval(): void {
  removalProject = null;
  removalDialog.close();
  initiatingControl?.focus();
}

async function confirmRemoval(): Promise<void> {
  const project = removalProject;
  if (!project) return;
  removalConfirm.disabled = true;
  removalConfirm.textContent = copy.removingProject;
  removalError.textContent = "";
  try {
    const result = await api<{ removed: { id: string; label: string }; cleanupWarning: boolean }>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "DELETE",
      headers: { "If-Match": `"${project.revision}"` },
    });
    removalProject = null;
    removalDialog.close();
    state.hidden = false;
    state.textContent = result.cleanupWarning ? copy.cleanupWarning : copy.projectRemoved(result.removed.label);
    await renderProjects();
  } catch (error) {
    removalError.textContent = localizedError(error, copy.removalFailed);
  } finally {
    removalConfirm.disabled = false;
    removalConfirm.textContent = copy.removeFromHub;
    initiatingControl?.focus();
  }
}

async function renderProjects(): Promise<void> {
  const items = await api<Project[]>("/api/projects");
  state.hidden = items.length > 0;
  state.textContent = items.length ? "" : copy.hubEmpty;
  projects.replaceChildren();
  for (const project of items) {
    const card = element("article", project.available ? "project-card" : "project-card unavailable");
    card.append(element("h2", undefined, project.label), element("p", "project-path", project.root));
    if (!project.available) card.append(element("p", "reason", copy.hubUnavailable));
    const actions = element("div", "project-actions");
    const button = element("button", undefined, project.available ? copy.openPlans : copy.findNewFolder);
    button.type = "button";
    button.addEventListener("click", () => project.available ? void openProject(project, button) : void beginRegistration("rebind", project, button));
    const remove = element("button", "secondary danger-text", copy.removeFromHub);
    remove.type = "button";
    remove.addEventListener("click", () => beginRemoval(project, remove));
    actions.append(button, remove);
    card.append(actions);
    projects.append(card);
  }
}

async function start(): Promise<void> {
  const bootstrap = await api<{ csrf: string; registrationAvailable: boolean }>("/api/bootstrap");
  csrf = bootstrap.csrf;
  addProject.hidden = !bootstrap.registrationAvailable;
  addProject.disabled = !bootstrap.registrationAvailable;
  await renderProjects();
}

addProject.addEventListener("click", () => void beginRegistration("add", null, addProject));
form.addEventListener("submit", (event) => { event.preventDefault(); void confirmRegistration(); });
cancelButton.addEventListener("click", () => void cancelRegistration());
removalForm.addEventListener("submit", (event) => { event.preventDefault(); void confirmRemoval(); });
removalCancel.addEventListener("click", cancelRemoval);

void start().catch((error: unknown) => {
  state.hidden = false;
  state.textContent = localizedError(error, copy.hubStartupFailure);
});
