/**
 * core5eLite.mjs — Default Rule Module: D&D 5e Lite (Tier 6.5)
 *
 * Implements simplified D&D 5th Edition rules as the default rule module.
 * This wraps the existing engine mechanics into the pluggable module format.
 *
 * Features:
 * - d20 attack rolls with ability modifiers
 * - Standard AC-based hit determination
 * - Weapon damage dice + modifier
 * - Dexterity-based initiative
 * - Standard condition effects (stunned, poisoned, prone, etc.)
 * - 5ft grid movement with difficult terrain
 */

/** Simple deterministic RNG helper for dice */
function rollDie(sides, rng) {
  if (rng && typeof rng.next === 'function') {
    return (rng.next() % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

function getStatValue(entity, stat) {
  return entity?.stats?.[stat] ?? 10;
}

// ── Combat Rules ───────────────────────────────────────────────────────

const combat = {
  calculateAttackRoll(attacker, target, rng) {
    const roll = rollDie(20, rng);
    const strMod = getModifier(getStatValue(attacker, 'strength') || 14);
    const modifier = attacker?.stats?.attackBonus ?? strMod;
    const total = roll + modifier;
    const ac = target?.stats?.ac ?? 10;
    const isCritical = roll === 20;
    const isCritFail = roll === 1;
    const hit = isCritical || (!isCritFail && total >= ac);
    return { roll, modifier, total, ac, hit, isCritical, isCritFail };
  },

  calculateDamage(attacker, target, weapon, rng) {
    const damageDie = weapon?.damageDie ?? 8;
    const roll = rollDie(damageDie, rng);
    const strMod = getModifier(getStatValue(attacker, 'strength') || 14);
    const modifier = attacker?.stats?.damageBonus ?? strMod;
    const total = Math.max(1, roll + modifier);
    return { roll, modifier, total, damageType: weapon?.damageType ?? 'slashing' };
  },

  calculateInitiative(entity, rng) {
    const roll = rollDie(20, rng);
    const dexMod = getModifier(getStatValue(entity, 'dexterity') || 10);
    const modifier = dexMod;
    const total = roll + modifier;
    return { roll, modifier, total };
  },

  getAttackRange(attacker, weapon) {
    if (weapon?.range) return weapon.range;
    return attacker?.stats?.attackRange ?? 1; // Default melee range
  },

  canAttack(attacker, target, state) {
    if (!attacker || !target) {
      return { allowed: false, reason: 'Missing attacker or target' };
    }
    if (attacker.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Attacker is dead' };
    }
    if (target.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Target is already dead' };
    }
    if (attacker.conditions?.includes('stunned')) {
      return { allowed: false, reason: 'Attacker is stunned' };
    }
    return { allowed: true, reason: null };
  },
};

// ── Ability Rules ──────────────────────────────────────────────────────

const abilities = {
  canUseAbility(caster, ability, target, state) {
    if (!caster || !ability) {
      return { allowed: false, reason: 'Missing caster or ability' };
    }
    if (caster.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Caster is dead' };
    }
    if (caster.conditions?.includes('stunned')) {
      return { allowed: false, reason: 'Caster is stunned and cannot use abilities' };
    }
    // Check cooldown
    const cooldownRemaining = caster.abilityCooldowns?.[ability.id] ?? 0;
    if (cooldownRemaining > 0) {
      return { allowed: false, reason: `Ability on cooldown (${cooldownRemaining} rounds remaining)` };
    }
    return { allowed: true, reason: null };
  },

  resolveAbility(caster, ability, target, rng) {
    if (ability.type === 'heal') {
      const healDie = ability.healDie ?? 8;
      const roll = rollDie(healDie, rng);
      const modifier = ability.healBonus ?? 2;
      const heal = Math.max(1, roll + modifier);
      return { hit: true, damage: 0, heal, effects: [] };
    }

    // Attack ability
    const roll = rollDie(20, rng);
    const modifier = ability.attackBonus ?? 4;
    const total = roll + modifier;
    const ac = target?.stats?.ac ?? 10;
    const hit = roll === 20 || (roll !== 1 && total >= ac);

    if (!hit) {
      return { hit: false, damage: 0, heal: 0, effects: [] };
    }

    const damageDie = ability.damageDie ?? 6;
    const damageRoll = rollDie(damageDie, rng);
    const damageBonus = ability.damageBonus ?? 2;
    const damage = Math.max(1, damageRoll + damageBonus);
    const effects = ability.appliesCondition ? [ability.appliesCondition] : [];

    return { hit: true, damage, heal: 0, effects };
  },

  getCooldown(ability) {
    return ability?.cooldown ?? 0;
  },

  getAbilityCost(ability) {
    return ability?.cost ?? { type: 'action', amount: 1 };
  },
};

// ── Condition Rules ────────────────────────────────────────────────────

const CONDITIONS = {
  stunned: {
    statMods: { ac: -2 },
    actionRestrictions: ['attack', 'move', 'ability'],
    duration: 1,
  },
  poisoned: {
    statMods: { attackBonus: -2 },
    actionRestrictions: [],
    duration: 3,
  },
  prone: {
    statMods: { ac: -2 },
    actionRestrictions: [],
    duration: 0, // Must use action to stand
  },
  blessed: {
    statMods: { attackBonus: 1, ac: 1 },
    actionRestrictions: [],
    duration: 3,
  },
  burning: {
    statMods: {},
    actionRestrictions: [],
    duration: 2,
    tickDamage: 3,
  },
};

const conditions = {
  applyCondition(entity, condition) {
    const def = CONDITIONS[condition] ?? { statMods: {}, actionRestrictions: [] };
    return def.statMods;
  },

  tickConditions(entity, activeConditions) {
    const remaining = [];
    const expired = [];
    const effects = [];

    for (const cond of activeConditions) {
      const def = CONDITIONS[cond.name] ?? { duration: 1 };
      const turnsLeft = (cond.turnsRemaining ?? def.duration) - 1;

      if (def.tickDamage) {
        effects.push({ type: 'damage', amount: def.tickDamage, source: cond.name });
      }

      if (turnsLeft <= 0) {
        expired.push(cond.name);
      } else {
        remaining.push({ ...cond, turnsRemaining: turnsLeft });
      }
    }

    return { remaining, expired, effects };
  },

  getConditionEffects(condition) {
    const def = CONDITIONS[condition] ?? { statMods: {}, actionRestrictions: [] };
    return {
      statMods: def.statMods,
      actionRestrictions: def.actionRestrictions,
    };
  },
};

// ── Movement Rules ─────────────────────────────────────────────────────

const TERRAIN_COSTS = {
  open: 1,
  difficult: 2,
  water: 2,
  blocked: Infinity,
  lava: 3,
};

const movement = {
  getMovementSpeed(entity, activeConditions = [], terrain = 'open') {
    let speed = entity?.stats?.movementSpeed ?? 6;

    // Prone halves movement
    if (activeConditions.includes('prone')) {
      speed = Math.floor(speed / 2);
    }

    // Difficult terrain handled at per-tile level
    return Math.max(0, speed);
  },

  getTerrainCost(terrainType) {
    return TERRAIN_COSTS[terrainType] ?? 1;
  },

  canMoveTo(entity, position, state) {
    if (!entity || !position) {
      return { allowed: false, reason: 'Missing entity or position' };
    }
    if (entity.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Dead entities cannot move' };
    }
    if (entity.conditions?.includes('stunned')) {
      return { allowed: false, reason: 'Stunned entities cannot move' };
    }

    // Check bounds
    const width = state?.map?.grid?.size?.width ?? 20;
    const height = state?.map?.grid?.size?.height ?? 15;
    if (position.x < 0 || position.x >= width || position.y < 0 || position.y >= height) {
      return { allowed: false, reason: 'Position out of bounds' };
    }

    return { allowed: true, reason: null };
  },
};

// ── Damage Rules ───────────────────────────────────────────────────────

const damage = {
  applyDamageReduction(damageAmount, target, damageType) {
    const dr = target?.stats?.damageReduction ?? 0;
    return Math.max(0, damageAmount - dr);
  },

  applyResistance(damageAmount, target, damageType) {
    const resistances = target?.resistances ?? [];
    if (resistances.includes(damageType)) {
      return Math.floor(damageAmount / 2);
    }
    return damageAmount;
  },

  calculateCriticalDamage(baseDamage, rng) {
    // 5e rule: double the dice (approximated as 1.5x + bonus)
    return Math.floor(baseDamage * 2);
  },
};

// ── Healing Rules ──────────────────────────────────────────────────────

const healing = {
  calculateHealing(healer, target, spell, rng) {
    const healDie = spell?.healDie ?? 8;
    const roll = rollDie(healDie, rng);
    const modifier = spell?.healBonus ?? 2;
    const total = Math.max(1, roll + modifier);

    // Cannot exceed max HP
    const maxHp = target?.stats?.hpMax ?? 20;
    const currentHp = target?.stats?.hpCurrent ?? 0;
    return Math.min(total, maxHp - currentHp);
  },

  canHeal(healer, target) {
    if (!healer || !target) {
      return { allowed: false, reason: 'Missing healer or target' };
    }
    if (healer.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Dead entities cannot heal' };
    }
    if (target.conditions?.includes('dead')) {
      return { allowed: false, reason: 'Cannot heal dead targets' };
    }
    if ((target.stats?.hpCurrent ?? 0) >= (target.stats?.hpMax ?? 20)) {
      return { allowed: false, reason: 'Target is at full HP' };
    }
    return { allowed: true, reason: null };
  },
};

// ── Module Export ──────────────────────────────────────────────────────

/**
 * Core 5e-Lite Rule Module
 * Default rule module implementing simplified D&D 5th Edition mechanics.
 */
export const core5eLiteModule = {
  id: 'core-5e-lite',
  name: 'D&D 5e Lite',
  version: '1.0.0',
  description: 'Simplified D&D 5th Edition rules with d20 attack rolls, AC-based hits, and standard conditions.',
  author: 'MIR Engine',
  rules: {
    combat,
    abilities,
    conditions,
    movement,
    damage,
    healing,
  },
};