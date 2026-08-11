import { randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { FAVICON_SVG, HUB_CLIENT_JS, HUB_HTML, HUB_STYLES_CSS } from "#workbench-assets";
import { discoverLocalBranches, inspectOpenSpecCandidate } from "./git.js";
import { WorkbenchLauncher } from "./launcher.js";
import { ProjectRegistry, validateRegisteredProject, validateRegisteredProjectRoot, type RegisteredProject } from "./registry.js";
import { RegistrationIntents, type FolderPicker } from "./registration.js";
import { WorkbenchError, type GitSnapshot, type LocalBranch } from "./types.js";

const HUB_CSP = ["default-src 'none'", "base-uri 'none'", "connect-src 'self'", "font-src 'self'", "form-action 'none'", "frame-ancestors 'none'", "img-src 'self' data:", "object-src 'none'", "script-src 'self'", "style-src 'self'"].join("; ");
const PROJECT_VALIDATION_CONCURRENCY = 4;

export interface HubInstance {
  url: string;
  origin: string;
  token: string;
  server: Server;
  close(): Promise<void>;
}

function headers(response: ServerResponse, contentType: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", HUB_CSP);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function exactPublicOrigin(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new WorkbenchError("PUBLIC_ORIGIN_INVALID", "--public-origin requires one exact HTTPS origin without a path, query, or fragment.", 400);
  }
  return parsed;
}

function isAbsoluteRequestTarget(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  headers(response, "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(JSON.stringify(value));
}

function equalToken(actual: string, expected: string): boolean {
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
    if (bytes > 16 * 1024) throw new WorkbenchError("REQUEST_TOO_LARGE", "The registration request is too large.", 413);
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch {
    throw new WorkbenchError("REQUEST_JSON_INVALID", "The registration request is not valid JSON.", 400);
  }
}

function exactBody(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => actual[index] === key);
}

function mapError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof WorkbenchError) return { status: error.status, code: error.code, message: error.message };
  if (error && typeof error === "object" && (error as { name?: unknown }).name === "WorkbenchError" && typeof (error as { code?: unknown }).code === "string" && Number.isInteger((error as { status?: unknown }).status) && typeof (error as { message?: unknown }).message === "string") {
    return { status: (error as { status: number }).status, code: (error as { code: string }).code, message: (error as { message: string }).message };
  }
  return { status: 500, code: "UNEXPECTED_FAILURE", message: "Projects Hub could not complete this request." };
}

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

function stableRoute(pathname: string): { projectId: string; worktreeId: string | null; childPath: string } | null {
  const match = /^\/projects\/([A-Za-z0-9_-]{16,64})\/(?:worktrees\/([A-Za-z0-9_-]{16,64})\/)?(.*)$/u.exec(pathname);
  if (!match) return null;
  return { projectId: match[1] ?? "", worktreeId: match[2] ?? null, childPath: `/${match[3] ?? ""}` };
}

interface StableRouteBinding {
  revision: number;
  root: string;
  verified: GitSnapshot;
  branches: LocalBranch[] | null;
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function validateCachedWorktreeRoot(root: string, expectedWorktreeId: string, expectedCommonGitDir: string): Promise<void> {
  const info = await lstat(root).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink() || await realpath(root).catch(() => null) !== root) {
    throw new WorkbenchError("WORKTREE_UNAVAILABLE", "This worktree is no longer available.", 409);
  }
  const candidate = await inspectOpenSpecCandidate(root).catch(() => null);
  if (!candidate || candidate.root !== root || candidate.worktreeId !== expectedWorktreeId || candidate.commonGitDir !== expectedCommonGitDir) {
    throw new WorkbenchError("WORKTREE_UNAVAILABLE", "This worktree is no longer available.", 409);
  }
}

