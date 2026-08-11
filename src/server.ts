import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HTML, CLIENT_JS, STYLES_CSS, FAVICON_SVG } from "#workbench-assets";
import { ActivityJournal, activityDiagnostic, type ActivityEntry } from "./activity.js";
import { discoverGitSnapshot, discoverLocalBranches, projectBranchNavigation } from "./git.js";
import { startHub } from "./hub.js";
import { WorkbenchLauncher } from "./launcher.js";
import { createPinnedOpenSpecRunner } from "./openspec.js";
import { buildChangeDetail, buildChangePreview, buildChangeVerification, buildSnapshot } from "./projection.js";
import { ProjectRegistry } from "./registry.js";
import { openSpecContentState, SnapshotWatcher, type SnapshotChangeEvidence } from "./watcher.js";
import { WorkbenchError, type ChangeDetail, type ChangeSummary } from "./types.js";
import { TranslationCache, TranslationService, type TranslationAdapter } from "./translation.js";
import { isTranslationProviderId, TranslationProviderRegistry, type TranslationProviderId, type TranslationProviderSelection } from "./translation-providers.js";

export { startHub } from "./hub.js";

const CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join("; ");

export interface WorkbenchInstance {
  url: string;
  origin: string;
  token: string;
  root: string;
  server: Server;
  close(): Promise<void>;
}

function securityHeaders(response: ServerResponse, contentType: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", CSP);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  securityHeaders(response, "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(JSON.stringify(value));
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(request: IncomingMessage): string {
  const value = request.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"] !== "application/json") throw new WorkbenchError("CONTENT_TYPE_REQUIRED", "This request requires application/json.", 415);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1024) throw new WorkbenchError("REQUEST_TOO_LARGE", "The translation request is too large.", 413);
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch {
    throw new WorkbenchError("REQUEST_JSON_INVALID", "The translation request is not valid JSON.", 400);
  }
}

function safeError(error: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (error instanceof WorkbenchError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: "UNEXPECTED_FAILURE", message: "The workbench could not complete this request." } } };
}

