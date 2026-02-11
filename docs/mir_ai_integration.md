# MIR AI Integration — GM Intelligence Layer

> MIR 3.1 / 3.2 · GM Intelligence Layer

## Purpose

Define how AI translates natural language player commands into structured
DeclaredAction objects without ever mutating GameState directly. The engine
remains the sole authority for state transitions.

## Hard Constraints

| # | Constraint | Enforcement |
|---|-----------|-------------|
| 1 | AI cannot mutate GameState | AI receives a sanitized read-only summary; never a reference |
| 2 | AI only produces DeclaredAction proposals | `aiActionParser` rejects anything else |
| 3 | Engine remains authoritative | AI output goes through `applyAction()` |
| 4 | Determinism preserved | AI has no RNG access; temperature=0 by default |
| 5 | No direct AI access to RNG | RNG seed stripped from state summary |

## Architecture

```
┌──────────────┐
│ Player Input │  "Move Seren to 4,5"
│ (natural     │
│  language)   │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ aiPromptTemplate │  Builds system + user prompt
│                  │  - Sanitized state (no RNG seed)
│                  │  - Allowed action schema
│                  │  - "Output JSON only" instruction
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│  AI / LLM    │  OpenAI API (or mock for offline)
│  (external)  │  temperature=0, max_tokens=256
└──────┬───────┘
       │  raw text
       ▼
┌──────────────────┐
│ aiActionParser   │  Safety layer:
│                  │  1. Strict JSON.parse
│                  │  2. Reject unknown fields
│                  │  3. Reject non-whitelisted types
│                  │  4. Validate required fields
│                  │  5. Strip extra fields
└──────┬───────────┘
       │  { ok, action } or { ok: false, reason }
       ▼
┌──────────────────┐
│ applyAction()    │  Engine validates + executes
│ (engine)         │  Returns events + nextState
└──────────────────┘
```

## Flow Detail

### Step 1: Player Input

The player types a natural language command in the UI text input:

```
"Move Seren to the right 3 spaces"
"Attack the barkeep"
"Roll initiative"
"End my turn"
```

### Step 2: Prompt Construction (`aiPromptTemplate.mjs`)

The system prompt instructs the AI:
- Output exactly ONE JSON object
- Only use allowed action types: MOVE, ATTACK, END_TURN, ROLL_INITIATIVE
- Use entity IDs, not names
- If the request can't be mapped, output `{"type":"INVALID","reason":"..."}`

The user prompt includes:
- **Sanitized state summary**: map size, blocked terrain, entity list (id, name, position, hp, ac, speed), combat status
- **Player command**: the raw input
- RNG seed is **never** included in the state summary

### Step 3: AI Response

The AI returns raw text. Expected format:

```json
{"type":"MOVE","entityId":"pc-seren","path":[{"x":3,"y":3},{"x":4,"y":3},{"x":5,"y":3}]}
```

### Step 4: Safety Validation (`aiActionParser.mjs`)

The parser applies five safety checks:

1. **Strict JSON parse** — `JSON.parse()`, no eval
2. **Must be an object** — reject arrays, primitives
3. **Type whitelist** — only MOVE, ATTACK, END_TURN, ROLL_INITIATIVE
4. **Required fields** — validates shape per action type
5. **Field stripping** — removes any fields not in the whitelist

If the AI returns `{"type":"INVALID","reason":"..."}`, the parser treats this
as a graceful decline and returns `{ ok: false }`.

### Step 5: Engine Execution

If parsing succeeds, the validated DeclaredAction is passed to `applyAction()`.
The engine validates preconditions, applies the mutation, and returns events.

If the engine rejects the action (e.g., blocked cell, not your turn), the
UI displays the rejection — the AI proposal failed engine validation.

## Modules

### `/src/ai/aiPromptTemplate.mjs`

| Export | Signature | Purpose |
|--------|-----------|---------|
| `buildSystemPrompt()` | `() → string` | System prompt with rules + allowed actions |
| `buildUserPrompt(state, input)` | `(GameState, string) → string` | User prompt with sanitized state + command |
| `buildMessages(state, input)` | `(GameState, string) → Message[]` | Complete message array for OpenAI |

### `/src/ai/aiActionParser.mjs`

| Export | Signature | Purpose |
|--------|-----------|---------|
| `parseAiAction(rawText)` | `(string) → { ok, action? \| reason? }` | Parse + validate + sanitize AI output |

### `/src/ai/aiClient.mjs`

| Export | Signature | Purpose |
|--------|-----------|---------|
| `proposeAction(state, input, opts?)` | `async (GameState, string, opts?) → AiProposalResult` | Full API-based proposal (Node only) |
| `proposeActionMock(state, input)` | `(GameState, string) → AiProposalResult` | Keyword-based mock (browser/offline) |

### `AiProposalResult`

```js
{
  ok: boolean,        // true if valid DeclaredAction produced
  action?: object,    // the validated DeclaredAction (if ok)
  reason?: string,    // rejection reason (if !ok)
  rawText: string,    // raw AI response text (for debug panel)
  durationMs: number, // API call duration
}
```

## Safety Properties

### What the AI receives

```json
{
  "map": { "name": "...", "grid": { "width": 20, "height": 15 }, "terrain": [...] },
  "entities": [{ "id": "pc-seren", "name": "Seren", "position": { "x": 2, "y": 3 }, ... }],
  "combat": { "mode": "exploration", "round": 0, ... }
}
```

### What the AI does NOT receive

