import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transformOpenAiSchema } from "./openaiSchemaTransform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const sourcePath = resolve(root, "shared/schemas/aiResponse.schema.json");
const targetPath = resolve(root, "shared/schemas/aiResponse.openai.schema.json");

const raw = readFileSync(sourcePath, "utf-8");
const schema = JSON.parse(raw);
const transformed = transformOpenAiSchema(schema);

writeFileSync(targetPath, JSON.stringify(transformed, null, 2));

console.log("Wrote OpenAI schema to", targetPath);
