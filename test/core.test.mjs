import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  ActivityJournal,
  AgyTranslationAdapter,
  CliTranslationAdapter,
  SnapshotWatcher,
  TranslationCache,
  TranslationService,
  TranslationProviderRegistry,
  WorkbenchError,
  ProjectRegistry,
  RegistrationIntents,
  WindowsFolderPicker,
  adaptArtifactStatus,
  adaptChangeList,
  adaptDoctor,
  adaptValidation,
  arrangeChangeTree,
  buildChangeDetail,
  buildChangePreview,
  buildSnapshot,
  createPinnedOpenSpecRunner,
  classifyAgyFailureForTesting,
  buildCliInvocation,
  createNativeFolderPicker,
  discoverOllamaModels,
  decodeMacFolderPickerOutputForTesting,
  decodeWindowsFolderPickerOutputForTesting,
  detectGitDirtyForTesting,
  deriveTreeParents,
  discoverGitSnapshot,
  discoverLocalBranches,
  inspectOpenSpecCandidate,
  isArchiveReadyChange,
  isCompletedChange,
  maskProtectedText,
  npmCliCandidatesForTesting,
  openSpecContentIdentity,
  openSpecContentState,
  parseExplicitChangeDependencies,
  parseSections,
  parseAgyTranslationOutput,
  parseCliTranslationOutput,
  parseTasks,
  projectBranchNavigation,
  runGitCommandForTesting,
  restoreProtectedText,
  safeReadProjectFile,
  screenTranslationBlock,
  translationCacheKey,
  translationProviderIds,
  isTranslationProviderId,
  isTranslationProviderPreference,
  OllamaTranslationAdapter,
  runBoundedProcess,
  validateOllamaModel,
  validateRegisteredProject,
  validateRegisteredProjectRoot,
} from "../.workbench-build/testing.mjs";
import { command, createFixture, makeEscapeSymlink, state } from "./fixture.mjs";

const fakeGit = new URL("./fixtures/fake-git.mjs", import.meta.url).pathname;

