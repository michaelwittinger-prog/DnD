/**
 * llm_intent_parser_test.mjs — Tests for LLM-powered intent parsing.
 *
 * Uses mock adapters to simulate LLM responses without actual API calls.
 * Tests the full pipeline: prompt building → LLM call → extraction → validation → fallback.
 */

import { parseLLMIntent, extractIntent } from "../src/ai/llmIntentParser.mjs";
import { summarizeStateForParsing, buildIntentSystemPrompt, buildIntentMessages } from "../src/ai/intentPromptBuilder.mjs";
import { INTENT_TYPES, DIRECTIONS, TARGET_SELECTORS, validateIntent } from "../src/ai/intentTypes.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║  MIR — LLM Intent Parser Tests                    ║");
console.log("╚══════════════════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };
const fresh = () => structuredClone(explorationExample);

// ── Mock Adapters ───────────────────────────────────────────────────

/** Adapter that returns a fixed JSON response. */
function mockAdapter(response) {
  return {
    id: "test-mock",
    name: "Test Mock",
    provider: "mock",
    call: async () => ({
      ok: true,
      response,
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      latencyMs: 5,
    }),
  };
}

/** Adapter that fails. */
function failingAdapter(error = "API error") {
  return {
    id: "test-fail",
    name: "Test Failing",
    provider: "mock",
    call: async () => ({ ok: false, response: null, error }),
  };
}

/** Adapter that throws. */
function throwingAdapter() {
  return {
    id: "test-throw",
    name: "Test Throwing",
    provider: "mock",
    call: async () => { throw new Error("Network timeout"); },
  };
}

/** Adapter that returns a string (like raw completion text). */
function stringAdapter(text) {
  return {
    id: "test-string",
    name: "Test String",
    provider: "mock",
    call: async () => ({ ok: true, response: text, latencyMs: 10 }),
  };
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 1: Prompt Builder
// ════════════════════════════════════════════════════════════════════════
console.log("═══ Section 1: Prompt Builder ═══");

console.log("\n[1.1] summarizeStateForParsing");
{
  const state = fresh();
  const summary = summarizeStateForParsing(state);
  check(typeof summary === "string", "returns string");
  check(summary.includes("Map:"), "includes map info");
  check(summary.includes("Entities"), "includes entities header");
  check(summary.includes("Seren"), "includes player name");
  check(summary.includes("Old Haggard"), "includes NPC name");
  check(!summary.includes("rng"), "strips RNG data");
  check(!summary.includes("seed"), "strips seed");
}

console.log("\n[1.2] summarizeStateForParsing — null state");
{
  const summary = summarizeStateForParsing(null);
  check(summary.includes("no game state"), "handles null gracefully");
}

console.log("\n[1.3] summarizeStateForParsing — combat mode");
{
  const state = fresh();
  state.combat.mode = "combat";
  state.combat.round = 3;
  state.combat.activeEntityId = "pc-seren";
  state.combat.initiativeOrder = ["pc-seren", "npc-barkeep"];
  const summary = summarizeStateForParsing(state);
  check(summary.includes("COMBAT"), "shows combat mode");
  check(summary.includes("Round 3"), "shows round");
  check(summary.includes("pc-seren"), "shows active entity");
}

console.log("\n[1.4] buildIntentSystemPrompt");
{
  const prompt = buildIntentSystemPrompt();
  check(typeof prompt === "string", "returns string");
  check(prompt.includes("move_to"), "includes move_to type");
  check(prompt.includes("attack"), "includes attack type");
  check(prompt.includes("compound"), "includes compound type");
  check(prompt.includes("nearest_hostile"), "includes tactical selectors");
  check(prompt.includes("JSON"), "mentions JSON output");
  check(prompt.length > 500, "substantial prompt (>500 chars)");
}

console.log("\n[1.5] buildIntentMessages");
{
  const state = fresh();
  const messages = buildIntentMessages("attack the goblin", state);
  check(Array.isArray(messages), "returns array");
  check(messages.length === 2, "2 messages (system + user)");
  check(messages[0].role === "system", "first is system");
  check(messages[1].role === "user", "second is user");
  check(messages[1].content.includes("attack the goblin"), "user prompt contains input");
  check(messages[1].content.includes("GAME STATE"), "user prompt contains state");
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 2: Response Extraction
// ════════════════════════════════════════════════════════════════════════
console.log("\n═══ Section 2: Response Extraction ═══");

console.log("\n[2.1] extractIntent — direct object");
{
  const r = extractIntent({ type: "attack", target: "goblin" });
  check(r !== null, "extracts from object");
  check(r.type === "attack", "type = attack");
  check(r.target === "goblin", "target = goblin");
}

console.log("\n[2.2] extractIntent — nested in .intent");
{
  const r = extractIntent({ intent: { type: "move_to", x: 3, y: 4 } });
  check(r !== null, "extracts from nested .intent");
  check(r.type === "move_to", "type = move_to");
}

console.log("\n[2.3] extractIntent — nested in .actions");
{
  const r = extractIntent({ actions: [{ type: "start_combat" }] });
  check(r !== null, "extracts from .actions[0]");
  check(r.type === "start_combat", "type = start_combat");
}

console.log("\n[2.4] extractIntent — plain JSON string");
{
  const r = extractIntent('{"type":"attack","target":"goblin"}');
  check(r !== null, "extracts from JSON string");
  check(r.type === "attack", "type = attack");
}

console.log("\n[2.5] extractIntent — JSON with markdown fences");
{
  const r = extractIntent('```json\n{"type":"flee","from":"dragon"}\n```');
  check(r !== null, "extracts from fenced JSON");
  check(r.type === "flee", "type = flee");
}

console.log("\n[2.6] extractIntent — JSON embedded in text");
{
  const r = extractIntent('Based on the input, here is the intent: {"type":"end_turn"} I hope this helps.');
  check(r !== null, "extracts JSON from mixed text");
  check(r.type === "end_turn", "type = end_turn");
}

console.log("\n[2.7] extractIntent — .text field");
{
  const r = extractIntent({ text: '{"type":"defend"}' });
  check(r !== null, "extracts from .text field");
  check(r.type === "defend", "type = defend");
}

console.log("\n[2.8] extractIntent — .content field");
{
  const r = extractIntent({ content: '{"type":"start_combat"}' });
  check(r !== null, "extracts from .content field");
  check(r.type === "start_combat", "type = start_combat");
}

console.log("\n[2.9] extractIntent — failures");
{
  check(extractIntent(null) === null, "null → null");
  check(extractIntent(undefined) === null, "undefined → null");
  check(extractIntent("just random text") === null, "non-JSON text → null");
  check(extractIntent({ foo: "bar" }) === null, "object without type → null");
  check(extractIntent(42) === null, "number → null");
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 3: LLM Parser — Success Cases
// ════════════════════════════════════════════════════════════════════════
console.log("\n═══ Section 3: LLM Parser — Success ═══");

console.log("\n[3.1] Valid attack intent from LLM");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "attack", subject: "active", target: "barkeep" });
  const r = await parseLLMIntent("I swing my sword at the barkeep", state, adapter);
  check(r.source === "llm", "source = llm");
  check(r.validated === true, "validated = true");
  check(r.error === null, "no error");
  check(r.intent.type === "attack", "intent type = attack");
  check(r.intent.target === "barkeep", "target = barkeep");
  check(typeof r.latencyMs === "number", "latencyMs tracked");
}

console.log("\n[3.2] Valid move_direction from LLM");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "move_direction", subject: "active", direction: "north", distance: 3 });
  const r = await parseLLMIntent("I cautiously creep three steps northward", state, adapter);
  check(r.source === "llm", "source = llm");
  check(r.intent.type === "move_direction", "type = move_direction");
  check(r.intent.direction === "north", "direction = north");
  check(r.intent.distance === 3, "distance = 3");
}

