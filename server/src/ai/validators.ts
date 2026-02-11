import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

const gameStateSchemaPath = resolve(root, "game_state.schema.json");
const aiResponseSchemaPath = resolve(root, "shared/schemas/aiResponse.schema.json");

const ajv = new Ajv2020({ allErrors: true, strict: false });

const gameStateSchema = JSON.parse(readFileSync(gameStateSchemaPath, "utf-8"));
const aiResponseSchema = JSON.parse(readFileSync(aiResponseSchemaPath, "utf-8"));

const validateGameState = ajv.compile(gameStateSchema);
const validateAiResponse = ajv.compile(aiResponseSchema);

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export interface ValidationSuccess<T> {
  valid: true;
  data: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

type AjvError = { instancePath?: string; message?: string };

function formatErrors(errors: AjvError[] | null | undefined): string[] {
  return (errors ?? []).map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`);
}

export function validateState(state: unknown): ValidationResult<unknown> {
  const valid = validateGameState(state);
  if (valid) {
    return { valid: true, data: state };
  }
  return { valid: false, errors: formatErrors(validateGameState.errors) };
}

export function validateAiOutput(data: unknown): ValidationResult<unknown> {
  const valid = validateAiResponse(data);
  if (valid) {
    return { valid: true, data };
  }
  return { valid: false, errors: formatErrors(validateAiResponse.errors) };
}