test("retains only bounded closed-schema activity with monotonic ids", () => {
  let tick = 0;
  const journal = new ActivityJournal(3, () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
  const emitted = [];
  journal.on("entry", (entry) => emitted.push(entry));
  journal.append("snapshot-refresh-started");
  journal.append("verification-started", { changeId: "safe-change" });
  journal.append("translation-started", { changeId: "safe-change", missingBlocks: 4 });
  journal.append("translation-completed", { changeId: "safe-change", translatedBlocks: 4 });
  assert.deepEqual(journal.list().map((entry) => entry.id), [4, 3, 2]);
  assert.equal(journal.list()[0].data.translatedBlocks, 4);
  assert.equal(emitted.length, 4);
  assert.throws(() => journal.append("translation-started", { changeId: "../../secret" }), /identifiers/u);
  assert.doesNotThrow(() => journal.append("verification-started", { changeId: `a${"b".repeat(254)}` }));
  assert.throws(() => journal.append("verification-started", { changeId: `a${"b".repeat(255)}` }), /identifiers/u);
  assert.throws(() => journal.append("translation-started", { missingBlocks: -1 }), /bounded/u);
  assert.doesNotThrow(() => journal.append("source-change-detected", { paths: ["openspec/changes/safe-change/tasks.md"], additionalPaths: 2 }));
  assert.doesNotThrow(() => journal.append("head-change-detected", { previousRevision: "0123456789", revision: "abcdef0123" }));
  assert.throws(() => journal.append("source-change-detected", { paths: ["/Users/example/secret.md"] }), /relative OpenSpec/u);
  assert.throws(() => journal.append("source-change-detected", { paths: ["openspec/../secret.md"] }), /relative OpenSpec/u);
  assert.throws(() => journal.append("source-change-detected", { paths: ["openspec/changes/bad\u202Ename.md"] }), /relative OpenSpec/u);
  assert.throws(() => journal.append("source-change-detected", { paths: Array.from({ length: 13 }, (_, index) => `openspec/${index}.md`) }), /bounded list/u);
  assert.throws(() => journal.append("head-change-detected", { previousRevision: "0123456" }), /revision/u);
  const sourceEntry = journal.list().find((entry) => entry.kind === "source-change-detected");
  sourceEntry.data.paths[0] = "openspec/mutated.md";
  assert.equal(journal.list().find((entry) => entry.kind === "source-change-detected").data.paths[0], "openspec/changes/safe-change/tasks.md");
  assert.throws(() => new ActivityJournal(0), /retention/u);
});

test("rejects a missing or non-OpenSpec root", async () => {
  const empty = await mkdtemp(path.join(os.tmpdir(), "owb-invalid-"));
  await assert.rejects(discoverGitSnapshot(empty), (error) => error?.code === "INVALID_GIT_ROOT");
  await rm(empty, { recursive: true, force: true });
});

test("classifies bounded Git failures without leaking command diagnostics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "owb-git-errors-"));
  try {
    await assert.rejects(
      runGitCommandForTesting(path.join(root, "missing-git"), [], root, ["version"]),
      (error) => error?.code === "GIT_UNAVAILABLE",
    );
    await assert.rejects(
      runGitCommandForTesting(process.execPath, [fakeGit, "timeout"], root, ["version"], { timeoutMs: 20 }),
      (error) => error?.code === "GIT_TIMEOUT",
    );
    await assert.rejects(
      runGitCommandForTesting(process.execPath, [fakeGit, "overflow"], root, ["version"], { maxBytes: 64 }),
      (error) => error?.code === "GIT_OUTPUT_LIMIT",
    );
    await assert.rejects(
      runGitCommandForTesting(process.execPath, [fakeGit, "failure"], root, ["version"]),
      (error) => error?.code === "GIT_COMMAND_FAILED" && !error.message.includes("secret raw"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dirty-state inspection stops after the first porcelain record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "owb-git-dirty-"));
  try {
    const started = Date.now();
    assert.equal(await detectGitDirtyForTesting(process.execPath, [fakeGit, "dirty"], root, { timeoutMs: 2_000 }), true);
    assert.ok(Date.now() - started < 1_000);
    assert.equal(await detectGitDirtyForTesting(process.execPath, [fakeGit, "clean"], root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovers branch, revision, dirty and detached worktree state", async () => {
  const root = await createFixture();
  const clean = await discoverGitSnapshot(root);
  assert.equal(clean.dirty, false);
  assert.equal(clean.detached, false);
  assert.equal(clean.operation, "normal");
  await writeFile(path.join(root, "dirty.txt"), "dirty\n");
  assert.equal((await discoverGitSnapshot(root)).dirty, true);
  await command("git", ["checkout", "--detach", "-q"], root);
  assert.equal((await discoverGitSnapshot(root)).detached, true);
  await rm(root, { recursive: true, force: true });
});

test("contains artifact reads after symlink resolution and size checks", async () => {
  const root = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "owb-outside-"));
  const secret = path.join(outside, "secret.md");
  await writeFile(secret, "private\n");
  await makeEscapeSymlink(root, secret);
  await assert.rejects(safeReadProjectFile(root, "openspec/changes/example-change/escape.md"), /outside/u);
  await assert.rejects(safeReadProjectFile(root, "../secret.md"), /invalid/u);
  await writeFile(path.join(root, "openspec/changes/example-change/large.md"), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(safeReadProjectFile(root, "openspec/changes/example-change/large.md"), /too large/u);
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("previews only an exact structural OpenSpec worktree without running its CLI", async () => {
  const root = await createFixture({ name: "candidate-project" });
  const nested = path.join(root, "nested");
  const link = `${root}-link`;
  try {
    await mkdir(nested);
    const before = await state(root);
    const candidate = await inspectOpenSpecCandidate(root);
    assert.equal(candidate.root, await realpath(root));
    assert.equal(candidate.kind, "primary");
    assert.deepEqual(await state(root), before);
    await assert.rejects(inspectOpenSpecCandidate(nested), (error) => error?.code === "PROJECT_ROOT_REQUIRED");
    await symlink(root, link, "dir");
    await assert.rejects(inspectOpenSpecCandidate(link), (error) => error?.code === "INVALID_ROOT");
    await rm(path.join(root, "openspec/config.yaml"));
    await assert.rejects(inspectOpenSpecCandidate(root), (error) => error?.code === "OPEN_SPEC_REQUIRED");
  } finally {
    await rm(link, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("registration intents serialize picker use, cancel safely, and expire", async () => {
  let resolvePick;
  const picker = { pick: () => new Promise((resolve) => { resolvePick = resolve; }) };
  const intents = new RegistrationIntents(picker, 20);
  try {
    const started = intents.start("add", null, null);
    assert.equal(started.state, "selecting");
    assert.throws(() => intents.start("add", null, null), (error) => error?.code === "PICKER_BUSY");
    resolvePick(null);
    await delay(0);
    assert.equal(intents.get(started.id).state, "cancelled");
    await delay(25);
    assert.throws(() => intents.get(started.id), (error) => error?.code === "REGISTRATION_INTENT_NOT_FOUND");
  } finally {
    await intents.close();
  }
});

test("macOS picker output preserves spaces, Unicode, and embedded newlines", () => {
  assert.equal(decodeMacFolderPickerOutputForTesting("/Volumes/Example/Проєкт з пробілом/\n"), "/Volumes/Example/Проєкт з пробілом/");
  assert.equal(decodeMacFolderPickerOutputForTesting("/tmp/line\nbreak/\n"), "/tmp/line\nbreak/");
  assert.equal(decodeMacFolderPickerOutputForTesting("__OPENSPEC_PICKER_CANCELLED__\n"), null);
  assert.throws(() => decodeMacFolderPickerOutputForTesting("relative/path\n"), (error) => error?.code === "PICKER_OUTPUT_INVALID");
});

test("Windows picker uses a fixed shell-free invocation and decodes absolute Unicode paths", async () => {
  const selected = "C:\\Users\\Example\\Проєкт з пробілом";
  const encoded = Buffer.from(selected, "utf8").toString("base64");
  assert.equal(decodeWindowsFolderPickerOutputForTesting(encoded), selected);
  assert.equal(decodeWindowsFolderPickerOutputForTesting("__OPENSPEC_PICKER_CANCELLED__"), null);
  assert.throws(() => decodeWindowsFolderPickerOutputForTesting(Buffer.from("relative\\path", "utf8").toString("base64")), (error) => error?.code === "PICKER_OUTPUT_INVALID");
  assert.throws(() => decodeWindowsFolderPickerOutputForTesting("__OPENSPEC_PICKER_NO_GUI__"), (error) => error?.code === "NO_GUI_SESSION");

  let invocation;
  const fakeSpawn = (executable, args, options) => {
    invocation = { executable, args, options };
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => true;
    queueMicrotask(() => {
      child.stdout.write(encoded);
      child.exitCode = 0;
      child.emit("close", 0);
    });
    return child;
  };
  const picker = new WindowsFolderPicker(fakeSpawn, "C:\\Windows", 100, "win32");
  assert.equal(await picker.pick(), selected);
  assert.equal(invocation.executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(invocation.args.slice(0, 5), ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command"]);
  assert.equal(invocation.options.shell, false);
  assert.doesNotMatch(invocation.args[5], new RegExp(selected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("Windows picker platform validation cannot be bypassed by an injected process", async () => {
  const fakeSpawn = () => { throw new Error("unreachable"); };
  await assert.rejects(
    new WindowsFolderPicker(fakeSpawn, "C:\\Windows", 100, "linux").pick(),
    (error) => error?.code === "PICKER_UNSUPPORTED",
  );
});

test("native picker selection fails visibly on unsupported platforms and Windows timeout kills the helper", async () => {
  await assert.rejects(createNativeFolderPicker("linux").pick(), (error) => error?.code === "PICKER_UNSUPPORTED");
  assert.equal(createNativeFolderPicker("darwin").constructor.name, "MacFolderPicker");
  assert.equal(createNativeFolderPicker("win32").constructor.name, "WindowsFolderPicker");

  let killed = false;
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killed = signal === "SIGKILL";
      child.signalCode = signal;
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    return child;
  };
  await assert.rejects(new WindowsFolderPicker(fakeSpawn, "C:\\Windows", 5, "win32").pick(), (error) => error?.code === "PICKER_TIMEOUT");
  assert.equal(killed, true);

  let closeSignal = null;
  const closeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      closeSignal = signal;
      child.signalCode = signal;
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    return child;
  };
  const closePicker = new WindowsFolderPicker(closeSpawn, "C:\\Windows", 1_000, "win32");
  const pending = closePicker.pick();
  await closePicker.close();
  await assert.rejects(pending, (error) => error?.code === "PICKER_FAILED");
  assert.equal(closeSignal, "SIGTERM");
});

test("project-local OpenSpec version checks use a bounded configurable timeout", async () => {
  const root = await createFixture({ openSpecDelayMs: 100 });
  try {
    await assert.rejects(
      createPinnedOpenSpecRunner(root, { versionTimeoutMs: 20 }).version(),
      (error) => error?.code === "OPENSPEC_TIMEOUT",
    );
    assert.equal(await createPinnedOpenSpecRunner(root, { versionTimeoutMs: 2_000 }).version(), "1.7.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OpenSpec runner validates project script metadata and an explicit npm JavaScript entry", async () => {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "npm_execpath must be available under npm test");

  const missing = await createFixture();
  const malformed = await createFixture();
  const oversized = await createFixture();
  const nonFile = await createFixture();
  const invalidRunner = await createFixture();
  try {
    await writeFile(path.join(missing, "package.json"), JSON.stringify({ name: "missing", scripts: {} }), "utf8");
    await assert.rejects(createPinnedOpenSpecRunner(missing, { npmCliPath: npmCli }).version(), (error) => error?.code === "OPENSPEC_SCRIPT_MISSING");

    await writeFile(path.join(malformed, "package.json"), "{not-json", "utf8");
    await assert.rejects(createPinnedOpenSpecRunner(malformed, { npmCliPath: npmCli }).version(), (error) => error?.code === "OPENSPEC_SCRIPT_MISSING");

    await writeFile(path.join(oversized, "package.json"), Buffer.alloc(1024 * 1024 + 1, 0x20));
    await assert.rejects(createPinnedOpenSpecRunner(oversized, { npmCliPath: npmCli }).version(), (error) => error?.code === "OPENSPEC_SCRIPT_MISSING");

    await rm(path.join(nonFile, "package.json"));
    await mkdir(path.join(nonFile, "package.json"));
    await assert.rejects(createPinnedOpenSpecRunner(nonFile, { npmCliPath: npmCli }).version(), (error) => error?.code === "OPENSPEC_SCRIPT_MISSING");

    await assert.rejects(createPinnedOpenSpecRunner(invalidRunner, { npmCliPath: "relative/npm-cli.js" }).version(), (error) => error?.code === "OPENSPEC_RUNNER_UNAVAILABLE");
    await assert.rejects(createPinnedOpenSpecRunner(invalidRunner, { npmCliPath: path.join(invalidRunner, "missing", "npm-cli.js") }).version(), (error) => error?.code === "OPENSPEC_RUNNER_UNAVAILABLE");
  } finally {
    await Promise.all([missing, malformed, oversized, nonFile, invalidRunner].map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("OpenSpec runner derives bounded Windows and Unix npm CLI candidates", () => {
  assert.deepEqual(
    npmCliCandidatesForTesting("win32", "C:\\Program Files\\nodejs\\node.exe", "C:\\portable\\npm-cli.js"),
    ["C:\\portable\\npm-cli.js", "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"],
  );
  assert.deepEqual(
    npmCliCandidatesForTesting("darwin", "/usr/local/bin/node", "/opt/npm/bin/npm-cli.js"),
    ["/opt/npm/bin/npm-cli.js", "/usr/local/lib/node_modules/npm/bin/npm-cli.js"],
  );
});

test("OpenSpec runner keeps shell metacharacters and spaces as literal script arguments", async () => {
  const root = await createFixture({ commandLog: true });
  try {
    await createPinnedOpenSpecRunner(root).run(["status", "--change", "space & whoami | echo", "--json"]);
    const logged = (await readFile(path.join(root, ".openspec-command-log"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(logged.at(-1), ["status", "--change", "space & whoami | echo", "--json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OpenSpec runner keeps timeout, output-limit, and non-zero failure codes distinct", async () => {
  const timeout = await createFixture({ openSpecDelayMs: 100 });
  const outputLimit = await createFixture({ openSpecVersion: "1".repeat(70 * 1024) });
  const failure = await createFixture();
  try {
    await writeFile(path.join(failure, "package.json"), JSON.stringify({ name: "broken", scripts: { openspec: "missing-openspec-command" } }), "utf8");
    await assert.rejects(createPinnedOpenSpecRunner(timeout, { versionTimeoutMs: 20 }).version(), (error) => error?.code === "OPENSPEC_TIMEOUT");
    await assert.rejects(createPinnedOpenSpecRunner(outputLimit).version(), (error) => error?.code === "OPENSPEC_OUTPUT_LIMIT");
    await assert.rejects(createPinnedOpenSpecRunner(failure).version(), (error) => error?.code === "OPENSPEC_COMMAND_FAILED");
  } finally {
    await Promise.all([timeout, outputLimit, failure].map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("adapts the supported OpenSpec 1.7 JSON shapes and rejects unknown shapes", () => {
  assert.deepEqual(adaptChangeList({ changes: [{ name: "a", completedTasks: 1, totalTasks: 2, lastModified: "now", status: "in-progress" }] })[0], {
    id: "a", title: "a", status: "in-progress", completedTasks: 1, totalTasks: 2, updatedAt: "now",
  });
  assert.deepEqual(adaptArtifactStatus({ artifacts: [{ id: "proposal", status: "done" }] }), [{ id: "proposal", status: "done" }]);
  assert.deepEqual(adaptDoctor({ root: { healthy: true } }), { healthy: true });
  assert.equal(adaptValidation({ items: [{ valid: true }], summary: { totals: { failed: 0 } } }).state, "valid");
  assert.throws(() => adaptChangeList({ version: 99 }), /not supported/u);
  assert.throws(() => adaptArtifactStatus({ artifacts: "wrong" }), /not supported/u);
  assert.throws(() => adaptDoctor({ root: {} }), /not supported/u);
  assert.throws(() => adaptValidation({}), /not supported/u);
});

test("parses exact source sections, task progress and malformed checkboxes", () => {
  const sections = parseSections("## Why\n\nReason\n\n### Detail\n\nMore", "proposal.md");
  assert.deepEqual(sections.map((item) => item.title), ["Why", "Detail"]);
  const parsed = parseTasks("- [x] 1.1 Done\n- [ ] 1.2 Pending\n- [maybe] broken", "tasks.md");
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0].completed, true);
  assert.deepEqual(parsed.malformedTaskLines, [3]);
});

test("derives only exact identifiers from explicit proposal dependency declarations", () => {
  const known = new Set(["foundation", "secondary-parent", "dependent"]);
  const proposal = [
    "## Why",
    "The later `foundation` plan is mentioned but is not a dependency declaration.",
    "",
    "## Impact",
    "- Depends on the active `foundation` change and an unknown `missing-change`.",
    "- **Dependencies:** the shared controls and",
    "  `secondary-parent` for the approved projection.",
    "- A note about `dependent` must not create a self-dependency.",
  ].join("\n");
  assert.deepEqual(parseExplicitChangeDependencies(proposal, known, "dependent"), ["foundation", "secondary-parent"]);
  assert.deepEqual(parseExplicitChangeDependencies(null, known, "dependent"), []);
});

test("flattens long dependency chains, preserves multiple parents, and leaves cycles flat", () => {
  const change = (id, dependsOn = []) => ({ id, title: id, status: "active", completedTasks: 0, totalTasks: 0, updatedAt: null, dependsOn, treeParentId: null });
  const derived = deriveTreeParents([
    change("foundation"),
    change("middle", ["foundation"]),
    change("leaf", ["middle", "foundation"]),
    change("cycle-a", ["cycle-b"]),
    change("cycle-b", ["cycle-a"]),
    change("blocked-by-cycle", ["cycle-a"]),
  ]);
  const byId = new Map(derived.map((item) => [item.id, item]));
  assert.equal(byId.get("middle")?.treeParentId, "foundation");
  assert.equal(byId.get("leaf")?.treeParentId, "foundation");
  assert.deepEqual(byId.get("leaf")?.dependsOn, ["middle", "foundation"]);
  assert.equal(byId.get("cycle-a")?.treeParentId, null);
  assert.equal(byId.get("cycle-b")?.treeParentId, null);
  assert.equal(byId.get("blocked-by-cycle")?.treeParentId, null);
});

test("arranges visible same-section dependencies once and keeps filtered children reachable", () => {
  const items = [
    { id: "foundation", treeParentId: null },
    { id: "middle", treeParentId: "foundation" },
    { id: "leaf", treeParentId: "foundation" },
  ];
  assert.deepEqual(arrangeChangeTree(items).map((row) => [row.change.id, row.child]), [
    ["foundation", false],
    ["middle", true],
    ["leaf", true],
  ]);
  assert.deepEqual(arrangeChangeTree([items[2]]).map((row) => [row.change.id, row.child]), [["leaf", false]]);
});

test("classifies completed and archive-ready changes from authoritative status and task counts", () => {
  assert.equal(isArchiveReadyChange({ status: "in-progress", completedTasks: 4, totalTasks: 4 }), true);
  assert.equal(isArchiveReadyChange({ status: "active", completedTasks: 3, totalTasks: 4 }), false);
  assert.equal(isArchiveReadyChange({ status: "active", completedTasks: 0, totalTasks: 0 }), false);
  assert.equal(isArchiveReadyChange({ status: "complete", completedTasks: 4, totalTasks: 4 }), false);
  assert.equal(isCompletedChange({ status: "archived" }), true);
  assert.equal(isCompletedChange({ status: "in-progress" }), false);
});

test("projects confirmed proposal dependencies and tolerates missing proposals", async () => {
  const root = await createFixture({
    listJson: {
      changes: [
        { name: "example-change", completedTasks: 1, totalTasks: 2, status: "in-progress" },
        { name: "dependent-change", completedTasks: 0, totalTasks: 1, status: "in-progress" },
        { name: "proposal-missing", completedTasks: 0, totalTasks: 1, status: "in-progress" },
      ],
    },
  });
  try {
    await mkdir(path.join(root, "openspec/changes/dependent-change"), { recursive: true });
    await writeFile(
      path.join(root, "openspec/changes/dependent-change/proposal.md"),
      "## Impact\n\n- Depends on the active `example-change` change.\n",
      "utf8",
    );
    const snapshot = await buildSnapshot(root, await discoverGitSnapshot(root), createPinnedOpenSpecRunner(root));
    assert.deepEqual(snapshot.changes.find((item) => item.id === "dependent-change")?.dependsOn, ["example-change"]);
    assert.equal(snapshot.changes.find((item) => item.id === "dependent-change")?.treeParentId, "example-change");
    assert.deepEqual(snapshot.changes.find((item) => item.id === "proposal-missing")?.dependsOn, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("projects CLI status with exact English artifacts and hostile text inert", async () => {
  const root = await createFixture();
  const detail = await buildChangeDetail(root, "example-change", createPinnedOpenSpecRunner(root));
  assert.equal(detail.completedTasks, 1);
  assert.equal(detail.totalTasks, 2);
  assert.match(detail.proposal[0].body, /<script>alert\(1\)<\/script>/u);
  assert.equal(detail.validation.state, "valid");
  await rm(root, { recursive: true, force: true });
});

test("builds an immediate source projection before strict verification", async () => {
  const root = await createFixture();
  try {
    const preview = await buildChangePreview(root, {
      id: "example-change",
      title: "Example change",
      status: "in-progress",
      completedTasks: 1,
      totalTasks: 2,
      updatedAt: null,
      dependsOn: [],
      treeParentId: null,
    });
    assert.equal(preview.validation.state, "pending");
    assert.deepEqual(preview.artifacts, []);
    assert.equal(preview.tasks.length, 2);
    assert.match(preview.proposal[0].body, /<script>/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("projects empty, complete, skipped-spec and missing-artifact states without guessing", async () => {
  const emptyRoot = await createFixture({ listJson: { changes: [] } });
  const emptyGit = await discoverGitSnapshot(emptyRoot);
  const empty = await buildSnapshot(emptyRoot, emptyGit, createPinnedOpenSpecRunner(emptyRoot));
  assert.deepEqual(empty.changes, []);
  await rm(emptyRoot, { recursive: true, force: true });

  const completeRoot = await createFixture({
    listJson: { changes: [{ name: "example-change", completedTasks: 0, totalTasks: 0, status: "complete" }] },
    statusJson: { artifacts: [{ id: "proposal", status: "done" }, { id: "specs", status: "skipped" }, { id: "tasks", status: "done" }] },
    omitDesign: true,
    omitTasks: true,
  });
  const complete = await buildChangeDetail(completeRoot, "example-change", createPinnedOpenSpecRunner(completeRoot));
  assert.equal(complete.status, "complete");
  assert.deepEqual(complete.design, []);
  assert.deepEqual(complete.tasks, []);
  assert.equal(complete.artifacts.find((item) => item.id === "specs")?.status, "skipped");
  await rm(completeRoot, { recursive: true, force: true });
});

test("fails visibly closed for unsupported OpenSpec versions and unknown doctor shapes", async () => {
  const unsupportedRoot = await createFixture({ openSpecVersion: "2.0.0", standardsVersion: "v1.9.0" });
  const unsupportedGit = await discoverGitSnapshot(unsupportedRoot);
  const unsupported = await buildSnapshot(unsupportedRoot, unsupportedGit, createPinnedOpenSpecRunner(unsupportedRoot));
  assert.equal(unsupported.compatibility, "unsupported");
  assert.equal(unsupported.openSpecHealthy, false);
  assert.deepEqual(unsupported.changes, []);
  await rm(unsupportedRoot, { recursive: true, force: true });

  const unknownRoot = await createFixture({ doctorJson: { root: {} } });
  const unknownGit = await discoverGitSnapshot(unknownRoot);
  const unknown = await buildSnapshot(unknownRoot, unknownGit, createPinnedOpenSpecRunner(unknownRoot));
  assert.equal(unknown.compatibility, "unsupported");
  assert.equal(unknown.openSpecHealthy, false);
  assert.deepEqual(unknown.changes, []);
  await rm(unknownRoot, { recursive: true, force: true });
});

test("uses dirty working-tree task content while labeling the Git snapshot dirty", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "openspec/changes/example-change/tasks.md"), "- [x] 1.1 First task\n- [x] 1.2 Second task\n", "utf8");
  const git = await discoverGitSnapshot(root);
  const detail = await buildChangeDetail(root, "example-change", createPinnedOpenSpecRunner(root));
  assert.equal(git.dirty, true);
  assert.equal(detail.completedTasks, 2);
  await rm(root, { recursive: true, force: true });
});

test("reports an unavailable repository CLI without leaking its process error", async () => {
  const root = await createFixture();
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "broken", scripts: { openspec: "missing-openspec-command" } }), "utf8");
  await assert.rejects(createPinnedOpenSpecRunner(root).run(["list", "--json"]), (error) => error?.code === "OPENSPEC_COMMAND_FAILED");
  await rm(root, { recursive: true, force: true });
});

test("masks technical tokens, validates round-trip, screens secrets and keys cache identity", () => {
  const source = "WHEN `order.total` MUST match src/modules/order.ts for uk-UA.";
  const masked = maskProtectedText(source);
  assert.notEqual(masked.value, source);
  assert.equal(restoreProtectedText(masked.value, masked), source);
  assert.throws(() => restoreProtectedText(masked.value.replace("⟦OWB_0000⟧", ""), masked), /round-trip/u);
  assert.equal(screenTranslationBlock("token=super-secret-value").allowed, false);
  assert.equal(screenTranslationBlock("ordinary planning prose").allowed, true);
  assert.equal(screenTranslationBlock("Read /Users/example/private/spec.md").reason, "denied-path");
  assert.equal(screenTranslationBlock("[key](file:///Users/example/.ssh/id_ed25519)").reason, "denied-path");
  assert.equal(screenTranslationBlock('{"path":"/Users/example/private/spec.md"}').reason, "denied-path");
  assert.equal(screenTranslationBlock("Open C:\\Users\\nick\\private\\spec.md").reason, "denied-path");
  assert.equal(screenTranslationBlock("[key](file:///C:/Users/example/private/spec.md)").reason, "denied-path");
  assert.equal(screenTranslationBlock("See https://example.com/home/guide").allowed, true);
  const common = { source, locale: "uk-UA", glossaryVersion: "1", promptVersion: "1", parserVersion: "1", adapterId: "disabled" };
  assert.equal(translationCacheKey(common), translationCacheKey(common));
  assert.notEqual(translationCacheKey(common), translationCacheKey({ ...common, glossaryVersion: "2" }));
  assert.notEqual(translationCacheKey(common), translationCacheKey({ ...common, adapterId: "another-provider" }));
});

test("parses only successful structured AGY translation output", () => {
  const parsed = parseAgyTranslationOutput(JSON.stringify({ status: "SUCCESS", structured_output: { translations: [{ id: "title", text: "Назва" }] }, usage: { input_tokens: 10, output_tokens: 3 } }));
  assert.deepEqual(parsed.translations, [{ id: "title", text: "Назва" }]);
  assert.equal(parsed.usage.inputTokens, 10);
  assert.throws(() => parseAgyTranslationOutput(JSON.stringify({ status: "FAILED" })), (error) => error?.code === "TRANSLATION_PROVIDER_FAILED");
  assert.throws(() => parseAgyTranslationOutput("not-json"), (error) => error?.code === "TRANSLATION_OUTPUT_INVALID");
});

test("bounds AGY prompt arguments and force-terminates a timed-out process", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-agy-timeout-"));
  const executable = path.join(directory, "ignore-term");
  try {
    await writeFile(executable, `#!/usr/bin/env node\nprocess.on("SIGTERM", () => undefined);\nsetInterval(() => undefined, 1000);\n`, "utf8");
    await chmod(executable, 0o755);
    const bounded = new AgyTranslationAdapter(executable, "fixture-model", 40, 30);
    await assert.rejects(bounded.translate([{ id: "one", text: "hello" }]), (error) => error?.code === "TRANSLATION_PROVIDER_TIMEOUT");
    const oversized = new AgyTranslationAdapter(path.join(directory, "missing"), "fixture-model", 40, 30);
    await assert.rejects(oversized.translate([{ id: "one", text: "x".repeat(100 * 1024) }]), (error) => error?.code === "TRANSLATION_REQUEST_TOO_LARGE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("classifies bounded AGY failures without exposing provider diagnostics", () => {
  assert.equal(classifyAgyFailureForTesting("OAuth login required"), "TRANSLATION_PROVIDER_AUTH_REQUIRED");
  assert.equal(classifyAgyFailureForTesting("RESOURCE_EXHAUSTED quota reached"), "TRANSLATION_PROVIDER_QUOTA");
  assert.equal(classifyAgyFailureForTesting("anything", true), "TRANSLATION_PROVIDER_TIMEOUT");
  assert.equal(classifyAgyFailureForTesting("provider-specific internal detail"), "TRANSLATION_PROVIDER_FAILED");
});

test("exposes only the closed provider catalogue and fixed safe CLI profiles", () => {
  assert.deepEqual(translationProviderIds, ["agy", "claude", "codex", "gemini", "qwen", "kimi", "ollama"]);
  assert.equal(isTranslationProviderId("claude"), true);
  assert.equal(isTranslationProviderId("../../bin/sh"), false);
  assert.equal(isTranslationProviderPreference("none"), true);
  assert.equal(isTranslationProviderPreference("openrouter"), false);
  for (const provider of ["claude", "codex", "gemini", "qwen", "kimi"]) {
    const invocation = buildCliInvocation(provider, "fixture prompt");
    const args = invocation.args("/private/tmp/empty-workspace");
    assert.equal(args.includes("fixture prompt"), true);
    assert.equal(args.some((argument) => argument === "--dangerously-skip-permissions" || argument === "--yolo"), false);
    assert.equal(JSON.stringify(args).includes("/Volumes/Example/Work"), false);
  }
  assert.equal(buildCliInvocation("claude", "fixture prompt").args("/tmp/work").includes("--tools"), true);
  assert.equal(buildCliInvocation("codex", "fixture prompt").args("/tmp/work").includes("--ephemeral"), true);
  assert.equal(buildCliInvocation("qwen", "fixture prompt").args("/tmp/work").includes("--safe-mode"), true);
  const kimi = buildCliInvocation("kimi", "fixture prompt");
  assert.equal(kimi.args("/tmp/work").includes("--agent-file"), true);
  assert.match(kimi.files[0].content, /tools: \[\]/u);
  assert.equal(kimi.environment.KIMI_CODE_EXPERIMENTAL_FLAG, "1");
  assert.equal(new CliTranslationAdapter("claude", "/missing").id, "claude-cli:structured:uk-v1");
});

test("parses provider-specific final envelopes and rejects tool events", () => {
  const payload = { translations: [{ id: "title", text: "Назва" }] };
  assert.deepEqual(parseCliTranslationOutput("claude", JSON.stringify({ structured_output: payload, usage: { input_tokens: 2, output_tokens: 1 } })).translations, payload.translations);
  assert.deepEqual(parseCliTranslationOutput("gemini", JSON.stringify({ response: JSON.stringify(payload) })).translations, payload.translations);
  assert.deepEqual(parseCliTranslationOutput("codex", "ignored", JSON.stringify(payload)).translations, payload.translations);
  assert.deepEqual(parseCliTranslationOutput("kimi", `${JSON.stringify({ type: "assistant.message", content: JSON.stringify(payload) })}\n`).translations, payload.translations);
  assert.throws(() => parseCliTranslationOutput("kimi", `${JSON.stringify({ type: "tool.call", name: "shell" })}\n`), (error) => error?.code === "TRANSLATION_OUTPUT_INVALID");
  assert.throws(() => parseCliTranslationOutput("claude", JSON.stringify({ tool_calls: [] })), (error) => error?.code === "TRANSLATION_OUTPUT_INVALID");
});

test("runs a fixed command from a private empty workspace and removes it afterwards", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-bounded-runner-"));
  const script = path.join(directory, "inspect.mjs");
  let observedWorkspace = "";
  try {
    await writeFile(script, `import { readdir } from "node:fs/promises";\nprocess.stdout.write(JSON.stringify({ cwd: process.cwd(), files: await readdir(process.cwd()), browser: process.env.BROWSER, prompt: process.env.GIT_TERMINAL_PROMPT }));\n`, "utf8");
    const result = await runBoundedProcess({ executable: process.execPath, args: [script], files: [{ path: "schema.json", content: "{}\n" }], timeoutMs: 1_000 });
    const value = JSON.parse(result.stdout);
    observedWorkspace = value.cwd;
    assert.deepEqual(value.files, ["schema.json"]);
    assert.equal(value.prompt, "0");
    assert.match(value.browser, /false|NUL/u);
    await assert.rejects(readFile(observedWorkspace), /ENOENT|EISDIR/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("discovers and translates only through a bounded loopback Ollama model", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b" }, { name: "../bad" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const request = JSON.parse(init.body);
    assert.equal(request.model, "qwen2.5:7b");
    assert.equal(request.stream, false);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ translations: [{ id: "title", text: "Назва" }] }) }, prompt_eval_count: 5, eval_count: 2 }), { status: 200 });
  };
  assert.deepEqual(await discoverOllamaModels(fetcher, "http://127.0.0.1:11434"), ["qwen2.5:7b"]);
  assert.equal(validateOllamaModel("qwen2.5:7b"), "qwen2.5:7b");
  assert.throws(() => validateOllamaModel("../bad"), (error) => error?.code === "TRANSLATION_MODEL_UNSUPPORTED");
  const adapter = new OllamaTranslationAdapter("qwen2.5:7b", fetcher, "http://127.0.0.1:11434", 1_000);
  const result = await adapter.translate([{ id: "title", text: "Title" }]);
  assert.deepEqual(result.translations, [{ id: "title", text: "Назва" }]);
  assert.equal(result.usage.inputTokens, 5);
  assert.equal(adapter.id, "ollama:structured:uk-v1:qwen2.5:7b");
  assert.equal(calls.length, 2);
  assert.throws(() => new OllamaTranslationAdapter("model", fetcher, "http://example.com:11434"), /loopback/u);
});

test("fails closed for hostile, oversized, redirected, and timed-out Ollama responses", async () => {
  const invalid = new OllamaTranslationAdapter("model", async () => new Response(JSON.stringify({ message: { content: "not-json" } }), { status: 200 }), "http://127.0.0.1:11434", 100);
  await assert.rejects(invalid.translate([{ id: "one", text: "Text" }]), (error) => error?.code === "TRANSLATION_OUTPUT_INVALID");
  const oversized = new OllamaTranslationAdapter("model", async () => new Response("{}", { status: 200, headers: { "Content-Length": String(3 * 1024 * 1024) } }), "http://127.0.0.1:11434", 100);
  await assert.rejects(oversized.translate([{ id: "one", text: "Text" }]), (error) => error?.code === "TRANSLATION_OUTPUT_LIMIT");
  const redirected = new OllamaTranslationAdapter("model", async (_url, init) => {
    assert.equal(init.redirect, "error");
    return new Response("", { status: 302, headers: { Location: "http://example.com" } });
  }, "http://127.0.0.1:11434", 100);
  await assert.rejects(redirected.translate([{ id: "one", text: "Text" }]), (error) => error?.code === "TRANSLATION_PROVIDER_FAILED");
  const timeout = new OllamaTranslationAdapter("model", async (_url, init) => await new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), "http://127.0.0.1:11434", 20);
  await assert.rejects(timeout.translate([{ id: "one", text: "Text" }]), (error) => error?.code === "TRANSLATION_PROVIDER_TIMEOUT");
});

test("resolves an injected AGY adapter without exposing browser-controlled commands", async () => {
  const adapter = { id: "fixture-agy", async translate() { return { translations: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }; } };
  const registry = new TranslationProviderRegistry(adapter);
  const catalogue = await registry.catalogue();
  assert.equal(catalogue.find((provider) => provider.id === "agy")?.available, true);
  assert.equal((await registry.resolve({ provider: "agy" })).id, "fixture-agy");
  await assert.rejects(registry.resolve({ provider: "unsupported" }), (error) => error?.code === "TRANSLATION_PROVIDER_UNSUPPORTED");
});

test("reuses content-addressed translations only from machine-local state", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-translation-cache-"));
  const cache = new TranslationCache(directory);
  const key = translationCacheKey({ source: "Goal", locale: "uk-UA", glossaryVersion: "1", promptVersion: "1", parserVersion: "1", adapterId: "fixture" });
  assert.equal(await cache.get(key), null);
  await cache.put(key, "Мета");
  assert.equal(await cache.get(key), "Мета");
  assert.equal(await cache.get(translationCacheKey({ source: "Changed", locale: "uk-UA", glossaryVersion: "1", promptVersion: "1", parserVersion: "1", adapterId: "fixture" })), null);
  await rm(directory, { recursive: true, force: true });
});

test("translates screened blocks only on an explicit service request, validates tokens, and reuses the private cache", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-translation-service-"));
  const calls = [];
  const adapter = {
    id: "fixture-adapter-v1",
    async translate(blocks) {
      calls.push(blocks);
      return {
        translations: blocks.map((block) => ({ id: block.id, text: `UK ${block.text}` })),
        usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
      };
    },
  };
  const service = new TranslationService(adapter, new TranslationCache(directory));
  const detail = {
    id: "example",
    title: "Example change",
    status: "active",
    completedTasks: 0,
    totalTasks: 1,
    updatedAt: null,
    proposal: [{ id: "why", title: "Why", body: "The `project.id` MUST remain stable.", sourcePath: "openspec/changes/example/proposal.md" }],
    design: [{ id: "risks", title: "Risks", body: "token=secret-value", sourcePath: "openspec/changes/example/design.md" }],
    tasks: [{ id: "1.1", text: "Add safe removal", completed: false, sourcePath: "openspec/changes/example/tasks.md", line: 1 }],
    malformedTaskLines: [],
    artifacts: [],
    validation: { state: "valid", message: "valid" },
  };
  try {
    const cachedBeforeRequest = await service.cachedChange(detail);
    assert.equal(cachedBeforeRequest.states.title, "missing");
    assert.equal(cachedBeforeRequest.usage.missingBlocks > 0, true);
    assert.equal(calls.length, 0);
    const first = await service.translateChange(detail);
    assert.equal(first.values["proposal:0:body"], "UK The `project.id` MUST remain stable.");
    assert.equal(first.states["design:0:body"], "rejected");
    assert.equal(first.usage.translatedBlocks > 0, true);
    assert.equal(calls.length, 1);
    const second = await service.translateChange(detail);
    assert.equal(second.values["proposal:0:body"], first.values["proposal:0:body"]);
    assert.equal(second.usage.cacheHits > 0, true);
    assert.equal(calls.length, 1);
    const restored = await service.cachedChange(detail);
    assert.equal(restored.values["proposal:0:body"], first.values["proposal:0:body"]);
    assert.equal(restored.usage.missingBlocks, 0);
    assert.equal(calls.length, 1);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("preserves cache state and returns an allowlisted adapter diagnostic", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-translation-diagnostic-"));
  const service = new TranslationService({
    id: "quota-adapter",
    async translate() {
      throw new WorkbenchError("TRANSLATION_PROVIDER_QUOTA", "raw provider text must not escape", 503);
    },
  }, new TranslationCache(directory));
  const detail = {
    id: "example", title: "Example", status: "active", completedTasks: 0, totalTasks: 0, updatedAt: null,
    proposal: [{ id: "why", title: "Why", body: "Translate this content.", sourcePath: "proposal.md" }], design: [], tasks: [], malformedTaskLines: [], artifacts: [], validation: { state: "valid", message: "valid" },
  };
  try {
    const result = await service.translateChange(detail);
    assert.equal(result.diagnostic, "TRANSLATION_PROVIDER_QUOTA");
    assert.equal(result.usage.failedBlocks > 0, true);
    assert.equal(JSON.stringify(result).includes("raw provider text"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("falls back per block when a translation adapter corrupts protected tokens", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-translation-token-failure-"));
  const service = new TranslationService({
    id: "broken-adapter",
    async translate(blocks) {
      return { translations: blocks.map((block) => ({ id: block.id, text: block.text.replace(/⟦OWB_\d{4}⟧/u, "") })), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
    },
  }, new TranslationCache(directory));
  const detail = {
    id: "example", title: "Example", status: "active", completedTasks: 0, totalTasks: 0, updatedAt: null,
    proposal: [{ id: "why", title: "Why", body: "Keep `project.id` stable.", sourcePath: "proposal.md" }], design: [], tasks: [], malformedTaskLines: [], artifacts: [], validation: { state: "valid", message: "valid" },
  };
  try {
    const result = await service.translateChange(detail);
    assert.equal(result.values["proposal:0:body"], undefined);
    assert.equal(result.states["proposal:0:body"], "failed");
    assert.equal(result.diagnostic, "TRANSLATION_OUTPUT_INVALID");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("polling detects a missed worktree revision event", async () => {
  const root = await createFixture();
  const initial = await discoverGitSnapshot(root);
  const watcher = await SnapshotWatcher.create(initial, 60_000);
  let reason = "";
  let evidence = {};
  watcher.on("change", (value, details) => { reason = value; evidence = details; });
  await writeFile(path.join(root, "revision.txt"), "next\n");
  await command("git", ["add", "."], root);
  await command("git", ["commit", "-qm", "next"], root);
  await watcher.poll();
  assert.equal(reason, "head");
  assert.equal(evidence.previousRevision, initial.head.slice(0, 10));
  assert.equal(evidence.revision, (await discoverGitSnapshot(root)).head.slice(0, 10));
  watcher.close();
  await rm(root, { recursive: true, force: true });
});

test("fallback polling runs only while an event client retains it", async () => {
  const root = await createFixture();
  const initial = await discoverGitSnapshot(root);
  const watcher = await SnapshotWatcher.create(initial, 20);
  let changes = 0;
  const reasons = [];
  watcher.on("change", (reason) => { changes += 1; reasons.push(reason); });
  try {
    await writeFile(path.join(root, "retained-poll.txt"), "one\n");
    await command("git", ["add", "."], root);
    await command("git", ["commit", "-qm", "retained poll"], root);
    await delay(60);
    assert.equal(changes, 0);
    const release = watcher.retainPolling();
    for (let attempt = 0; attempt < 20 && changes === 0; attempt += 1) await delay(20);
    assert.ok(changes > 0);
    release();
    const current = await discoverGitSnapshot(root);
    assert.equal(watcher.acknowledge(current, watcher.generation, await openSpecContentIdentity(root)), true);
    const observed = changes;
    await writeFile(path.join(root, "retained-poll.txt"), "two\n");
    await command("git", ["add", "."], root);
    await command("git", ["commit", "-qm", "released poll"], root);
    await delay(60);
    assert.equal(changes, observed);
  } finally {
    watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("content polling ignores unchanged bytes and detects repeated edits in a dirty OpenSpec worktree", async () => {
  const root = await createFixture();
  const proposal = path.join(root, "openspec/changes/example-change/proposal.md");
  const original = await readFile(proposal, "utf8");
  const initial = await discoverGitSnapshot(root);
  const watcher = await SnapshotWatcher.create(initial, 60_000);
  let changes = 0;
  const reasons = [];
  const evidence = [];
  watcher.on("change", (reason, details) => { changes += 1; reasons.push(reason); evidence.push(details); });
  try {
    await writeFile(proposal, original, "utf8");
    await watcher.poll();
    assert.equal(changes, 0);

    await writeFile(proposal, `${original}\nFirst dirty edit.\n`, "utf8");
    await watcher.poll();
    assert.equal(changes, 1);
    assert.equal(reasons.at(-1), "source");
    assert.deepEqual(evidence.at(-1).paths, ["openspec/changes/example-change/proposal.md"]);
    assert.equal(evidence.at(-1).additionalPaths, 0);
    const dirty = await discoverGitSnapshot(root);
    assert.equal(dirty.dirty, true);
    assert.equal(watcher.acknowledge(dirty, watcher.generation, await openSpecContentState(root)), true);

    await writeFile(proposal, `${original}\nSecond dirty edit.\n`, "utf8");
    await watcher.poll();
    assert.equal(changes, 2);
    assert.equal(reasons.at(-1), "source");
    assert.deepEqual(evidence.at(-1).paths, ["openspec/changes/example-change/proposal.md"]);
  } finally {
    watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("bounds and sorts changed OpenSpec path evidence across additions and deletion", async () => {
  const root = await createFixture({ name: "changed-path-evidence" });
  const watcher = await SnapshotWatcher.create(await discoverGitSnapshot(root), 60_000);
  let observed;
  watcher.on("change", (reason, evidence) => { observed = { reason, evidence }; });
  try {
    const changeRoot = path.join(root, "openspec/changes/example-change");
    await rm(path.join(changeRoot, "tasks.md"));
    for (let index = 0; index < 14; index += 1) await writeFile(path.join(changeRoot, `extra-${String(index).padStart(2, "0")}.md`), `${index}\n`, "utf8");
    await watcher.poll();
    assert.equal(observed.reason, "source");
    assert.equal(observed.evidence.paths.length, 12);
    assert.equal(observed.evidence.additionalPaths, 3);
    assert.deepEqual(observed.evidence.paths, [...observed.evidence.paths].sort((left, right) => left.localeCompare(right, "en")));
    assert.equal(observed.evidence.paths.every((item) => item.startsWith("openspec/") && !path.isAbsolute(item)), true);
  } finally {
    watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reports bounded OpenSpec content once and emits one recovery generation", async () => {
  const root = await createFixture({ name: "bounded-openspec-content" });
  const proposal = path.join(root, "openspec/changes/example-change/proposal.md");
  let watcher;
  try {
    await writeFile(proposal, Buffer.alloc(2 * 1024 * 1024 + 1, 97));
    await assert.rejects(openSpecContentIdentity(root), (error) => error?.code === "OPEN_SPEC_CONTENT_LIMIT");
    watcher = await SnapshotWatcher.create(await discoverGitSnapshot(root), 60_000);
    const reasons = [];
    watcher.on("change", (reason) => reasons.push(reason));
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(reasons, []);
    await writeFile(proposal, "## Why\n\nRecovered.\n", "utf8");
    await watcher.poll();
    assert.deepEqual(reasons, ["worktree"]);
  } finally {
    watcher?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("stores only explicitly registered projects in a private versioned machine-local registry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-registry-"));
  const first = await createFixture({ name: "registered-one" });
  const unregistered = await createFixture({ name: "not-registered" });
  const registry = new ProjectRegistry(path.join(directory, "state"));
  try {
    const project = await registry.register(first, "Registered project");
    await assert.rejects(registry.register(first, "Bad\tlabel"), /printable characters/u);
    await assert.rejects(registry.register(unregistered, "Hidden\u202Ename"), /printable characters/u);
    const items = await registry.list();
    assert.deepEqual(items, [project]);
    assert.equal(items.some((item) => item.root === unregistered), false);
    const raw = await readFile(registry.file, "utf8");
    assert.match(raw, /"version": 2/u);
    assert.equal(project.revision, 1);
    assert.doesNotMatch(raw, /capability|token|proposal|tasks/u);
    if (process.platform !== "win32") assert.deepEqual(await registry.permissions(), { directory: 0o700, file: 0o600 });
    assert.deepEqual(await registry.remove(project.id, project.revision), project);
    assert.deepEqual(await registry.list(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(first, { recursive: true, force: true });
    await rm(unregistered, { recursive: true, force: true });
  }
});

test("migrates version-1 registry records in memory and preserves stable ids on rebind", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-registry-v1-"));
  const stateDirectory = path.join(directory, "state");
  const oldRoot = await createFixture({ name: "old-root" });
  const newRoot = await createFixture({ name: "new-root" });
  const registry = new ProjectRegistry(stateDirectory);
  try {
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(registry.file, `${JSON.stringify({ version: 1, projects: [{ id: "legacy-project-id", label: "Legacy", root: await realpath(oldRoot) }] }, null, 2)}\n`);
    assert.deepEqual(await registry.list(), [{ id: "legacy-project-id", label: "Legacy", root: await realpath(oldRoot), revision: 1 }]);
    const rebound = await registry.rebind("legacy-project-id", 1, newRoot, "Renamed");
    assert.equal(rebound.project.id, "legacy-project-id");
    assert.equal(rebound.project.revision, 2);
    assert.equal(rebound.project.label, "Renamed");
    await assert.rejects(registry.rebind("legacy-project-id", 1, oldRoot), (error) => error?.code === "REGISTRY_CONFLICT");
    assert.match(await readFile(registry.file, "utf8"), /"version": 2/u);
  } finally {
    await rm(oldRoot, { recursive: true, force: true });
    await rm(newRoot, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("bounds the explicit project registry before Hub validation fan-out", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-registry-capacity-"));
  const root = await createFixture({ name: "registry-capacity" });
  const registry = new ProjectRegistry(directory);
  const projects = Array.from({ length: 256 }, (_, index) => ({ id: `project-${index}`, label: `Project ${index}`, root: `/registered/${index}`, revision: 1 }));
  try {
    await writeFile(registry.file, `${JSON.stringify({ version: 2, projects })}\n`, "utf8");
    assert.equal((await registry.list()).length, 256);
    await assert.rejects(registry.register(root, "One too many"), (error) => error?.code === "REGISTRY_CAPACITY_REACHED");
    await writeFile(registry.file, `${JSON.stringify({ version: 2, projects: [...projects, { id: "overflow", label: "Overflow", root: "/registered/overflow", revision: 1 }] })}\n`, "utf8");
    await assert.rejects(registry.list(), (error) => error?.code === "REGISTRY_CAPACITY_EXCEEDED");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("rechecks the confirmed candidate under the registry lock before committing", async () => {
  const root = await createFixture({ name: "confirmed-candidate" });
  const foreign = await createFixture({ name: "foreign-candidate" });
  const moved = `${root}-moved`;
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-confirmed-candidate-state-"));
  class SwappingRegistry extends ProjectRegistry {
    async register(inputRoot, label, expectedCandidate) {
      await rename(root, moved);
      await rename(foreign, root);
      return super.register(inputRoot, label, expectedCandidate);
    }
  }
  const registry = new SwappingRegistry(stateDirectory);
  const intents = new RegistrationIntents({ async pick() { return root; } });
  try {
    let intent = intents.start("add", null, null);
    for (let attempt = 0; attempt < 50 && intent.state === "selecting"; attempt += 1) {
      await delay(10);
      intent = intents.get(intent.id);
    }
    assert.equal(intent.state, "preview");
    await assert.rejects(intents.confirm(intent.id, "Confirmed", registry, { async invalidateRoot() {} }), (error) => error?.code === "REGISTRATION_CANDIDATE_CHANGED");
    assert.deepEqual(await registry.list(), []);
  } finally {
    await intents.close();
    await rm(root, { recursive: true, force: true });
    await rm(moved, { recursive: true, force: true });
    await rm(foreign, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("keeps a committed rebind authoritative when obsolete child cleanup warns", async () => {
  const oldRoot = await createFixture({ name: "cleanup-old" });
  const newRoot = await createFixture({ name: "cleanup-new" });
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "owb-rebind-cleanup-state-"));
  const registry = new ProjectRegistry(stateDirectory);
  const project = await registry.register(oldRoot, "Stable slot");
  const intents = new RegistrationIntents({ async pick() { return newRoot; } });
  try {
    let intent = intents.start("rebind", project.id, project.revision);
    for (let attempt = 0; attempt < 50 && intent.state === "selecting"; attempt += 1) {
      await delay(10);
      intent = intents.get(intent.id);
    }
    const completed = await intents.confirm(intent.id, "Stable slot", registry, { async invalidateRoot() { throw new Error("cleanup failed"); } });
    assert.equal(completed.state, "completed");
    assert.equal(completed.cleanupWarning, true);
    assert.equal((await registry.list())[0].root, await realpath(newRoot));
  } finally {
    await intents.close();
    await rm(oldRoot, { recursive: true, force: true });
    await rm(newRoot, { recursive: true, force: true });
    await rm(stateDirectory, { recursive: true, force: true });
  }
});

test("revalidates registered canonical roots and rejects symlink substitution", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-registry-root-"));
  const registeredRoot = await createFixture({ name: "registered-root" });
  const replacementRoot = await createFixture({ name: "replacement-root" });
  const movedRoot = `${registeredRoot}-moved`;
  const registry = new ProjectRegistry(path.join(directory, "state"));
  try {
    const project = await registry.register(registeredRoot, "Registered root");
    assert.equal(await validateRegisteredProjectRoot(project), await realpath(registeredRoot));
    assert.equal((await validateRegisteredProject(project)).root, await realpath(registeredRoot));
    await rename(registeredRoot, movedRoot);
    await symlink(replacementRoot, registeredRoot, "dir");
    await assert.rejects(validateRegisteredProjectRoot(project), (error) => error?.code === "REGISTERED_ROOT_CHANGED");
    await assert.rejects(validateRegisteredProject(project), (error) => error?.code === "REGISTERED_ROOT_CHANGED");
  } finally {
    await rm(registeredRoot, { recursive: true, force: true });
    await rename(movedRoot, registeredRoot).catch(() => undefined);
    await rm(registeredRoot, { recursive: true, force: true });
    await rm(replacementRoot, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovers only an old registry lock whose owner is gone", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owb-registry-lock-"));
  const root = await createFixture({ name: "lock-project" });
  const stateDirectory = path.join(directory, "state");
  const lockFile = path.join(stateDirectory, "projects.lock");
  const registry = new ProjectRegistry(stateDirectory);
  try {
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(lockFile, `${JSON.stringify({ pid: 2_147_483_647, createdAt: 0 })}\n`, "utf8");
    assert.equal((await registry.register(root, "Recovered lock")).label, "Recovered lock");
    await writeFile(lockFile, `${JSON.stringify({ pid: process.pid, createdAt: 0 })}\n`, "utf8");
    await assert.rejects(registry.remove("missing"), (error) => error?.code === "REGISTRY_BUSY");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("lists current plus five recent local branches and opens only existing OpenSpec worktrees", async () => {
  const root = await createFixture();
  const linked = `${root}-linked`;
  try {
    for (let index = 1; index <= 7; index += 1) await command("git", ["branch", `local-${index}`], root);
    await command("git", ["worktree", "add", "-q", "-b", "linked-plans", linked], root);
    await command("git", ["update-ref", "refs/remotes/origin/remote-only", "HEAD"], root);
    const branches = await discoverLocalBranches(root);
    const navigation = projectBranchNavigation(branches);
    assert.equal(navigation.recent[0].current, true);
    assert.equal(navigation.recent.length, 6);
    assert.equal(navigation.all.some((branch) => branch.name === "remote-only"), false);
    assert.equal(navigation.all.find((branch) => branch.name === "linked-plans")?.openable, true);
    assert.equal(navigation.all.find((branch) => branch.name === "local-7")?.openable, false);
    assert.equal("worktreeRoot" in navigation.all.find((branch) => branch.name === "linked-plans"), false);
    await rm(linked, { recursive: true, force: true });
    const stale = await discoverLocalBranches(root);
    assert.equal(stale.find((branch) => branch.name === "linked-plans")?.openable, false);
  } finally {
    await command("git", ["worktree", "remove", "--force", linked], root).catch(() => undefined);
    await rm(linked, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
