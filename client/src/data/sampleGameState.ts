/**
 * Sample Game State conforming to shared/schemas/gameState.schema.json
 * Used for local MVP rendering. No server or AI calls involved.
 */
export const sampleGameState = {
  session: {
    id: "session-001",
    system: "dnd5e_light",
    language: "en" as const,
    scene_id: "tavern-brawl",
    round: 3,
    turn_index: 0,
    active_entity_id: "pc-aria",
    phase: "combat" as const,
  },
  map: {
    grid: {
      type: "square" as const,
      unit: "5ft",
      width: 12,
      height: 10,
    },
    terrain: {
      blocked: [
        { x: 3, y: 0 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
        { x: 8, y: 7 },
      ],
      difficult: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 6, y: 4 },
        { x: 6, y: 5 },
      ],
    },
    objects: [
      {
        id: "obj-table1",
        kind: "table",
        name: "Wooden Table",
        pos: { x: 5, y: 4 },
        blocks_movement: true,
        blocks_line_of_sight: false,
        state: { flipped: false } as Record<string, boolean>,
      },
      {
        id: "obj-door1",
        kind: "door",
        name: "Tavern Door",
        pos: { x: 0, y: 5 },
        blocks_movement: false,
        blocks_line_of_sight: false,
        state: { open: true, locked: false } as Record<string, boolean>,
      },
    ],
    entities_on_map: [
      {
        entity_id: "pc-aria",
        pos: { x: 2, y: 3 },
        token: { shape: "circle" as const, label: "Aria" },
      },
      {
        entity_id: "pc-bron",
        pos: { x: 4, y: 6 },
        token: { shape: "circle" as const, label: "Bron" },
      },
      {
        entity_id: "npc-goblin1",
        pos: { x: 7, y: 3 },
        token: { shape: "square" as const, label: "Gob1" },
      },
      {
        entity_id: "npc-goblin2",
        pos: { x: 9, y: 7 },
        token: { shape: "square" as const, label: "Gob2" },
      },
    ],
  },
  entities: [
    {
      id: "pc-aria",
      name: "Aria",
      type: "player" as const,
      role: "pc" as const,
      stats: { ac: 16, speed: 6, attack_bonus: 5, damage: "1d8+3" },
      hp: { current: 22, max: 28 },
      conditions: [],
    },
    {
      id: "pc-bron",
      name: "Bron",
      type: "player" as const,
      role: "pc" as const,
      stats: { ac: 18, speed: 5, attack_bonus: 6, damage: "1d10+4" },
      hp: { current: 35, max: 40 },
      conditions: [],
    },
    {
      id: "npc-goblin1",
      name: "Goblin Scrapper",
      type: "npc" as const,
      role: "enemy" as const,
      stats: { ac: 13, speed: 6, attack_bonus: 4, damage: "1d6+2" },
      hp: { current: 5, max: 12 },
      conditions: [],
      intent: "Attack nearest PC",
    },
    {
      id: "npc-goblin2",
      name: "Goblin Archer",
      type: "npc" as const,
      role: "enemy" as const,
      stats: { ac: 12, speed: 6, attack_bonus: 4, damage: "1d6+2" },
      hp: { current: 8, max: 10 },
      conditions: ["prone"],
      intent: "Retreat and shoot",
    },
  ],
  rules_profile: {
    movement: {
      diagonal: "allowed" as const,
      through_allies: true,
      through_enemies: false,
    },
    combat: {
      initiative: "fixed_order" as const,
      criticals: true,
      opportunity_attacks: false,
    },
    checks: {
      skill_system: "simple_dc" as const,
      default_dc: 12,
    },
    style: {
      narration_sentences_max: 4,
      ask_questions_max: 2,
      rules_explain_brief: true,
    },
  },
  log_compact: {
    summary: "Combat round 3 in the tavern. Aria is up next. Two goblins remain.",
    events: [
      {
        i: 1,
        actor_id: "pc-bron",
        intent: "attack",
        input: "I swing my axe at the goblin scrapper",
        result: "hit, 8 damage",
        delta: "npc-goblin1 hp 13->5",
      },
      {
        i: 2,
        actor_id: "npc-goblin2",
        intent: "move",
        input: "AI: retreat south",
        result: "moved to 9,7",
        delta: "npc-goblin2 pos 9,5->9,7",
      },
    ],
  },
};
