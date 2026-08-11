import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "openspec-workbench-verify-"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repositoryRoot, "scripts/build.mjs"), "--outdir", temporary], { cwd: repositoryRoot, stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Build exited with ${code}`)));
    child.on("error", reject);
  });
  const files = ["server.mjs", "testing.mjs", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  const hashes = [];
  for (const file of files) {
    const [committed, rebuilt] = await Promise.all([
      readFile(path.join(repositoryRoot, "dist", file)),
      readFile(path.join(temporary, file)),
    ]);
    if (hash(committed) !== hash(rebuilt)) throw new Error(`Committed ${file} differs from a clean deterministic rebuild.`);
    hashes.push(`${file}:${hash(rebuilt)}`);
  }
  process.stdout.write(`Workbench bundle verified: ${hashes.join(" ")}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