console.log("\n[3.3] Valid compound from LLM");
{
  const state = fresh();
  const adapter = mockAdapter({
    type: "compound",
    steps: [
      { type: "move_direction", subject: "active", direction: "south", distance: 2 },
      { type: "attack", subject: "active", target: "barkeep" },
    ],
  });
  const r = await parseLLMIntent("rush south and strike the barkeep", state, adapter);
  check(r.source === "llm", "source = llm");
  check(r.validated === true, "validated");
  check(r.intent.type === "compound", "type = compound");
  check(r.intent.steps.length === 2, "2 steps");
}

console.log("\n[3.4] LLM returns string JSON");
{
  const state = fresh();
  const adapter = stringAdapter('{"type":"start_combat"}');
  const r = await parseLLMIntent("let's fight!", state, adapter);
  check(r.source === "llm", "source = llm");
  check(r.validated === true, "validated");
  check(r.intent.type === "start_combat", "type = start_combat");
}

console.log("\n[3.5] LLM returns markdown-fenced JSON");
{
  const state = fresh();
  const adapter = stringAdapter('```json\n{"type":"flee","from":"nearest_hostile"}\n```');
  const r = await parseLLMIntent("run for your life!", state, adapter);
  check(r.source === "llm", "source = llm");
  check(r.intent.type === "flee", "type = flee");
}

