import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readYaml(relativePath) {
  const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  const document = parseDocument(source, { prettyErrors: false, strict: true });
  assert.deepEqual(document.errors, [], `${relativePath} must be valid YAML.`);
  return document.toJS();
}

const workflow = await readYaml(".github/workflows/ci.yml");
assert.equal(workflow.permissions?.contents, "read", "CI must use read-only repository permissions.");
assert.deepEqual(Object.keys(workflow.permissions), ["contents"], "CI must not request additional token permissions.");

const steps = workflow.jobs?.verify?.steps;
assert.ok(Array.isArray(steps), "CI must define the verify job steps.");
assert.deepEqual(workflow.jobs?.verify?.strategy?.matrix?.node, ["20.20.0", "22.23.1"], "CI must test the declared Node minimum and pinned development release.");
const checkout = steps.find((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
assert.equal(checkout?.with?.["persist-credentials"], false, "Checkout credentials must not persist.");
assert.match(checkout?.uses ?? "", /@[0-9a-f]{40}$/u, "Checkout must be pinned to a commit SHA.");
const setupNode = steps.find((step) => String(step.uses ?? "").startsWith("actions/setup-node@"));
assert.match(setupNode?.uses ?? "", /@[0-9a-f]{40}$/u, "Node setup must be pinned to a commit SHA.");
assert.equal(setupNode?.with?.["node-version"], "${{ matrix.node }}", "CI must use the declared Node version matrix.");

const runCommands = steps.flatMap((step) => typeof step.run === "string" ? [step.run] : []);
for (const required of ["npm ci", "npm run verify", "npm audit --audit-level=high"]) {
  assert.ok(runCommands.includes(required), `CI must run ${required}.`);
}
for (const command of runCommands) {
  assert.doesNotMatch(command, /\b(?:git\s+push|npm\s+publish|gh\s+release|deploy)\b/iu, "CI must not publish or deploy.");
}

const dependabot = await readYaml(".github/dependabot.yml");
assert.equal(dependabot.version, 2, "Dependabot configuration must use version 2.");
const ecosystems = new Set((dependabot.updates ?? []).map((entry) => entry["package-ecosystem"]));
assert.deepEqual(ecosystems, new Set(["npm", "github-actions"]), "Dependabot must cover npm and GitHub Actions.");

process.stdout.write("GitHub configuration verified: valid YAML, pinned actions, read-only permissions, and non-publishing gates.\n");
