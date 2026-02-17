/**
 * ruleModuleRegistry.mjs — Pluggable Rule Module System (Tier 6.5)
 *
 * Provides a registry for pluggable rule modules that define how
 * combat mechanics, ability checks, damage calculations, and
 * condition handling work. Enables switching between D&D 5e-lite,
 * homebrew, or custom rule sets without changing engine code.
 *
 * Architecture:
 *   RuleModule = { id, name, version, rules }
 *   rules = { combat, abilities, conditions, movement, damage, healing }
 *   Each sub-object provides hook functions the engine calls.
 *
 * Usage:
 *   registerModule(module)
 *   setActiveModule('core-5e-lite')
 *   const rules = getActiveRules()
 *   const result = rules.combat.calculateAttackRoll(attacker, target, rng)
 */

// ── Module Registry ────────────────────────────────────────────────────

/** @type {Map<string, RuleModule>} */
const registry = new Map();

/** @type {string|null} */
let activeModuleId = null;

/**
 * @typedef {Object} CombatRules
 * @property {function} calculateAttackRoll - (attacker, target, rng) => { roll, modifier, total, ac, hit }
 * @property {function} calculateDamage - (attacker, target, weapon, rng) => { roll, modifier, total }
 * @property {function} calculateInitiative - (entity, rng) => { roll, modifier, total }
 * @property {function} getAttackRange - (attacker, weapon) => number
 * @property {function} canAttack - (attacker, target, state) => { allowed, reason }
 */

/**
 * @typedef {Object} AbilityRules
 * @property {function} canUseAbility - (caster, ability, target, state) => { allowed, reason }
 * @property {function} resolveAbility - (caster, ability, target, rng) => { hit, damage, heal, effects }
 * @property {function} getCooldown - (ability) => number
 * @property {function} getAbilityCost - (ability) => { type, amount }
 */

/**
 * @typedef {Object} ConditionRules
 * @property {function} applyCondition - (entity, condition) => modifiers
 * @property {function} tickConditions - (entity, conditions) => { remaining, expired, effects }
 * @property {function} getConditionEffects - (condition) => { statMods, actionRestrictions }
 */

/**
 * @typedef {Object} MovementRules
 * @property {function} getMovementSpeed - (entity, conditions, terrain) => number
 * @property {function} getTerrainCost - (terrainType) => number
 * @property {function} canMoveTo - (entity, position, state) => { allowed, reason }
 */

/**
 * @typedef {Object} DamageRules
 * @property {function} applyDamageReduction - (damage, target, damageType) => number
 * @property {function} applyResistance - (damage, target, damageType) => number
 * @property {function} calculateCriticalDamage - (baseDamage, rng) => number
 */

/**
 * @typedef {Object} HealingRules
 * @property {function} calculateHealing - (healer, target, spell, rng) => number
 * @property {function} canHeal - (healer, target) => { allowed, reason }
 */

/**
 * @typedef {Object} RuleModuleRules
 * @property {CombatRules} combat
 * @property {AbilityRules} abilities
 * @property {ConditionRules} conditions
 * @property {MovementRules} movement
 * @property {DamageRules} damage
 * @property {HealingRules} healing
 */

/**
 * @typedef {Object} RuleModule
 * @property {string} id - Unique identifier (e.g., 'core-5e-lite')
 * @property {string} name - Display name
 * @property {string} version - Semantic version
 * @property {string} description - Brief description
 * @property {string} author - Module author
 * @property {RuleModuleRules} rules - Rule implementations
 */

/**
 * Register a rule module in the registry
 * @param {RuleModule} module
 * @throws {Error} If module is invalid or ID is already registered
 */
export function registerModule(module) {
  if (!module || !module.id) {
    throw new Error('Rule module must have an id');
  }
  if (!module.name) {
    throw new Error('Rule module must have a name');
  }
  if (!module.rules) {
    throw new Error('Rule module must have a rules object');
  }

  // Validate required rule categories exist
  const requiredCategories = ['combat', 'abilities', 'conditions', 'movement', 'damage', 'healing'];
  for (const cat of requiredCategories) {
    if (!module.rules[cat]) {
      throw new Error(`Rule module "${module.id}" missing required category: ${cat}`);
    }
  }

  if (registry.has(module.id)) {
    throw new Error(`Rule module "${module.id}" is already registered`);
  }

  registry.set(module.id, module);
}

/**
 * Unregister a rule module
 * @param {string} moduleId
 */
export function unregisterModule(moduleId) {
  if (activeModuleId === moduleId) {
    activeModuleId = null;
  }
  registry.delete(moduleId);
}

/**
 * Set the active rule module by ID
 * @param {string} moduleId
 * @throws {Error} If module is not registered
 */
export function setActiveModule(moduleId) {
  if (!registry.has(moduleId)) {
    throw new Error(`Rule module "${moduleId}" is not registered`);
  }
  activeModuleId = moduleId;
}

/**
 * Get the currently active rule module
 * @returns {RuleModule|null}
 */
export function getActiveModule() {
  if (!activeModuleId) return null;
  return registry.get(activeModuleId) || null;
}

/**
 * Get the rules from the active module
 * @returns {RuleModuleRules}
 * @throws {Error} If no active module
 */
export function getActiveRules() {
  const module = getActiveModule();
  if (!module) {
    throw new Error('No active rule module. Call setActiveModule() first.');
  }
  return module.rules;
}

/**
 * Get the active module ID
 * @returns {string|null}
 */
export function getActiveModuleId() {
  return activeModuleId;
}

/**
 * List all registered modules
 * @returns {Array<{ id: string, name: string, version: string, description: string }>}
 */
export function listModules() {
  return [...registry.values()].map(m => ({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    author: m.author,
  }));
}

/**
 * Get a specific registered module by ID
 * @param {string} moduleId
 * @returns {RuleModule|null}
 */
export function getModule(moduleId) {
  return registry.get(moduleId) || null;
}

/**
 * Clear all registered modules (for testing)
 */
export function clearRegistry() {
  registry.clear();
  activeModuleId = null;
}

/**
 * Check if a module is registered
 * @param {string} moduleId
 * @returns {boolean}
 */
export function isModuleRegistered(moduleId) {
  return registry.has(moduleId);
}