console.log("\n[3.6] Raw input preserved in intent");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "defend" });
  const r = await parseLLMIntent("I brace for impact", state, adapter);
  check(r.intent.raw === "I brace for impact", "raw preserved");
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 4: LLM Parser — Fallback Cases
// ════════════════════════════════════════════════════════════════════════
console.log("\n═══ Section 4: LLM Parser — Fallback ═══");

console.log("\n[4.1] No adapter → mock fallback");
{
  const state = fresh();
  const r = await parseLLMIntent("move north", state, null);
  check(r.source === "mock", "source = mock");
  check(r.validated === true, "validated via mock");
  check(r.intent.type === "move_direction", "mock parsed correctly");
  check(r.error.includes("Fallback"), "error mentions fallback");
}

console.log("\n[4.2] Adapter returns error → mock fallback");
{
  const state = fresh();
  const adapter = failingAdapter("Rate limited");
  const r = await parseLLMIntent("attack goblin", state, adapter);
  check(r.source === "mock", "source = mock");
  check(r.intent.type === "attack", "mock parsed attack");
  check(r.error.includes("Rate limited"), "error includes reason");
}

console.log("\n[4.3] Adapter throws → mock fallback");
{
  const state = fresh();
  const adapter = throwingAdapter();
  const r = await parseLLMIntent("roll initiative", state, adapter);
  check(r.source === "mock", "source = mock");
  check(r.intent.type === "start_combat", "mock parsed start_combat");
  check(r.error.includes("Network timeout"), "error includes exception");
}

console.log("\n[4.4] LLM returns unparseable response → mock fallback");
{
  const state = fresh();
  const adapter = mockAdapter("I think the player wants to attack someone");
  const r = await parseLLMIntent("attack the nearest enemy", state, adapter);
  check(r.source === "mock", "source = mock (unparseable)");
  check(r.error.includes("Fallback"), "fallback triggered");
}

console.log("\n[4.5] LLM returns invalid intent → mock fallback");
{
  const state = fresh();
  // move_to without x,y → fails validation
  const adapter = mockAdapter({ type: "move_to" });
  const r = await parseLLMIntent("go somewhere", state, adapter);
  check(r.source === "mock", "source = mock (invalid intent)");
  check(r.error.includes("Fallback"), "fallback triggered");
}

console.log("\n[4.6] No fallback mode — returns error intent");
{
  const state = fresh();
  const adapter = failingAdapter("Server down");
  const r = await parseLLMIntent("attack", state, adapter, { fallbackToMock: false });
  check(r.source === "llm", "source = llm (no fallback)");
  check(r.validated === false, "not validated");
  check(r.intent.type === "unknown", "intent = unknown");
  check(r.error === "Server down", "error preserved");
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 5: Contract — Output Shape
// ════════════════════════════════════════════════════════════════════════
console.log("\n═══ Section 5: Output Contract ═══");

const REQUIRED_KEYS = ["intent", "source", "validated", "error", "latencyMs"];

console.log("\n[5.1] Success result has all required keys");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "end_turn" });
  const r = await parseLLMIntent("done", state, adapter);
  for (const key of REQUIRED_KEYS) {
    check(r[key] !== undefined, `result.${key} defined`);
  }
  check(r.source === "llm" || r.source === "mock", "source is llm or mock");
  check(typeof r.validated === "boolean", "validated is boolean");
  check(typeof r.latencyMs === "number", "latencyMs is number");
}

