/**
 * modelAdapter.mjs — MIR Tier 5.5 Model Selection Adapter.
 *
 * Adapter pattern for multiple AI model providers.
 * Each adapter implements the same interface:
 *   { id, name, call(prompt, state, options) → { ok, response, usage } }
 *
 * Adapters are registered at startup. The active adapter is selected
 * by configuration. New providers can be added without touching
 * existing code.
 *
 * Pure functions. No I/O (adapters wrap I/O internally).
 */

// ── Adapter Registry ────────────────────────────────────────────────────

/** @type {Map<string, ModelAdapter>} */
const registry = new Map();

/**
 * @typedef {object} ModelAdapter
 * @property {string} id — unique adapter ID (e.g., "openai-gpt4o")
 * @property {string} name — human-readable name
 * @property {string} provider — provider category: "openai", "anthropic", "local", "mock"
 * @property {function} call — async (prompt, state, options) → AdapterResponse
 * @property {function} [validate] — optional config validation
 */

/**
 * @typedef {object} AdapterResponse
 * @property {boolean} ok
 * @property {object|null} response — parsed AI response
 * @property {string|null} error — error message if !ok
 * @property {{ promptTokens: number, completionTokens: number, totalTokens: number }} [usage]
 * @property {number} [latencyMs]
 */

/**
 * Register a model adapter.
 *
 * @param {ModelAdapter} adapter
 * @returns {{ ok: boolean, error?: string }}
 */
export function registerAdapter(adapter) {
  if (!adapter?.id) return { ok: false, error: "Adapter must have an id" };
  if (!adapter?.name) return { ok: false, error: "Adapter must have a name" };
  if (!adapter?.provider) return { ok: false, error: "Adapter must have a provider" };
  if (typeof adapter?.call !== "function") return { ok: false, error: "Adapter must have a call function" };

  registry.set(adapter.id, adapter);
  return { ok: true };
}

/**
 * Unregister a model adapter.
 *
 * @param {string} adapterId
 * @returns {boolean}
 */
export function unregisterAdapter(adapterId) {
  return registry.delete(adapterId);
}

/**
 * Get a registered adapter by ID.
 *
 * @param {string} adapterId
 * @returns {ModelAdapter|null}
 */
export function getAdapter(adapterId) {
  return registry.get(adapterId) || null;
}

/**
 * List all registered adapters.
 *
 * @returns {Array<{id: string, name: string, provider: string}>}
 */
export function listAdapters() {
  return Array.from(registry.values()).map(a => ({
    id: a.id,
    name: a.name,
    provider: a.provider,
  }));
}

/**
 * Clear all registered adapters.
 */
export function clearAdapters() {
  registry.clear();
}

// ── Built-in Adapter Factories ──────────────────────────────────────────

/**
 * Create a mock adapter for testing.
 * Always returns a fixed response.
 *
 * @param {object} [fixedResponse] — response to return for every call
 * @returns {ModelAdapter}
 */
export function createMockAdapter(fixedResponse = null) {
  const defaultResponse = {
    actions: [{ type: "END_TURN" }],
    narration: "The mock AI ends its turn.",
  };

  let callCount = 0;

  return {
    id: "mock",
    name: "Mock AI (Testing)",
    provider: "mock",
    call: async (_prompt, _state, _options) => {
      callCount++;
      return {
        ok: true,
        response: fixedResponse || defaultResponse,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 1,
      };
    },
    getCallCount: () => callCount,
  };
}

/**
 * Create an OpenAI-compatible adapter configuration.
 * NOTE: Does not make actual API calls — that requires the openaiClient.
 * This creates the adapter shape for registration.
 *
 * @param {object} options
 * @param {string} [options.model="gpt-4o-mini"] — model name
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=1000]
 * @param {function} options.callFn — actual API call function
 * @returns {ModelAdapter}
 */
export function createOpenAIAdapter(options = {}) {
  const model = options.model || "gpt-4o-mini";
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1000;
  const callFn = options.callFn;

  return {
    id: `openai-${model}`,
    name: `OpenAI ${model}`,
    provider: "openai",
    model,
    temperature,
    maxTokens,
    call: async (prompt, state, callOptions = {}) => {
      if (!callFn) {
        return { ok: false, response: null, error: "No callFn provided" };
      }
      const start = Date.now();
      try {
        const result = await callFn(prompt, state, {
          model,
          temperature: callOptions.temperature ?? temperature,
          maxTokens: callOptions.maxTokens ?? maxTokens,
        });
        return {
          ok: true,
          response: result.response,
          usage: result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return {
          ok: false,
          response: null,
          error: err.message,
          latencyMs: Date.now() - start,
        };
      }
    },
  };
}

/**
 * Create a local LLM adapter configuration (e.g., Ollama, llama.cpp).
 *
 * @param {object} options
 * @param {string} options.id — adapter ID
 * @param {string} options.name — display name
 * @param {string} [options.endpoint="http://127.0.0.1:11434"] — API endpoint
 * @param {string} [options.model="mistral"] — model name
 * @param {function} options.callFn — actual API call function
 * @returns {ModelAdapter}
 */
export function createLocalAdapter(options = {}) {
  const endpoint = options.endpoint || "http://127.0.0.1:11434";
  const model = options.model || "mistral";

  return {
    id: options.id || `local-${model}`,
    name: options.name || `Local ${model}`,
    provider: "local",
    model,
    endpoint,
    call: async (prompt, state, callOptions = {}) => {
      if (!options.callFn) {
        return { ok: false, response: null, error: "No callFn provided" };
      }
      const start = Date.now();
      try {
        const result = await options.callFn(prompt, state, { model, endpoint, ...callOptions });
        return {
          ok: true,
          response: result.response,
          usage: result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return {
          ok: false,
          response: null,
          error: err.message,
          latencyMs: Date.now() - start,
        };
      }
    },
  };
}

// ── Active Adapter Selection ────────────────────────────────────────────

let activeAdapterId = null;

/**
 * Set the active adapter by ID.
 *
 * @param {string} adapterId
 * @returns {{ ok: boolean, error?: string }}
 */
export function setActiveAdapter(adapterId) {
  if (!registry.has(adapterId)) {
    return { ok: false, error: `Adapter "${adapterId}" not registered` };
  }
  activeAdapterId = adapterId;
  return { ok: true };
}

/**
 * Get the active adapter.
 *
 * @returns {ModelAdapter|null}
 */
export function getActiveAdapter() {
  if (!activeAdapterId) return null;
  return registry.get(activeAdapterId) || null;
}

/**
 * Get the active adapter ID.
 *
 * @returns {string|null}
 */
export function getActiveAdapterId() {
  return activeAdapterId;
}

/**
 * Call the active adapter.
 *
 * @param {string} prompt
 * @param {object} state
 * @param {object} [options]
 * @returns {Promise<AdapterResponse>}
 */
export async function callActiveAdapter(prompt, state, options = {}) {
  const adapter = getActiveAdapter();
  if (!adapter) {
    return { ok: false, response: null, error: "No active adapter set" };
  }
  return adapter.call(prompt, state, options);
}

/**
 * Reset active adapter (for testing).
 */
export function resetActiveAdapter() {
  activeAdapterId = null;
}
