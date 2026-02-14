/**
 * envCheck.mjs — Preflight environment variable checker.
 *
 * Validates that all required environment variables are set before
 * the application starts. Catches configuration errors upfront
 * instead of failing mid-turn.
 *
 * Pure function. No side effects.
 */

import { existsSync } from "fs";
import { resolve } from "path";

// ── Configuration ───────────────────────────────────────────────────────

/**
 * Required env vars — the app cannot function without these.
 * Each entry: { name, description }
 */
const REQUIRED = [
  {
    name: "OPENAI_API_KEY",
    description: "OpenAI API key (starts with sk-)",
  },
];

/**
 * Optional env vars — the app works without them but may use defaults.
 * Each entry: { name, description, default }
 */
const OPTIONAL = [
  {
    name: "OPENAI_MODEL",
    description: "OpenAI model to use",
    default: "gpt-4o-mini",
  },
  {
    name: "PORT",
    description: "API server port",
    default: "3030",
  },
  {
    name: "NODE_ENV",
    description: "Node environment",
    default: "development",
  },
];

// ── Core Check ──────────────────────────────────────────────────────────

/**
 * Check that all required environment variables are present.
 *
 * @param {object} [env=process.env] — environment object to check (for testability)
 * @returns {{ ok: boolean, missing: Array<{name: string, description: string}>, warnings: Array<string> }}
 */
export function checkEnv(env = process.env) {
  const missing = [];
  const warnings = [];

  for (const req of REQUIRED) {
    const val = env[req.name];
    if (!val || val.trim().length === 0) {
      missing.push({ name: req.name, description: req.description });
    }
  }

  for (const opt of OPTIONAL) {
    const val = env[opt.name];
    if (!val || val.trim().length === 0) {
      warnings.push(
        `${opt.name} not set — using default: "${opt.default}" (${opt.description})`
      );
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Check that a .env file exists in the project root.
 *
 * @param {string} rootDir — project root directory
 * @returns {{ exists: boolean, exampleExists: boolean }}
 */
export function checkEnvFile(rootDir) {
  const envPath = resolve(rootDir, ".env");
  const examplePath = resolve(rootDir, ".env.example");
  return {
    exists: existsSync(envPath),
    exampleExists: existsSync(examplePath),
  };
}

/**
 * Run full preflight check and return a human-readable report.
 *
 * @param {object} [options]
 * @param {object} [options.env=process.env]
 * @param {string} [options.rootDir] — project root for .env file check
 * @returns {{ ok: boolean, report: string, result: object }}
 */
export function preflight(options = {}) {
  const env = options.env || process.env;
  const result = checkEnv(env);
  const lines = [];

  if (options.rootDir) {
    const fileCheck = checkEnvFile(options.rootDir);
    if (!fileCheck.exists) {
      result.ok = false;
      if (fileCheck.exampleExists) {
        result.missing.push({
          name: ".env file",
          description:
            "Copy .env.example to .env and fill in your values",
        });
      } else {
        result.missing.push({
          name: ".env file",
          description:
            "Create a .env file with required environment variables",
        });
      }
    }
  }

  if (result.ok && result.warnings.length === 0) {
    lines.push("✅ All required environment variables are set.");
  } else if (result.ok) {
    lines.push("✅ All required environment variables are set.");
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  ⚠  ${w}`);
    }
  } else {
    lines.push("❌ Environment check FAILED.\n");
    lines.push("Missing required configuration:");
    for (const m of result.missing) {
      lines.push(`  ✗ ${m.name} — ${m.description}`);
    }
    if (result.warnings.length > 0) {
      lines.push("\nWarnings:");
      for (const w of result.warnings) {
        lines.push(`  ⚠  ${w}`);
      }
    }
    lines.push(
      "\nHint: Copy .env.example to .env and fill in your values."
    );
  }

  return {
    ok: result.ok,
    report: lines.join("\n"),
    result,
  };
}

/** Exported config for testing */
export const ENV_CONFIG = { REQUIRED, OPTIONAL };
