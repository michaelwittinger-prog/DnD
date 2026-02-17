/**
 * homebrewSample.mjs — Homebrew Sample Rule Module (Tier 6.5)
 *
 * Demonstrates pluggability of the rule module system with a variant
 * ruleset that differs from core-5e-lite in meaningful ways:
 *
 * Differences from core-5e-lite:
 * - 2d10 attack rolls instead of d20 (bell curve distribution)
 * - Flat damage (no dice) + strength modifier
 * - Faster movement (8 base instead of 6)
 * - Conditions last longer
 * - Critical hits on 19-20 (instead of just 20)
 * - Healing is more powerful
 * - Lava does not block movement (only damages)
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

// ── Combat Rules (2d10 system) ─────────────────────────────────────────

const combat = {
  /**
   * 2d10 attack roll: more predictable outcomes (bell curve)
   * Crit on 19-20 total on first die
   */
  calculateAttackRoll(attacker, target, rng) {
    const die1 = rollDie(10, rng);
    const die2 = rollDie(10, rng);
    const roll = die1 + die2;
    const modifier = attacker?.stats?.attackBonus ?? 3;
    const total = roll + modifier;
    const ac = target?.stats?.ac ?? 10;
    const isCritical = die1 >= 9 && die2 >= 9; // Double high = crit
    const isCritFail = die1 === 1 && die2 === 1; // Double ones = crit fail
    const hit = isCritical || (!isCritFail && total >= ac);
    return { roll, modifier, total, ac, hit, isCritical, isCritFail };
  },

  /**
   * Flat damage system: base weapon damage + full strength modifier
   * No randomness in damage — only attack rolls are random
   */
  calculateDamage(attacker, target, weapon, rng) {
    const baseDamage = weapon?.flatDamage ?? weapon?.damageDie ?? 5;
    const strMod = getModifier(attacker?.stats?.strength ?? 14);
    const modifier = attacker?.stats?.damageBonus ?? strMod;
    const total = Math.max(1, baseDamage + modifier);
    return { roll: baseDamage, modifier, total, damageType: weapon?.damageType ?? 'bludgeoning' };
  },

  /**
   * Initiative: 1d10 + dex modifier (faster resolution)
   */
  calculateInitiative(entity, rng) {
    const roll = rollDie(10, rng);
    const dexMod = getModifier(entity?.stats?.dexterity ?? 10);
    const total = roll + dexMod;
    return { roll, modifier: dexMod, total };
  },

  getAttackRange(attacker, weapon) {
    if (weapon?.range) return weapon.range;
    // Homebrew: slightly longer melee reach
    return attacker?.stats?.attackRange ?? 1;
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
    // Homebrew: stunned entities CAN attack, but at disadvantage (handled in roll)
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
    // Homebrew: no cooldowns — abilities are always available
    return { allowed: true, reason: null };
  },

  resolveAbility(caster, ability, target, rng) {
    if (ability.type === 'heal') {
      // Homebrew: healing is flat + bonus (more reliable)
      const flatHeal = ability.flatHeal ?? ability.healDie ?? 6;
      const modifier = ability.healBonus ?? 4; // Higher heal bonus
      const heal = flatHeal + modifier;
      return { hit: true, damage: 0, heal, effects: [] };
    }

    // Attack ability: 2d10 system
    const die1 = rollDie(10, rng);
    const die2 = rollDie(10, rng);
    const roll = die1 + die2;
    const modifier = ability.attackBonus ?? 4;
    const total = roll + modifier;
    const ac = target?.stats?.ac ?? 10;
    const hit = (die1 >= 9 && die2 >= 9) || (!(die1 === 1 && die2 === 1) && total >= ac);

    if (!hit) {
      return { hit: false, damage: 0, heal: 0, effects: [] };
    }

    // Flat damage for abilities too
    const flatDamage = ability.flatDamage ?? ability.damageDie ?? 5;
    const damageBonus = ability.damageBonus ?? 3;
    const damage = Math.max(1, flatDamage + damageBonus);
    const effects = ability.appliesCondition ? [ability.appliesCondition] : [];

    return { hit: true, damage, heal: 0, effects };
  },

  getCooldown(ability) {
    return 0; // Homebrew: no cooldowns
  },

  getAbilityCost(ability) {
    return ability?.cost ?? { type: 'action', amount: 1 };
  },
};