- `rng.seed`, `rng.mode`, `rng.lastRolls`
- `log.events` (event history)
- `ui` state (selected entity)
- `schemaVersion`, `timestamp`

### What the AI cannot do

| Prohibited | How enforced |
|-----------|-------------|
| Generate random numbers | No RNG access; temperature=0 |
| Modify state directly | Only produces action JSON; engine applies |
| Invent action types | Parser whitelist rejects unknown types |
| Add extra fields | Parser strips non-whitelisted fields |
| Override invariants | Engine validates post-conditions |

## Determinism

AI proposals are deterministic given:
- Same GameState
- Same player input
- temperature=0 (default)

The engine adds determinism via seeded RNG for any rolls.

Replay: `State₀ + DeclaredAction + seed → identical events → identical State₁`

## UI Integration

The browser UI uses `proposeActionMock()` for offline testing. The mock
performs simple keyword matching (e.g., "attack barkeep" → ATTACK action)
without calling any external API.

For live AI integration, the UI will call the local API server which
uses `proposeAction()` with the real OpenAI client.

### UI Elements

- **Text input**: `#ai-input` — player types natural language command
- **"Propose via AI" button**: `#btn-ai-propose` — triggers mock proposal
- **Debug panel**: `#ai-debug` — shows raw AI output and parse result

## Running AI Locally (Node)

### Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes (for real AI) | — | Your OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model name override |

### Setup

```bash
# 1. Copy .env.example to .env and set your key
cp .env.example .env
# Edit .env: OPENAI_API_KEY=sk-your-key-here

# 2. Run tests (no network, no key needed)
npm run test:ai

# 3. Use real AI in Node scripts
node -e "
  import('dotenv/config');
  import { proposeAction } from './src/ai/aiClient.mjs';
  import { explorationExample } from './src/state/exampleStates.mjs';
  const r = await proposeAction(explorationExample, 'attack the barkeep');
  console.log(r);
"
```

### Configuration

The `AI_CONFIG` object in `aiClient.mjs` defines immutable defaults:

```js
AI_CONFIG = {
  model: "gpt-4o-mini",     // Override with OPENAI_MODEL env var
  temperature: 0,            // Fixed low — clamped to [0, 0.3]
  maxTokens: 256,            // Hard cap on response length
  responseFormat: "json_object",  // Enforced via API parameter
}
```

Temperature is **clamped to 0–0.3** even if overridden per-call. This prevents
creative hallucinations while allowing slight variation if needed.

### JSON Response Format

The client sends `response_format: { type: "json_object" }` to the API,
which forces the model to output valid JSON. Combined with the parser's
strict validation, this provides two layers of JSON enforcement.

## AI Bridge Server (MIR 3.3)

The browser UI connects to a local Node bridge server at `http://localhost:3002`
that keeps the API key server-side.

### Running

```bash
# Terminal 1: Start AI bridge
npm run ai:bridge

# Terminal 2: Start UI server
npm run ui

# Open: http://localhost:3001
```

When the bridge is running, the UI sends `POST /api/propose` to it.
If the bridge is unreachable, the UI falls back to the local mock silently.

### Request / Response

**Request:**
```json
POST /api/propose
{
  "inputText": "attack the barkeep",
  "state": { ... },
  "mode": "real"
}
```

**Response (success):**
```json
{
  "ok": true,
  "action": { "type": "ATTACK", "attackerId": "pc-seren", "targetId": "npc-barkeep-01" },
  "mode": "real",
  "durationMs": 1234
}
```

**Response (failure):**
```json
{
  "ok": false,
  "errors": ["Mock parser could not understand: \"do a backflip\""],
  "mode": "mock",
  "durationMs": 1
}
```

### Security

| Measure | Detail |
|---------|--------|
| API key isolation | `OPENAI_API_KEY` only loaded server-side, never sent to browser |
| CORS | Only `localhost` / `127.0.0.1` origins accepted |
| Payload size | 200KB max request body |
| Rate limiting | 30 requests per 10 min per IP, returns 429 |
| Parser gate | Server re-validates through `parseAiAction` even after client parse |
| No raw text | Raw AI response not included in API response |

### Fallback Behavior

| Condition | Result |
|-----------|--------|
| Bridge running + API key set + mode="real" | Real OpenAI API |
| Bridge running + no API key + mode="real" | Falls back to mock on bridge |
| Bridge not running | UI falls back to local mock (no error) |
| Rate limit exceeded | 429 response, UI shows error |

## Browser Strategy (Future)

The current bridge is a local development tool. For production, the same
endpoint pattern could be deployed as a hosted microservice with proper
auth. The browser never needs the API key.

## Logging and Redaction

### Redaction Rules

All AI outputs are logged through `logProposal()` which applies:

1. **API key masking**: Any `sk-...` pattern is replaced with `sk-***REDACTED***`
2. **Truncation**: Raw text over 500 chars is truncated with `… [truncated, N chars total]`
3. **Mode tagging**: Logs are tagged `[AI:real]` or `[AI:mock]` to distinguish paths

### Log Format

Every AI proposal is logged to the console:

```
[AI] Input: "attack barkeep"
[AI] Raw:   {"type":"ATTACK","attackerId":"pc-seren","targetId":"npc-barkeep-01"}
[AI] Parse: ok=true
[AI] Engine: ✓ ATTACK_RESOLVED
```

On rejection:

```
[AI] Input: "fly to the moon"
[AI] Raw:   {"type":"INVALID","reason":"No fly action available"}
[AI] Parse: ok=false — AI declined: No fly action available
```
