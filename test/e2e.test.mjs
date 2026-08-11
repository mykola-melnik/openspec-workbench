import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import test from "node:test";
import os from "node:os";
import { startHub, startWorkbench } from "../.workbench-build/server.mjs";
import { discoverLocalBranches, ProjectRegistry } from "../.workbench-build/testing.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command, createFixture, readFixture, state } from "./fixture.mjs";

async function request(instance, pathname, options = {}) {
  return fetch(`${instance.origin}${pathname}`, options);
}

async function rawStatus(instance, pathname, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${instance.origin}${pathname}`, { headers }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

async function rawRequest(instance, pathname, { method = "GET", headers = {}, body } = {}) {
  const target = new URL(instance.origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: pathname, method, headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function readEvent(instance, pathname, headers = {}) {
  const target = new URL(instance.origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: pathname, headers }, (response) => {
      response.setEncoding("utf8");
      response.once("data", (body) => {
        resolve({ status: response.statusCode, headers: response.headers, body });
        response.destroy();
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function waitForActivityEvent(instance, pathname, trigger, headers = {}) {
  const target = new URL(instance.origin);
  return new Promise((resolve, reject) => {
    let body = "";
    let triggered = false;
    const timer = setTimeout(() => {
      request.destroy();
      reject(new Error("Timed out waiting for an activity event."));
    }, 2_000);
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: pathname, headers }, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (!triggered && body.includes("event: ready")) {
          triggered = true;
          void Promise.resolve(trigger()).catch(reject);
        }
        if (body.includes("event: activity") && body.includes("snapshot-refresh-started")) {
          clearTimeout(timer);
          response.destroy();
          resolve({ status: response.statusCode, headers: response.headers, body });
        }
      });
    });
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

async function trustedHubRequest(instance, pathname, options = {}) {
  const response = await rawRequest(instance, pathname, {
    method: options.method ?? "GET",
    headers: { Host: "plans.internal", ...(options.headers ?? {}) },
    body: options.body,
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

async function launchRuntimeUntilOutput(runtime, args, cwd) {
  const child = spawn(process.execPath, [runtime, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let errorOutput = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });
  const outcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ kind: "listening" }), 750);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); resolve({ kind: "exit", code }); });
    const poll = setInterval(() => {
      if (/http:\/\/127\.0\.0\.1:\d+\//u.test(output)) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve({ kind: "listening" });
      }
    }, 10);
    poll.unref();
  });
  return { child, output, errorOutput, outcome };
}

async function stopRuntime(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

test("serves a read-only worktree projection behind a capability", async () => {
  const root = await createFixture();
  const before = await state(root);
  const instance = await startWorkbench(root);
  try {
    assert.equal((await request(instance, "/api/snapshot")).status, 401);
    assert.equal((await request(instance, "/api/activity")).status, 401);
    assert.equal((await request(instance, `/?token=${encodeURIComponent(instance.token)}`)).status, 200);
    const faviconResponse = await request(instance, "/favicon.svg");
    assert.equal(faviconResponse.status, 200);
    assert.match(faviconResponse.headers.get("content-type") ?? "", /image\/svg\+xml/u);
    const snapshotResponse = await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.projectName, "fixture-project");
    assert.equal(snapshot.changes.length, 1);
    const activity = await (await request(instance, "/api/activity", { headers: { Authorization: `Bearer ${instance.token}` } })).json();
    assert.equal(activity.scope, "process");
    assert.equal(activity.limit, 100);
    assert.deepEqual(activity.entries.slice(0, 2).map((entry) => entry.kind), ["snapshot-refresh-completed", "snapshot-refresh-started"]);
    assert.doesNotMatch(JSON.stringify(activity), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    const liveActivity = await waitForActivityEvent(
      instance,
      `/api/events?token=${encodeURIComponent(instance.token)}`,
      () => request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } }),
    );
    assert.equal(liveActivity.status, 200);
    assert.match(liveActivity.body, /event: activity/u);
    assert.match(liveActivity.body, /snapshot-refresh-started/u);
    const detailResponse = await request(instance, "/api/change/example-change", { headers: { Authorization: `Bearer ${instance.token}` } });
    const detail = await detailResponse.json();
    assert.equal(detail.tasks.length, 2);
    assert.match(detail.proposal[0].body, /<script>/u);
    assert.deepEqual(await state(root), before);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("snapshot failures return a typed terminal OpenSpec error instead of an endless loading response", async () => {
  const root = await createFixture();
  const instance = await startWorkbench(root);
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture-project", scripts: {} }), "utf8");
    const response = await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: {
        code: "OPENSPEC_SCRIPT_MISSING",
        message: "The selected project does not declare a local openspec script.",
      },
    });
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reuses one fast change projection while strict verification completes once in the background", async () => {
  const root = await createFixture({ openSpecDelayMs: 400, commandLog: true });
  const adapter = {
    id: "projection-cache-adapter",
    async translate(blocks) {
      return { translations: blocks.map((block) => ({ id: block.id, text: `UK ${block.text}` })), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
    },
  };
  const instance = await startWorkbench(root, 0, adapter);
  const headers = { Authorization: `Bearer ${instance.token}` };
  try {
    assert.equal((await request(instance, "/api/snapshot", { headers })).status, 200);
    const startedAt = Date.now();
    const previewResponse = await request(instance, "/api/change/example-change", { headers });
    const preview = await previewResponse.json();
    assert.equal(preview.validation.state, "pending");
    assert.equal(Date.now() - startedAt < 300, true);

    const cacheResponse = await request(instance, "/api/change/example-change/translation?provider=agy", { headers });
    assert.equal(cacheResponse.status, 200);
    const translationResponse = await request(instance, "/api/change/example-change/translation", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-OpenSpec-Client": "1" },
      body: JSON.stringify({ provider: "agy" }),
    });
    assert.equal(translationResponse.status, 200);

    await new Promise((resolve) => setTimeout(resolve, 900));
    const verified = await (await request(instance, "/api/change/example-change", { headers })).json();
    assert.equal(verified.validation.state, "valid");
    const commands = (await readFixture(root, ".openspec-command-log")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(commands.filter((args) => args.includes("status")).length, 1);
    assert.equal(commands.filter((args) => args.includes("validate")).length, 1);
    const activity = await (await request(instance, "/api/activity", { headers })).json();
    const kinds = activity.entries.map((entry) => entry.kind);
    assert.equal(kinds.filter((kind) => kind === "verification-started").length, 1);
    assert.equal(kinds.filter((kind) => kind === "verification-completed").length, 1);
    assert.equal(kinds.filter((kind) => kind === "translation-started").length, 1);
    assert.equal(kinds.filter((kind) => kind === "translation-completed").length, 1);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps in-flight translations isolated by watcher generation", async () => {
  const root = await createFixture({ name: "translation-generation" });
  let calls = 0;
  let releaseFirst;
  let markFirstStarted;
  let markSecondStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const secondStarted = new Promise((resolve) => { markSecondStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  const adapter = {
    id: `generation-adapter-${Date.now()}`,
    async translate(blocks) {
      calls += 1;
      const call = calls;
      if (call === 1) {
        markFirstStarted();
        await firstRelease;
      } else {
        markSecondStarted();
      }
      return { translations: blocks.map((block) => ({ id: block.id, text: block.text })), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
    },
  };
  const instance = await startWorkbench(root, 0, adapter);
  const headers = { Authorization: `Bearer ${instance.token}` };
  const postHeaders = { ...headers, "Content-Type": "application/json", "X-OpenSpec-Client": "1" };
  const endpoint = "/api/change/example-change/translation";
  try {
    assert.equal((await request(instance, "/api/snapshot", { headers })).status, 200);
    const firstRequest = request(instance, endpoint, { method: "POST", headers: postHeaders, body: JSON.stringify({ provider: "agy" }) });
    await firstStarted;
    await writeFile(path.join(root, "openspec/changes/example-change/proposal.md"), "## Why\n\nChanged generation text.\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal((await request(instance, "/api/snapshot", { headers })).status, 200);
    const secondRequest = request(instance, endpoint, { method: "POST", headers: postHeaders, body: JSON.stringify({ provider: "agy" }) });
    await Promise.race([secondStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("Second translation did not start.")), 1_000))]);
    releaseFirst();
    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(calls, 2);
    assert.equal(Object.values((await secondResponse.json()).values).some((value) => value.includes("Changed generation text")), true);
    const activity = await (await request(instance, "/api/activity", { headers })).json();
    assert.equal(activity.entries.filter((entry) => entry.kind === "translation-completed").length, 1, JSON.stringify(activity.entries));
  } finally {
    releaseFirst?.();
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps unsupported background OpenSpec shapes distinct from temporary unavailability", async () => {
  const root = await createFixture({ name: "unsupported-background-shape", statusJson: { futureArtifacts: [] } });
  const instance = await startWorkbench(root);
  const headers = { Authorization: `Bearer ${instance.token}` };
  try {
    assert.equal((await request(instance, "/api/snapshot", { headers })).status, 200);
    assert.equal((await (await request(instance, "/api/change/example-change", { headers })).json()).validation.state, "pending");
    let detail = { validation: { state: "pending" } };
    for (let attempt = 0; attempt < 40 && detail.validation.state === "pending"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      detail = await (await request(instance, "/api/change/example-change", { headers })).json();
    }
    assert.equal(detail.validation.state, "unsupported");
    assert.match(detail.validation.message, /not supported/u);
    const activity = await (await request(instance, "/api/activity", { headers })).json();
    assert.equal(activity.entries.some((entry) => entry.kind === "verification-failed" && entry.data.validationState === "unsupported"), true);
    assert.equal(activity.entries.some((entry) => entry.kind === "verification-completed"), false);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("starts safely and reports an explicit bounded-content error for oversized OpenSpec trees", async () => {
  const root = await createFixture({ name: "oversized-openspec" });
  await writeFile(path.join(root, "openspec/changes/example-change/proposal.md"), Buffer.alloc(2 * 1024 * 1024 + 1, 97));
  const instance = await startWorkbench(root);
  try {
    const response = await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "OPEN_SPEC_CONTENT_LIMIT");
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("translates the current server projection through an explicitly authorized adapter", async () => {
  const root = await createFixture({ name: "translation-runtime" });
  let adapterCalls = 0;
  const adapter = {
    id: `e2e-agy-fixture-${Date.now()}`,
    async translate(blocks) {
      adapterCalls += 1;
      return { translations: blocks.map((block) => ({ id: block.id, text: `UK ${block.text}` })), usage: { inputTokens: 12, outputTokens: 8, costUsd: 0 } };
    },
  };
  const instance = await startWorkbench(root, 0, adapter);
  try {
    assert.equal((await request(instance, "/translation-worker.js")).status, 401);
    const endpoint = "/api/change/example-change/translation";
    assert.equal((await request(instance, endpoint, { method: "POST" })).status, 401);
    assert.equal((await request(instance, endpoint)).status, 401);
    assert.equal((await request(instance, endpoint, { headers: { Authorization: `Bearer ${instance.token}` } })).status, 400);
    const providersResponse = await request(instance, "/api/translation/providers", { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(providersResponse.status, 200);
    const providerBody = await providersResponse.json();
    assert.deepEqual(providerBody.providers.map((provider) => provider.id), ["agy", "claude", "codex", "gemini", "qwen", "kimi", "ollama"]);
    assert.equal(providerBody.providers.find((provider) => provider.id === "agy").available, true);
    assert.doesNotMatch(JSON.stringify(providerBody), /\/Users\/|\/Volumes\/|executable|arguments|environment/iu);
    const cachedBefore = await request(instance, `${endpoint}?provider=agy`, { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(cachedBefore.status, 200);
    const cachedBeforeValue = await cachedBefore.json();
    assert.equal(cachedBeforeValue.usage.missingBlocks > 0, true);
    assert.equal(adapterCalls, 0);
    assert.equal((await request(instance, endpoint, { method: "POST", headers: { Authorization: `Bearer ${instance.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "agy" }) })).status, 403);
    assert.equal((await request(instance, endpoint, { method: "POST", headers: { Authorization: `Bearer ${instance.token}`, "Content-Type": "application/json", "X-OpenSpec-Client": "1" }, body: JSON.stringify({ provider: "unsupported" }) })).status, 400);
    assert.equal((await request(instance, endpoint, { method: "POST", headers: { Authorization: `Bearer ${instance.token}`, "Content-Type": "application/json", "X-OpenSpec-Client": "1" }, body: JSON.stringify({ provider: "agy", executable: "/bin/sh", args: ["-c", "id"] }) })).status, 400);
    const response = await request(instance, endpoint, { method: "POST", headers: { Authorization: `Bearer ${instance.token}`, "Content-Type": "application/json", "X-OpenSpec-Client": "1" }, body: JSON.stringify({ provider: "agy" }) });
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.values.title.startsWith("UK "), true);
    assert.equal(value.usage.inputTokens, 12);
    assert.equal(value.usage.adapterId, adapter.id);
    assert.equal(adapterCalls, 1);
    const cachedAfter = await request(instance, `${endpoint}?provider=agy`, { headers: { Authorization: `Bearer ${instance.token}` } });
    const cachedAfterValue = await cachedAfter.json();
    assert.equal(cachedAfterValue.values.title.startsWith("UK "), true);
    assert.equal(cachedAfterValue.usage.missingBlocks, 0);
    assert.equal(adapterCalls, 1);
    const activity = await (await request(instance, "/api/activity", { headers: { Authorization: `Bearer ${instance.token}` } })).json();
    assert.equal(activity.entries.some((entry) => entry.kind === "translation-started" && entry.data.changeId === "example-change" && entry.data.providerId === "agy"), true);
    assert.equal(activity.entries.some((entry) => entry.kind === "translation-completed" && entry.data.translatedBlocks > 0 && entry.data.providerId === "agy"), true);
    assert.doesNotMatch(JSON.stringify(activity), /UK |token|stderr|prompt/iu);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("returns to a fresh projection after an authoritative reread", async () => {
  const root = await createFixture();
  const instance = await startWorkbench(root);
  try {
    await writeFile(path.join(root, "freshness.txt"), "next\n", "utf8");
    await command("git", ["add", "."], root);
    await command("git", ["commit", "-qm", "freshness"], root);
    const response = await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).stale, false);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects hostile Host, Origin, method, traversal and cross-root selection", async () => {
  const root = await createFixture();
  const second = await createFixture({ name: "second-project" });
  const instance = await startWorkbench(root);
  try {
    assert.equal(await rawStatus(instance, "/api/health", { Authorization: `Bearer ${instance.token}`, Host: "evil.invalid" }), 403);
    assert.equal((await request(instance, "/api/health", { headers: { Authorization: `Bearer ${instance.token}`, Origin: "https://evil.invalid" } })).status, 403);
    assert.equal((await request(instance, "/api/health", { method: "POST", headers: { Authorization: `Bearer ${instance.token}` } })).status, 405);
    assert.notEqual((await request(instance, `/?token=${encodeURIComponent(instance.token)}`, { method: "POST" })).status, 200);
    assert.equal((await request(instance, "/api/change/%2e%2e%2fsecret", { headers: { Authorization: `Bearer ${instance.token}` } })).status, 400);
    const snapshot = await (await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } })).json();
    assert.equal(snapshot.projectName, "fixture-project");
    assert.notEqual(snapshot.projectName, "second-project");
    const page = await request(instance, `/?token=${encodeURIComponent(instance.token)}`);
    const csp = page.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'none'/u);
    assert.match(csp, /script-src 'self'/u);
    assert.doesNotMatch(csp, /(?:blob:|wasm-unsafe-eval)/u);
    assert.doesNotMatch(csp, /'unsafe-(?:inline|eval)'/u);
    assert.match(await page.text(), /OpenSpec Workbench/u);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("launches the explicit standalone runtime without creating consumer state", async () => {
  const root = await createFixture();
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const builtRuntime = path.resolve(testDirectory, "../.workbench-build/server.mjs");
  const beforeConsumer = await state(root);
  const child = spawn(process.execPath, [builtRuntime, "project", "--root", await realpath(root)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const url = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Pinned runtime did not start.")), 10_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/u.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { if (code !== null) { clearTimeout(timer); reject(new Error(`Pinned runtime exited with ${code}.`)); } });
    });
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.deepEqual(await state(root), beforeConsumer);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary runtime launch opens the Hub and advanced project mode requires an explicit canonical root", async () => {
  const root = await createFixture({ name: "startup-contract" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-startup-state-"));
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.workbench-build/server.mjs");
  const ordinary = await launchRuntimeUntilOutput(runtime, ["--state-dir", stateDirectory], root);
  try {
    assert.equal(ordinary.outcome.kind, "listening");
    assert.match(ordinary.output, /OpenSpec Projects Hub/u);
    assert.doesNotMatch(ordinary.output, /OpenSpec Workbench/u);
  } finally {
    await stopRuntime(ordinary.child);
  }

  const missingRoot = await launchRuntimeUntilOutput(runtime, ["project"], root);
  try {
    assert.equal(missingRoot.outcome.kind, "exit");
    assert.notEqual(missingRoot.outcome.code, 0);
    assert.match(missingRoot.errorOutput, /ROOT_REQUIRED/u);
  } finally {
    await stopRuntime(missingRoot.child);
  }

  const relativeRoot = await launchRuntimeUntilOutput(runtime, ["project", "--root", "."], root);
  try {
    assert.equal(relativeRoot.outcome.kind, "exit");
    assert.notEqual(relativeRoot.outcome.code, 0);
    assert.match(relativeRoot.errorOutput, /ROOT_ABSOLUTE_REQUIRED/u);
  } finally {
    await stopRuntime(relativeRoot.child);
  }

  const project = await launchRuntimeUntilOutput(runtime, ["project", "--root", await realpath(root)], root);
  try {
    assert.equal(project.outcome.kind, "listening");
    assert.match(project.output, /OpenSpec Workbench/u);
  } finally {
    await stopRuntime(project.child);
  }

  const rootWithTrailingSeparator = `${await realpath(root)}${path.sep}`;
  const normalizedProject = await launchRuntimeUntilOutput(runtime, ["project", "--root", rootWithTrailingSeparator], root);
  try {
    assert.equal(normalizedProject.outcome.kind, "listening");
    assert.match(normalizedProject.output, /OpenSpec Workbench/u);
  } finally {
    await stopRuntime(normalizedProject.child);
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("one-root child does not expose Hub registration routes", async () => {
  const root = await createFixture();
  const instance = await startWorkbench(root);
  try {
    const headers = { Authorization: `Bearer ${instance.token}` };
    assert.equal((await request(instance, "/api/bootstrap", { headers })).status, 404);
    assert.equal((await request(instance, "/api/project-registration-intents", { headers })).status, 404);
  } finally {
    await instance.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Hub lists differing supported standards pins and opens isolated verified project instances", async () => {
  const first = await createFixture({ name: "hub-first", standardsVersion: "v1.6.1" });
  const second = await createFixture({ name: "hub-second", standardsVersion: "v1.8.0" });
  const hidden = await createFixture({ name: "hub-hidden" });
  const stale = await createFixture({ name: "hub-stale" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-hub-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const firstProject = await registry.register(first, "First project");
  await registry.register(second, "Second project");
  await registry.register(stale, "Stale project");
  await rm(stale, { recursive: true, force: true });
  const hub = await startHub(registry);
  try {
    assert.equal((await request(hub, `/?token=${hub.token}`)).status, 200);
    assert.equal((await request(hub, "/")).status, 200);
    assert.equal((await request(hub, "/?token=wrong")).status, 401);
    assert.equal((await request(hub, "/api/bootstrap")).status, 401);
    assert.equal((await request(hub, "/api/projects")).status, 401);
    assert.equal(await rawStatus(hub, "/api/projects", { Authorization: `Bearer ${hub.token}`, Host: "evil.invalid" }), 403);
    assert.equal((await request(hub, "/api/projects", { headers: { Authorization: `Bearer ${hub.token}`, Origin: "https://evil.invalid" } })).status, 403);
    const projectsResponse = await request(hub, "/api/projects", { headers: { Authorization: `Bearer ${hub.token}` } });
    const projects = await projectsResponse.json();
    assert.deepEqual(projects.map((project) => project.label), ["First project", "Second project", "Stale project"]);
    assert.equal(projects.some((project) => project.root === hidden), false);
    assert.equal(projects.find((project) => project.label === "Stale project")?.available, false);
    const bootstrap = await (await request(hub, "/api/bootstrap", { headers: { Authorization: `Bearer ${hub.token}` } })).json();
    assert.equal(bootstrap.registrationAvailable, process.platform === "darwin" || process.platform === "win32");
    const launchResponse = await request(hub, `/api/project/${firstProject.id}/open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hub.token}`,
        Origin: hub.origin,
        "X-OpenSpec-Client": "1",
        "X-OpenSpec-CSRF": bootstrap.csrf,
        "Sec-Fetch-Site": "same-origin",
      },
    });
    assert.equal(launchResponse.status, 200);
    const launch = await launchResponse.json();
    const identity = await (await fetch(`${new URL(launch.url).origin}/api/identity`, { headers: { Authorization: `Bearer ${new URL(launch.url).searchParams.get("token")}` } })).json();
    assert.equal(identity.root, await realpath(first));
    assert.notEqual(identity.root, await realpath(second));
    assert.equal(await readFixture(first, "standards.version"), "v1.6.1\n");
    assert.equal(await readFixture(second, "standards.version"), "v1.8.0\n");
  } finally {
    await hub.close();
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
    await rm(hidden, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("Hub hides native registration when its folder picker is unavailable", async () => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-unsupported-picker-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const picker = {
    available: false,
    async pick() { throw new Error("unreachable"); },
  };
  const hub = await startHub(registry, 0, undefined, undefined, picker);
  try {
    const bootstrap = await (await request(hub, "/api/bootstrap", {
      headers: { Authorization: `Bearer ${hub.token}` },
    })).json();
    assert.equal(bootstrap.registrationAvailable, false);
  } finally {
    await hub.close();
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("portable capability Hub registers a chosen folder without accepting browser paths", async () => {
  const root = await createFixture({ name: "portable-picked" });
  const before = await state(root);
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-portable-picker-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  let pickerCalls = 0;
  const picker = { async pick() { pickerCalls += 1; return root; } };
  const hub = await startHub(registry, 0, undefined, undefined, picker);
  try {
    assert.equal((await request(hub, "/api/bootstrap")).status, 401);
    const authorization = { Authorization: `Bearer ${hub.token}` };
    const bootstrap = await (await request(hub, "/api/bootstrap", { headers: authorization })).json();
    assert.equal(bootstrap.registrationAvailable, true);
    const mutationHeaders = {
      ...authorization,
      Origin: hub.origin,
      "X-OpenSpec-Client": "1",
      "X-OpenSpec-CSRF": bootstrap.csrf,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    };
    const { Origin: _omittedOrigin, ...missingOriginHeaders } = mutationHeaders;
    assert.equal((await request(hub, "/api/project-registration-intents", {
      method: "POST",
      headers: missingOriginHeaders,
      body: JSON.stringify({ operation: "add" }),
    })).status, 403);
    assert.equal((await request(hub, "/api/project-registration-intents", {
      method: "POST",
      headers: { ...mutationHeaders, "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ operation: "add" }),
    })).status, 403);
    const wrongCsrf = await request(hub, "/api/project-registration-intents", {
      method: "POST",
      headers: { ...mutationHeaders, "X-OpenSpec-CSRF": "wrong" },
      body: JSON.stringify({ operation: "add" }),
    });
    assert.equal(wrongCsrf.status, 403);
    assert.equal(pickerCalls, 0);
    const pathBearing = await request(hub, "/api/project-registration-intents", {
      method: "POST", headers: mutationHeaders, body: JSON.stringify({ operation: "add", path: root }),
    });
    assert.equal(pathBearing.status, 400);
    assert.equal(pickerCalls, 0);
    let intent = await (await request(hub, "/api/project-registration-intents", {
      method: "POST", headers: mutationHeaders, body: JSON.stringify({ operation: "add" }),
    })).json();
    for (let attempt = 0; attempt < 40 && intent.state === "selecting"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      intent = await (await request(hub, `/api/project-registration-intents/${intent.id}`, { headers: authorization })).json();
    }
    assert.equal(intent.state, "preview");
    const confirmed = await request(hub, `/api/project-registration-intents/${intent.id}/confirm`, {
      method: "POST", headers: mutationHeaders, body: JSON.stringify({ label: "Portable project" }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).result.label, "Portable project");
    assert.equal(pickerCalls, 1);
    assert.deepEqual((await registry.list()).map((project) => project.label), ["Portable project"]);
    assert.deepEqual(await state(root), before);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("trusted local proxy Hub enforces exact authority while retaining child capabilities", async () => {
  const root = await createFixture({ name: "trusted-hub" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-trusted-hub-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const project = await registry.register(root, "Trusted project");
  const hub = await startHub(registry, 0, undefined, "https://plans.internal");
  try {
    const csrf = (await (await trustedHubRequest(hub, "/api/bootstrap")).json()).csrf;
    assert.equal(hub.url, "https://plans.internal/");
    const page = await trustedHubRequest(hub, "/");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("access-control-allow-origin"), null);
    assert.equal(page.headers.get("cross-origin-resource-policy"), "same-origin");

    const projects = await trustedHubRequest(hub, "/api/projects");
    assert.equal(projects.status, 200);
    assert.deepEqual((await projects.json()).map((item) => item.label), ["Trusted project"]);
    assert.equal((await trustedHubRequest(hub, "/api/projects", { headers: { Origin: "https://plans.internal" } })).status, 200);
    assert.equal((await trustedHubRequest(hub, "/api/projects", { headers: { Origin: "https://evil.invalid" } })).status, 403);
    assert.equal((await trustedHubRequest(hub, "/api/projects", { headers: { Origin: "null" } })).status, 403);
    assert.equal(await rawStatus(hub, "/api/projects", { Host: "evil.invalid", "X-Forwarded-Host": "plans.internal" }), 403);

    const foreignTarget = await rawRequest(hub, "https://evil.invalid/api/projects", { headers: { Host: "plans.internal" } });
    assert.equal(foreignTarget.status, 403);
    assert.equal(foreignTarget.headers["access-control-allow-origin"], undefined);

    const openPath = `/api/project/${project.id}/open`;
    assert.equal((await trustedHubRequest(hub, openPath, { method: "POST" })).status, 403);
    assert.equal((await trustedHubRequest(hub, openPath, { method: "POST", headers: { Origin: "https://plans.internal" } })).status, 403);
    assert.equal((await trustedHubRequest(hub, openPath, { method: "POST", headers: { Origin: "https://plans.internal", "X-OpenSpec-Client": "1", "Sec-Fetch-Site": "cross-site" } })).status, 403);

    const launchResponse = await trustedHubRequest(hub, openPath, {
      method: "POST",
      headers: { Origin: "https://plans.internal", "X-OpenSpec-Client": "1", "X-OpenSpec-CSRF": csrf, "Sec-Fetch-Site": "same-origin" },
    });
    assert.equal(launchResponse.status, 200);
    assert.equal(launchResponse.headers.get("access-control-allow-origin"), null);
    const launch = await launchResponse.json();
    assert.equal(launch.path, `/projects/${project.id}/`);
    assert.doesNotMatch(JSON.stringify(launch), /token|127\.0\.0\.1|capability/u);
    const stablePage = await trustedHubRequest(hub, launch.path);
    assert.equal(stablePage.status, 200);
    assert.match(await stablePage.text(), /OpenSpec Workbench/u);
    const stableSnapshot = await trustedHubRequest(hub, `${launch.path}api/snapshot`);
    assert.equal(stableSnapshot.status, 200);
    assert.equal((await stableSnapshot.json()).projectName, "trusted-hub");
    const stableActivity = await trustedHubRequest(hub, `${launch.path}api/activity`);
    assert.equal(stableActivity.status, 200);
    assert.equal((await stableActivity.json()).scope, "process");
    assert.equal((await trustedHubRequest(hub, `${launch.path}api/translation-model/status`)).status, 404);
    assert.equal((await trustedHubRequest(hub, `${launch.path}api/change/example-change/translation`, { method: "POST" })).status, 403);
    assert.equal((await trustedHubRequest(hub, `${launch.path}client.js`)).status, 200);
    const projectFavicon = await trustedHubRequest(hub, `${launch.path}favicon.svg`);
    assert.equal(projectFavicon.status, 200);
    assert.match(projectFavicon.headers.get("content-type") ?? "", /image\/svg\+xml/u);
    const eventResponse = await readEvent(hub, `${launch.path}api/events`, { Host: "plans.internal" });
    assert.equal(eventResponse.status, 200);
    assert.match(eventResponse.headers["content-type"] ?? "", /text\/event-stream/u);
    assert.match(eventResponse.body, /event: ready/u);

    const preflight = await trustedHubRequest(hub, openPath, { method: "OPTIONS", headers: { Origin: "https://evil.invalid" } });
    assert.equal(preflight.status, 405);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("a stable project bookmark resolves the new root after atomic rebind", async () => {
  const oldRoot = await createFixture({ name: "bookmark-old" });
  const newRoot = await createFixture({ name: "bookmark-new" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-rebind-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const project = await registry.register(oldRoot, "Stable slot");
  const hub = await startHub(registry, 0, undefined, "https://plans.internal");
  const stablePath = `/projects/${project.id}/api/snapshot`;
  try {
    assert.equal((await (await trustedHubRequest(hub, stablePath)).json()).projectName, "bookmark-old");
    const rebound = await registry.rebind(project.id, project.revision, newRoot, "Stable slot");
    assert.equal(rebound.project.id, project.id);
    assert.equal(rebound.project.revision, 2);
    assert.equal((await (await trustedHubRequest(hub, stablePath)).json()).projectName, "bookmark-new");
  } finally {
    await hub.close();
    await rm(oldRoot, { recursive: true, force: true });
    await rm(newRoot, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("a cached linked-worktree bookmark rejects an unrelated repository recreated at the same path", async () => {
  const root = await createFixture({ name: "linked-authority-root" });
  const linked = `${root}-linked-authority`;
  const foreignOriginal = await createFixture({ name: "foreign-linked-replacement" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-linked-authority-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  let hub;
  try {
    await command("git", ["worktree", "add", "-q", "-b", "linked-authority", linked], root);
    const project = await registry.register(root, "Linked authority");
    const branch = (await discoverLocalBranches(root)).find((item) => item.name === "linked-authority");
    assert.equal(branch?.openable, true);
    hub = await startHub(registry, 0, undefined, "https://plans.internal");
    const stablePath = `/projects/${project.id}/worktrees/${branch.worktreeId}/api/snapshot`;
    assert.equal((await trustedHubRequest(hub, stablePath)).status, 200);
    await command("git", ["worktree", "remove", "--force", linked], root);
    await rename(foreignOriginal, linked);
    const replaced = await trustedHubRequest(hub, stablePath);
    assert.equal(replaced.status, 409);
    assert.equal((await replaced.json()).error.code, "WORKTREE_UNAVAILABLE");
  } finally {
    await hub?.close();
    await command("git", ["worktree", "remove", "--force", linked], root).catch(() => undefined);
    await rm(linked, { recursive: true, force: true });
    await rm(foreignOriginal, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("trusted Hub removes only the selected registration with revision and authority checks", async () => {
  const root = await createFixture({ name: "removable-project" });
  const before = await state(root);
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-removal-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const project = await registry.register(root, "Old project");
  const hub = await startHub(registry, 0, undefined, "https://plans.internal");
  const mutationHeaders = { Origin: "https://plans.internal", "X-OpenSpec-Client": "1", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
  try {
    const csrf = (await (await trustedHubRequest(hub, "/api/bootstrap")).json()).csrf;
    const unauthorized = await trustedHubRequest(hub, `/api/projects/${project.id}`, {
      method: "DELETE", headers: { ...mutationHeaders, "If-Match": `"${project.revision}"` },
    });
    assert.equal(unauthorized.status, 403);
    const pathBearing = await trustedHubRequest(hub, `/api/projects/${project.id}?root=${encodeURIComponent(root)}`, {
      method: "DELETE", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf, "If-Match": `"${project.revision}"` },
    });
    assert.equal(pathBearing.status, 400);
    const stale = await trustedHubRequest(hub, `/api/projects/${project.id}`, {
      method: "DELETE", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf, "If-Match": `"${project.revision + 1}"` },
    });
    assert.equal(stale.status, 409);
    assert.deepEqual(await registry.list(), [project]);
    const removed = await trustedHubRequest(hub, `/api/projects/${project.id}`, {
      method: "DELETE", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf, "If-Match": `"${project.revision}"` },
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).removed.label, "Old project");
    assert.deepEqual(await registry.list(), []);
    assert.equal((await trustedHubRequest(hub, `/projects/${project.id}/api/snapshot`)).status, 404);
    assert.deepEqual(await state(root), before);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("trusted Hub registers a chosen folder only after preview confirmation", async () => {
  const root = await createFixture({ name: "picked-project", standardsVersion: "v1.9.0" });
  const replacement = await createFixture({ name: "replacement-project" });
  const before = await state(root);
  const replacementBefore = await state(replacement);
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-picker-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  let pickerCalls = 0;
  const selections = [root, replacement];
  const picker = { async pick() { pickerCalls += 1; return selections.shift() ?? null; } };
  const hub = await startHub(registry, 0, undefined, "https://plans.internal", picker);
  const mutationHeaders = { Origin: "https://plans.internal", "X-OpenSpec-Client": "1", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
  try {
    const csrf = (await (await trustedHubRequest(hub, "/api/bootstrap")).json()).csrf;
    const unauthorized = await trustedHubRequest(hub, "/api/project-registration-intents", {
      method: "POST", headers: mutationHeaders, body: JSON.stringify({ operation: "add", path: root }),
    });
    assert.equal(unauthorized.status, 403);
    const malformed = await trustedHubRequest(hub, "/api/project-registration-intents", {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ operation: "add", path: root }),
    });
    assert.equal(malformed.status, 400);
    assert.equal(pickerCalls, 0);
    const startedResponse = await trustedHubRequest(hub, "/api/project-registration-intents", {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ operation: "add" }),
    });
    assert.equal(startedResponse.status, 202);
    const started = await startedResponse.json();
    let intent = started;
    for (let attempt = 0; attempt < 40 && intent.state === "selecting"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      intent = await (await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}`)).json();
    }
    assert.equal(intent.state, "preview");
    assert.equal(intent.preview.root, await realpath(root));
    assert.deepEqual(await registry.list(), []);
    const confirmed = await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}/confirm`, {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ label: "My picked project" }),
    });
    assert.equal(confirmed.status, 200);
    const registered = (await confirmed.json()).result;
    assert.equal(registered.label, "My picked project");
    assert.equal(registered.revision, 1);
    assert.equal(pickerCalls, 1);
    const repeated = await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}/confirm`, {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ label: "Repeated" }),
    });
    assert.equal(repeated.status, 409);

    const rebindStarted = await (await trustedHubRequest(hub, "/api/project-registration-intents", {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ operation: "rebind", projectId: registered.id, expectedRevision: registered.revision }),
    })).json();
    let rebindIntent = rebindStarted;
    for (let attempt = 0; attempt < 40 && rebindIntent.state === "selecting"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      rebindIntent = await (await trustedHubRequest(hub, `/api/project-registration-intents/${rebindIntent.id}`)).json();
    }
    assert.equal(rebindIntent.state, "preview");
    const reboundResponse = await trustedHubRequest(hub, `/api/project-registration-intents/${rebindIntent.id}/confirm`, {
      method: "POST", headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf }, body: JSON.stringify({ label: "Moved project" }),
    });
    assert.equal(reboundResponse.status, 200);
    const rebound = (await reboundResponse.json()).result;
    assert.equal(rebound.id, registered.id);
    assert.equal(rebound.revision, 2);
    assert.equal(rebound.root, await realpath(replacement));
    assert.equal((await (await trustedHubRequest(hub, `/projects/${registered.id}/api/snapshot`)).json()).projectName, "replacement-project");
    assert.equal(pickerCalls, 2);
    assert.deepEqual(await state(root), before);
    assert.deepEqual(await state(replacement), replacementBefore);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
    await rm(replacement, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("registration confirmation fails closed when OpenSpec configuration changes after preview", async () => {
  const root = await createFixture({ name: "changed-candidate" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-changed-candidate-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const picker = { async pick() { return root; } };
  const hub = await startHub(registry, 0, undefined, "https://plans.internal", picker);
  const mutationHeaders = { Origin: "https://plans.internal", "X-OpenSpec-Client": "1", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
  try {
    const csrf = (await (await trustedHubRequest(hub, "/api/bootstrap")).json()).csrf;
    let intent = await (await trustedHubRequest(hub, "/api/project-registration-intents", {
      method: "POST",
      headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf },
      body: JSON.stringify({ operation: "add" }),
    })).json();
    for (let attempt = 0; attempt < 40 && intent.state === "selecting"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      intent = await (await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}`)).json();
    }
    assert.equal(intent.state, "preview");
    await writeFile(path.join(root, "openspec/config.yaml"), "schema: spec-driven\ncontext: changed-after-preview\n", "utf8");
    const confirmation = await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}/confirm`, {
      method: "POST",
      headers: { ...mutationHeaders, "X-OpenSpec-CSRF": csrf },
      body: JSON.stringify({ label: "Changed candidate" }),
    });
    assert.equal(confirmation.status, 409);
    assert.equal((await confirmation.json()).error.code, "REGISTRATION_CANDIDATE_CHANGED");
    const failedIntent = await (await trustedHubRequest(hub, `/api/project-registration-intents/${intent.id}`)).json();
    assert.equal(failedIntent.state, "error");
    assert.equal(failedIntent.error.code, "REGISTRATION_CANDIDATE_CHANGED");
    assert.deepEqual(await registry.list(), []);
  } finally {
    await hub.close();
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("built runtime exposes explicit register, projects and remove CLI commands", async () => {
  const root = await createFixture({ name: "cli-project" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-cli-state-"));
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.workbench-build/server.mjs");
  try {
    const registered = JSON.parse((await command(process.execPath, [runtime, "register", "--root", root, "--label", "CLI project", "--state-dir", stateDirectory], root)).stdout);
    assert.equal(registered.label, "CLI project");
    const listed = JSON.parse((await command(process.execPath, [runtime, "projects", "--state-dir", stateDirectory], root)).stdout);
    assert.deepEqual(listed.projects, [registered]);
    const removed = JSON.parse((await command(process.execPath, [runtime, "remove", "--project", registered.id, "--state-dir", stateDirectory], root)).stdout);
    assert.equal(removed.removed, registered.id);
    assert.deepEqual(JSON.parse((await command(process.execPath, [runtime, "projects", "--state-dir", stateDirectory], root)).stdout).projects, []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("branch navigation opens an existing worktree without changing repository state", async () => {
  const root = await createFixture({ name: "branch-root" });
  const linked = `${root}-linked`;
  await command("git", ["worktree", "add", "-q", "-b", "linked-plans", linked], root);
  const beforeRoot = await state(root);
  const beforeLinked = await state(linked);
  const instance = await startWorkbench(root);
  try {
    const snapshot = await (await request(instance, "/api/snapshot", { headers: { Authorization: `Bearer ${instance.token}` } })).json();
    const linkedBranch = snapshot.branches.all.find((branch) => branch.name === "linked-plans");
    assert.equal(linkedBranch.openable, true);
    const response = await request(instance, `/api/worktree/${linkedBranch.worktreeId}/open`, { method: "POST", headers: { Authorization: `Bearer ${instance.token}` } });
    assert.equal(response.status, 200);
    const launch = await response.json();
    assert.equal(launch.identity.root, await realpath(linked));
    assert.deepEqual(await state(root), beforeRoot);
    assert.deepEqual(await state(linked), beforeLinked);
  } finally {
    await instance.close();
    await command("git", ["worktree", "remove", "--force", linked], root).catch(() => undefined);
    await rm(linked, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