export async function startWorkbench(inputRoot = process.cwd(), requestedPort = 0, translationAdapter?: TranslationAdapter): Promise<WorkbenchInstance> {
  const initialGit = await discoverGitSnapshot(inputRoot);
  const root = initialGit.root;
  const runner = createPinnedOpenSpecRunner(root);
  const token = randomBytes(32).toString("base64url");
  const watcher = await SnapshotWatcher.create(initialGit);
  const launcher = new WorkbenchLauncher();
  const translationProviders = new TranslationProviderRegistry(translationAdapter);
  const translationCache = new TranslationCache();
  const activity = new ActivityJournal();
  let stale = false;
  const eventClients = new Set<ServerResponse>();
  activity.on("entry", (entry: ActivityEntry) => {
    const data = `event: activity\ndata: ${JSON.stringify(entry)}\n\n`;
    for (const client of eventClients) client.write(data);
  });
  let projectedSnapshot: { generation: number; changes: ChangeSummary[] } | null = null;
  type DetailCacheEntry = {
    generation: number;
    preview: Promise<ChangeDetail>;
    verification: Promise<ChangeDetail> | null;
    verified: ChangeDetail | null;
  };
  const detailCache = new Map<string, DetailCacheEntry>();
  watcher.on("change", (reason: string, evidence: SnapshotChangeEvidence = {}) => {
    stale = true;
    projectedSnapshot = null;
    detailCache.clear();
    if (reason === "source" || reason === "head-and-source") activity.append("source-change-detected", {
      ...(evidence.paths ? { paths: evidence.paths } : {}),
      ...(evidence.additionalPaths !== undefined ? { additionalPaths: evidence.additionalPaths } : {}),
    });
    if (reason === "head" || reason === "head-and-source") activity.append("head-change-detected", {
      ...(evidence.previousRevision ? { previousRevision: evidence.previousRevision } : {}),
      ...(evidence.revision ? { revision: evidence.revision } : {}),
    });
    const data = `event: stale\ndata: ${JSON.stringify({ stale: true, reason })}\n\n`;
    for (const client of eventClients) client.write(data);
  });

  function detailEntry(changeId: string): DetailCacheEntry {
    const generation = watcher.generation;
    const existing = detailCache.get(changeId);
    if (existing?.generation === generation) return existing;
    const summary = projectedSnapshot?.generation === generation ? projectedSnapshot.changes.find((item) => item.id === changeId) : undefined;
    const preview = summary ? buildChangePreview(root, summary) : buildChangeDetail(root, changeId, runner);
    const entry: DetailCacheEntry = { generation, preview, verification: null, verified: null };
    if (!summary) {
      entry.verification = preview;
      void preview.then((value) => {
        if (detailCache.get(changeId) === entry) entry.verified = value;
      }, () => undefined);
    }
    detailCache.set(changeId, entry);
    return entry;
  }

  function startBackgroundVerification(changeId: string, entry: DetailCacheEntry): void {
    if (entry.verification) return;
    activity.append("verification-started", { changeId });
    entry.verification = Promise.all([entry.preview, buildChangeVerification(root, changeId, runner)])
      .then(([preview, verification]) => {
        if (verification.validation.state === "unavailable" || verification.validation.state === "pending" || verification.validation.state === "unsupported") activity.append("verification-failed", { changeId, validationState: verification.validation.state === "unsupported" ? "unsupported" : "unavailable" });
        else activity.append("verification-completed", { changeId, validationState: verification.validation.state });
        return { ...preview, ...verification };
      })
      .catch(async (error: unknown) => {
        const unsupported = error instanceof WorkbenchError && error.code === "OPENSPEC_VERSION_UNSUPPORTED";
        activity.append("verification-failed", { changeId, validationState: unsupported ? "unsupported" : "unavailable" });
        return {
          ...await entry.preview,
          artifacts: [],
          validation: unsupported
            ? { state: "unsupported" as const, message: "This OpenSpec response format is not supported." }
            : { state: "unavailable" as const, message: "Strict validation is currently unavailable." },
        };
      });
    void entry.verification.then((value) => {
      if (detailCache.get(changeId) !== entry || watcher.generation !== entry.generation) return;
      entry.verified = value;
    }, () => undefined);
  }

  async function projectedChange(changeId: string, verifyInBackground = false): Promise<ChangeDetail> {
    const entry = detailEntry(changeId);
    const value = entry.verified ?? await entry.preview;
    if (verifyInBackground) startBackgroundVerification(changeId, entry);
    return value;
  }

  const translationRuns = new Map<string, Promise<Awaited<ReturnType<TranslationService["translateChange"]>>>>();
  async function translateChangeWithActivity(changeId: string, generation: number, change: ChangeDetail, providerId: TranslationProviderId, service: TranslationService): Promise<Awaited<ReturnType<TranslationService["translateChange"]>>> {
    const adapterId = service.status().adapterId;
    const runKey = `${generation}:${changeId}:${adapterId}`;
    const existing = translationRuns.get(runKey);
    if (existing) return existing;
    const run = (async () => {
      const cached = await service.cachedChange(change);
      if (watcher.generation === generation) activity.append("translation-started", { changeId, providerId, missingBlocks: cached.usage.missingBlocks });
      try {
        const result = await service.translateChange(change);
        if (watcher.generation !== generation) return result;
        translationProviders.reportDiagnostic(providerId, result.diagnostic);
        if (result.diagnostic || result.usage.failedBlocks > 0) {
          activity.append("translation-failed", {
            changeId,
            providerId,
            failedBlocks: result.usage.failedBlocks,
            diagnostic: activityDiagnostic(result.diagnostic),
          });
        } else {
          activity.append("translation-completed", { changeId, providerId, translatedBlocks: result.usage.translatedBlocks });
        }
        return result;
      } catch (error) {
        if (watcher.generation === generation) activity.append("translation-failed", { changeId, providerId, diagnostic: "TRANSLATION_FAILED" });
        throw error;
      }
    })();
    translationRuns.set(runKey, run);
    try {
      return await run;
    } finally {
      if (translationRuns.get(runKey) === run) translationRuns.delete(runKey);
    }
  }

  let expectedHost = "";
  let origin = "";
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
        response.setHeader("Allow", "GET, HEAD, POST");
        json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "This read-only workbench accepts only reading and isolated-navigation requests." } });
        return;
      }
      if (request.headers.host !== expectedHost) {
        json(response, 403, { error: { code: "HOST_REJECTED", message: "The request host is not allowed." } });
        return;
      }
      const requestOrigin = request.headers.origin;
      if (requestOrigin !== undefined && requestOrigin !== origin) {
        json(response, 403, { error: { code: "ORIGIN_REJECTED", message: "The request origin is not allowed." } });
        return;
      }
      const url = new URL(request.url ?? "/", origin);
      if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
        if (!safeTokenEqual(bearer(request) || url.searchParams.get("token") || "", token)) {
          json(response, 401, { error: { code: "CAPABILITY_REQUIRED", message: "A valid local launch capability is required." } });
          return;
        }
        securityHeaders(response, "text/html; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : HTML);
        return;
      }
      if (url.pathname === "/client.js" && (request.method === "GET" || request.method === "HEAD")) {
        securityHeaders(response, "text/javascript; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : CLIENT_JS);
        return;
      }
      if (url.pathname === "/styles.css" && (request.method === "GET" || request.method === "HEAD")) {
        securityHeaders(response, "text/css; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : STYLES_CSS);
        return;
      }
      if (url.pathname === "/favicon.svg" && (request.method === "GET" || request.method === "HEAD")) {
        securityHeaders(response, "image/svg+xml; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : FAVICON_SVG);
        return;
      }
      const suppliedToken = bearer(request) || (url.pathname === "/api/events" ? url.searchParams.get("token") ?? "" : "");
      if (!safeTokenEqual(suppliedToken, token)) {
        json(response, 401, { error: { code: "CAPABILITY_REQUIRED", message: "A valid local launch capability is required." } });
        return;
      }
      const worktreeMatch = /^\/api\/worktree\/([a-f0-9]{16})\/open$/u.exec(url.pathname);
      const translationMatch = /^\/api\/change\/([^/]+)\/translation$/u.exec(url.pathname);
      if (request.method === "POST" && !worktreeMatch && !translationMatch) {
        response.setHeader("Allow", "GET, HEAD");
        json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only an existing worktree can be opened with POST." } });
        return;
      }
      if (url.pathname === "/api/health") {
        json(response, 200, { ok: true });
        return;
      }
      if (url.pathname === "/api/identity" && request.method === "GET") {
        const currentGit = await discoverGitSnapshot(root);
        json(response, 200, {
          root: currentGit.root,
          repositoryId: currentGit.repositoryId,
          worktreeId: currentGit.worktreeId,
          head: currentGit.head,
        });
        return;
      }
      if (url.pathname === "/api/activity" && request.method === "GET") {
        json(response, 200, { entries: activity.list(), limit: activity.limit, scope: "process" });
        return;
      }
      if (url.pathname === "/api/translation/providers" && request.method === "GET") {
        json(response, 200, { providers: await translationProviders.catalogue() });
        return;
      }
      if (url.pathname === "/api/snapshot") {
        activity.append("snapshot-refresh-started");
        try {
          const generation = watcher.generation;
          const [currentGit, content] = await Promise.all([discoverGitSnapshot(root), openSpecContentState(root)]);
          const branches = projectBranchNavigation(await discoverLocalBranches(root));
          const data = await buildSnapshot(root, currentGit, runner, false, branches);
          stale = !watcher.acknowledge(currentGit, generation, content);
          data.stale = stale;
          if (!stale) {
            projectedSnapshot = { generation: watcher.generation, changes: data.changes };
            detailCache.clear();
          }
          activity.append("snapshot-refresh-completed");
          json(response, 200, data);
        } catch (error) {
          activity.append("snapshot-refresh-failed");
          throw error;
        }
        return;
      }
      if (url.pathname.startsWith("/api/change/")) {
        if (translationMatch && request.method === "GET") {
          const id = decodeURIComponent(translationMatch[1] ?? "");
          const provider = url.searchParams.get("provider");
          const model = url.searchParams.get("model");
          if (!isTranslationProviderId(provider) || [...url.searchParams.keys()].some((key) => key !== "provider" && key !== "model")) throw new WorkbenchError("TRANSLATION_PROVIDER_UNSUPPORTED", "The selected translation provider is not supported.", 400);
          const selection: TranslationProviderSelection = { provider, ...(model === null ? {} : { model }) };
          const service = new TranslationService(await translationProviders.resolve(selection, false), translationCache);
          json(response, 200, await service.cachedChange(await projectedChange(id)));
          return;
        }
        if (translationMatch && request.method === "POST") {
          if (request.headers["x-openspec-client"] !== "1") throw new WorkbenchError("TRANSLATION_AUTHORITY_REJECTED", "The translation request is not from the local workbench client.", 403);
          const body = await readJsonBody(request);
          if (!isTranslationProviderId(body.provider) || Object.keys(body).some((key) => key !== "provider" && key !== "model") || body.model !== undefined && typeof body.model !== "string") throw new WorkbenchError("TRANSLATION_PROVIDER_UNSUPPORTED", "The selected translation provider is not supported.", 400);
          const selection: TranslationProviderSelection = { provider: body.provider, ...(typeof body.model === "string" ? { model: body.model } : {}) };
          const service = new TranslationService(await translationProviders.resolve(selection), translationCache);
          const id = decodeURIComponent(translationMatch[1] ?? "");
          const entry = detailEntry(id);
          const change = entry.verified ?? await entry.preview;
          json(response, 200, await translateChangeWithActivity(id, entry.generation, change, body.provider, service));
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/api/change/".length));
        json(response, 200, await projectedChange(id, true));
        return;
      }
      if (url.pathname === "/api/events") {
        securityHeaders(response, "text/event-stream; charset=utf-8");
        response.setHeader("Connection", "keep-alive");
        response.write("event: ready\ndata: {}\n\n");
        eventClients.add(response);
        const releasePolling = watcher.retainPolling();
        request.on("close", () => {
          eventClients.delete(response);
          releasePolling();
        });
        return;
      }
      if (worktreeMatch && request.method === "POST") {
        const worktreeId = worktreeMatch[1] ?? "";
        const branch = (await discoverLocalBranches(root)).find((item) => item.worktreeId === worktreeId && item.openable && item.worktreeRoot);
        if (!branch?.worktreeRoot) throw new WorkbenchError("WORKTREE_UNAVAILABLE", "This branch has no existing readable OpenSpec worktree.", 409);
        if (branch.worktreeId === initialGit.worktreeId) {
          json(response, 200, { url: `${origin}/?token=${encodeURIComponent(token)}`, identity: { root, repositoryId: initialGit.repositoryId, worktreeId: initialGit.worktreeId, head: initialGit.head } });
          return;
        }
        const launch = await launcher.launch(branch.worktreeRoot);
        json(response, 200, { url: launch.url, identity: launch.identity });
        return;
      }
      json(response, 404, { error: { code: "NOT_FOUND", message: "The requested workbench route does not exist." } });
    } catch (error) {
      const mapped = safeError(error);
      json(response, mapped.status, mapped.body);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new WorkbenchError("LISTEN_FAILED", "The local workbench could not start.");
  expectedHost = `127.0.0.1:${address.port}`;
  origin = `http://${expectedHost}`;
  watcher.start();
  return {
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    origin,
    token,
    root,
    server,
    async close() {
      watcher.close();
      for (const client of eventClients) client.end();
      await launcher.close();
      await translationProviders.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const stateFlag = process.argv.indexOf("--state-dir");
  const stateDirectory = stateFlag >= 0 ? process.argv[stateFlag + 1] : undefined;
  if (stateFlag >= 0 && !stateDirectory) throw new WorkbenchError("STATE_DIRECTORY_REQUIRED", "--state-dir requires a directory.", 400);
  const registry = new ProjectRegistry(stateDirectory);
  if (command === "register") {
    const rootFlag = process.argv.indexOf("--root");
    const labelFlag = process.argv.indexOf("--label");
    const root = rootFlag >= 0 ? process.argv[rootFlag + 1] : undefined;
    const label = labelFlag >= 0 ? process.argv[labelFlag + 1] : undefined;
    if (!root) throw new WorkbenchError("ROOT_REQUIRED", "register requires --root <project>.", 400);
    process.stdout.write(`${JSON.stringify(await registry.register(root, label))}\n`);
    return;
  }
  if (command === "projects") {
    process.stdout.write(`${JSON.stringify({ version: 2, projects: await registry.list() }, null, 2)}\n`);
    return;
  }
  if (command === "remove") {
    const projectFlag = process.argv.indexOf("--project");
    const projectId = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
    if (!projectId) throw new WorkbenchError("PROJECT_REQUIRED", "remove requires --project <id>.", 400);
    const removed = await registry.remove(projectId);
    process.stdout.write(`${JSON.stringify({ removed: removed.id, label: removed.label })}\n`);
    return;
  }
  const rootFlag = process.argv.indexOf("--root");
  const projectMode = command === "project" || rootFlag >= 0 || process.argv.includes("--machine");
  const knownCommand = command === undefined || command.startsWith("--") || ["register", "projects", "remove", "project"].includes(command);
  if (!knownCommand) throw new WorkbenchError("COMMAND_INVALID", "The requested Workbench command is not supported.", 400);
  if (!projectMode) {
    const portFlag = process.argv.indexOf("--port");
    const portValue = portFlag >= 0 ? process.argv[portFlag + 1] : undefined;
    const requestedPort = portValue === undefined ? 0 : Number(portValue);
    if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
      throw new WorkbenchError("PORT_INVALID", "--port requires an integer from 0 through 65535.", 400);
    }
    const originFlag = process.argv.indexOf("--public-origin");
    const publicOrigin = originFlag >= 0 ? process.argv[originFlag + 1] : undefined;
    if (originFlag >= 0 && !publicOrigin) throw new WorkbenchError("PUBLIC_ORIGIN_REQUIRED", "--public-origin requires an exact HTTPS origin.", 400);
    const hub = await startHub(registry, requestedPort, undefined, publicOrigin);
    process.stdout.write(`OpenSpec Projects Hub\n${hub.url}\n`);
    return;
  }
  const root = rootFlag >= 0 ? process.argv[rootFlag + 1] : undefined;
  if (!root) throw new WorkbenchError("ROOT_REQUIRED", "--root requires a project directory.", 400);
  if (!path.isAbsolute(root)) throw new WorkbenchError("ROOT_ABSOLUTE_REQUIRED", "--root requires an absolute project directory.", 400);
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(root);
  } catch {
    throw new WorkbenchError("ROOT_INVALID", "--root must name an existing project directory.", 400);
  }
  const resolvedRoot = path.resolve(root);
  const sameCanonicalPath = process.platform === "win32"
    ? canonicalRoot.toLocaleLowerCase("en-US") === resolvedRoot.toLocaleLowerCase("en-US")
    : canonicalRoot === resolvedRoot;
  if (!sameCanonicalPath) throw new WorkbenchError("ROOT_CANONICAL_REQUIRED", "--root must use the canonical project directory.", 400);
  const instance = await startWorkbench(canonicalRoot);
  if (process.argv.includes("--machine")) {
    process.stdout.write(`${JSON.stringify({ url: instance.url, origin: instance.origin, token: instance.token, pid: process.pid })}\n`);
  } else {
    process.stdout.write(`OpenSpec Workbench\n${instance.url}\n`);
  }
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  void main().catch((error: unknown) => {
    const mapped = safeError(error);
    process.stderr.write(`${mapped.body.error.code}: ${mapped.body.error.message}\n`);
    process.exitCode = 1;
  });
}
