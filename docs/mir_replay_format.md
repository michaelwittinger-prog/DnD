# MIR Replay Format — Deterministic Trace Bundles

> MIR 3.4 · GM Intelligence Layer

## Purpose

A replay bundle captures a full game session as a deterministic trace:
an initial state plus a sequence of actions with expected outcomes.
Replays can be shared, verified, and debugged offline without AI calls.

## Hard Constraints

1. **Fully offline and deterministic** — no AI calls, no network
2. **Same bundle always produces same results** — guaranteed by seeded RNG
3. **Validates schema, invariants, events, and state hashes** at every step
4. **Append-only** — bundles are immutable once created

## ReplayBundle Schema

```typescript
interface ReplayBundle {
  meta: {
    id: string;                  // unique bundle ID
    createdAt: string;           // ISO 8601 timestamp
    schemaVersion: string;       // GameState schema version
    engineVersion: string;       // engine version (e.g. "1.4")
    notes?: string;              // human-readable description
  };
  initialState: GameState;       // full valid GameState (must pass schema + invariants)
  steps: ReplayStep[];           // ordered list of actions
  final?: {
    expectedStateHash?: string;  // 16-char hex hash of final state
    expectedKeyFields?: object;  // optional summary for quick inspection
  };
}

interface ReplayStep {
  action: DeclaredAction;                // action to apply
  expectedEvents?: { type: string }[];   // expected event types (count + type checked)
  expectedStateHash?: string;            // 16-char hex hash after this step
}
```

## State Hashing

### Algorithm

1. **Canonical JSON stringify** — `JSON.stringify` with a replacer that sorts
   object keys alphabetically. Ensures the same state always serializes identically
   regardless of property insertion order.

2. **FNV-1a dual-pass** — Two 32-bit FNV-1a hashes (one with `"mir:"` prefix)
   concatenated into a 16-character hex string. Fast, portable, no crypto dependency.

### Properties

| Property | Guaranteed |
|----------|-----------|
| Deterministic | Same state → same hash, always |
| Key-order independent | `{a:1, b:2}` and `{b:2, a:1}` produce the same hash |
| Collision resistance | 64 effective bits, suitable for replay verification |
| Portable | Works in Node and browser (no `crypto` module needed) |

### Module

```javascript
import { stateHash, canonicalStringify } from "./src/replay/hash.mjs";

const hash = stateHash(gameState); // → "0db9a6661fc133b8" (16-char hex)
```

## Replay Runner

### Module

```javascript
import { runReplay } from "./src/replay/runReplay.mjs";

const report = runReplay(bundle);
```

### Execution Flow

```
1. Validate bundle structure (meta, initialState, steps)
2. Validate initialState (schema + invariants)
3. For each step:
   a. Apply action via applyAction()
   b. Check success/failure matches expectations
   c. Compare produced events to expectedEvents (if provided)
   d. Compare state hash to expectedStateHash (if provided)
   e. Validate post-step invariants
4. Compare final state hash to bundle.final.expectedStateHash (if provided)
5. Return ReplayReport
```

### ReplayReport

```typescript
interface ReplayReport {
  ok: boolean;                // true if all steps passed
  stepsRun: number;           // how many steps completed
  failingStep: number | null; // index of first failure
  errors: string[];           // error messages
  finalStateHash: string;     // hash of final state
  eventLog: EngineEvent[];    // all events produced
}
```

## CLI Usage

```bash
# Run all replay bundles in /replays
node scripts/run-replay.mjs

# Run specific bundle
node scripts/run-replay.mjs replays/combat_flow.replay.json

# npm script
npm run replay:verify
```

### Example Output

```
╔══════════════════════════════════════╗
║  MIR 3.4 — Replay Runner              ║
╚══════════════════════════════════════╝

  ✅ combat_flow.replay.json
     Full combat flow: move, roll initiative, attack, end turn
     Steps: 4 | Events: 4 | Hash: 5cd19c3c82ba2f76

  ✅ rejected_move.replay.json
     Rejected move into blocked cell, then valid move
     Steps: 2 | Events: 2 | Hash: d6957e37c264cc91

══════════════════════════════════════════════════
PASS: all replays verified
```

## Included Replay Bundles

| File | Steps | Description |
|------|-------|-------------|
| `replays/combat_flow.replay.json` | 4 | MOVE → ROLL_INITIATIVE → ATTACK → END_TURN |
| `replays/rejected_move.replay.json` | 2 | Rejected MOVE (blocked cell) → Valid MOVE |

## Creating a Replay Bundle

### From Code

```javascript
import { explorationExample } from "./src/state/exampleStates.mjs";
import { stateHash } from "./src/replay/hash.mjs";
import { runReplay } from "./src/replay/runReplay.mjs";

const bundle = {
  meta: {
    id: "my-replay",
    createdAt: new Date().toISOString(),
    schemaVersion: "0.1.0",
    engineVersion: "1.4",
    notes: "Test scenario",
  },
  initialState: myGameState,
  steps: [
    { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] } },
    { action: { type: "ROLL_INITIATIVE" } },
  ],
};

// Run once to get hashes, then add them for future verification
const report = runReplay(bundle);
bundle.final = { expectedStateHash: report.finalStateHash };
```

### From UI

The browser UI has an Export Replay button that downloads the current
session as a `.replay.json` file, and an Import Replay button that
loads and replays a bundle step-by-step.

## Determinism Guarantee

For a replay to be deterministic:
1. `initialState.rng.mode` must be `"seeded"`
2. `initialState.rng.seed` must be set
3. All actions that involve randomness (attacks, initiative) use the seeded RNG

Same initial state + same actions + same seed = **identical events and identical final state**.
This is verified by the state hash comparison at every step.

## File Storage

- Replay bundles: `/replays/*.replay.json`
- The `/replays` directory is committed to the repo for shared test bundles
- Session exports go to the user's download folder
