/**
 * rng.mjs — MIR 1.3 Deterministic RNG.
 *
 * Uses a simple Linear Congruential Generator (LCG).
 * Parameters: a=1664525, c=1013904223, m=2^32 (Numerical Recipes).
 *
 * No Math.random usage. All randomness flows through state.rng.seed.
 */

const MOD = 2 ** 32;
const A = 1664525;
const C = 1013904223;

/**
 * Hash a string seed into a numeric seed.
 * Uses DJB2 hash to produce a 32-bit integer.
 * @param {string} seed
 * @returns {number}
 */
export function hashSeed(seed) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Advance LCG state by one step.
 * @param {number} numericSeed — current numeric seed (32-bit unsigned)
 * @returns {{ value: number, nextSeed: number }}
 *   value is in [0, 1) range.
 */
function lcgStep(numericSeed) {
  const nextSeed = ((A * numericSeed + C) % MOD) >>> 0;
  return { value: nextSeed / MOD, nextSeed };
}

/**
 * Roll a d20 deterministically using the game state's RNG.
 *
 * When mode is "manual", we fall back to a hash of the seed + roll count.
 * When mode is "seeded", we advance the seed deterministically.
 *
 * @param {object} state — full GameState
 * @param {string} [source] — optional label for what this roll is for
 * @returns {{ result: number, nextState: object }}
 */
export function rollD20(state, source) {
  return rollDice(state, 1, 20, source);
}

/**
 * Roll dice deterministically: {count}d{sides} + 0.
 *
 * @param {object} state — full GameState
 * @param {number} count — number of dice
 * @param {number} sides — number of sides per die
 * @param {string} [source] — optional label
 * @returns {{ result: number, nextState: object }}
 */
export function rollDice(state, count, sides, source) {
  const rng = state.rng;
  const seedStr = rng.seed ?? "default";
  // Derive numeric seed from string seed + roll count for reproducibility
  let numSeed = hashSeed(seedStr + ":" + (rng.lastRolls?.length ?? 0));

  let total = 0;
  const breakdown = [];
  for (let i = 0; i < count; i++) {
    const step = lcgStep(numSeed);
    numSeed = step.nextSeed;
    const roll = Math.floor(step.value * sides) + 1; // 1..sides
    total += roll;
    breakdown.push(roll);
  }

  const formula = count === 1 ? `1d${sides}` : `${count}d${sides}`;
  const rollRecord = {
    id: `roll-${(rng.lastRolls?.length ?? 0) + 1}`,
    timestamp: state.timestamp,
    formula,
    resultTotal: total,
    breakdown: `[${breakdown.join("+")}]=${total}`,
    ...(source ? { source } : {}),
  };

  // Build new state with updated seed representation and appended roll
  const nextState = structuredClone(state);
  // Encode next numeric seed back into string seed for reproducibility chain
  nextState.rng.seed = seedStr.split(":")[0] + ":" + numSeed;
  nextState.rng.lastRolls = [...(rng.lastRolls ?? []), rollRecord];

  return { result: total, nextState };
}
