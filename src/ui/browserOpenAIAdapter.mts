/**
 * browserOpenAIAdapter.mjs — Browser-compatible OpenAI adapter.
 *
 * Uses the fetch API directly to call the OpenAI chat completions endpoint.
 * No Node.js dependencies — works in any modern browser.
 *
 * Conforms to the ModelAdapter interface from ai/modelAdapter.mjs:
 *   { id, name, provider, call(prompt, state, options) → { ok, response, usage } }
 *
 * API key is injected at creation time (from UI input, stored in sessionStorage).
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Create a browser-compatible OpenAI adapter.
 *
 * @param {object} options
 * @param {string} options.apiKey — OpenAI API key
 * @param {string} [options.model="gpt-4o-mini"] — model name
 * @param {number} [options.temperature=0.1] — default temperature
 * @param {number} [options.maxTokens=200] — default max tokens
 * @returns {import("../ai/modelAdapter.mjs").ModelAdapter}
 */
export function createBrowserOpenAIAdapter(options = {}) {
  const {
    apiKey,
    model = "gpt-4o-mini",
    temperature = 0.1,
    maxTokens = 200,
  } = options;

  let callCount = 0;

  return {
    id: `browser-openai-${model}`,
    name: `OpenAI ${model} (browser)`,
    provider: "openai",
    model,

    /**
     * Call the OpenAI chat completions API via fetch.
     *
     * @param {string} prompt — the formatted prompt (system + user joined)
     * @param {object} _state — game state (unused, context is in prompt)
     * @param {object} [callOptions]
     * @param {number} [callOptions.temperature]
     * @param {number} [callOptions.maxTokens]
     * @returns {Promise<import("../ai/modelAdapter.mjs").AdapterResponse>}
     */
    call: async (prompt, _state, callOptions = {}) => {
      callCount++;

      if (!apiKey) {
        return { ok: false, response: null, error: "No API key provided" };
      }

      const temp = callOptions.temperature ?? temperature;
      const tokens = callOptions.maxTokens ?? maxTokens;

      // Parse the prompt into system + user messages.
      // The intentPromptBuilder joins messages as "[system]\n...\n\n[user]\n..."
      const messages = parsePromptToMessages(prompt);

      const start = Date.now();

      try {
        const resp = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: temp,
            max_tokens: tokens,
            response_format: { type: "json_object" },
          }),
        });

        const latencyMs = Date.now() - start;

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          const errMsg = resp.status === 401
            ? "Invalid API key"
            : resp.status === 429
              ? "Rate limited — try again in a moment"
              : resp.status === 402 || resp.status === 403
                ? "API key has no credits or is restricted"
                : `OpenAI API error ${resp.status}: ${errBody.slice(0, 200)}`;
          return { ok: false, response: null, error: errMsg, latencyMs };
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content ?? null;
        const usage = data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        // Try to parse as JSON
        let response = content;
        if (typeof content === "string") {
          try {
            response = JSON.parse(content);
          } catch {
            // Return raw string — extractIntent() in llmIntentParser handles this
            response = content;
          }
        }

        return { ok: true, response, usage, latencyMs };

      } catch (err) {
        return {
          ok: false,
          response: null,
          error: `Network error: ${err.message}`,
          latencyMs: Date.now() - start,
        };
      }
    },

    getCallCount: () => callCount,
  };
}

/**
 * Parse the combined prompt string back into OpenAI messages format.
 * The intent prompt builder joins messages as:
 *   "[system]\n<content>\n\n[user]\n<content>"
 *
 * @param {string} prompt
 * @returns {Array<{role: string, content: string}>}
 */
function parsePromptToMessages(prompt) {
  if (!prompt || typeof prompt !== "string") {
    return [{ role: "user", content: String(prompt ?? "") }];
  }

  const parts = prompt.split(/\n\n\[user\]\n/i);
  if (parts.length >= 2) {
    const systemContent = parts[0].replace(/^\[system\]\n/i, "").trim();
    const userContent = parts.slice(1).join("\n\n[user]\n").trim();
    return [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];
  }

  // Fallback: treat entire prompt as user message
  return [{ role: "user", content: prompt }];
}

// ── API Key Persistence (sessionStorage) ────────────────────────────

const STORAGE_KEY = "mir_openai_api_key";

/**
 * Save API key to sessionStorage (cleared when browser tab closes).
 * @param {string} key
 */
export function saveApiKey(key) {
  try {
    if (key) {
      sessionStorage.setItem(STORAGE_KEY, key);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* storage not available */ }
}

/**
 * Load API key from sessionStorage.
 * @returns {string|null}
 */
export function loadApiKey() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Check if an API key looks valid (basic format check, not a real validation).
 * @param {string} key
 * @returns {boolean}
 */
export function isApiKeyFormat(key) {
  return typeof key === "string" && key.startsWith("sk-") && key.length > 20;
}
