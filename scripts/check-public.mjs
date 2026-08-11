import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicationManifest = "PUBLICATION_MANIFEST.txt";

const prohibitedPatterns = [
  { label: "non-public Git host", expression: /\bgit@(?!github\.com:)[A-Za-z0-9.-]+:/iu },
  { label: "non-public internal origin", expression: /https?:\/\/(?!plans\.internal(?:\/|\b))[^/\s]*\.internal(?:\/|\b)/iu },
  {
    label: "personal home path",
    expression: new RegExp(
      ["/", "Users", "/"].join("") + "(?!(?:example|runner|user)(?:/|$))[^/\\s]+",
      "i",
    ),
  },
  {
    label: "mounted private path",
    expression: new RegExp(["/", "Volumes", "/"].join("") + "(?!(?:Example)(?:/|$))[^/\\s]+", "i"),
  },
  {
    label: "personal contact",
    expression: /\b(?!(?:git@github\.com|[A-Z0-9._%+-]+@(?:example\.(?:com|org|invalid)|users\.noreply\.github\.com))\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  },
  { label: "runtime process identifier", expression: /\b(?:PID|process id)\s*[:=]?\s*[1-9][0-9]+\b/iu },
  { label: "private key", expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", expression: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "GitHub fine-grained token", expression: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "AWS access key", expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "Slack token", expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    label: "Anthropic token",
    expression: new RegExp("\\b" + ["s", "k", "-", "a", "n", "t", "-"].join("") + "[A-Za-z0-9_-]{20,}\\b"),
  },
  {
    label: "OpenAI token",
    expression: new RegExp("\\b" + ["s", "k", "-"].join("") + "(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\\b"),
  },
  {
    label: "Google API key",
    expression: new RegExp("\\b" + ["A", "I", "z", "a"].join("") + "[A-Za-z0-9_-]{20,}\\b"),
  },
  {
    label: "npm token",
    expression: new RegExp("\\b" + ["n", "p", "m", "_"].join("") + "[A-Za-z0-9]{24,}\\b"),
  },
  {
    label: "JWT credential",
    expression: new RegExp("\\b" + ["e", "y", "J"].join("") + "[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b"),
  },
  {
    label: "bearer credential",
    expression: new RegExp(["Authorization", ":", " ", "Bearer", " "].join("") + "[A-Za-z0-9._~-]{16,}", "i"),
  },
  {
    label: "credential assignment",
    expression: new RegExp("\\b(?:" + ["api", "[_-]?", "key", "|pass", "word|sec", "ret|to", "ken"].join("") + ")\\s*[:=]\\s*([\\\"'])[A-Za-z0-9._~-]{16,}\\1", "i"),
  },
  {
    label: "runtime session identifier",
    expression: new RegExp("\\b[0-9a-f]{8}" + ["-", "[0-9a-f]{4}", "-", "[0-9a-f]{4}", "-", "[0-9a-f]{4}", "-", "[0-9a-f]{12}"].join("") + "\\b", "i"),
  },
];

export function scanPublicEntries(entries) {
  const findings = [];
  for (const entry of entries) {
    let content;
    if (Buffer.isBuffer(entry.content)) {
      if (entry.content.includes(0)) {
        findings.push({ path: entry.path, label: "binary publication input" });
        continue;
      }
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(entry.content);
      } catch {
        findings.push({ path: entry.path, label: "non-UTF-8 publication input" });
        continue;
      }
    } else {
      content = entry.content;
      if (content.includes("\0")) {
        findings.push({ path: entry.path, label: "binary publication input" });
        continue;
      }
    }
    const searchable = `${entry.path}\n${content}`;
    for (const pattern of prohibitedPatterns) {
      if (pattern.expression.test(searchable)) {
        findings.push({ path: entry.path, label: pattern.label });
      }
      pattern.expression.lastIndex = 0;
    }
  }
  return findings;
}

async function discoveredPaths(root) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

async function existingPaths(root, paths) {
  const existing = [];
  for (const relativePath of paths) {
    try {
      await lstat(path.join(root, relativePath));
      existing.push(relativePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return existing;
}

export async function publicationPaths(root = repositoryRoot) {
  const manifestSource = await readFile(path.join(root, publicationManifest), "utf8");
  const manifestPaths = manifestSource.split("\n").filter(Boolean);
  const sortedPaths = [...manifestPaths].sort();
  if (manifestPaths.length === 0 || manifestPaths.join("\n") !== sortedPaths.join("\n")) {
    throw new Error("PUBLICATION_MANIFEST.txt must contain a non-empty sorted path list.");
  }
  if (new Set(manifestPaths).size !== manifestPaths.length || !manifestPaths.includes(publicationManifest)) {
    throw new Error("PUBLICATION_MANIFEST.txt must contain unique paths and include itself.");
  }
  for (const relativePath of manifestPaths) {
    if (path.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith("../") || relativePath.includes("/../")) {
      throw new Error(`PUBLICATION_MANIFEST.txt contains an unsafe path: ${relativePath}`);
    }
  }
  const actualPaths = await existingPaths(root, await discoveredPaths(root));
  const expected = new Set(manifestPaths);
  const actual = new Set(actualPaths);
  const unexpected = actualPaths.filter((entry) => !expected.has(entry));
  const missing = manifestPaths.filter((entry) => !actual.has(entry));
  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      ...unexpected.map((entry) => `unexpected:${entry}`),
      ...missing.map((entry) => `missing:${entry}`),
    ];
    throw new Error(`Publication manifest mismatch (${details.join(", ")}).`);
  }
  return manifestPaths;
}

async function readPublicationEntries(root, paths) {
  const entries = [];
  for (const relativePath of paths) {
    const absolutePath = path.resolve(root, relativePath);
    if (path.relative(root, absolutePath).startsWith("..")) {
      throw new Error(`Refusing to scan a path outside the repository: ${relativePath}`);
    }
    try {
      const metadata = await lstat(absolutePath);
      if (!metadata.isFile()) throw new Error(`Publication input must be a regular file: ${relativePath}`);
      const content = await readFile(absolutePath);
      entries.push({ path: relativePath, content });
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Publication input is missing: ${relativePath}`);
      throw error;
    }
  }
  return entries;
}

export async function checkPublicTree(root = repositoryRoot) {
  const paths = await publicationPaths(root);
  const entries = await readPublicationEntries(root, paths);
  return { paths, findings: scanPublicEntries(entries) };
}

async function main() {
  const { paths, findings } = await checkPublicTree();
  if (findings.length > 0) {
    process.stderr.write("Public-readiness check failed:\n");
    for (const finding of findings) {
      process.stderr.write(`- ${finding.path}: ${finding.label}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Public-readiness check passed (${paths.length} publication files scanned).\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    process.stderr.write(`Public-readiness check failed: ${error instanceof Error ? error.message : "unexpected error"}\n`);
    process.exitCode = 1;
  });
}
