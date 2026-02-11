# MIR Scenarios

> MIR 4.2 · Scenario System

## ScenarioBundle JSON Structure

Each `.scenario.json` file follows this format:

```json
{
  "meta": {
    "id": "unique-scenario-id",
    "name": "Human-readable Name",
    "description": "What this encounter is about.",
    "recommendedPlayers": 2,
    "difficulty": "easy|medium|hard",
    "tags": ["combat", "tavern", "tutorial"]
  },
  "initialState": { /* full valid GameState */ },
  "suggestedReplays": ["combat_flow.replay.json"]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `meta.id` | string | ✓ | Unique identifier |
| `meta.name` | string | ✓ | Display name |
| `meta.description` | string | ✓ | Short description |
| `meta.recommendedPlayers` | number | ✓ | Suggested player count |
| `meta.difficulty` | string | ✓ | `easy`, `medium`, or `hard` |
| `meta.tags` | string[] | ✓ | Searchable tags |
| `initialState` | GameState | ✓ | Must pass schema + invariant validation |
| `suggestedReplays` | string[] | optional | Replay filenames in `/replays/` |

### Rules

1. `initialState` must validate against the GameState JSON Schema
2. `initialState` must pass all 25 invariants
3. `rng.mode` should be `"seeded"` with a non-empty seed for determinism
4. Scenarios are data-only — no engine logic, no scripts
5. Each scenario must have at least 2 PCs and meaningful terrain

### Adding a Scenario

1. Create `scenarios/my_encounter.scenario.json`
2. Run `npm run test:scenario` to validate
3. The UI will auto-detect it in the scenario dropdown
