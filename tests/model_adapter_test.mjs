/**
 * model_adapter_test.mjs — Tests for Tier 5.5 Model Selection Adapter.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerAdapter,
  unregisterAdapter,
  getAdapter,
  listAdapters,
  clearAdapters,
  createMockAdapter,
  createOpenAIAdapter,
  createLocalAdapter,
  setActiveAdapter,
  getActiveAdapter,
  getActiveAdapterId,
  callActiveAdapter,
  resetActiveAdapter,
} from "../src/ai/modelAdapter.mjs";

// Reset state before each test
beforeEach(() => {
  clearAdapters();
  resetActiveAdapter();
});

// ── registerAdapter ─────────────────────────────────────────────────────

describe("registerAdapter", () => {
  it("registers a valid adapter", () => {
    const result = registerAdapter({
      id: "test-1", name: "Test", provider: "mock", call: async () => ({}),
    });
    assert.equal(result.ok, true);
  });

  it("rejects adapter with missing id", () => {
    const result = registerAdapter({ name: "X", provider: "mock", call: async () => ({}) });
    assert.equal(result.ok, false);
    assert.match(result.error, /id/);
  });

  it("rejects adapter with missing name", () => {
    const result = registerAdapter({ id: "x", provider: "mock", call: async () => ({}) });
    assert.equal(result.ok, false);
    assert.match(result.error, /name/);
  });

  it("rejects adapter with missing provider", () => {
    const result = registerAdapter({ id: "x", name: "X", call: async () => ({}) });
    assert.equal(result.ok, false);
    assert.match(result.error, /provider/);
  });

  it("rejects adapter with missing call function", () => {
    const result = registerAdapter({ id: "x", name: "X", provider: "mock" });
    assert.equal(result.ok, false);
    assert.match(result.error, /call/);
  });
});

// ── getAdapter / listAdapters ───────────────────────────────────────────

describe("getAdapter", () => {
  it("retrieves a registered adapter by ID", () => {
    registerAdapter({ id: "a1", name: "A", provider: "mock", call: async () => ({}) });
    const a = getAdapter("a1");
    assert.ok(a);
    assert.equal(a.id, "a1");
  });

  it("returns null for unregistered ID", () => {
    assert.equal(getAdapter("ghost"), null);
  });
});

describe("listAdapters", () => {
  it("returns empty when no adapters registered", () => {
    assert.equal(listAdapters().length, 0);
  });

  it("lists all registered adapters with id/name/provider", () => {
    registerAdapter({ id: "a1", name: "A", provider: "mock", call: async () => ({}) });
    registerAdapter({ id: "a2", name: "B", provider: "openai", call: async () => ({}) });
    const list = listAdapters();
    assert.equal(list.length, 2);
    assert.ok(list.every(a => a.id && a.name && a.provider));
  });
});

// ── unregisterAdapter ───────────────────────────────────────────────────

describe("unregisterAdapter", () => {
  it("removes an existing adapter", () => {
    registerAdapter({ id: "a1", name: "A", provider: "mock", call: async () => ({}) });
    assert.equal(unregisterAdapter("a1"), true);
    assert.equal(getAdapter("a1"), null);
  });

  it("returns false for nonexistent adapter", () => {
    assert.equal(unregisterAdapter("ghost"), false);
  });
});

// ── clearAdapters ───────────────────────────────────────────────────────

describe("clearAdapters", () => {
  it("empties the registry", () => {
    registerAdapter({ id: "a1", name: "A", provider: "mock", call: async () => ({}) });
    registerAdapter({ id: "a2", name: "B", provider: "mock", call: async () => ({}) });
    clearAdapters();
    assert.equal(listAdapters().length, 0);
  });
});

// ── createMockAdapter ───────────────────────────────────────────────────

describe("createMockAdapter", () => {
  it("creates adapter with default response", async () => {
    const mock = createMockAdapter();
    assert.equal(mock.id, "mock");
    assert.equal(mock.provider, "mock");
    const result = await mock.call("test", {});
    assert.equal(result.ok, true);
    assert.deepEqual(result.response.actions, [{ type: "END_TURN" }]);
  });

  it("creates adapter with custom response", async () => {
    const custom = { actions: [{ type: "MOVE" }], narration: "Custom" };
    const mock = createMockAdapter(custom);
    const result = await mock.call("test", {});
    assert.deepEqual(result.response, custom);
  });

  it("tracks call count", async () => {
    const mock = createMockAdapter();
    assert.equal(mock.getCallCount(), 0);
    await mock.call("a", {});
    await mock.call("b", {});
    assert.equal(mock.getCallCount(), 2);
  });
});

// ── createOpenAIAdapter ─────────────────────────────────────────────────

describe("createOpenAIAdapter", () => {
  it("creates adapter with correct shape", () => {
    const adapter = createOpenAIAdapter({ model: "gpt-4o", callFn: async () => ({ response: {} }) });
    assert.equal(adapter.id, "openai-gpt-4o");
    assert.equal(adapter.provider, "openai");
    assert.equal(adapter.model, "gpt-4o");
    assert.equal(typeof adapter.call, "function");
  });

  it("delegates call to callFn", async () => {
    let received = null;
    const adapter = createOpenAIAdapter({
      callFn: async (prompt, state, opts) => {
        received = { prompt, state, opts };
        return { response: { ok: true }, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      },
    });
    const result = await adapter.call("hello", { round: 1 });
    assert.equal(result.ok, true);
    assert.equal(received.prompt, "hello");
    assert.equal(result.usage.totalTokens, 15);
    assert.ok(result.latencyMs >= 0);
  });

  it("returns error when no callFn provided", async () => {
    const adapter = createOpenAIAdapter();
    const result = await adapter.call("test", {});
    assert.equal(result.ok, false);
    assert.match(result.error, /callFn/);
  });

  it("catches callFn exceptions", async () => {
    const adapter = createOpenAIAdapter({
      callFn: async () => { throw new Error("API down"); },
    });
    const result = await adapter.call("test", {});
    assert.equal(result.ok, false);
    assert.match(result.error, /API down/);
  });
});

// ── createLocalAdapter ──────────────────────────────────────────────────

describe("createLocalAdapter", () => {
  it("creates adapter with correct defaults", () => {
    const adapter = createLocalAdapter({ callFn: async () => ({ response: {} }) });
    assert.equal(adapter.id, "local-mistral");
    assert.equal(adapter.provider, "local");
    assert.equal(adapter.model, "mistral");
    assert.equal(adapter.endpoint, "http://127.0.0.1:11434");
  });

  it("accepts custom options", () => {
    const adapter = createLocalAdapter({
      id: "local-llama",
      name: "Llama 3",
      model: "llama3",
      endpoint: "http://127.0.0.1:8080",
      callFn: async () => ({ response: {} }),
    });
    assert.equal(adapter.id, "local-llama");
    assert.equal(adapter.name, "Llama 3");
    assert.equal(adapter.model, "llama3");
  });
});

// ── Active Adapter ──────────────────────────────────────────────────────

describe("setActiveAdapter / getActiveAdapter", () => {
  it("sets and gets the active adapter", () => {
    const mock = createMockAdapter();
    registerAdapter(mock);
    const result = setActiveAdapter("mock");
    assert.equal(result.ok, true);
    const active = getActiveAdapter();
    assert.ok(active);
    assert.equal(active.id, "mock");
  });

  it("rejects unregistered adapter ID", () => {
    const result = setActiveAdapter("nonexistent");
    assert.equal(result.ok, false);
    assert.match(result.error, /not registered/);
  });

  it("getActiveAdapter returns null when none set", () => {
    assert.equal(getActiveAdapter(), null);
    assert.equal(getActiveAdapterId(), null);
  });
});

describe("callActiveAdapter", () => {
  it("calls the active adapter", async () => {
    const mock = createMockAdapter();
    registerAdapter(mock);
    setActiveAdapter("mock");
    const result = await callActiveAdapter("test", {});
    assert.equal(result.ok, true);
    assert.ok(result.response);
  });

  it("returns error when no active adapter set", async () => {
    const result = await callActiveAdapter("test", {});
    assert.equal(result.ok, false);
    assert.match(result.error, /No active adapter/);
  });
});

describe("resetActiveAdapter", () => {
  it("clears the active adapter", () => {
    const mock = createMockAdapter();
    registerAdapter(mock);
    setActiveAdapter("mock");
    resetActiveAdapter();
    assert.equal(getActiveAdapterId(), null);
    assert.equal(getActiveAdapter(), null);
  });
});
