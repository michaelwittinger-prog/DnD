/**
 * Thin wrapper around the OpenAI SDK client.
 * Requires OPENAI_API_KEY environment variable.
 *
 * Lazy initialization: the client is only created when first accessed,
 * allowing fixture-based runs (--fixture) to work without an API key.
 */
import OpenAI from "openai";

let _client = null;

export function getClient() {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Missing required environment variable OPENAI_API_KEY. " +
        "Set it in your shell or in a .env file."
    );
  }
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// Default export for backward compatibility
export default { get client() { return getClient(); } };
