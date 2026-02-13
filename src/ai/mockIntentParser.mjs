/**
 * mockIntentParser.mjs — Enhanced mock natural language → PlayerIntent parser.
 *
 * Converts free-form player text into structured PlayerIntent objects
 * WITHOUT requiring an LLM. Uses keyword matching, pattern recognition,
 * and fuzzy entity/ability name resolution.
 *
 * The mock parser handles ~80% of common gameplay phrases. The planner
 * then converts intents into concrete DeclaredActions.
 *
 * Safety: This module produces ONLY inert PlayerIntent objects.
 * It never modifies state or produces engine actions directly.
 */

import { INTENT_TYPES, DIRECTIONS, TARGET_SELECTORS } from "./intentTypes.mjs";

// ── Keyword Maps ─────────────────────────────────────────────────────

/** Attack verbs (allow conjugated forms like "attacks", "hits") */
const ATTACK_VERBS = /\b(attacks?|hits?|strikes?|fights?|slashe?s?|swings?|shoots?|stabs?|smites?|smashe?s?|punche?s?|kicks?|cleaves?)\b/i;

/** Movement verbs */
const MOVE_VERBS = /\b(moves?|go(?:es)?|walks?|runs?|steps?|advances?|heads?|travels?|proceeds?|dashe?s?)\b/i;

/** Ability / cast verbs */
const ABILITY_VERBS = /\b(casts?|uses?|activates?|invokes?|channels?|fires?|heals?|throws?|launche?s?|unleashe?s?)\b/i;

/** Flee / retreat verbs */
const FLEE_VERBS = /\b(flee|retreat|escape|run\s*away|back\s*off|disengage|withdraw)\b/i;

/** Defend verbs */
const DEFEND_VERBS = /\b(defend|dodge|block|brace|hunker|guard|protect)\b/i;

/** Direction keywords → direction constant */
const DIRECTION_MAP = {
  north: DIRECTIONS.NORTH, up: DIRECTIONS.NORTH, n: DIRECTIONS.NORTH,
  south: DIRECTIONS.SOUTH, down: DIRECTIONS.SOUTH, s: DIRECTIONS.SOUTH,
  east: DIRECTIONS.EAST,   right: DIRECTIONS.EAST,  e: DIRECTIONS.EAST,
  west: DIRECTIONS.WEST,   left: DIRECTIONS.WEST,   w: DIRECTIONS.WEST,
};

/** Tactical target keywords → selector constant */
const TACTICAL_TARGETS = {
  "nearest enemy":       TARGET_SELECTORS.NEAREST_HOSTILE,
  "nearest hostile":     TARGET_SELECTORS.NEAREST_HOSTILE,
  "closest enemy":       TARGET_SELECTORS.NEAREST_HOSTILE,
  "closest hostile":     TARGET_SELECTORS.NEAREST_HOSTILE,
  "nearest foe":         TARGET_SELECTORS.NEAREST_HOSTILE,
  "weakest enemy":       TARGET_SELECTORS.WEAKEST_HOSTILE,
  "weakest hostile":     TARGET_SELECTORS.WEAKEST_HOSTILE,
  "weakest foe":         TARGET_SELECTORS.WEAKEST_HOSTILE,
  "lowest hp enemy":     TARGET_SELECTORS.WEAKEST_HOSTILE,
  "strongest enemy":     TARGET_SELECTORS.STRONGEST_HOSTILE,
  "strongest hostile":   TARGET_SELECTORS.STRONGEST_HOSTILE,
  "most injured ally":   TARGET_SELECTORS.MOST_INJURED_ALLY,
  "most hurt ally":      TARGET_SELECTORS.MOST_INJURED_ALLY,
  "weakest ally":        TARGET_SELECTORS.MOST_INJURED_ALLY,
  "injured ally":        TARGET_SELECTORS.MOST_INJURED_ALLY,
  "wounded ally":        TARGET_SELECTORS.MOST_INJURED_ALLY,
  "nearest ally":        TARGET_SELECTORS.NEAREST_ALLY,
  "closest ally":        TARGET_SELECTORS.NEAREST_ALLY,
  "nearest friend":      TARGET_SELECTORS.NEAREST_ALLY,
};

