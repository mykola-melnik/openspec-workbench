import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryUrl = "https://github.com/mykola-melnik/openspec-workbench";

function add(findings, file, message) {
  findings.push({ file, message });
}

function parseYaml(source, file, findings) {
  const document = parseDocument(source, { prettyErrors: false, strict: true });
  if (document.errors.length > 0) {
    add(findings, file, "must contain valid YAML");
    return undefined;
  }
  return document.toJS();
}

function navigationTargets(value, targets = []) {
  if (typeof value === "string") targets.push(value);
  else if (Array.isArray(value)) for (const item of value) navigationTargets(item, targets);
  else if (value && typeof value === "object") for (const item of Object.values(value)) navigationTargets(item, targets);
  return targets;
}

function manifestPaths(source) {
  return source.split("\n").filter(Boolean);
}

function normalizedText(source) {
  return source.replace(/\s+/gu, " ").trim();
}

function compareSemver(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function documentationFindings(input, options = {}) {
  const findings = [];
  const packageJson = input.packageJson;
  const version = String(packageJson.version ?? "");
  const scripts = packageJson.scripts ?? {};
  const minimumNodeMatch = String(packageJson.engines?.node ?? "").match(/^>=(\d+)\.(\d+)\.(\d+)$/u);
  if (!minimumNodeMatch) add(findings, "package.json", "engines.node must declare one exact >=X.Y.Z minimum");
  const minimumNode = minimumNodeMatch
    ? minimumNodeMatch[3] === "0" ? `${minimumNodeMatch[1]}.${minimumNodeMatch[2]}` : `${minimumNodeMatch[1]}.${minimumNodeMatch[2]}.${minimumNodeMatch[3]}`
    : undefined;

  if (!/^\d+\.\d+\.\d+$/u.test(version)) add(findings, "package.json", "version must be SemVer");
  if (!String(scripts.start ?? "").includes("server.mjs --hub")) add(findings, "package.json", "npm start must launch the Projects Hub");
  if (scripts.hub !== scripts.start) add(findings, "package.json", "npm run hub must remain an alias of npm start");
  if (!String(scripts.project ?? "").includes("server.mjs project")) add(findings, "package.json", "npm run project must use the explicit one-project role");
  if (scripts["check:docs"] !== "node scripts/check-docs.mjs") add(findings, "package.json", "check:docs must run the documentation contract checker");
  if (scripts["check:release"] !== "node scripts/check-docs.mjs --release") add(findings, "package.json", "check:release must enable the finalized release contract");
  if (scripts["docs:build"] !== "python3 -m mkdocs build --strict") add(findings, "package.json", "docs:build must run MkDocs in strict mode");

  const requiredReadme = [
    "```bash\nnpm start\n```",
    "npm run project -- --root /absolute/path/to/project",
    "Windows desktop support is provisional",
    "per-process CSRF token",
    "[changelog](CHANGELOG.md)",
  ];
  const normalizedReadme = normalizedText(input.readme);
  for (const text of requiredReadme) if (!normalizedReadme.includes(normalizedText(text))) add(findings, "README.md", `missing required contract: ${text}`);
  if (input.readme.includes("npm run start -- --root")) add(findings, "README.md", "contains the obsolete implicit one-project startup command");
  if (minimumNode && !input.readme.includes(`Node.js ${minimumNode} or newer`)) add(findings, "README.md", "Node minimum does not match package engines");
  for (const text of [
    minimumNode ? `Node.js ${minimumNode} or newer` : "",
    "```bash\nnpm start\n```",
    "npm run project -- --root /absolute/path/to/project",
    "Fetch Metadata headers",
  ].filter(Boolean)) {
    if (!normalizedText(input.gettingStarted).includes(normalizedText(text))) add(findings, "docs/getting-started.md", `missing required contract: ${text}`);
  }

  const requiredChangelog = ["# Changelog", "## [Unreleased]"];
  for (const text of requiredChangelog) if (!input.changelog.includes(text)) add(findings, "CHANGELOG.md", `missing release contract: ${text}`);
  const releases = [...input.changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (Pending|\d{4}-\d{2}-\d{2})$/gmu)]
    .map((match) => ({ version: match[1], state: match[2] }));
  const currentRelease = releases.find((release) => release.version === version);
  if (!currentRelease) {
    add(findings, "CHANGELOG.md", `missing release heading for package version ${version}`);
  } else {
    if (options.release === true && currentRelease.state === "Pending") {
      add(findings, "CHANGELOG.md", `release ${version} must have a finalized YYYY-MM-DD date`);
    }
    const finalized = releases.filter((release) => release.state !== "Pending");
    const latestFinalized = finalized.reduce((latest, release) => !latest || compareSemver(release.version, latest.version) > 0 ? release : latest, undefined);
    const comparisonBase = currentRelease.state === "Pending" ? latestFinalized?.version : currentRelease.version;
    const currentReleaseLink = `[${version}]: ${repositoryUrl}/releases/tag/v${version}`;
    if (currentRelease.state === "Pending" && input.changelog.includes(currentReleaseLink)) {
      add(findings, "CHANGELOG.md", `pending release ${version} must not advertise a tag that does not exist`);
    }
    if (comparisonBase) {
      for (const text of [
        `[Unreleased]: ${repositoryUrl}/compare/v${comparisonBase}...HEAD`,
        `[${comparisonBase}]: ${repositoryUrl}/releases/tag/v${comparisonBase}`,
      ]) {
        if (!input.changelog.includes(text)) add(findings, "CHANGELOG.md", `missing release contract: ${text}`);
      }
    } else if (/^\[Unreleased\]:/mu.test(input.changelog)) {
      add(findings, "CHANGELOG.md", "Unreleased must not compare against a tag before the first release is finalized");
    }
  }

  const mkdocs = parseYaml(input.mkdocsSource, "mkdocs.yml", findings);
  if (mkdocs) {
    if (mkdocs.docs_dir !== "docs") add(findings, "mkdocs.yml", "docs_dir must remain docs");
    if (mkdocs.site_dir !== ".workbench-docs-site") add(findings, "mkdocs.yml", "site_dir must remain ignored derived output");
    if (mkdocs.strict !== true) add(findings, "mkdocs.yml", "strict mode must be enabled");
    const targets = navigationTargets(mkdocs.nav);
    for (const required of ["index.md", "getting-started.md", "security.md", "release-operations.md"]) {
      if (!targets.includes(required)) add(findings, "mkdocs.yml", `navigation must include ${required}`);
    }
    for (const target of targets) {
      if (path.posix.isAbsolute(target) || target.split("/").includes("..") || !target.endsWith(".md")) {
        add(findings, "mkdocs.yml", `navigation target must be a contained Markdown source: ${target}`);
        continue;
      }
      const relativePath = path.posix.join("docs", target);
      if (!input.existingPaths.includes(relativePath)) add(findings, "mkdocs.yml", `navigation target is missing: ${relativePath}`);
    }
  }

  const workflow = parseYaml(input.workflowSource, ".github/workflows/ci.yml", findings);
  const nodeMatrix = workflow?.jobs?.verify?.strategy?.matrix?.node ?? [];
  const minimumExact = String(packageJson.engines?.node ?? "").replace(/^>=/u, "");
  const developmentNode = input.nvmrc.trim();
  if (!Array.isArray(nodeMatrix) || !nodeMatrix.includes(minimumExact) || !nodeMatrix.includes(developmentNode)) {
    add(findings, ".github/workflows/ci.yml", "Node matrix must include package minimum and .nvmrc versions");
  }

  const manifest = manifestPaths(input.publicationManifest);
  const requiredPublicationPaths = [
    "CHANGELOG.md",
    "README.md",
    "mkdocs.yml",
    "requirements-docs.in",
    "requirements-docs.txt",
    "docs/index.md",
    "docs/getting-started.md",
    "docs/security.md",
    "docs/release-operations.md",
    "scripts/check-docs.mjs",
    "test/docs-contract.test.mjs",
  ];
  for (const required of requiredPublicationPaths) {
    if (!manifest.includes(required)) add(findings, "PUBLICATION_MANIFEST.txt", `missing documentation input: ${required}`);
    if (!input.existingPaths.includes(required)) add(findings, required, "documented publication input is missing");
  }

  return findings;
}

