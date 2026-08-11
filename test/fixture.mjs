import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function command(command, args, cwd) {
  return execFile(command, args, { cwd, encoding: "utf8" });
}

export async function createFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "openspec-workbench-fixture-"));
  await mkdir(path.join(root, "openspec/changes/example-change"), { recursive: true });
  await writeFile(path.join(root, "openspec/config.yaml"), "schema: spec-driven\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".standards/\n.openspec-workbench/\n.openspec-command-log\n", "utf8");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: options.name ?? "fixture-project",
    private: true,
    type: "module",
    scripts: { openspec: "node fake-openspec.mjs" },
  }, null, 2) + "\n", "utf8");
  const listJson = options.listJson ?? {changes:[{name:"example-change",completedTasks:1,totalTasks:2,lastModified:"2026-01-01T00:00:00.000Z",status:"in-progress"}]};
  const statusJson = options.statusJson ?? {artifacts:[{id:"proposal",status:"done"},{id:"tasks",status:"done"}]};
  const validationJson = options.validationJson ?? {items:[{id:"example-change",valid:true}],summary:{totals:{items:1,passed:1,failed:0}},version:"1.0"};
  const doctorJson = options.doctorJson ?? {root:{healthy:true},status:[]};
  await writeFile(path.join(root, "fake-openspec.mjs"), `
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
const commandLog = ${JSON.stringify(options.commandLog ? path.join(root, ".openspec-command-log") : "")};
if (commandLog) await appendFile(commandLog, JSON.stringify(args) + "\\n", "utf8");
const delayMs = ${JSON.stringify(options.openSpecDelayMs ?? 0)};
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
if (args.includes("--version")) console.log(${JSON.stringify(options.openSpecVersion ?? "1.7.0")});
else if (args.includes("list")) console.log(${JSON.stringify(JSON.stringify(listJson))});
else if (args.includes("status")) console.log(${JSON.stringify(JSON.stringify(statusJson))});
else if (args.includes("validate")) console.log(${JSON.stringify(JSON.stringify(validationJson))});
else if (args.includes("doctor")) console.log(${JSON.stringify(JSON.stringify(doctorJson))});
else { console.error("unsupported"); process.exitCode = 2; }
`, "utf8");
  await chmod(path.join(root, "fake-openspec.mjs"), 0o755);
  if (!options.omitProposal) await writeFile(path.join(root, "openspec/changes/example-change/proposal.md"), `## Why\n\nA safe <script>alert(1)</script> plan.\n\n## What Changes\n\n- Add workbench.\n`, "utf8");
  if (!options.omitDesign) await writeFile(path.join(root, "openspec/changes/example-change/design.md"), `## Decisions\n\nKeep English authoritative.\n\n## Risks\n\nRemote media ![x](https://example.invalid/x.png) stays inert.\n`, "utf8");
  if (!options.omitTasks) await writeFile(path.join(root, "openspec/changes/example-change/tasks.md"), `## 1. Work\n\n- [x] 1.1 First task\n- [ ] 1.2 Second task\n`, "utf8");
  if (options.standardsVersion) await writeFile(path.join(root, "standards.version"), `${options.standardsVersion}\n`, "utf8");
  await command("git", ["init", "-q"], root);
  await command("git", ["config", "user.name", "Workbench Test"], root);
  await command("git", ["config", "user.email", "workbench@example.invalid"], root);
  await command("git", ["add", "."], root);
  await command("git", ["commit", "-qm", "fixture"], root);
  return root;
}

export async function state(root) {
  const [{ stdout: status }, { stdout: head }] = await Promise.all([
    command("git", ["status", "--porcelain=v1", "--untracked-files=all"], root),
    command("git", ["rev-parse", "HEAD"], root),
  ]);
  return { status, head: head.trim() };
}

export async function makeEscapeSymlink(root, outside) {
  await symlink(outside, path.join(root, "openspec/changes/example-change/escape.md"));
}

export async function readFixture(root, relative) {
  return readFile(path.join(root, relative), "utf8");
}
