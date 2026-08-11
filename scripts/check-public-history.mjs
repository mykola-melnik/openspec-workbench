import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { scanPublicEntries } from "./check-public.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryFlag = process.argv.indexOf("--repository");
const requestedRepository = repositoryFlag >= 0 ? process.argv[repositoryFlag + 1] : ".public-snapshot";
assert.ok(requestedRepository, "--repository requires a path.");
const snapshotRoot = path.resolve(repositoryRoot, requestedRepository);
const relativeSnapshot = path.relative(repositoryRoot, snapshotRoot);
assert.ok(relativeSnapshot && !relativeSnapshot.startsWith(".."), "History scanning is limited to a nested repository.");

async function git(args, encoding = "utf8") {
  const result = await execFileAsync("git", args, {
    cwd: snapshotRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

assert.equal((await git(["rev-parse", "--is-inside-work-tree"])).trim(), "true");
assert.equal(Number((await git(["rev-list", "--count", "--all"])).trim()), 1, "Public history must contain exactly one commit.");
assert.equal((await git(["for-each-ref", "--format=%(refname)", "refs/heads"])).trim(), "refs/heads/main");
assert.equal((await git(["remote"])).trim(), "", "The approval snapshot must not have a remote.");

const metadata = (await git(["show", "-s", "--format=%H%x00%T%x00%an%x00%ae%x00%s", "HEAD"])).trim().split("\0");
assert.equal(metadata.length, 5, "Commit metadata must use the bounded public schema.");
const [commit, tree, authorName, authorEmail, subject] = metadata;
assert.equal(authorName, "Mykola Melnik");
assert.match(authorEmail, /^[0-9]+\+mykola-melnik@users\.noreply\.github\.com$/u);
assert.equal(subject, "Initial public release");

const treeOutput = await git(["ls-tree", "-r", "-z", "--full-tree", "HEAD"], "buffer");
const entries = [];
for (const record of treeOutput.toString("utf8").split("\0").filter(Boolean)) {
  const tab = record.indexOf("\t");
  assert.ok(tab > 0, "Git tree record is malformed.");
  const [mode, type, object] = record.slice(0, tab).split(" ");
  const filePath = record.slice(tab + 1);
  assert.equal(type, "blob", `Public tree contains unsupported object type at ${filePath}.`);
  assert.equal(mode, "100644", `Public tree contains unsupported mode at ${filePath}.`);
  const content = await git(["cat-file", "blob", object], "buffer");
  entries.push({ path: filePath, content });
}

const manifest = (await git(["show", "HEAD:PUBLICATION_MANIFEST.txt"])).split("\n").filter(Boolean);
const committedPaths = entries.map((entry) => entry.path).sort();
assert.deepEqual(committedPaths, manifest, "Public tree paths must match PUBLICATION_MANIFEST.txt exactly.");

const findings = scanPublicEntries([
  ...entries,
  { path: "<commit-subject>", content: subject },
]);
assert.deepEqual(findings, [], "Reachable public history contains a prohibited marker.");

process.stdout.write(`Public history verified: commits=1 files=${entries.length} findings=0 commit=${commit} tree=${tree}\n`);