async function proxyChild(
  request: IncomingMessage,
  response: ServerResponse,
  launcher: WorkbenchLauncher,
  root: string,
  childPath: string,
  search: string,
): Promise<void> {
  const stream = childPath === "/api/events";
  const retained = await launcher.acquire(root, stream);
  const controller = new AbortController();
  request.once("aborted", () => controller.abort());
  response.once("close", () => controller.abort());
  try {
    const forwarded = new Headers({ Authorization: `Bearer ${retained.launch.token}` });
    for (const name of ["accept", "accept-language", "if-none-match", "last-event-id", "user-agent", "x-openspec-client"]) {
      const value = request.headers[name];
      if (typeof value === "string") forwarded.set(name, value);
    }
    const contentType = request.headers["content-type"];
    if (typeof contentType === "string") forwarded.set("Content-Type", contentType);
    const body = request.method === "POST" ? JSON.stringify(await readJsonBody(request)) : undefined;
    const upstream = await fetch(`${retained.launch.origin}${childPath}${search}`, {
      method: request.method ?? "GET",
      headers: forwarded,
      signal: controller.signal,
      ...(body ? { body } : {}),
    });
    response.statusCode = upstream.status;
    for (const [name, value] of upstream.headers) {
      if (!HOP_BY_HOP.has(name.toLowerCase()) && name.toLowerCase() !== "content-length" && name.toLowerCase() !== "set-cookie") response.setHeader(name, value);
    }
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (request.method === "HEAD" || !upstream.body) {
      response.end();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const body = Readable.fromWeb(upstream.body as never);
      body.once("error", reject);
      response.once("error", reject);
      response.once("finish", resolve);
      response.once("close", resolve);
      body.pipe(response);
    });
  } catch (error) {
    if (!response.headersSent) throw error;
    response.destroy();
  } finally {
    retained.release();
  }
}

