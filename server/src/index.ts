import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initialGameState, type GameState } from './data/initialGameState.js';
import { validateAiResponse } from './validation/validateAiResponse.js';
import { assemblePrompt } from './ai/promptAssembler.js';
import { callAiGm } from './ai/openaiClient.js';
import { applyAiEvents } from './ai/eventApplier.js';
import { validateAiOutput, validateState } from './ai/validators.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory authoritative game state
// ---------------------------------------------------------------------------
let gameState: GameState = structuredClone(initialGameState);

// ---------------------------------------------------------------------------
// GET /state — return the current game state
// ---------------------------------------------------------------------------
app.get('/state', (_req, res) => {
  res.json(gameState);
});

// ---------------------------------------------------------------------------
// POST /action — accept a player action
// Body: { actorId: string, intent: string, data?: unknown }
//
// For now this is a stub: it echoes the current gameState unchanged.
// TODO: In a future phase, this endpoint will:
//   1. Receive the player action
//   2. Build a prompt from gameState + action
//   3. Call the AI provider (e.g. OpenAI)
//   4. Validate the AI response with validateAiResponse()
//   5. Apply map_updates and state_updates to gameState
//   6. Return the updated gameState
// ---------------------------------------------------------------------------
interface PlayerAction {
  actorId: string;
  intent: string;
  data?: unknown;
}

app.post('/action', (req, res) => {
  const action = req.body as PlayerAction;

  if (!action.actorId || !action.intent) {
    res.status(400).json({ error: 'Missing actorId or intent' });
    return;
  }

  console.log(`[action] actor=${action.actorId} intent=${action.intent}`);
  res.json(gameState);
});

app.post('/ai-gm', async (req, res) => {
  const { state, player_input } = req.body ?? {};

  if (!state || typeof player_input !== 'string') {
    res.status(400).json({ error: { code: 'invalid_request', message: 'Missing state or player_input' } });
    return;
  }

  const stateValidation = validateState(state);
  if (!stateValidation.valid) {
    res.status(400).json({ error: { code: 'invalid_state', message: stateValidation.errors.join('; ') } });
    return;
  }

  try {
    const { systemPrompt, userPrompt } = assemblePrompt(state, player_input);
    const aiRaw = await callAiGm(systemPrompt, userPrompt);

    const aiValidation = validateAiOutput(aiRaw);
    if (!aiValidation.valid) {
      res.status(400).json({ error: { code: 'invalid_ai_response', message: aiValidation.errors.join('; ') } });
      return;
    }

    const updatedState = applyAiEvents(state, aiValidation.data as any);
    const updatedValidation = validateState(updatedState);
    if (!updatedValidation.valid) {
      res.status(400).json({ error: { code: 'invalid_updated_state', message: updatedValidation.errors.join('; ') } });
      return;
    }

    res.json({ ai_response: aiValidation.data, updated_state: updatedState });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: { code: 'ai_provider_error', message } });
  }
});

// ---------------------------------------------------------------------------
// POST /reset — reset state to initial (dev/testing convenience)
// ---------------------------------------------------------------------------
app.post('/reset', (_req, res) => {
  gameState = structuredClone(initialGameState);
  console.log('[reset] Game state reset to initial');
  res.json(gameState);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// IMPORTANT: Node.js v24+ defaults to IPv6 (::1) for "localhost".
// Chrome and the Vite proxy use 127.0.0.1 (IPv4). Always bind explicitly
// to '127.0.0.1' to guarantee connectivity. See also: client/vite.config.ts
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  // Validate that the AI response validator loaded correctly at startup
  const validatorReady = validateAiResponse !== undefined;
  console.log(`[server] AI GM RPG server running on http://${HOST}:${PORT}`);
  console.log(`[server] AI response validator loaded: ${validatorReady}`);
});
