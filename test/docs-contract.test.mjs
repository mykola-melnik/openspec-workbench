import assert from "node:assert/strict";
import test from "node:test";
import { documentationFindings } from "../scripts/check-docs.mjs";

const requiredPaths = [
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

function fixture() {
  return {
    packageJson: {
      version: "0.1.0",
      engines: { node: ">=20.20.0" },
      scripts: {
        start: "node server.mjs --hub",
        hub: "node server.mjs --hub",
        project: "node server.mjs project",
        "check:docs": "node scripts/check-docs.mjs",
        "check:release": "node scripts/check-docs.mjs --release",
        "docs:build": "python3 -m mkdocs build --strict",
      },
    },
    readme: [
      "Node.js 20.20 or newer",
      "```bash\nnpm start\n```",
      "npm run project -- --root /absolute/path/to/project",
      "Windows desktop support is provisional",
      "per-process CSRF token",
      "[changelog](CHANGELOG.md)",
    ].join("\n"),
    gettingStarted: [
      "Node.js 20.20 or newer",
      "```bash\nnpm start\n```",
      "npm run project -- --root /absolute/path/to/project",
      "A current browser that sends Fetch Metadata headers",
    ].join("\n"),
    changelog: [
      "# Changelog",
      "## [Unreleased]",
      "## [0.1.0] - Pending",
    ].join("\n"),
    mkdocsSource: [
      "docs_dir: docs",
      "site_dir: .workbench-docs-site",
      "strict: true",
      "nav:",
      "  - Overview: index.md",
      "  - Start: getting-started.md",
      "  - Security: security.md",
      "  - Release: release-operations.md",
    ].join("\n"),
    workflowSource: [
      "jobs:",
      "  verify:",
      "    strategy:",
      "      matrix:",
      "        node: [\"20.20.0\", \"22.23.1\"]",
    ].join("\n"),
    publicationManifest: `${requiredPaths.join("\n")}\n`,
    nvmrc: "22.23.1\n",
    existingPaths: [...requiredPaths],
  };
}

test("documentation contract accepts consistent release metadata", () => {
  assert.deepEqual(documentationFindings(fixture()), []);
});

test("documentation contract rejects stale startup instructions", () => {
  const input = fixture();
  input.readme += "\nnpm run start -- --root /tmp/project";
  assert.ok(documentationFindings(input).some((finding) => finding.message.includes("obsolete implicit one-project")));
});

test("documentation contract rejects stale MkDocs startup instructions", () => {
  const input = fixture();
  input.gettingStarted = input.gettingStarted.replace("npm start", "npm run old-start");
  assert.ok(documentationFindings(input).some((finding) => finding.file === "docs/getting-started.md"));
});

test("documentation contract does not silently skip a patch-level Node minimum", () => {
  const input = fixture();
  input.packageJson.engines.node = ">=20.20.1";
  assert.ok(documentationFindings(input).some((finding) => finding.message === "Node minimum does not match package engines"));
});

test("documentation contract rejects package and changelog version drift", () => {
  const input = fixture();
  input.packageJson.version = "0.2.0";
  assert.ok(documentationFindings(input).some((finding) => finding.file === "CHANGELOG.md"));
});

test("documentation contract accepts a finalized release date", () => {
  const input = fixture();
  input.changelog = input.changelog.replace("## [0.1.0] - Pending", "## [0.1.0] - 2026-08-11");
  input.changelog += "\n[Unreleased]: https://github.com/mykola-melnik/openspec-workbench/compare/v0.1.0...HEAD";
  input.changelog += "\n[0.1.0]: https://github.com/mykola-melnik/openspec-workbench/releases/tag/v0.1.0";
  assert.deepEqual(documentationFindings(input, { release: true }), []);
});

test("release contract rejects an unfinalized changelog date", () => {
  const input = fixture();
  assert.ok(documentationFindings(input, { release: true }).some((finding) => finding.message.includes("finalized YYYY-MM-DD")));
});

test("future pending versions compare from the latest finalized release", () => {
  const input = fixture();
  input.packageJson.version = "0.2.0";
  input.changelog = input.changelog.replace("## [0.1.0] - Pending", [
    "## [0.2.0] - Pending",
    "## [0.1.0] - 2026-08-11",
  ].join("\n"));
  input.changelog += "\n[Unreleased]: https://github.com/mykola-melnik/openspec-workbench/compare/v0.1.0...HEAD";
  input.changelog += "\n[0.1.0]: https://github.com/mykola-melnik/openspec-workbench/releases/tag/v0.1.0";
  assert.deepEqual(documentationFindings(input), []);
});

test("documentation contract rejects missing MkDocs navigation targets", () => {
  const input = fixture();
  input.existingPaths = input.existingPaths.filter((entry) => entry !== "docs/security.md");
  assert.ok(documentationFindings(input).some((finding) => finding.message === "navigation target is missing: docs/security.md"));
});

test("documentation contract rejects navigation outside the documentation root", () => {
  const input = fixture();
  input.mkdocsSource = input.mkdocsSource.replace("security.md", "../README.md");
  input.existingPaths.push("README.md");
  assert.ok(documentationFindings(input).some((finding) => finding.message.includes("contained Markdown source")));
});

test("documentation contract rejects malformed changelog structure", () => {
  const input = fixture();
  input.changelog = input.changelog.replace("## [Unreleased]", "## Next");
  assert.ok(documentationFindings(input).some((finding) => finding.message.includes("## [Unreleased]")));
});

test("documentation contract rejects documentation omitted from publication", () => {
  const input = fixture();
  input.publicationManifest = input.publicationManifest.replace("requirements-docs.txt\n", "");
  assert.ok(documentationFindings(input).some((finding) => finding.message === "missing documentation input: requirements-docs.txt"));
});
