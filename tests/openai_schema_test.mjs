/**
 * openai_schema_test.mjs — Validates the OpenAI strict-mode schema
 * against ALL documented OpenAI structured-output constraints.
 *
 * This test ensures we never ship a schema that OpenAI will reject at runtime.
 * Run: node --test tests/openai_schema_test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const schema = JSON.parse(
  readFileSync(resolve(ROOT, "shared", "schemas", "aiResponse.openai.strict.json"), "utf-8")
);

// ── Collect ALL violations in one pass ──────────────────────────────────

function validateStrictMode(node, path = "root") {
  const errors = [];

  if (typeof node !== "object" || node === null) return errors;
  if (Array.isArray(node)) {
    node.forEach((item, i) => errors.push(...validateStrictMode(item, `${path}[${i}]`)));
    return errors;
  }

  // Rule 1: No $schema or $id
  if (node.$schema) errors.push(`${path}: must not have $schema`);
  if (node.$id) errors.push(`${path}: must not have $id`);

  // Rule 2: No oneOf (must use anyOf)
  if (node.oneOf) errors.push(`${path}: must use anyOf instead of oneOf`);

  // Rule 3: type arrays not allowed (use anyOf instead)
  if (Array.isArray(node.type)) {
    errors.push(`${path}: type must be a string, not array ${JSON.stringify(node.type)}. Use anyOf.`);
  }

  // Rule 4: "const" must have "type" alongside it
  if (node.const !== undefined && !node.type) {
    errors.push(`${path}: "const" requires a "type" field (e.g. "type": "string")`);
  }

  // Rule 5: "enum" must have "type"
  if (node.enum && !node.type) {
    errors.push(`${path}: "enum" requires a "type" field`);
  }

  // Rule 6: Objects must have properties, required = ALL keys, additionalProperties: false
  if (node.type === "object") {
    if (node.properties === undefined && !node.anyOf && !node.$ref) {
      errors.push(`${path}: type "object" must have "properties" (or use anyOf/$ref)`);
    }
    if (node.properties) {
      const propKeys = Object.keys(node.properties).sort();
      const reqKeys = (node.required || []).slice().sort();

      if (JSON.stringify(propKeys) !== JSON.stringify(reqKeys)) {
        const missing = propKeys.filter(k => !reqKeys.includes(k));
        const extra = reqKeys.filter(k => !propKeys.includes(k));
        errors.push(
          `${path}: required must exactly match properties keys. ` +
          (missing.length ? `Missing from required: [${missing}]. ` : "") +
          (extra.length ? `Extra in required: [${extra}].` : "")
        );
      }

      if (node.additionalProperties !== false) {
        errors.push(`${path}: additionalProperties must be false, got ${JSON.stringify(node.additionalProperties)}`);
      }

      // Recurse into properties
      for (const [key, val] of Object.entries(node.properties)) {
        errors.push(...validateStrictMode(val, `${path}.properties.${key}`));
      }
    }
  }

  // Rule 7: additionalProperties must not be a schema object
  if (
    typeof node.additionalProperties === "object" &&
    node.additionalProperties !== null &&
    node.additionalProperties !== false
  ) {
    errors.push(`${path}: additionalProperties must be false, not a schema object`);
  }

  // Recurse into anyOf
  if (node.anyOf) {
    node.anyOf.forEach((item, i) => errors.push(...validateStrictMode(item, `${path}.anyOf[${i}]`)));
  }

  // Recurse into items
  if (node.items) {
    errors.push(...validateStrictMode(node.items, `${path}.items`));
  }

  // Recurse into $defs
  if (node.$defs) {
    for (const [key, val] of Object.entries(node.$defs)) {
      errors.push(...validateStrictMode(val, `${path}.$defs.${key}`));
    }
  }

  return errors;
}

// ── Structural checks ───────────────────────────────────────────────────

function collectAllRefs(node, refs = new Set()) {
  if (typeof node !== "object" || node === null) return refs;
  if (Array.isArray(node)) { node.forEach(n => collectAllRefs(n, refs)); return refs; }
  if (node.$ref) refs.add(node.$ref);
  for (const v of Object.values(node)) collectAllRefs(v, refs);
  return refs;
}

function collectAllDefs(schema) {
  return new Set(Object.keys(schema.$defs || {}));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("OpenAI strict schema validation", () => {
  it("has no strict-mode violations", () => {
    const errors = validateStrictMode(schema);
    if (errors.length > 0) {
      assert.fail(
        `Found ${errors.length} OpenAI strict-mode violation(s):\n` +
        errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")
      );
    }
  });

  it("has title and is type object", () => {
    assert.ok(schema.title, "schema must have a title");
    assert.equal(schema.type, "object");
  });

  it("has no $schema or $id", () => {
    assert.equal(schema.$schema, undefined);
    assert.equal(schema.$id, undefined);
  });

  it("all $ref targets exist in $defs", () => {
    const refs = collectAllRefs(schema);
    const defs = collectAllDefs(schema);
    for (const ref of refs) {
      const defName = ref.replace("#/$defs/", "");
      assert.ok(defs.has(defName), `$ref "${ref}" has no matching $defs entry`);
    }
  });

  it("required top-level fields match properties", () => {
    const propKeys = Object.keys(schema.properties).sort();
    const reqKeys = schema.required.slice().sort();
    assert.deepEqual(reqKeys, propKeys);
  });

  it("every object node has additionalProperties: false", () => {
    const errors = [];
    function check(node, path) {
      if (typeof node !== "object" || node === null || Array.isArray(node)) return;
      if (node.type === "object" && node.properties && node.additionalProperties !== false) {
        errors.push(`${path}: missing additionalProperties: false`);
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "object" && v !== null) check(v, `${path}.${k}`);
      }
    }
    check(schema, "root");
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("every const has a type", () => {
    const errors = [];
    function check(node, path) {
      if (typeof node !== "object" || node === null || Array.isArray(node)) return;
      if (node.const !== undefined && !node.type) {
        errors.push(`${path}: const without type`);
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "object" && v !== null) check(v, `${path}.${k}`);
      }
    }
    check(schema, "root");
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("no type arrays anywhere", () => {
    const errors = [];
    function check(node, path) {
      if (typeof node !== "object" || node === null) return;
      if (Array.isArray(node)) { node.forEach((n, i) => check(n, `${path}[${i}]`)); return; }
      if (Array.isArray(node.type)) {
        errors.push(`${path}: type is array ${JSON.stringify(node.type)}`);
      }
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "object" && v !== null) check(v, `${path}.${k}`);
      }
    }
    check(schema, "root");
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});
