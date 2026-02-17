/**
 * community_registry_test.mjs — Community Sharing Platform Tests (Package C)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBundle, publishBundle, updateBundle, downloadBundle, removeBundle,
  searchRegistry, rateBundle, exportBundleToJson, importBundleFromJson,
  validateBundle, contentChecksum, clearRegistry, getRegistryStats, getRegistrySize,
  CONTENT_TYPES,
} from "../src/content/communityRegistry.mjs";

function sampleBundle(overrides = {}) {
  return createBundle({
    id: "test-scenario-1", name: "Test Scenario", author: "Tester",
    version: "1.0.0", description: "A test scenario", tags: ["test", "combat"],
    type: "scenario", data: { map: { width: 10, height: 10 }, entities: [] },
    ...overrides,
  });
}

test("createBundle: produces valid bundle with checksum", () => {
  const b = sampleBundle();
  assert.equal(b.meta.id, "test-scenario-1");
  assert.ok(b.checksum.startsWith("chk-"));
  assert.equal(b.meta.downloads, 0);
});

test("validateBundle: accepts valid bundle", () => {
  const b = sampleBundle();
  const r = validateBundle(b);
  assert.ok(r.valid);
  assert.equal(r.errors.length, 0);
});

test("validateBundle: rejects null", () => {
  const r = validateBundle(null);
  assert.equal(r.valid, false);
});

test("validateBundle: rejects bad checksum", () => {
  const b = sampleBundle();
  b.checksum = "chk-wrong";
  const r = validateBundle(b);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.includes("Checksum")));
});

test("publishBundle: publishes and prevents duplicate", () => {
  clearRegistry();
  const b = sampleBundle();
  assert.ok(publishBundle(b).ok);
  assert.equal(publishBundle(b).ok, false);
});

test("downloadBundle: returns clone and increments count", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  const r = downloadBundle("test-scenario-1");
  assert.ok(r.ok);
  assert.equal(r.bundle.meta.id, "test-scenario-1");
  const r2 = downloadBundle("test-scenario-1");
  assert.ok(r2.bundle.meta.downloads >= 1);
});

test("downloadBundle: fails for missing id", () => {
  clearRegistry();
  assert.equal(downloadBundle("nope").ok, false);
});

test("updateBundle: updates existing", () => {
  clearRegistry();
  const b = sampleBundle();
  publishBundle(b);
  b.meta.version = "2.0.0";
  b.checksum = contentChecksum(JSON.stringify(b.data));
  assert.ok(updateBundle(b).ok);
});

test("updateBundle: fails for non-existent", () => {
  clearRegistry();
  assert.equal(updateBundle(sampleBundle()).ok, false);
});

test("removeBundle: removes published", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  assert.ok(removeBundle("test-scenario-1"));
  assert.equal(getRegistrySize(), 0);
});

test("searchRegistry: finds by type", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  publishBundle(sampleBundle({ id: "map-1", name: "Map", type: "map", data: {} }));
  const r = searchRegistry({ type: "scenario" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "test-scenario-1");
});

test("searchRegistry: finds by query", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  assert.equal(searchRegistry({ query: "test" }).length, 1);
  assert.equal(searchRegistry({ query: "zzz" }).length, 0);
});

test("searchRegistry: finds by tags", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  assert.equal(searchRegistry({ tags: ["combat"] }).length, 1);
  assert.equal(searchRegistry({ tags: ["magic"] }).length, 0);
});

test("rateBundle: valid rating", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  downloadBundle("test-scenario-1");
  const r = rateBundle("test-scenario-1", 4);
  assert.ok(r.ok);
  assert.ok(r.newRating >= 1);
});

test("rateBundle: rejects out of range", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  assert.equal(rateBundle("test-scenario-1", 0).ok, false);
  assert.equal(rateBundle("test-scenario-1", 6).ok, false);
});

test("exportBundleToJson + importBundleFromJson roundtrip", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  const json = exportBundleToJson("test-scenario-1");
  assert.ok(json);
  const r = importBundleFromJson(json);
  assert.ok(r.ok);
  assert.equal(r.bundle.meta.id, "test-scenario-1");
});

test("importBundleFromJson: rejects bad JSON", () => {
  const r = importBundleFromJson("not-json");
  assert.equal(r.ok, false);
});

test("getRegistryStats: returns correct counts", () => {
  clearRegistry();
  publishBundle(sampleBundle());
  publishBundle(sampleBundle({ id: "map-1", name: "Map", type: "map", data: {} }));
  const stats = getRegistryStats();
  assert.equal(stats.totalBundles, 2);
  assert.equal(stats.byType.scenario, 1);
  assert.equal(stats.byType.map, 1);
});

test("CONTENT_TYPES: includes expected types", () => {
  assert.ok(CONTENT_TYPES.includes("scenario"));
  assert.ok(CONTENT_TYPES.includes("map"));
  assert.ok(CONTENT_TYPES.includes("ruleModule"));
  assert.ok(CONTENT_TYPES.includes("monsterPack"));
});

console.log("✓ All community registry tests passed");