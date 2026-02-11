/**
 * validateAiResponse.ts
 *
 * JSON Schema validation for AI GM responses using Ajv.
 * Validates against shared/schemas/aiResponse.schema.json.
 *
 * STRICT RULES:
 * - The schema is a hard contract. No extra fields. No missing fields.
 * - additionalProperties: false is enforced at every level.
 * - All oneOf discriminators (map_update, state_update) must match exactly.
 * - On validation failure: reject the response, return errors,
 *   and do NOT apply any updates to game state.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Load and compile schema once at module init
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../../../shared/schemas/aiResponse.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export interface ValidationSuccess {
  valid: true;
  data: AiGmResponse;
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * TypeScript type matching the AI GM response shape.
 * Kept lightweight — the JSON Schema is the authoritative definition.
 */
export interface AiGmResponse {
  narration: string;
  adjudication: string;
  map_updates: unknown[];
  state_updates: unknown[];
  questions: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an unknown value against the AI GM response schema.
 *
 * Usage (future AI integration):
 *   const raw = JSON.parse(aiProviderOutput);
 *   const result = validateAiResponse(raw);
 *   if (!result.valid) { log(result.errors); reject(); }
 *   else { applyUpdates(gameState, result.data); }
 */
export function validateAiResponse(data: unknown): ValidationResult {
  const valid = validate(data);

  if (valid) {
    return { valid: true, data: data as AiGmResponse };
  }

  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || '/'} ${e.message ?? 'unknown error'}`
  );

  console.warn('[validateAiResponse] Validation failed:', errors);
  return { valid: false, errors };
}
