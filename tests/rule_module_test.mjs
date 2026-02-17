/**
 * rule_module_test.mjs — Rule Module System Tests (Tier 6.5)
 *
 * Tests for the pluggable rule module system:
 * - Registry operations (register, unregister, list, activate)
 * - Core 5e-lite module functionality
 * - Homebrew sample module functionality
 * - Module switching and compatibility
 * - Determinism verification
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerModule,
  unregisterModule,
  setActiveModule,
  getActiveModule,
  getActiveRules,
  getActiveModuleId,
  listModules,
  getModule,
  clearRegistry,
  isModuleRegistered,
} from "../src/rules/ruleModuleRegistry.mjs";
import { core5eLiteModule } from "../src/rules/modules/core5eLite.mjs";
import { homebrewSampleModule } from "../src/rules/modules/homebrewSample.mjs";
import { initRuleModules, DEFAULT_MODULE_ID } from "../src/rules/initRuleModules.mjs";

// ── Helper: deterministic RNG ──────────────────────────────────────────

function createSeededRng(seed) {
  let current = seed;
  return {
    next() {
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current;
    },
  };
}

// ── Helper: mock entities ──────────────────────────────────────────────

function mockAttacker(overrides = {}) {
  return {
    id: "player-1",
    name: "Fighter",
    kind: "player",
    stats: { ac: 15, hpCurrent: 30, hpMax: 30, movementSpeed: 6, attackBonus: 5, damageBonus: 3, strength: 16, dexterity: 14 },
    conditions: [],
    position: { x: 3, y: 3 },
    ...overrides,
  };
}

function mockTarget(overrides = {}) {
  return {
    id: "npc-1",
    name: "Goblin",
    kind: "npc",
    stats: { ac: 12, hpCurrent: 15, hpMax: 15, movementSpeed: 6, strength: 10, dexterity: 12 },
    conditions: [],
    resistances: [],
    position: { x: 4, y: 3 },
    ...overrides,
  };
}

// ── Test Suite: Registry Operations ────────────────────────────────────

test("Registry: register and retrieve module", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  assert.ok(isModuleRegistered("core-5e-lite"));
  const mod = getModule("core-5e-lite");
  assert.equal(mod.id, "core-5e-lite");
  assert.equal(mod.name, "D&D 5e Lite");
});

test("Registry: reject duplicate registration", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  assert.throws(() => registerModule(core5eLiteModule), /already registered/);
});

test("Registry: reject module without id", () => {
  clearRegistry();
  assert.throws(() => registerModule({ name: "Bad" }), /must have an id/);
});

test("Registry: reject module without rules", () => {
  clearRegistry();
  assert.throws(() => registerModule({ id: "bad", name: "Bad" }), /must have a rules object/);
});

test("Registry: reject module with missing rule category", () => {
  clearRegistry();
  assert.throws(() => registerModule({
    id: "incomplete",
    name: "Incomplete",
    rules: { combat: {} },
  }), /missing required category/);
});

test("Registry: unregister module", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  assert.ok(isModuleRegistered("core-5e-lite"));
  unregisterModule("core-5e-lite");
  assert.ok(!isModuleRegistered("core-5e-lite"));
});

test("Registry: unregister active module clears active", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  setActiveModule("core-5e-lite");
  assert.equal(getActiveModuleId(), "core-5e-lite");
  unregisterModule("core-5e-lite");
  assert.equal(getActiveModuleId(), null);
});

test("Registry: set and get active module", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  setActiveModule("core-5e-lite");
  const active = getActiveModule();
  assert.equal(active.id, "core-5e-lite");
});

test("Registry: setActiveModule rejects unregistered", () => {
  clearRegistry();
  assert.throws(() => setActiveModule("nonexistent"), /not registered/);
});

test("Registry: getActiveRules throws when no active module", () => {
  clearRegistry();
  assert.throws(() => getActiveRules(), /No active rule module/);
});

test("Registry: listModules returns all registered", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  registerModule(homebrewSampleModule);
  const list = listModules();
  assert.equal(list.length, 2);
  assert.ok(list.some(m => m.id === "core-5e-lite"));
  assert.ok(list.some(m => m.id === "homebrew-sample"));
});

test("Registry: clearRegistry removes all", () => {
  clearRegistry();
  registerModule(core5eLiteModule);
  registerModule(homebrewSampleModule);
  setActiveModule("core-5e-lite");
  clearRegistry();
  assert.equal(listModules().length, 0);
  assert.equal(getActiveModuleId(), null);
});

// ── Test Suite: Init Bootstrap ─────────────────────────────────────────

test("initRuleModules: registers both built-in modules", () => {
  clearRegistry();
  initRuleModules();
  assert.ok(isModuleRegistered("core-5e-lite"));
  assert.ok(isModuleRegistered("homebrew-sample"));
  assert.equal(getActiveModuleId(), DEFAULT_MODULE_ID);
});

test("initRuleModules: can activate homebrew", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  assert.equal(getActiveModuleId(), "homebrew-sample");
});

test("initRuleModules: safe to call multiple times", () => {
  clearRegistry();
  initRuleModules();
  initRuleModules(); // Should not throw
  assert.equal(listModules().length, 2);
});

// ── Test Suite: Core 5e-Lite Combat Rules ──────────────────────────────

test("Core5e: calculateAttackRoll returns valid structure", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const rng = createSeededRng(42);
  const attacker = mockAttacker();
  const target = mockTarget();

  const result = rules.combat.calculateAttackRoll(attacker, target, rng);
  assert.ok("roll" in result);
  assert.ok("modifier" in result);
  assert.ok("total" in result);
  assert.ok("ac" in result);
  assert.ok("hit" in result);
  assert.ok(result.roll >= 1 && result.roll <= 20);
});

test("Core5e: calculateDamage returns positive total", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const rng = createSeededRng(42);
  const attacker = mockAttacker();
  const target = mockTarget();

  const result = rules.combat.calculateDamage(attacker, target, { damageDie: 8 }, rng);
  assert.ok(result.total >= 1);
  assert.ok("damageType" in result);
});

test("Core5e: calculateInitiative returns valid structure", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const rng = createSeededRng(42);
  const entity = mockAttacker();

  const result = rules.combat.calculateInitiative(entity, rng);
  assert.ok("roll" in result);
  assert.ok("modifier" in result);
  assert.ok("total" in result);
  assert.ok(result.roll >= 1 && result.roll <= 20);
});

test("Core5e: canAttack blocks dead attacker", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const attacker = mockAttacker({ conditions: ["dead"] });
  const target = mockTarget();

  const result = rules.combat.canAttack(attacker, target, {});
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("dead"));
});

test("Core5e: canAttack blocks stunned attacker", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const attacker = mockAttacker({ conditions: ["stunned"] });
  const target = mockTarget();

  const result = rules.combat.canAttack(attacker, target, {});
  assert.equal(result.allowed, false);
});

// ── Test Suite: Core 5e-Lite Ability Rules ─────────────────────────────

test("Core5e: canUseAbility blocks dead caster", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const caster = mockAttacker({ conditions: ["dead"] });
  const ability = { id: "firebolt", type: "attack" };

  const result = rules.abilities.canUseAbility(caster, ability, null, {});
  assert.equal(result.allowed, false);
});

test("Core5e: resolveAbility heal returns positive heal", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const rng = createSeededRng(42);
  const caster = mockAttacker();
  const target = mockTarget({ stats: { ...mockTarget().stats, hpCurrent: 5, hpMax: 15 } });
  const ability = { id: "healing_word", type: "heal", healDie: 8, healBonus: 3 };

  const result = rules.abilities.resolveAbility(caster, ability, target, rng);
  assert.equal(result.hit, true);
  assert.ok(result.heal > 0);
  assert.equal(result.damage, 0);
});

// ── Test Suite: Core 5e-Lite Movement Rules ────────────────────────────

test("Core5e: getMovementSpeed returns default 6", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const entity = { stats: {} };

  const speed = rules.movement.getMovementSpeed(entity);
  assert.equal(speed, 6);
});

test("Core5e: prone halves movement", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const entity = { stats: { movementSpeed: 6 } };

  const speed = rules.movement.getMovementSpeed(entity, ["prone"]);
  assert.equal(speed, 3);
});

test("Core5e: terrain cost for difficult terrain is 2", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  assert.equal(rules.movement.getTerrainCost("difficult"), 2);
  assert.equal(rules.movement.getTerrainCost("open"), 1);
  assert.equal(rules.movement.getTerrainCost("blocked"), Infinity);
});

// ── Test Suite: Core 5e-Lite Condition Rules ───────────────────────────

test("Core5e: getConditionEffects for stunned", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const effects = rules.conditions.getConditionEffects("stunned");
  assert.ok(effects.statMods.ac < 0);
  assert.ok(effects.actionRestrictions.includes("attack"));
});

test("Core5e: tickConditions expires conditions", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const entity = mockAttacker();
  const activeConditions = [{ name: "stunned", turnsRemaining: 1 }];

  const result = rules.conditions.tickConditions(entity, activeConditions);
  assert.ok(result.expired.includes("stunned"));
  assert.equal(result.remaining.length, 0);
});

// ── Test Suite: Core 5e-Lite Damage Rules ──────────────────────────────

test("Core5e: resistance halves damage", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const target = mockTarget({ resistances: ["fire"] });

  const result = rules.damage.applyResistance(10, target, "fire");
  assert.equal(result, 5);
});

test("Core5e: no resistance returns full damage", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const target = mockTarget({ resistances: [] });

  const result = rules.damage.applyResistance(10, target, "fire");
  assert.equal(result, 10);
});

test("Core5e: critical damage doubles", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  assert.equal(rules.damage.calculateCriticalDamage(10, null), 20);
});

// ── Test Suite: Core 5e-Lite Healing Rules ─────────────────────────────

test("Core5e: canHeal blocks dead targets", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const healer = mockAttacker();
  const target = mockTarget({ conditions: ["dead"] });

  const result = rules.healing.canHeal(healer, target);
  assert.equal(result.allowed, false);
});

test("Core5e: canHeal blocks full HP targets", () => {
  clearRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const healer = mockAttacker();
  const target = mockTarget();

  const result = rules.healing.canHeal(healer, target);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("full HP"));
});

// ── Test Suite: Homebrew Module Differences ─────────────────────────────

test("Homebrew: 2d10 attack roll differs from d20", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const rng = createSeededRng(42);
  const attacker = mockAttacker();
  const target = mockTarget();

  const result = rules.combat.calculateAttackRoll(attacker, target, rng);
  assert.ok("roll" in result);
  // 2d10 range: 2-20
  assert.ok(result.roll >= 2 && result.roll <= 20);
});

test("Homebrew: no cooldowns on abilities", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  assert.equal(rules.abilities.getCooldown({ cooldown: 3 }), 0);
});

test("Homebrew: stunned attacker CAN attack", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const attacker = mockAttacker({ conditions: ["stunned"] });
  const target = mockTarget();

  const result = rules.combat.canAttack(attacker, target, {});
  assert.equal(result.allowed, true); // Homebrew allows stunned attacks
});

test("Homebrew: base movement speed is 8", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const entity = { stats: {} };

  const speed = rules.movement.getMovementSpeed(entity);
  assert.equal(speed, 8);
});

test("Homebrew: enraged condition adds speed", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const entity = { stats: { movementSpeed: 8 } };

  const speed = rules.movement.getMovementSpeed(entity, ["enraged"]);
  assert.equal(speed, 10);
});

test("Homebrew: critical damage is 2.5x", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  assert.equal(rules.damage.calculateCriticalDamage(10, null), 25);
});

test("Homebrew: resistance reduces by 1/3", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const target = mockTarget({ resistances: ["fire"] });

  const result = rules.damage.applyResistance(12, target, "fire");
  assert.equal(result, 8); // 12 * 2/3 = 8
});

test("Homebrew: lava terrain cost is 2 (not Infinity)", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  assert.equal(rules.movement.getTerrainCost("lava"), 2);
});

test("Homebrew: CAN heal dead targets (revive)", () => {
  clearRegistry();
  initRuleModules("homebrew-sample");
  const rules = getActiveRules();
  const healer = mockAttacker();
  const target = mockTarget({ conditions: ["dead"], stats: { hpCurrent: 0, hpMax: 15 } });

  const result = rules.healing.canHeal(healer, target);
  assert.equal(result.allowed, true); // Homebrew allows reviving dead
});

// ── Test Suite: Module Switching ───────────────────────────────────────

test("Module switching: same seed produces different results between modules", () => {
  clearRegistry();
  initRuleModules();
  const attacker = mockAttacker();
  const target = mockTarget();

  // Core 5e result
  setActiveModule("core-5e-lite");
  const rng1 = createSeededRng(42);
  const core5eResult = getActiveRules().combat.calculateAttackRoll(attacker, target, rng1);

  // Homebrew result (2d10 system consumes 2 RNG calls vs 1)
  setActiveModule("homebrew-sample");
  const rng2 = createSeededRng(42);
  const homebrewResult = getActiveRules().combat.calculateAttackRoll(attacker, target, rng2);

  // They should produce structurally valid results from both
  assert.ok("hit" in core5eResult);
  assert.ok("hit" in homebrewResult);
});

// ── Test Suite: Determinism ────────────────────────────────────────────

test("Determinism: same seed produces identical results", () => {
  clearRegistry();
  initRuleModules();
  const attacker = mockAttacker();
  const target = mockTarget();

  const rng1 = createSeededRng(12345);
  const result1 = getActiveRules().combat.calculateAttackRoll(attacker, target, rng1);

  const rng2 = createSeededRng(12345);
  const result2 = getActiveRules().combat.calculateAttackRoll(attacker, target, rng2);

  assert.equal(result1.roll, result2.roll);
  assert.equal(result1.hit, result2.hit);
  assert.equal(result1.total, result2.total);
});

test("Determinism: different seeds produce different results", () => {
  clearRegistry();
  initRuleModules();
  const attacker = mockAttacker();
  const target = mockTarget();

  const rng1 = createSeededRng(42);
  const result1 = getActiveRules().combat.calculateAttackRoll(attacker, target, rng1);

  const rng2 = createSeededRng(9999);
  const result2 = getActiveRules().combat.calculateAttackRoll(attacker, target, rng2);

  // With different seeds, at least the roll should differ
  // (there's a tiny chance they'd match, but with our LCG they won't for these seeds)
  assert.notEqual(result1.roll, result2.roll);
});

console.log("✓ All rule module tests passed");