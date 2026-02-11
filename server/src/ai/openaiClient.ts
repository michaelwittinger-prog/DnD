import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const schemaPath = resolve(root, "shared/schemas/aiResponse.openai.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set");
}

const client = new OpenAI({ apiKey });

function extractJsonText(response: OpenAI.Responses.Response): string {
  for (const item of response.output ?? []) {
    if (item.type === "message" && "content" in item) {
      for (const block of item.content) {
        if (block.type === "output_text") {
          return block.text;
        }
      }
    }
  }
  throw new Error("No output_text content found in OpenAI response");
}

export async function callAiGm(systemPrompt: string, userPrompt: string): Promise<unknown> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "AiGmResponse",
        strict: true,
        schema
      }
    }
  });

  const jsonText = extractJsonText(response);
  return JSON.parse(jsonText);
}
