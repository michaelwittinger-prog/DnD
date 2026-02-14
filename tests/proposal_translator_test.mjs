/**
 * proposal_translator_test.mjs — Tests for proposalToActions + bootstrapState.
 *
 * Tests the one-way translation from AI response ops to engine DeclaredActions,
 * and the one-time pipeline→engine state bootstrap converter.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { translateProposal } from "../src/pipeline/proposalToActions.mjs";
import { bootstrapEngineState } from "../src/state/bootstrapState.mjs";
import { explorationExample, combatExample } from "../src/state/exampleStates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(ROOT, "fixtures", name), "utf-8"));
}

function loadGameState() {
  return JSON.parse(readFileSync(resolve(ROOT, "game_state.example.json"), "utf-8"));
}

// ════════════════════════════════════════════════════════════════════════
// bootstrapEngineState tests
// ════════════════════════════════════════════════════════════════════════

describe("bootstrapEngineState", () => {
  const pipelineState = loadGameState();
  const engineState = bootstrapEngineState(pipelineState);

  it("produces a valid engine state shape", () => {
    assert.ok(engineState.schemaVersion);
    assert.ok(engineState.map);
    assert.ok(engineState.map.grid);
    assert.ok(engineState.map.grid.size);
    assert.ok(engineState.entities);
    assert.ok(Array.isArray(engineState.entities.players));
    assert.ok(Array.isArray(engineState.entities.npcs));
    assert.ok(Array.isArray(engineState.entities.objects));
    assert.ok(engineState.combat);
    assert.ok(engineState.rng);
    assert.ok(engineState.log);
    assert.ok(Array.isArray(engineState.log.events));
    assert.ok(engineState.ui);
  });

  it("converts map dimensions to grid.size", () => {
    assert.equal(engineState.map.grid.size.width, 20);
    assert.equal(engineState.map.grid.size.height, 15);
  });

  it("converts map name", () => {
    assert.equal(engineState.map.name, "Ravenford Square");
  });

  it("splits flat entities into players/npcs", () => {
    assert.equal(engineState.entities.players.length, 1, "Should have 1 player");
    assert.equal(engineState.entities.npcs.length, 1, "Should have 1 NPC");
    assert.equal(engineState.entities.objects.length, 0, "Should have 0 objects");
  });

  it("converts entity fields correctly", () => {
    const seren = engineState.entities.players[0];
    assert.equal(seren.id, "pc-01");
    assert.equal(seren.kind, "player");
    assert.equal(seren.name, "Seren");
    assert.equal(seren.position.x, 5);
    assert.equal(seren.position.y, 6);
    assert.equal(seren.stats.hpCurrent, 24);
    assert.equal(seren.stats.hpMax, 24);
    assert.equal(seren.stats.ac, 16);
    assert.equal(seren.stats.movementSpeed, 6);
    assert.deepEqual(seren.conditions, []);
  });

  it("converts NPC entity correctly", () => {
    const voss = engineState.entities.npcs[0];
    assert.equal(voss.id, "npc-02");
    assert.equal(voss.kind, "npc");
    assert.equal(voss.name, "Captain Voss");
    assert.equal(voss.stats.hpCurrent, 23);
    assert.equal(voss.stats.movementSpeed, 6);
  });

  it("sets exploration mode when combat not active", () => {
    assert.equal(engineState.combat.mode, "exploration");
    assert.equal(engineState.combat.activeEntityId, null);
  });

  it("converts RNG", () => {
    assert.equal(engineState.rng.mode, "seeded");
    assert.equal(engineState.rng.seed, "987654321");
  });

  it("converts logs to engine events", () => {
    assert.ok(engineState.log.events.length >= 1);
    assert.equal(engineState.log.events[0].type, "BOOTSTRAP_LOG");
  });
});

// ════════════════════════════════════════════════════════════════════════
// translateProposal tests — using engine example states
// ════════════════════════════════════════════════════════════════════════

describe("translateProposal — with engine example states", () => {

  it("translates move_entity to MOVE action with path", () => {
    // Use the exploration example where pc-seren is at (2,3)
    const aiResponse = {
      narration: "Seren moves east.",
      adjudication: "Legal move.",
      map_updates: [
        { op: "move_entity", entity_id: "pc-seren", from: { x: 2, y: 3 }, to: { x: 4, y: 3 } },
      ],
      state_updates: [],
      questions: [],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 1, "Should produce 1 action");
    assert.equal(result.actions[0].type, "MOVE");
    assert.equal(result.actions[0].entityId, "pc-seren");
    assert.ok(Array.isArray(result.actions[0].path), "Should have a path array");
    assert.ok(result.actions[0].path.length > 0, "Path should not be empty");

    // Path should end at the target
    const lastStep = result.actions[0].path[result.actions[0].path.length - 1];
    assert.equal(lastStep.x, 4);
    assert.equal(lastStep.y, 3);

    assert.equal(result.narration, "Seren moves east.");
    assert.equal(result.warnings.length, 0);
  });

  it("warns when entity not found in engine state", () => {
    const aiResponse = {
      narration: "Ghost moves.",
      map_updates: [
        { op: "move_entity", entity_id: "nonexistent-123", to: { x: 5, y: 5 } },
      ],
      state_updates: [],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.ok(result.warnings.length >= 1);
    assert.ok(result.warnings[0].includes("not found"));
  });

  it("warns when path is unreachable (blocked)", () => {
    // In explorationExample, (3,0), (3,1), (3,2) are blocked terrain
    // pc-seren at (2,3) — try to move to (3,0) which is blocked
    const aiResponse = {
      narration: "Move into wall.",
      map_updates: [
        { op: "move_entity", entity_id: "pc-seren", to: { x: 3, y: 0 } },
      ],
      state_updates: [],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.ok(result.warnings.length >= 1);
    assert.ok(result.warnings[0].includes("no valid path"));
  });

  it("translates start_combat to ROLL_INITIATIVE", () => {
    const aiResponse = {
      narration: "Combat begins!",
      map_updates: [],
      state_updates: [
        {
          op: "start_combat",
          participants: [
            { entity_id: "pc-seren", initiative: 15 },
            { entity_id: "npc-barkeep", initiative: 10 },
          ],
        },
      ],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "ROLL_INITIATIVE");
  });

  it("warns when start_combat but already in combat", () => {
    const aiResponse = {
      narration: "Combat!",
      map_updates: [],
      state_updates: [{ op: "start_combat", participants: [] }],
    };

    const result = translateProposal(aiResponse, combatExample);

    assert.equal(result.actions.length, 0);
    assert.ok(result.warnings.length >= 1);
    assert.ok(result.warnings[0].includes("already active"));
  });

  it("translates end_turn to END_TURN with entity_id", () => {
    const aiResponse = {
      narration: "Turn ends.",
      map_updates: [],
      state_updates: [{ op: "end_turn", entity_id: "pc-seren" }],
    };

    const result = translateProposal(aiResponse, combatExample);

    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "END_TURN");
    assert.equal(result.actions[0].entityId, "pc-seren");
  });

  it("translates advance_turn to END_TURN with active entity", () => {
    // combatExample has activeEntityId: "pc-seren"
    const aiResponse = {
      narration: "Next turn.",
      map_updates: [],
      state_updates: [
        { op: "advance_turn", turn_index: 3, round: 2, active_entity_id: "pc-seren" },
      ],
    };

    const result = translateProposal(aiResponse, combatExample);

    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "END_TURN");
    assert.equal(result.actions[0].entityId, "pc-seren");
  });

  it("skips set_hp as narration-only", () => {
    const aiResponse = {
      narration: "Damage dealt.",
      map_updates: [],
      state_updates: [
        { op: "set_hp", entity_id: "npc-barkeep", current: 5 },
      ],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0, "set_hp should not produce engine actions");
    assert.ok(result.skipped.length >= 1);
    assert.ok(result.skipped[0].includes("set_hp"));
  });

  it("skips spawn_entity as narration-only", () => {
    const aiResponse = {
      narration: "A new foe appears!",
      map_updates: [
        { op: "spawn_entity", entity: { id: "new-1", name: "Rat", pos: { x: 0, y: 0 } } },
      ],
      state_updates: [],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.ok(result.skipped.length >= 1);
    assert.ok(result.skipped[0].includes("spawn_entity"));
  });

  it("skips add_event_log as narration-only", () => {
    const aiResponse = {
      narration: "Log entry.",
      map_updates: [],
      state_updates: [
        { op: "add_event_log", event: { i: 99, actor_id: "pc-seren", intent: "move", result: "ok", delta: "+1" } },
      ],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.ok(result.skipped.length >= 1);
  });

  it("handles empty AI response gracefully", () => {
    const aiResponse = {
      narration: "",
      map_updates: [],
      state_updates: [],
    };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it("handles missing arrays gracefully", () => {
    const aiResponse = { narration: "Hello." };

    const result = translateProposal(aiResponse, explorationExample);

    assert.equal(result.actions.length, 0);
    assert.equal(result.narration, "Hello.");
  });
});

// ════════════════════════════════════════════════════════════════════════
// translateProposal tests — with bootstrapped state + real fixtures
// ════════════════════════════════════════════════════════════════════════

describe("translateProposal — with bootstrapped state from game_state.example.json", () => {
  const pipelineState = loadGameState();
  const engineState = bootstrapEngineState(pipelineState);

  it("translates legal_move fixture into MOVE action", () => {
    const fixture = loadFixture("ai_response_legal_move.json");
    const result = translateProposal(fixture, engineState);

    // Should produce at least 1 MOVE action for pc-01
    const moveActions = result.actions.filter((a) => a.type === "MOVE");
    assert.ok(moveActions.length >= 1, `Expected MOVE action, got: ${JSON.stringify(result)}`);
    assert.equal(moveActions[0].entityId, "pc-01");

    // Path should end at (6,6) — one step east from (5,6)
    const path = moveActions[0].path;
    assert.ok(path.length > 0);
    assert.equal(path[path.length - 1].x, 6);
    assert.equal(path[path.length - 1].y, 6);

    // set_hp should be skipped
    assert.ok(result.skipped.some((s) => s.includes("set_hp")));

    // advance_turn should produce END_TURN or warn (depending on combat state)
    // Since bootstrapped state is exploration, advance_turn may warn
  });

  it("translates end_turn fixture", () => {
    const fixture = loadFixture("ai_response_end_turn.json");
    const result = translateProposal(fixture, engineState);

    // end_turn with entity_id should produce END_TURN
    const endActions = result.actions.filter((a) => a.type === "END_TURN");
    assert.equal(endActions.length, 1);
    assert.equal(endActions[0].entityId, "npc-02");
  });

  it("translates start_combat fixture to ROLL_INITIATIVE", () => {
    const fixture = loadFixture("ai_response_start_combat.json");
    const result = translateProposal(fixture, engineState);

    const initActions = result.actions.filter((a) => a.type === "ROLL_INITIATIVE");
    assert.equal(initActions.length, 1);
  });

  it("passes through narration and adjudication", () => {
    const fixture = loadFixture("ai_response_legal_move.json");
    const result = translateProposal(fixture, engineState);

    assert.ok(result.narration, "Should have narration");
    assert.ok(result.adjudication, "Should have adjudication");
    assert.ok(result.narration.length > 0);
  });
});