async function existingManifestPaths(root, source) {
  const existing = [];
  for (const relativePath of manifestPaths(source)) {
    try {
      const metadata = await lstat(path.join(root, relativePath));
      if (metadata.isFile()) existing.push(relativePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return existing;
}

export async function checkDocumentation(root = repositoryRoot, options = {}) {
  const [packageSource, readme, gettingStarted, changelog, mkdocsSource, workflowSource, publicationManifest, nvmrc] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "docs/getting-started.md"), "utf8"),
    readFile(path.join(root, "CHANGELOG.md"), "utf8"),
    readFile(path.join(root, "mkdocs.yml"), "utf8"),
    readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"),
    readFile(path.join(root, "PUBLICATION_MANIFEST.txt"), "utf8"),
    readFile(path.join(root, ".nvmrc"), "utf8"),
  ]);
  return documentationFindings({
    packageJson: JSON.parse(packageSource),
    readme,
    gettingStarted,
    changelog,
    mkdocsSource,
    workflowSource,
    publicationManifest,
    nvmrc,
    existingPaths: await existingManifestPaths(root, publicationManifest),
  }, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = process.argv.includes("--release");
  const findings = await checkDocumentation(repositoryRoot, { release }).catch((error) => [{ file: "documentation", message: error instanceof Error ? error.message : "unexpected error" }]);
  if (findings.length > 0) {
    process.stderr.write("Documentation drift check failed:\n");
    for (const finding of findings) process.stderr.write(`- ${finding.file}: ${finding.message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${release ? "Release" : "Documentation drift"} check passed: commands, versions, navigation, changelog, and publication inventory agree.\n`);
  }
}
