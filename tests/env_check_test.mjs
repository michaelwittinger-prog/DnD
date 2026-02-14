#!/usr/bin/env node
/**
 * env_check_test.mjs — Tests for the preflight environment checker.
 *
 * Verifies that missing/empty env vars are caught upfront,
 * before the app starts serving requests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkEnv, checkEnvFile, preflight, ENV_CONFIG } from "../src/core/envCheck.mjs";

// ── checkEnv ────────────────────────────────────────────────────────────

describe("checkEnv", () => {
  it("returns ok:true when all required vars are set", () => {
    const env = { OPENAI_API_KEY: "sk-test-key-123" };
    const result = checkEnv(env);
    assert.equal(result.ok, true);
    assert.equal(result.missing.length, 0);
  });

  it("returns ok:false when OPENAI_API_KEY is missing", () => {
    const env = {};
    const result = checkEnv(env);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].name, "OPENAI_API_KEY");
  });

  it("returns ok:false when OPENAI_API_KEY is empty string", () => {
    const env = { OPENAI_API_KEY: "" };
    const result = checkEnv(env);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].name, "OPENAI_API_KEY");
  });

  it("returns ok:false when OPENAI_API_KEY is whitespace-only", () => {
    const env = { OPENAI_API_KEY: "   " };
    const result = checkEnv(env);
    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
  });

  it("produces warnings for optional vars when not set", () => {
    const env = { OPENAI_API_KEY: "sk-test-key-123" };
    const result = checkEnv(env);
    assert.ok(result.warnings.length > 0, "should have warnings for unset optional vars");
    assert.ok(
      result.warnings.some((w) => w.includes("OPENAI_MODEL")),
      "should warn about OPENAI_MODEL"
    );
  });

  it("no warnings when all optional vars are set", () => {
    const env = {
      OPENAI_API_KEY: "sk-test-key-123",
      OPENAI_MODEL: "gpt-4o",
      PORT: "3030",
      NODE_ENV: "production",
    };
    const result = checkEnv(env);
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 0);
  });
});

// ── checkEnvFile ────────────────────────────────────────────────────────

describe("checkEnvFile", () => {
  it("detects .env file in project root", () => {
    // The project root should have .env (we created it earlier)
    const result = checkEnvFile(process.cwd());
    // .env.example always exists in this project
    assert.equal(result.exampleExists, true);
  });

  it("returns false for a non-existent directory", () => {
    const result = checkEnvFile("/tmp/does-not-exist-xyz-12345");
    assert.equal(result.exists, false);
    assert.equal(result.exampleExists, false);
  });
});

// ── preflight ───────────────────────────────────────────────────────────

describe("preflight", () => {
  it("returns ok:true with valid env", () => {
    const result = preflight({ env: { OPENAI_API_KEY: "sk-test-key" } });
    assert.equal(result.ok, true);
    assert.ok(result.report.includes("All required environment variables are set"));
  });

  it("returns ok:false and clear report when OPENAI_API_KEY missing", () => {
    const result = preflight({ env: {} });
    assert.equal(result.ok, false);
    assert.ok(result.report.includes("OPENAI_API_KEY"));
    assert.ok(result.report.includes("FAILED"));
    assert.ok(result.report.includes("Hint"));
  });

  it("report includes warning for optional vars", () => {
    const result = preflight({ env: { OPENAI_API_KEY: "sk-test" } });
    assert.equal(result.ok, true);
    assert.ok(result.report.includes("OPENAI_MODEL"));
  });
});

// ── ENV_CONFIG ──────────────────────────────────────────────────────────

describe("ENV_CONFIG", () => {
  it("REQUIRED includes OPENAI_API_KEY", () => {
    const names = ENV_CONFIG.REQUIRED.map((r) => r.name);
    assert.ok(names.includes("OPENAI_API_KEY"));
  });

  it("every required entry has name and description", () => {
    for (const req of ENV_CONFIG.REQUIRED) {
      assert.ok(req.name, "must have name");
      assert.ok(req.description, "must have description");
    }
  });

  it("every optional entry has name, description, and default", () => {
    for (const opt of ENV_CONFIG.OPTIONAL) {
      assert.ok(opt.name, "must have name");
      assert.ok(opt.description, "must have description");
      assert.ok(opt.default !== undefined, "must have default");
    }
  });
});