console.log("\n[5.2] Fallback result has all required keys");
{
  const state = fresh();
  const r = await parseLLMIntent("move north", state, null);
  for (const key of REQUIRED_KEYS) {
    check(r[key] !== undefined, `fallback: result.${key} defined`);
  }
}

console.log("\n[5.3] Intent always passes validateIntent()");
{
  const state = fresh();

  // LLM success
  const a = mockAdapter({ type: "attack", target: "barkeep" });
  const r1 = await parseLLMIntent("attack", state, a);
  check(validateIntent(r1.intent).ok, "LLM intent validates");

  // Mock fallback
  const r2 = await parseLLMIntent("move north", state, null);
  check(validateIntent(r2.intent).ok, "mock fallback intent validates");
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 6: Narrative Language (the whole point)
// ════════════════════════════════════════════════════════════════════════
console.log("\n═══ Section 6: Narrative Language Classification ═══");

// These tests simulate what GPT-4o would return for narrative inputs.
// In production, the LLM does the classification. Here we verify
// that if the LLM returns the right intent, our pipeline handles it.

console.log("\n[6.1] 'I cautiously approach the dark figure' → approach");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "approach", subject: "active", target: "barkeep" });
  const r = await parseLLMIntent("I cautiously approach the dark figure", state, adapter);
  check(r.validated, "validated");
  check(r.intent.type === "approach", "classified as approach");
}

console.log("\n[6.2] 'I ready my blade and charge the nearest foe' → attack");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "attack", subject: "active", target: "nearest_hostile" });
  const r = await parseLLMIntent("I ready my blade and charge the nearest foe", state, adapter);
  check(r.intent.type === "attack", "classified as attack");
  check(r.intent.target === "nearest_hostile", "target = nearest_hostile");
}

console.log("\n[6.3] 'Miri, fall back! Get behind Seren!' → compound flee");
{
  const state = fresh();
  const adapter = mockAdapter({
    type: "compound",
    steps: [
      { type: "flee", subject: "miri", from: "nearest_hostile" },
      { type: "approach", subject: "miri", target: "seren" },
    ],
  });
  const r = await parseLLMIntent("Miri, fall back! Get behind Seren!", state, adapter);
  check(r.intent.type === "compound", "classified as compound");
  check(r.intent.steps.length === 2, "2 steps");
  check(r.intent.steps[0].type === "flee", "step 1 = flee");
  check(r.intent.steps[1].type === "approach", "step 2 = approach");
}

console.log("\n[6.4] 'I whisper a healing prayer over my wounded companion' → use_ability");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "use_ability", subject: "active", ability: "healing_word", target: "most_injured_ally" });
  const r = await parseLLMIntent("I whisper a healing prayer over my wounded companion", state, adapter);
  check(r.intent.type === "use_ability", "classified as use_ability");
  check(r.intent.ability === "healing_word", "ability = healing_word");
  check(r.intent.target === "most_injured_ally", "target = most_injured_ally");
}

console.log("\n[6.5] 'That's enough talking. Let steel do the rest.' → start_combat");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "start_combat" });
  const r = await parseLLMIntent("That's enough talking. Let steel do the rest.", state, adapter);
  check(r.intent.type === "start_combat", "classified as start_combat");
}

console.log("\n[6.6] 'I've done what I can this round' → end_turn");
{
  const state = fresh();
  const adapter = mockAdapter({ type: "end_turn", subject: "active" });
  const r = await parseLLMIntent("I've done what I can this round", state, adapter);
  check(r.intent.type === "end_turn", "classified as end_turn");
}

// ════════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all LLM intent parser tests passed" : "FAIL: some LLM intent parser tests failed");
if (failed) process.exit(1);
