/**
 * serverOpenAIAdapter.mjs — UI adapter that proxies LLM parsing to local API server.
 *
 * Keeps API key fully server-side. UI only receives connectivity/status booleans.
 */

const DEFAULT_API_BASE = "http://127.0.0.1:3030";

export async function getServerAiStatus(apiBase = DEFAULT_API_BASE) {
  try {
    const resp = await fetch(`${apiBase}/ai/status`);
    if (!resp.ok) {
      return {
        ok: false,
        keyConfigured: false,
        mode: "offline",
        model: null,
        provider: "openai",
        error: `HTTP ${resp.status}`,
      };
    }
    const data = await resp.json();
    return {
      ok: true,
      keyConfigured: !!data.keyConfigured,
      mode: data.mode || (data.keyConfigured ? "real" : "mock"),
      model: data.model || null,
      provider: data.provider || "openai",
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      keyConfigured: false,
      mode: "offline",
      model: null,
      provider: "openai",
      error: err?.message || "Server unreachable",
    };
  }
}

export function createServerOpenAIAdapter(options = {}) {
  const apiBase = options.apiBase || DEFAULT_API_BASE;

  return {
    id: "server-openai-proxy",
    name: "OpenAI (server proxy)",
    provider: "openai",
    async call(prompt, state, callOptions = {}) {
      const body = {
        playerInput: extractUserInputFromPrompt(prompt),
        state,
        temperature: callOptions.temperature,
        maxTokens: callOptions.maxTokens,
      };

      const t0 = Date.now();
      try {
        const resp = await fetch(`${apiBase}/ai/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const latencyMs = Date.now() - t0;
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          return { ok: false, response: null, error: `HTTP ${resp.status}: ${text.slice(0, 200)}`, latencyMs };
        }

        const data = await resp.json();
        if (!data?.ok || !data?.result?.intent) {
          return { ok: false, response: null, error: "Invalid /ai/intent response", latencyMs };
        }

        return {
          ok: true,
          response: data.result.intent,
          error: null,
          usage: data.result.usage,
          latencyMs,
        };
      } catch (err) {
        return {
          ok: false,
          response: null,
          error: `Network error: ${err?.message || "unknown"}`,
          latencyMs: Date.now() - t0,
        };
      }
    },
  };
}

function extractUserInputFromPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") return "";
  const parts = prompt.split(/\n\n\[user\]\n/i);
  if (parts.length >= 2) return parts.slice(1).join("\n\n[user]\n").trim();
  return prompt.trim();
}