/** Known ability name patterns → normalized ability key */
const ABILITY_PATTERNS = [
  { pattern: /\bfire\s*bolt\b/i,       key: "firebolt" },
  { pattern: /\bhealing\s*word\b/i,    key: "healing_word" },
  { pattern: /\bheal\b/i,              key: "healing_word" },
  { pattern: /\bsneak\s*attack\b/i,    key: "sneak_attack" },
  { pattern: /\bpoison\s*strike\b/i,   key: "poison_strike" },
  { pattern: /\bshield\s*bash\b/i,     key: "shield_bash" },
  { pattern: /\bbash\b/i,              key: "shield_bash" },
  { pattern: /\bpoison\b/i,            key: "poison_strike" },
];

// ── Main Parser ──────────────────────────────────────────────────────

/**
 * Parse natural language player input into a PlayerIntent.
 *
 * @param {string} input — raw player text
 * @returns {object} — PlayerIntent object
 */
export function parseIntent(input) {
  if (!input || typeof input !== "string") {
    return { type: INTENT_TYPES.UNKNOWN, raw: input ?? "", hint: "Empty input" };
  }

  const raw = input;
  const text = normalizeWordNumbers(input.trim().toLowerCase());

  // ── 1. Start combat ─────────────────────────────────────────────
  if (/^(roll\s+initiative|start\s+combat|initiative|begin\s+combat|begin\s+battle|let'?s?\s+fight)$/i.test(text)) {
    return { type: INTENT_TYPES.START_COMBAT, raw };
  }

  // ── 2. End turn ─────────────────────────────────────────────────
  if (/^(end\s+turn|end|next|pass|done|skip|wait)$/i.test(text)) {
    return { type: INTENT_TYPES.END_TURN, raw, subject: TARGET_SELECTORS.ACTIVE };
  }

  // ── 3. Flee / retreat ───────────────────────────────────────────
  if (FLEE_VERBS.test(text)) {
    const from = extractTacticalTarget(text) || TARGET_SELECTORS.NEAREST_HOSTILE;
    const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
    return { type: INTENT_TYPES.FLEE, raw, subject, from };
  }

  // ── 4. Defend ───────────────────────────────────────────────────
  if (DEFEND_VERBS.test(text) && !ATTACK_VERBS.test(text)) {
    const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
    return { type: INTENT_TYPES.DEFEND, raw, subject };
  }

  // ── 5. Compound: "X and Y" / "X then Y" ────────────────────────
  const compound = tryParseCompound(text, raw);
  if (compound) return compound;

  // ── 6. Ability use (cast/use + ability name) ────────────────────
  if (ABILITY_VERBS.test(text)) {
    const ability = matchAbility(text);
    if (ability) {
      const target = extractTarget(text) || TARGET_SELECTORS.NEAREST_HOSTILE;
      const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
      return { type: INTENT_TYPES.USE_ABILITY, raw, subject, ability, target };
    }
  }

  // ── 7. Attack ───────────────────────────────────────────────────
  if (ATTACK_VERBS.test(text)) {
    const target = extractTarget(text) || TARGET_SELECTORS.NEAREST_HOSTILE;
    const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
    return { type: INTENT_TYPES.ATTACK, raw, subject, target };
  }

  // ── 8. Move to coordinates ──────────────────────────────────────
  const coordMatch = text.match(/(\d+)\s*[,\s]\s*(\d+)/);
  if (coordMatch && (MOVE_VERBS.test(text) || /\bto\b/.test(text) || !ATTACK_VERBS.test(text))) {
    const x = parseInt(coordMatch[1], 10);
    const y = parseInt(coordMatch[2], 10);
    const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
    return { type: INTENT_TYPES.MOVE_TO, raw, subject, x, y };
  }

  // ── 9. Move in direction ────────────────────────────────────────
  if (MOVE_VERBS.test(text) || hasDirection(text)) {
    const dir = extractDirection(text);
    if (dir) {
      const distMatch = text.match(/(\d+)\s*(cell|square|step|tile|space|feet|ft)?s?/i);
      const distance = distMatch ? parseInt(distMatch[1], 10) : undefined;
      const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
      return { type: INTENT_TYPES.MOVE_DIRECTION, raw, subject, direction: dir, distance };
    }
  }

  // ── 10. Approach target (move verb + entity name, no coords) ────
  if (MOVE_VERBS.test(text)) {
    const target = extractTarget(text);
    if (target) {
      const subject = extractSubjectName(text) || TARGET_SELECTORS.ACTIVE;
      return { type: INTENT_TYPES.APPROACH, raw, subject, target };
    }
  }

  // ── 11. Bare ability name (no verb) ─────────────────────────────
  const bareAbility = matchAbility(text);
  if (bareAbility) {
    const target = extractTarget(text) || TARGET_SELECTORS.NEAREST_HOSTILE;
    const subject = TARGET_SELECTORS.ACTIVE;
    return { type: INTENT_TYPES.USE_ABILITY, raw, subject, ability: bareAbility, target };
  }

  // ── 12. Bare entity name with no verb → approach ────────────────
  // e.g. player types just "goblin" — interpret as "go to the goblin"

  // ── 13. Unknown ─────────────────────────────────────────────────
  return {
    type: INTENT_TYPES.UNKNOWN,
    raw,
    hint: "Try: 'attack goblin', 'move north 3', 'cast firebolt at bandit', 'heal Miri', 'move to 5,3 and attack', 'flee', 'end turn'",
  };
}

// ── Compound Intent Parsing ──────────────────────────────────────────

/**
 * Try to parse "X and Y" / "X then Y" / "X, then Y" patterns.
 * Returns a COMPOUND intent or null if not a compound sentence.
 */
function tryParseCompound(text, raw) {
  // Split on " and then ", " then ", " and ", ", "
  const splitPatterns = [
    /\s+and\s+then\s+/i,
    /\s+then\s+/i,
    /\s+and\s+/i,
  ];

  for (const pattern of splitPatterns) {
    const parts = text.split(pattern);
    if (parts.length >= 2 && parts.every(p => p.trim().length > 2)) {
      const steps = parts.map(p => parseIntent(p.trim()));
      // Only valid if at least 2 steps parsed to known intents
      const validSteps = steps.filter(s => s.type !== INTENT_TYPES.UNKNOWN);
      if (validSteps.length >= 2) {
        // Resolve pronouns across compound steps (e.g. "go to goblin and attack him")
        resolvePronouns(validSteps);
        return { type: INTENT_TYPES.COMPOUND, raw, steps: validSteps };
      }
    }
  }
  return null;
}

// ── Target Extraction ────────────────────────────────────────────────

/**
 * Extract a target from text. Checks tactical selectors first,
 * then returns remaining noun phrase as a fuzzy entity name.
 */
function extractTarget(text) {
  // Check tactical targets first (multi-word patterns)
  const tactical = extractTacticalTarget(text);
  if (tactical) return tactical;

  // Extract entity name after target prepositions
  const targetPatterns = [
    /(?:at|on|against|toward|towards)\s+(?:the\s+)?(.+?)(?:\s+and\s+|\s+then\s+|$)/i,
    /(?:attack|hit|strike|fight|slash|shoot|stab)\s+(?:the\s+)?(.+?)(?:\s+and\s+|\s+then\s+|$)/i,
    /(?:cast|use|fire|launch)\s+\w+\s+(?:at|on)\s+(?:the\s+)?(.+?)(?:\s+and\s+|\s+then\s+|$)/i,
    /(?:heal|cure|mend)\s+(?:the\s+)?(.+?)$/i,
    /(?:go|move|walk|run|advance)\s+(?:to|toward|towards)\s+(?:the\s+)?(.+?)$/i,
  ];

  for (const pattern of targetPatterns) {
    const m = text.match(pattern);
    if (m) {
      const name = (m[m.length - 1] || "").trim();
      if (name && name.length > 1 && !isDirectionWord(name) && !isStopWord(name)) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Extract a tactical target selector from text.
 */
function extractTacticalTarget(text) {
  for (const [phrase, selector] of Object.entries(TACTICAL_TARGETS)) {
    if (text.includes(phrase)) return selector;
  }
  return null;
}

/**
 * Extract the subject (who is performing the action) from text.
 * Returns a fuzzy name or null (defaults to "active" entity).
 */
function extractSubjectName(text) {
  // "Seren attacks the goblin" → subject = "seren"
  // "have Miri cast firebolt" → subject = "miri"
  const subjectPatterns = [
    /^(\w+)\s+(?:attacks?|hits?|casts?|uses?|moves?|goes?|walks?|runs?|flees?|defends?|strikes?|shoots?)/i,
    /(?:have|tell|make|let)\s+(\w+)\s+/i,
    /(?:move|walk|run|send)\s+(\w+)\s+(?:to|toward|towards|north|south|east|west)/i,
  ];

  for (const pattern of subjectPatterns) {
    const m = text.match(pattern);
    if (m) {
      const name = m[1].toLowerCase();
      // Filter out common false positives
      if (!isVerb(name) && !isStopWord(name) && name.length > 2) {
        return name;
      }
    }
  }
  return null;
}

// ── Ability Matching ─────────────────────────────────────────────────

/**
 * Match an ability name from text.
 * Returns normalized ability key or null.
 */
function matchAbility(text) {
  for (const { pattern, key } of ABILITY_PATTERNS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

// ── Direction Extraction ─────────────────────────────────────────────

function extractDirection(text) {
  const words = text.split(/\s+/);
  for (const word of words) {
    if (DIRECTION_MAP[word]) return DIRECTION_MAP[word];
  }
  return null;
}

function hasDirection(text) {
  return text.split(/\s+/).some(w => DIRECTION_MAP[w]);
}

function isDirectionWord(word) {
  return DIRECTION_MAP[word.toLowerCase()] !== undefined;
}

// ── Word-Number Parsing ──────────────────────────────────────────────

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, single: 1, couple: 2, few: 3, several: 4,
};

/**
 * Replace word-numbers with digits in text.
 * "go three steps west" → "go 3 steps west"
 */
function normalizeWordNumbers(text) {
  return text.replace(/\b(\w+)\b/g, (match) => {
    const num = WORD_NUMBERS[match.toLowerCase()];
    return num !== undefined ? String(num) : match;
  });
}

// ── Pronoun Resolution ───────────────────────────────────────────────

const PRONOUNS = new Set(["him", "her", "it", "them", "they", "he", "she"]);

/**
 * Check if a word is a pronoun that refers to a previously mentioned entity.
 */
function isPronoun(word) {
  return PRONOUNS.has(word.toLowerCase());
}

/**
 * Resolve pronouns in compound commands.
 * If a pronoun is found as a target, look back at previous steps
 * for a concrete entity name to inherit.
 */
function resolvePronouns(steps) {
  let lastTargetName = null;

  for (const step of steps) {
    // Track the last concrete target name
    if (step.target && !isPronoun(step.target) && step.target !== TARGET_SELECTORS.NEAREST_HOSTILE) {
      lastTargetName = step.target;
    }
    // Replace pronouns with the last known target
    if (step.target && isPronoun(step.target) && lastTargetName) {
      step.target = lastTargetName;
    }
    // Also check "from" (for flee)
    if (step.from && isPronoun(step.from) && lastTargetName) {
      step.from = lastTargetName;
    }
  }
  return steps;
}

// ── Helpers ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "at", "on", "in", "of", "for", "and", "then",
  "it", "its", "my", "your", "their", "this", "that", "with", "from",
]);

const VERB_WORDS = new Set([
  "move", "go", "walk", "run", "attack", "hit", "cast", "use", "fire",
  "heal", "flee", "retreat", "defend", "dodge", "step", "advance",
  "slash", "strike", "fight", "shoot", "stab",
]);

function isStopWord(word) { return STOP_WORDS.has(word.toLowerCase()); }
function isVerb(word) { return VERB_WORDS.has(word.toLowerCase()); }
