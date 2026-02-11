type JsonValue = null | boolean | number | string | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

const META_KEYS = new Set(["$schema", "$id"]);

function ensureObjectSchema(schema: JsonObject): JsonObject {
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      return { ...schema, additionalProperties: false };
    }
  }
  return schema;
}

function transformNode(node: JsonValue, path: string): JsonValue {
  if (Array.isArray(node)) {
    return node.map((item, index) => transformNode(item, `${path}[${index}]`));
  }

  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    const result: JsonObject = {};

    for (const [key, value] of Object.entries(obj)) {
      if (META_KEYS.has(key)) {
        continue;
      }
      if (key === "oneOf") {
        if (!Array.isArray(value)) {
          throw new Error(`Expected oneOf array at ${path}`);
        }
        result.anyOf = value.map((entry, index) =>
          transformNode(entry, `${path}.anyOf[${index}]`)
        ) as JsonArray;
        continue;
      }

      result[key] = transformNode(value, `${path}.${key}`);
    }

    const withObjectDefaults = ensureObjectSchema(result);
    return withObjectDefaults;
  }

  return node;
}

export function transformOpenAiSchema(schema: JsonObject): JsonObject {
  const transformed = transformNode(schema, "$") as JsonObject;
  return transformed;
}