export async function startHub(registry = new ProjectRegistry(), requestedPort = 0, runtimePath?: string, requestedPublicOrigin?: string, picker?: FolderPicker): Promise<HubInstance> {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const launcher = new WorkbenchLauncher(runtimePath);
  const registrationIntents = new RegistrationIntents(picker);
  const publicOrigin = requestedPublicOrigin ? exactPublicOrigin(requestedPublicOrigin) : undefined;
  const trustedProxy = publicOrigin !== undefined;
  const stableBindings = new Map<string, StableRouteBinding>();
  const refreshStableBinding = async (project: RegisteredProject, includeBranches: boolean): Promise<StableRouteBinding> => {
    const verified = await validateRegisteredProject(project);
    const binding = {
      revision: project.revision,
      root: project.root,
      verified,
      branches: includeBranches ? await discoverLocalBranches(verified.root) : null,
    };
    stableBindings.set(project.id, binding);
    return binding;
  };
  const stableBinding = async (project: RegisteredProject, includeBranches: boolean): Promise<StableRouteBinding> => {
    const canonical = await validateRegisteredProjectRoot(project);
    const cached = stableBindings.get(project.id);
    if (cached && cached.revision === project.revision && cached.root === canonical) {
      if (includeBranches && !cached.branches) cached.branches = await discoverLocalBranches(cached.verified.root);
      return cached;
    }
    return refreshStableBinding(project, includeBranches);
  };
  let expectedHost = "";
  let listenerOrigin = "";
  let authorityOrigin = "";
  const server = createServer(async (request, response) => {
    try {
      if (!(["GET", "HEAD", "POST", "DELETE"] as Array<string | undefined>).includes(request.method)) {
        response.setHeader("Allow", "GET, HEAD, POST, DELETE");
        json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "This local Hub accepts only navigation requests." } });
        return;
      }
      if (request.headers.host !== expectedHost) {
        json(response, 403, { error: { code: "HOST_REJECTED", message: "The request host is not allowed." } });
        return;
      }
      if (request.headers.origin !== undefined && request.headers.origin !== authorityOrigin) {
        json(response, 403, { error: { code: "ORIGIN_REJECTED", message: "The request origin is not allowed." } });
        return;
      }
      const requestTarget = request.url ?? "/";
      const url = new URL(requestTarget, authorityOrigin);
      if (isAbsoluteRequestTarget(requestTarget) && url.origin !== authorityOrigin) {
        json(response, 403, { error: { code: "TARGET_REJECTED", message: "The absolute request target is not allowed." } });
        return;
      }
      if (trustedProxy && (request.method === "POST" || request.method === "DELETE")) {
        const fetchSite = request.headers["sec-fetch-site"];
        if (request.headers.origin !== authorityOrigin || request.headers["x-openspec-client"] !== "1" || (fetchSite !== undefined && fetchSite !== "same-origin" && fetchSite !== "none")) {
          json(response, 403, { error: { code: "MUTATION_AUTHORITY_REJECTED", message: "The project launch request is not from the trusted Hub client." } });
          return;
        }
      }
      if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
        if (!trustedProxy && !equalToken(url.searchParams.get("token") ?? "", token)) {
          json(response, 401, { error: { code: "CAPABILITY_REQUIRED", message: "A valid local Hub capability is required." } });
          return;
        }
        headers(response, "text/html; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : HUB_HTML);
        return;
      }
      if (url.pathname === "/hub.js" && (request.method === "GET" || request.method === "HEAD")) {
        headers(response, "text/javascript; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : HUB_CLIENT_JS);
        return;
      }
      if (url.pathname === "/hub.css" && (request.method === "GET" || request.method === "HEAD")) {
        headers(response, "text/css; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : HUB_STYLES_CSS);
        return;
      }
      if (url.pathname === "/favicon.svg" && (request.method === "GET" || request.method === "HEAD")) {
        headers(response, "image/svg+xml; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : FAVICON_SVG);
        return;
      }
      if (url.pathname === "/api/bootstrap" && request.method === "GET") {
        json(response, 200, { csrf: trustedProxy ? csrf : "", registrationAvailable: trustedProxy });
        return;
      }
      if (trustedProxy && (request.method === "GET" || request.method === "HEAD" || request.method === "POST")) {
        const missingSlash = /^\/projects\/([A-Za-z0-9_-]{16,64})(?:\/worktrees\/([A-Za-z0-9_-]{16,64}))?$/u.exec(url.pathname);
        if (missingSlash) {
          response.statusCode = 308;
          response.setHeader("Location", `${url.pathname}/${url.search}`);
          response.end();
          return;
        }
        const route = stableRoute(url.pathname);
        if (route) {
          if (request.method === "POST" && !/^\/api\/change\/[^/]+\/translation$/u.test(route.childPath)) throw new WorkbenchError("METHOD_NOT_ALLOWED", "This project route does not accept that mutation.", 405);
          const project = (await registry.list()).find((item) => item.id === route.projectId);
          if (!project) throw new WorkbenchError("PROJECT_NOT_REGISTERED", "The selected project is not registered.", 404);
          let binding = await stableBinding(project, route.worktreeId !== null);
          let root = binding.verified.root;
          if (route.worktreeId) {
            let branch = binding.branches?.find((item) => item.worktreeId === route.worktreeId && item.openable && item.worktreeRoot);
            if (!branch?.worktreeRoot) {
              binding = await refreshStableBinding(project, true);
              branch = binding.branches?.find((item) => item.worktreeId === route.worktreeId && item.openable && item.worktreeRoot);
            }
            if (!branch?.worktreeRoot) throw new WorkbenchError("WORKTREE_UNAVAILABLE", "This worktree is no longer available.", 409);
            await validateCachedWorktreeRoot(branch.worktreeRoot, route.worktreeId, binding.verified.commonGitDir);
            root = branch.worktreeRoot;
          }
          await proxyChild(request, response, launcher, root, route.childPath, url.search);
          return;
        }
      }
      if (!trustedProxy && !equalToken(bearer(request), token)) {
        json(response, 401, { error: { code: "CAPABILITY_REQUIRED", message: "A valid local Hub capability is required." } });
        return;
      }
      const match = /^\/api\/project\/([^/]+)\/open$/u.exec(url.pathname);
      const removalMatch = /^\/api\/projects\/([A-Za-z0-9_-]{16,64})$/u.exec(url.pathname);
      const intentMatch = /^\/api\/project-registration-intents\/([A-Za-z0-9_-]{32})(?:\/(confirm))?$/u.exec(url.pathname);
      if (url.pathname === "/api/project-registration-intents" && request.method === "POST") {
        if (!trustedProxy || !equalToken(String(request.headers["x-openspec-csrf"] ?? ""), csrf)) throw new WorkbenchError("REGISTRATION_AUTHORITY_REJECTED", "The registration request is not authorized.", 403);
        const body = await readJsonBody(request);
        const operation = body.operation;
        if (operation === "add" && exactBody(body, ["operation"])) {
          json(response, 202, registrationIntents.start("add", null, null));
          return;
        }
        if (operation === "rebind" && exactBody(body, ["expectedRevision", "operation", "projectId"]) && typeof body.projectId === "string" && Number.isInteger(body.expectedRevision)) {
          json(response, 202, registrationIntents.start("rebind", body.projectId, body.expectedRevision as number));
          return;
        }
        throw new WorkbenchError("REGISTRATION_INTENT_INVALID", "The registration request has unknown or invalid fields.", 400);
      }
      if (intentMatch && !intentMatch[2] && request.method === "GET") {
        json(response, 200, registrationIntents.get(intentMatch[1] ?? ""));
        return;
      }
      if (intentMatch && !intentMatch[2] && request.method === "DELETE") {
        if (!trustedProxy || !equalToken(String(request.headers["x-openspec-csrf"] ?? ""), csrf)) throw new WorkbenchError("REGISTRATION_AUTHORITY_REJECTED", "The registration request is not authorized.", 403);
        json(response, 200, registrationIntents.cancel(intentMatch[1] ?? ""));
        return;
      }
      if (intentMatch?.[2] === "confirm" && request.method === "POST") {
        if (!trustedProxy || !equalToken(String(request.headers["x-openspec-csrf"] ?? ""), csrf)) throw new WorkbenchError("REGISTRATION_AUTHORITY_REJECTED", "The registration request is not authorized.", 403);
        const body = await readJsonBody(request);
        if (!exactBody(body, ["label"]) || typeof body.label !== "string") throw new WorkbenchError("PROJECT_LABEL_INVALID", "The project label is invalid.", 400);
        json(response, 200, await registrationIntents.confirm(intentMatch[1] ?? "", body.label, registry, launcher));
        return;
      }
      if (removalMatch && request.method === "DELETE") {
        if (!trustedProxy || !equalToken(String(request.headers["x-openspec-csrf"] ?? ""), csrf)) throw new WorkbenchError("REGISTRATION_AUTHORITY_REJECTED", "The project removal request is not authorized.", 403);
        if (url.search || request.headers["content-length"] && request.headers["content-length"] !== "0" || request.headers["transfer-encoding"]) {
          request.resume();
          throw new WorkbenchError("PROJECT_REMOVAL_INVALID", "The project removal request has unknown or invalid fields.", 400);
        }
        const revisionMatch = /^"([1-9]\d*)"$/u.exec(typeof request.headers["if-match"] === "string" ? request.headers["if-match"] : "");
        if (!revisionMatch) throw new WorkbenchError("PROJECT_REMOVAL_INVALID", "The project removal request requires a quoted numeric If-Match revision.", 400);
        const removed = await registry.remove(removalMatch[1] ?? "", Number(revisionMatch[1]));
        let cleanupWarning = false;
        try {
          await launcher.invalidateRoot(removed.root);
        } catch {
          cleanupWarning = true;
        }
        json(response, 200, { removed: { id: removed.id, label: removed.label }, cleanupWarning });
        return;
      }
      if (request.method === "POST" && !match) {
        response.setHeader("Allow", "GET, HEAD");
        json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only a registered project can be opened with POST." } });
        return;
      }
      if (url.pathname === "/api/projects" && request.method === "GET") {
        const projects = await mapWithConcurrency(await registry.list(), PROJECT_VALIDATION_CONCURRENCY, async (project) => {
          try {
            await validateRegisteredProject(project);
            return { ...project, available: true, reason: null };
          } catch {
            return { ...project, available: false, reason: "The registered OpenSpec worktree is missing or no longer readable." };
          }
        });
        json(response, 200, projects);
        return;
      }
      if (match && request.method === "POST") {
        const id = decodeURIComponent(match[1] ?? "");
        const project = (await registry.list()).find((item) => item.id === id);
        if (!project) throw new WorkbenchError("PROJECT_NOT_REGISTERED", "The selected project is not registered.", 404);
        const verified = await validateRegisteredProject(project);
        if (trustedProxy) {
          stableBindings.set(project.id, { revision: project.revision, root: project.root, verified, branches: null });
          json(response, 200, { path: `/projects/${encodeURIComponent(project.id)}/` });
        } else {
          const launch = await launcher.launch(verified.root);
          json(response, 200, { url: launch.url, identity: launch.identity });
        }
        return;
      }
      json(response, 404, { error: { code: "NOT_FOUND", message: "The requested Hub route does not exist." } });
    } catch (error) {
      const mapped = mapError(error);
      json(response, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new WorkbenchError("LISTEN_FAILED", "Projects Hub could not start.");
  listenerOrigin = `http://127.0.0.1:${address.port}`;
  authorityOrigin = publicOrigin?.origin ?? listenerOrigin;
  expectedHost = publicOrigin?.host ?? `127.0.0.1:${address.port}`;
  return {
    url: trustedProxy ? `${authorityOrigin}/` : `${listenerOrigin}/?token=${encodeURIComponent(token)}`,
    origin: listenerOrigin,
    token,
    server,
    async close() {
      await registrationIntents.close();
      await launcher.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
