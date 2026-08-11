import { execFile } from "node:child_process";
import { chmod, copyFile, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { checkPublicTree } from "./check-public.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotRoot = path.join(repositoryRoot, ".public-snapshot");

async function ensureSnapshotDoesNotExist() {
  try {
    await lstat(snapshotRoot);
    throw new Error("The public snapshot directory already exists; refusing to replace it.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function copyPublicationTree(paths) {
  for (const relativePath of paths) {
    const source = path.resolve(repositoryRoot, relativePath);
    const destination = path.resolve(snapshotRoot, relativePath);
    if (path.relative(repositoryRoot, source).startsWith("..") || path.relative(snapshotRoot, destination).startsWith("..")) {
      throw new Error(`Refusing to copy a path outside the publication boundary: ${relativePath}`);
    }
    const metadata = await lstat(source);
    if (!metadata.isFile()) throw new Error(`Publication input must be a regular file: ${relativePath}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    await chmod(destination, 0o644);
  }
}

async function git(args, options = {}) {
  return execFileAsync("git", args, {
    cwd: snapshotRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

await ensureSnapshotDoesNotExist();
const readiness = await checkPublicTree();
if (readiness.findings.length > 0) throw new Error("The publication tree does not pass the public-readiness check.");

const paths = readiness.paths;
await mkdir(snapshotRoot, { recursive: false });
await copyPublicationTree(paths);

await git(["init", "--initial-branch=main"]);
await git(["config", "user.name", "Mykola Melnik"]);
await git(["config", "user.email", "1466738+mykola-melnik@users.noreply.github.com"]);
await git(["add", "--force", "--all"]);
await git(["commit", "-m", "Initial public release"]);

const [{ stdout: commit }, { stdout: tree }, { stdout: status }, { stdout: committedPaths }] = await Promise.all([
  git(["rev-parse", "HEAD"]),
  git(["rev-parse", "HEAD^{tree}"]),
  git(["status", "--porcelain=v1"]),
  git(["ls-tree", "-r", "--name-only", "HEAD"]),
]);
if (status !== "") throw new Error("The generated public snapshot is not clean.");
const committed = committedPaths.split("\n").filter(Boolean).sort();
if (committed.join("\n") !== paths.join("\n")) throw new Error("The generated public snapshot does not match PUBLICATION_MANIFEST.txt.");

process.stdout.write(`Public snapshot prepared: files=${paths.length} commit=${commit.trim()} tree=${tree.trim()}\n`);
