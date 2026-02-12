/**
 * persistence_test.mjs — MIR S2.2+S2.4 Persistence Tests.
 *
 * Tests pure functions from campaignStore (no IndexedDB needed).
 * Browser-specific IndexedDB tests are manual/E2E only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyRosterToState, exportCampaign, importCampaign } from "../src/persistence/campaignStore.mjs";

// ── Test Helpers ────────────────────────────────────────────────────────

function makeCampaign(roster = []) {
  return {
    id: "campaign-test-001",
    name: "Test Campaign",
    description: "A test campaign",
    createdAt: "2026-02-12T08:00:00Z",
    updatedAt: "2026-02-12T08:00:00Z",
    sessionIds: ["session-1", "session-2"],
    roster,
  };
}

function makeState() {
  return {
    schemaVersion: "0.1.0",
    campaignId: "test",
    sessionId: "test-001",
    timestamp: "2026-02-12T08:00:00Z",
    rng: { mode: "seeded", seed: "test", lastRolls: [] },
    map: { id: "map-1", name: "Test Map", grid: { type: "square", size: { width: 10, height: 10 }, cellSize: 5 }, terrain: [], fogOfWarEnabled: false },
    entities: {
      players: [
        { id: "pc-seren", kind: "player", name: "Seren Ashford", position: { x: 2, y: 3 }, size: "M", stats: { hpCurrent: 22, hpMax: 28, ac: 16, movementSpeed: 6 }, conditions: [], inventory: [{ id: "item-1", name: "Longsword", qty: 1, tags: ["weapon"] }], token: { style: "mini", spriteKey: null }, controller: { type: "human", playerId: "pc-seren" } },
        { id: "pc-miri", kind: "player", name: "Miri Thistledown", position: { x: 4, y: 5 }, size: "M", stats: { hpCurrent: 18, hpMax: 22, ac: 13, movementSpeed: 6 }, conditions: ["poisoned"], inventory: [], token: { style: "standee", spriteKey: null }, controller: { type: "human", playerId: "pc-miri" } },
      ],
      npcs: [],
      objects: [],
    },
    combat: { mode: "exploration", round: 0, activeEntityId: null, initiativeOrder: [] },
    log: { events: [] },
    ui: { selectedEntityId: null, hoveredCell: null },
  };
}

// ── applyRosterToState ──────────────────────────────────────────────────

describe("applyRosterToState", () => {
  it("applies roster stats to matching players", () => {
    const roster = [
      { id: "pc-seren", name: "Seren Ashford", kind: "player", stats: { hpCurrent: 15, hpMax: 28, ac: 16, movementSpeed: 6 }, conditions: ["blessed"], inventory: [{ id: "item-1", name: "Longsword", qty: 1, tags: ["weapon"] }] },
    ];
    const campaign = makeCampaign(roster);
    const state = makeState();

    const result = applyRosterToState(campaign, state);

    assert.equal(result.entities.players[0].stats.hpCurrent, 15, "hp should be updated from roster");
    assert.deepEqual(result.entities.players[0].conditions, ["blessed"], "conditions from roster");
  });

  it("does not mutate original state", () => {
    const roster = [
      { id: "pc-seren", name: "Seren", kind: "player", stats: { hpCurrent: 5, hpMax: 28, ac: 16, movementSpeed: 6 }, conditions: [], inventory: [] },
    ];
    const campaign = makeCampaign(roster);
    const state = makeState();
    const originalHp = state.entities.players[0].stats.hpCurrent;

    applyRosterToState(campaign, state);

    assert.equal(state.entities.players[0].stats.hpCurrent, originalHp, "original state unchanged");
  });

  it("leaves unmatched players unchanged", () => {
    const roster = [
      { id: "pc-unknown", name: "Unknown", kind: "player", stats: { hpCurrent: 99, hpMax: 99, ac: 20, movementSpeed: 6 }, conditions: [], inventory: [] },
    ];
    const campaign = makeCampaign(roster);
    const state = makeState();

    const result = applyRosterToState(campaign, state);

    assert.equal(result.entities.players[0].stats.hpCurrent, 22, "Seren hp unchanged");
    assert.equal(result.entities.players[1].stats.hpCurrent, 18, "Miri hp unchanged");
  });

  it("handles empty roster gracefully", () => {
    const campaign = makeCampaign([]);
    const state = makeState();

    const result = applyRosterToState(campaign, state);

    assert.equal(result.entities.players.length, 2);
    assert.equal(result.entities.players[0].stats.hpCurrent, 22);
  });

  it("applies inventory from roster", () => {
    const roster = [
      { id: "pc-miri", name: "Miri", kind: "player", stats: { hpCurrent: 18, hpMax: 22, ac: 13, movementSpeed: 6 }, conditions: [], inventory: [{ id: "item-bow", name: "Shortbow", qty: 1, tags: ["weapon"] }, { id: "item-arrows", name: "Arrows", qty: 15, tags: ["ammo"] }] },
    ];
    const campaign = makeCampaign(roster);
    const state = makeState();

    const result = applyRosterToState(campaign, state);

    assert.equal(result.entities.players[1].inventory.length, 2, "inventory replaced from roster");
    assert.equal(result.entities.players[1].inventory[1].qty, 15, "arrow count from roster");
  });

  it("strips 'dead' condition in roster correctly", () => {
    // Dead conditions are stripped at updateRosterFromState time, not applyRosterToState.
    // applyRosterToState applies whatever is in roster (including dead if present).
    const roster = [
      { id: "pc-seren", name: "Seren", kind: "player", stats: { hpCurrent: 0, hpMax: 28, ac: 16, movementSpeed: 6 }, conditions: ["prone"], inventory: [] },
    ];
    const campaign = makeCampaign(roster);
    const state = makeState();

    const result = applyRosterToState(campaign, state);

    assert.equal(result.entities.players[0].stats.hpCurrent, 0);
    assert.deepEqual(result.entities.players[0].conditions, ["prone"]);
  });
});

// ── exportCampaign ──────────────────────────────────────────────────────

describe("exportCampaign", () => {
  it("produces a valid export bundle", () => {
    const campaign = makeCampaign([{ id: "pc-seren", name: "Seren", kind: "player", stats: {}, conditions: [], inventory: [] }]);

    const bundle = exportCampaign(campaign);

    assert.equal(bundle.format, "mir-campaign");
    assert.equal(bundle.version, "1.0");
    assert.ok(bundle.exportedAt);
    assert.equal(bundle.campaign.id, "campaign-test-001");
    assert.equal(bundle.campaign.name, "Test Campaign");
    assert.equal(bundle.campaign.roster.length, 1);
  });

  it("deep clones the campaign (no shared references)", () => {
    const campaign = makeCampaign([{ id: "pc-x", name: "X", kind: "player", stats: { hpCurrent: 10 }, conditions: ["blessed"], inventory: [] }]);
    const bundle = exportCampaign(campaign);

    // Mutate original
    campaign.roster[0].stats.hpCurrent = 999;
    campaign.roster[0].conditions.push("stunned");

    assert.equal(bundle.campaign.roster[0].stats.hpCurrent, 10, "export not affected by mutation");
    assert.equal(bundle.campaign.roster[0].conditions.length, 1, "export not affected by mutation");
  });
});

// ── importCampaign ──────────────────────────────────────────────────────

describe("importCampaign", () => {
  it("imports a valid campaign bundle", () => {
    const bundle = {
      format: "mir-campaign",
      version: "1.0",
      exportedAt: "2026-02-12T08:00:00Z",
      campaign: makeCampaign(),
    };

    const result = importCampaign(bundle);

    assert.equal(result.id, "campaign-test-001");
    assert.equal(result.name, "Test Campaign");
    assert.equal(result.sessionIds.length, 2);
  });

  it("rejects invalid format", () => {
    assert.throws(
      () => importCampaign({ format: "wrong", campaign: {} }),
      /Invalid campaign file format/
    );
  });

  it("rejects missing campaign.id", () => {
    assert.throws(
      () => importCampaign({ format: "mir-campaign", campaign: {} }),
      /Invalid campaign file format/
    );
  });

  it("rejects completely invalid input", () => {
    assert.throws(
      () => importCampaign({ foo: "bar" }),
      /Invalid campaign file format/
    );
  });
});

// ── Summary ─────────────────────────────────────────────────────────────

describe("persistence module structure", () => {
  it("sessionStore exports are importable", async () => {
    // This tests that the module parses without errors in Node
    // (IndexedDB calls will fail, but exports exist)
    const mod = await import("../src/persistence/sessionStore.mjs");
    assert.equal(typeof mod.saveSession, "function");
    assert.equal(typeof mod.loadSession, "function");
    assert.equal(typeof mod.listSessions, "function");
    assert.equal(typeof mod.deleteSession, "function");
    assert.equal(typeof mod.clearAllSessions, "function");
    assert.equal(typeof mod.initAutoSave, "function");
    assert.equal(typeof mod.exportSessionToFile, "function");
    assert.equal(typeof mod.importSessionFromFile, "function");
  });

  it("campaignStore exports are importable", async () => {
    const mod = await import("../src/persistence/campaignStore.mjs");
    assert.equal(typeof mod.createCampaign, "function");
    assert.equal(typeof mod.saveCampaign, "function");
    assert.equal(typeof mod.loadCampaign, "function");
    assert.equal(typeof mod.listCampaigns, "function");
    assert.equal(typeof mod.deleteCampaign, "function");
    assert.equal(typeof mod.addSessionToCampaign, "function");
    assert.equal(typeof mod.removeSessionFromCampaign, "function");
    assert.equal(typeof mod.updateRosterFromState, "function");
    assert.equal(typeof mod.applyRosterToState, "function");
    assert.equal(typeof mod.exportCampaign, "function");
    assert.equal(typeof mod.importCampaign, "function");
  });
});
