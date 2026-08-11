import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  adaptArtifactStatus,
  adaptChangeList,
  adaptDoctor,
  adaptValidation,
  compatibilityManifest,
  validateCompatibilityManifestForTesting,
  verifyOpenSpecCompatibility,
} from "../.workbench-build/testing.mjs";
import { rm } from "node:fs/promises";
import { createFixture } from "./fixture.mjs";

const manifest = JSON.parse(await readFile(new URL("../compatibility.json", import.meta.url), "utf8"));

test("declares the standalone compatibility and fail-closed policy", () => {
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.openspec.supported, ["1.7.x"]);
  assert.deepEqual(manifest.openspec.adapters, { "1.7.x": "openspec-1.7" });
  assert.deepEqual(manifest.standards, { provenanceFile: "standards.version", required: false });
  assert.equal(manifest.unknownFormatPolicy, "fail-closed");
  assert.deepEqual(compatibilityManifest, manifest);
});

test("rejects malformed bundled compatibility declarations", () => {
  assert.throws(
    () => validateCompatibilityManifestForTesting({ ...manifest, unknownFormatPolicy: "guess" }),
    (error) => error?.code === "COMPATIBILITY_MANIFEST_INVALID",
  );
  assert.throws(
    () => validateCompatibilityManifestForTesting({ ...manifest, openspec: { supported: ["1.7.x"], adapters: { "1.7.x": "unknown" } } }),
    (error) => error?.code === "COMPATIBILITY_MANIFEST_INVALID",
  );
});

test("uses OpenSpec protocol compatibility while standards provenance stays optional", async () => {
  for (const standardsVersion of [undefined, "v1.6.0", "v1.7.0", "v1.8.0", "v1.9.0"]) {
    const root = await createFixture({ ...(standardsVersion ? { standardsVersion } : {}) });
    try {
      const result = await verifyOpenSpecCompatibility(root, {
        async version() { return "1.7.0"; },
        async run() { throw new Error("Compatibility selection must not execute a projection command."); },
      });
      assert.equal(result.jsonAdapter, "openspec-1.7");
      assert.equal(result.standardsVersion, standardsVersion ?? null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("rejects an unsupported OpenSpec version before projection commands", async () => {
  const root = await createFixture({ standardsVersion: "v1.9.0" });
  let projectionCalls = 0;
  try {
    await assert.rejects(verifyOpenSpecCompatibility(root, {
      async version() { return "2.0.0"; },
      async run() { projectionCalls += 1; return {}; },
    }), (error) => error?.code === "OPENSPEC_VERSION_UNSUPPORTED");
    assert.equal(projectionCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("adapts the declared OpenSpec 1.7 shapes", () => {
  assert.equal(adaptChangeList({ changes: [{ name: "plan", completedTasks: 1, totalTasks: 2 }] })[0].id, "plan");
  assert.deepEqual(adaptArtifactStatus({ artifacts: [{ id: "proposal", status: "done" }] }), [{ id: "proposal", status: "done" }]);
  assert.deepEqual(adaptDoctor({ root: { healthy: true } }), { healthy: true });
  assert.equal(adaptValidation({ items: [{ valid: true }], summary: { totals: { failed: 0 } } }).state, "valid");
});

test("rejects unknown OpenSpec shapes instead of guessing", () => {
  assert.throws(() => adaptChangeList({ version: 99 }), /not supported/u);
  assert.throws(() => adaptArtifactStatus({ artifacts: "unknown" }), /not supported/u);
  assert.throws(() => adaptDoctor({ root: {} }), /not supported/u);
  assert.throws(() => adaptValidation({}), /not supported/u);
});
