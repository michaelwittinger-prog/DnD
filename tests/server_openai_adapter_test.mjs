import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createServerOpenAIAdapter, getServerAiStatus } from "../src/ui/serverOpenAIAdapter.mjs";

describe("serverOpenAIAdapter", () => {
  it("getServerAiStatus returns structured offline result when fetch throws", async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("connection refused");
    };

    const status = await getServerAiStatus("http://127.0.0.1:3030");
    assert.equal(status.ok, false);
    assert.equal(status.mode, "offline");
    assert.equal(status.keyConfigured, false);

    globalThis.fetch = prevFetch;
  });

  it("adapter.call returns intent from /ai/intent endpoint", async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          intent: { type: "end_turn", subject: "active" },
          usage: { totalTokens: 10 },
        },
      }),
    });

    const adapter = createServerOpenAIAdapter({ apiBase: "http://127.0.0.1:3030" });
    const result = await adapter.call("[system]\nX\n\n[user]\nend turn", { entities: {} }, {});
    assert.equal(result.ok, true);
    assert.equal(result.response.type, "end_turn");

    globalThis.fetch = prevFetch;
  });
});