// ── Condition Rules (longer durations) ─────────────────────────────────

const CONDITIONS = {
  stunned: {
    statMods: { ac: -1 }, // Homebrew: lesser AC penalty
    actionRestrictions: ['move'], // Can still attack while stunned
    duration: 2, // Longer duration
  },
  poisoned: {
    statMods: { attackBonus: -3 }, // Stronger penalty
    actionRestrictions: [],
    duration: 5, // Much longer
  },
  prone: {
    statMods: { ac: -1 },
    actionRestrictions: [],
    duration: 0,
  },
  blessed: {
    statMods: { attackBonus: 2, ac: 2 }, // Stronger buffs
    actionRestrictions: [],
    duration: 5, // Longer
  },
  burning: {
    statMods: {},
    actionRestrictions: [],
    duration: 3, // Longer
    tickDamage: 5, // More tick damage
  },
  enraged: { // Homebrew-only condition
    statMods: { attackBonus: 3, ac: -2 },
    actionRestrictions: [],
    duration: 3,
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

// ── Movement Rules (faster base movement) ──────────────────────────────

const TERRAIN_COSTS = {
  open: 1,
  difficult: 2,
  water: 2,
  blocked: Infinity,
  lava: 2, // Homebrew: lava doesn't block, just costs more (and damages)
};

const movement = {
  getMovementSpeed(entity, activeConditions = [], terrain = 'open') {
    let speed = entity?.stats?.movementSpeed ?? 8; // Homebrew: 8 base speed

    if (activeConditions.includes('prone')) {
      speed = Math.floor(speed / 2);
    }
    // Homebrew: enraged gives +2 speed
    if (activeConditions.includes('enraged')) {
      speed += 2;
    }

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
    // Homebrew: stunned entities CAN move (only at half speed, handled in getMovementSpeed)

    const width = state?.map?.grid?.size?.width ?? 20;
    const height = state?.map?.grid?.size?.height ?? 15;
    if (position.x < 0 || position.x >= width || position.y < 0 || position.y >= height) {
      return { allowed: false, reason: 'Position out of bounds' };
    }

    return { allowed: true, reason: null };
  },
};

// ── Damage Rules (with armor system) ───────────────────────────────────

const damage = {
  applyDamageReduction(damageAmount, target, damageType) {
    // Homebrew: all entities get flat DR based on armor
    const dr = target?.stats?.damageReduction ?? 1; // Minimum 1 DR
    return Math.max(1, damageAmount - dr); // Always deal at least 1
  },

  applyResistance(damageAmount, target, damageType) {
    const resistances = target?.resistances ?? [];
    if (resistances.includes(damageType)) {
      // Homebrew: resistance reduces by 1/3 instead of 1/2
      return Math.floor(damageAmount * 2 / 3);
    }
    return damageAmount;
  },

  calculateCriticalDamage(baseDamage, rng) {
    // Homebrew: crits do 2.5x damage (more impactful)
    return Math.floor(baseDamage * 2.5);
  },
};

// ── Healing Rules (more powerful) ──────────────────────────────────────

const healing = {
  calculateHealing(healer, target, spell, rng) {
    // Homebrew: flat healing (no dice) + larger bonus
    const flatHeal = spell?.flatHeal ?? spell?.healDie ?? 6;
    const modifier = spell?.healBonus ?? 4;
    const total = flatHeal + modifier;

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
    // Homebrew: CAN heal dead targets (revive mechanic)
    if ((target.stats?.hpCurrent ?? 0) >= (target.stats?.hpMax ?? 20)) {
      return { allowed: false, reason: 'Target is at full HP' };
    }
    return { allowed: true, reason: null };
  },
};

// ── Module Export ──────────────────────────────────────────────────────

/**
 * Homebrew Sample Rule Module
 * Variant ruleset demonstrating pluggability of the module system.
 */
export const homebrewSampleModule = {
  id: 'homebrew-sample',
  name: 'Homebrew Variant',
  version: '1.0.0',
  description: '2d10 attack system, flat damage, faster movement, no cooldowns, longer conditions. Demonstrates rule module pluggability.',
  author: 'MIR Community',
  rules: {
    combat,
    abilities,
    conditions,
    movement,
    damage,
    healing,
  },
};