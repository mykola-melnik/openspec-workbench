import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { publicationPaths, scanPublicEntries } from "../scripts/check-public.mjs";

const execFileAsync = promisify(execFile);

test("public-readiness scanner accepts portable text", () => {
  assert.deepEqual(
    scanPublicEntries([{ path: "README.md", content: "Use /Users/example/project or git@github.com:example/project.git." }]),
    [],
  );
});

test("public-readiness scanner fails closed without echoing secret content", () => {
  const injectedToken = `ghp_${"A".repeat(36)}`;
  const findings = scanPublicEntries([{ path: "fixture/private.txt", content: injectedToken }]);
  assert.deepEqual(findings, [{ path: "fixture/private.txt", label: "GitHub token" }]);
  assert.equal(JSON.stringify(findings).includes(injectedToken), false);
});

test("public-readiness scanner rejects binary and invalid UTF-8 inputs", () => {
  assert.deepEqual(
    scanPublicEntries([{ path: "fixture/blob.bin", content: Buffer.from([0, 1, 2]) }]),
    [{ path: "fixture/blob.bin", label: "binary publication input" }],
  );
  assert.deepEqual(
    scanPublicEntries([{ path: "fixture/invalid.bin", content: Buffer.from([0xc3, 0x28]) }]),
    [{ path: "fixture/invalid.bin", label: "non-UTF-8 publication input" }],
  );
});

test("public-readiness scanner covers provider credentials and private path boundaries", () => {
  const cases = [
    { value: ["/", "Users", "/", "example-real", "/project"].join(""), label: "personal home path" },
    { value: ["/", "Volumes", "/", "PrivateDisk", "/project"].join(""), label: "mounted private path" },
    { value: ["/", "Users", "/", "private-user", "\nNext line"].join(""), label: "personal home path" },
    { value: ["/", "Volumes", "/", "PrivateDisk", ". Next sentence"].join(""), label: "mounted private path" },
    { value: ["s", "k", "-", "ant", "-", "A".repeat(24)].join(""), label: "Anthropic token" },
    { value: ["s", "k", "-", "proj", "-", "B".repeat(24)].join(""), label: "OpenAI token" },
    { value: ["A", "I", "z", "a", "C".repeat(30)].join(""), label: "Google API key" },
    { value: ["n", "p", "m", "_", "D".repeat(24)].join(""), label: "npm token" },
    { value: ["Authorization", ": Bearer ", "E".repeat(24)].join(""), label: "bearer credential" },
    { value: ["api", "_key=\"", "F".repeat(24), "\""].join(""), label: "credential assignment" },
    { value: ["12345678", "-1234-1234-1234-", "123456789abc"].join(""), label: "runtime session identifier" },
  ];
  for (const [index, fixture] of cases.entries()) {
    const findings = scanPublicEntries([{ path: `fixture/${index}.txt`, content: fixture.value }]);
    assert.ok(findings.some((finding) => finding.label === fixture.label), `Expected ${fixture.label}.`);
    assert.equal(JSON.stringify(findings).includes(fixture.value), false);
  }
});

test("publication manifest rejects an untracked file that was not approved", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openspec-public-manifest-"));
  try {
    await execFileAsync("git", ["init", "--initial-branch=main"], { cwd: root });
    await writeFile(path.join(root, "PUBLICATION_MANIFEST.txt"), "PUBLICATION_MANIFEST.txt\nREADME.md\n", "utf8");
    await writeFile(path.join(root, "README.md"), "Approved.\n", "utf8");
    await execFileAsync("git", ["add", "PUBLICATION_MANIFEST.txt", "README.md"], { cwd: root });
    assert.deepEqual(await publicationPaths(root), ["PUBLICATION_MANIFEST.txt", "README.md"]);
    await writeFile(path.join(root, "PRIVATE_NOTES.md"), "Unapproved.\n", "utf8");
    await assert.rejects(publicationPaths(root), /unexpected:PRIVATE_NOTES\.md/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
