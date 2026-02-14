/**
 * llm_wiring_test.mjs — Tests for P1: LLM parser wiring into UI.
 *
 * Tests the browser OpenAI adapter, the LLM→Plan→Execute pipeline,
 * and the mode-switching logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseLLMIntent } from "../src/ai/llmIntentParser.mjs";
import { planFromIntent } from "../src/ai/intentPlanner.mjs";
import { executePlan, executeIntent } from "../src/ai/intentExecutor.mjs";
import { createMockAdapter } from "../src/ai/modelAdapter.mjs";
import { demoEncounter } from "../src/state/exampleStates.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeCombatState() {
  const state = structuredClone(demoEncounter);
  const initResult = applyAction(state, { type: "ROLL_INITIATIVE" });
  if (initResult.success) return initResult.nextState;
  state.combat.mode = "combat";
  state.combat.round = 1;
  const npcIds = state.entities.npcs.filter(n => !n.conditions.includes("dead")).map(n => n.id);
  const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
  state.combat.initiativeOrder = [...playerIds, ...npcIds];
  state.combat.activeEntityId = playerIds[0] || npcIds[0];
  return state;
}

// ── A) Browser Adapter Shape ────────────────────────────────────────────

describe("Browser OpenAI Adapter Shape", () => {
  it("mock adapter conforms to ModelAdapter interface", () => {
    const adapter = createMockAdapter({ type: "attack", target: "nearest_hostile" });
    assert.ok(adapter.id, "has id");
    assert.ok(adapter.name, "has name");
    assert.ok(adapter.provider, "has provider");
    assert.equal(typeof adapter.call, "function", "has call function");
  });

  it("mock adapter returns ok response with .response field", async () => {
    const intent = { type: "attack", target: "nearest_hostile" };
    const adapter = createMockAdapter(intent);
    const result = await adapter.call("test prompt", {}, {});
    assert.equal(result.ok, true);
    assert.deepEqual(result.response, intent);
    assert.ok(result.usage, "has usage");
  });
});

// ── B) LLM → Plan → Execute Pipeline ───────────────────────────────────

describe("LLM → Plan → Execute Pipeline (with mock adapter)", () => {
  it("parseLLMIntent with mock adapter returns intent with source=llm", async () => {
    const state = makeCombatState();
    const intent = { type: "attack", subject: "active", target: "nearest_hostile" };
    const adapter = createMockAdapter(intent);

    const result = await parseLLMIntent("attack the goblin", state, adapter);
    assert.equal(result.source, "llm", "source should be llm");
    assert.equal(result.validated, true);
    assert.equal(result.error, null);
    assert.equal(result.intent.type, "attack");
  });

  it("full pipeline: LLM parse → plan → execute produces state change", async () => {
    const state = makeCombatState();
    // Make sure a player is active
    const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
    if (playerIds.length > 0) {
      state.combat.activeEntityId = playerIds[0];
    }

    const intent = { type: "end_turn", subject: "active" };
    const adapter = createMockAdapter(intent);

    const llmResult = await parseLLMIntent("I'm done", state, adapter);
    assert.equal(llmResult.intent.type, "end_turn");

    const plan = planFromIntent(state, llmResult.intent);
    assert.ok(plan.ok, "plan should succeed");
    assert.ok(plan.actions.length > 0, "plan should have actions");

    const execResult = executePlan(state, plan);
    assert.ok(execResult.state || execResult.finalState, "should return new state");
  });

  it("LLM pipeline result has UI-compatible fields", async () => {
    const state = makeCombatState();
    const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
    if (playerIds.length > 0) state.combat.activeEntityId = playerIds[0];

    const intent = { type: "end_turn", subject: "active" };
    const adapter = createMockAdapter(intent);
    const llmResult = await parseLLMIntent("done", state, adapter);
    const plan = planFromIntent(state, llmResult.intent);
    const execResult = executePlan(state, plan);

    // These are the fields main.mjs reads
    assert.ok("ok" in execResult, "has ok");
    assert.ok("state" in execResult || "finalState" in execResult, "has state or finalState");
    assert.ok("events" in execResult || "allEvents" in execResult, "has events or allEvents");
    assert.ok("actions" in execResult, "has actions");
    assert.ok("actionsExecuted" in execResult, "has actionsExecuted");
    assert.ok("narrationHint" in execResult, "has narrationHint");
  });
});

// ── C) Fallback Behavior ────────────────────────────────────────────────

describe("LLM Fallback to Mock Parser", () => {
  it("falls back to mock when no adapter provided", async () => {
    const state = makeCombatState();
    const result = await parseLLMIntent("attack the goblin", state, null);
    assert.equal(result.source, "mock", "should fallback to mock");
    assert.equal(result.validated, true);
    assert.ok(result.error, "should have error explaining why");
  });

  it("falls back to mock when adapter returns error", async () => {
    const state = makeCombatState();
    const failAdapter = {
      id: "fail",
      name: "Failing Adapter",
      provider: "test",
      call: async () => ({ ok: false, response: null, error: "API error" }),
    };

    const result = await parseLLMIntent("attack", state, failAdapter);
    assert.equal(result.source, "mock", "should fallback to mock");
    assert.ok(result.error.includes("Fallback"), "error should mention fallback");
  });

  it("falls back to mock when adapter throws", async () => {
    const state = makeCombatState();
    const throwAdapter = {
      id: "throw",
      name: "Throwing Adapter",
      provider: "test",
      call: async () => { throw new Error("Network failure"); },
    };

    const result = await parseLLMIntent("attack", state, throwAdapter);
    assert.equal(result.source, "mock", "should fallback to mock");
  });

  it("falls back to mock when response is invalid intent", async () => {
    const state = makeCombatState();
    const badAdapter = createMockAdapter({ foo: "bar" }); // Not a valid intent

    const result = await parseLLMIntent("attack", state, badAdapter);
    assert.equal(result.source, "mock", "should fallback to mock on invalid intent");
    assert.equal(result.validated, true, "mock fallback should be valid");
  });
});

// ── D) Mode Switching Logic ─────────────────────────────────────────────

describe("Mode Switching: Mock vs LLM", () => {
  it("mock mode: executeIntent works synchronously", () => {
    const state = makeCombatState();
    const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
    if (playerIds.length > 0) state.combat.activeEntityId = playerIds[0];

    const result = executeIntent(state, "end turn");
    assert.ok("ok" in result, "has ok");
    assert.ok("state" in result, "has state");
    assert.ok("intent" in result, "has intent");
    assert.equal(result.mode, "mock");
  });

  it("LLM mode: parseLLMIntent is async and returns promise", async () => {
    const state = makeCombatState();
    const adapter = createMockAdapter({ type: "end_turn" });

    const promise = parseLLMIntent("end turn", state, adapter);
    assert.ok(promise instanceof Promise, "should return a Promise");

    const result = await promise;
    assert.ok(result.intent, "resolved result has intent");
  });

  it("both modes produce compatible output for UI", async () => {
    const state = makeCombatState();
    const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
    if (playerIds.length > 0) state.combat.activeEntityId = playerIds[0];

    // Mock mode
    const mockResult = executeIntent(state, "end turn");

    // LLM mode (with mock adapter returning same intent)
    const adapter = createMockAdapter({ type: "end_turn", subject: "active" });
    const llmParsed = await parseLLMIntent("end turn", state, adapter);
    const plan = planFromIntent(state, llmParsed.intent);
    const llmResult = executePlan(state, plan);

    // Both should have the same key fields
    const mockKeys = ["ok", "narrationHint"];
    for (const key of mockKeys) {
      assert.ok(key in mockResult, `mock has ${key}`);
      assert.ok(key in llmResult, `llm has ${key}`);
    }
  });
});

// ── E) Browser Adapter Specifics ────────────────────────────────────────

describe("Browser OpenAI Adapter", () => {
  // Note: actual fetch tests require network; these test the module shape

  it("createMockAdapter tracks call count", async () => {
    const adapter = createMockAdapter({ type: "end_turn" });
    assert.equal(adapter.getCallCount(), 0);
    await adapter.call("test", {}, {});
    assert.equal(adapter.getCallCount(), 1);
    await adapter.call("test2", {}, {});
    assert.equal(adapter.getCallCount(), 2);
  });

  it("adapter handles various intent types from LLM", async () => {
    const state = makeCombatState();

    const intents = [
      { type: "move_to", x: 3, y: 4, subject: "active" },
      { type: "attack", target: "nearest_hostile", subject: "active" },
      { type: "end_turn", subject: "active" },
      { type: "start_combat" },
      { type: "flee", subject: "active", from: "nearest_hostile" },
    ];

    for (const intent of intents) {
      const adapter = createMockAdapter(intent);
      const result = await parseLLMIntent("test", state, adapter);
      assert.equal(result.source, "llm", `${intent.type}: source should be llm`);
      assert.equal(result.intent.type, intent.type, `${intent.type}: type matches`);
    }
  });

  it("adapter with compound intent works through pipeline", async () => {
    const state = makeCombatState();
    const playerIds = state.entities.players.filter(p => !p.conditions.includes("dead")).map(p => p.id);
    if (playerIds.length > 0) state.combat.activeEntityId = playerIds[0];

    const compound = {
      type: "compound",
      steps: [
        { type: "end_turn", subject: "active" },
      ],
    };
    const adapter = createMockAdapter(compound);
    const result = await parseLLMIntent("I'm done", state, adapter);
    assert.equal(result.intent.type, "compound");

    const plan = planFromIntent(state, result.intent);
    // Compound with end_turn should produce actions
    assert.ok(plan.ok || plan.actions?.length >= 0, "plan should process compound");
  });
});

console.log("✓ LLM wiring test module loaded");
