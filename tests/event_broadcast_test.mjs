/**
 * event_broadcast_test.mjs — Tests for S3.1 WebSocket event broadcast.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MessageType,
  createRoom, addClient, removeClient, getClient, listClients,
  touchClient, findStaleClients,
  encodeMessage, decodeMessage,
  createWelcomeMessage,
  prepareBroadcast, prepareSingleEventBroadcast,
  prepareTurnNotification, preparePlayerJoinedNotification,
  preparePlayerLeftNotification, prepareRejectMessage,
  authorizeAction, prepareStateSync,
} from "../src/net/eventBroadcast.mjs";

// ── Room Management ─────────────────────────────────────────────────────

describe("createRoom", () => {
  it("creates a room with defaults", () => {
    const room = createRoom("room-1");
    assert.equal(room.id, "room-1");
    assert.equal(room.maxPlayers, 6);
    assert.equal(room.perPlayerFog, false);
    assert.equal(room.clients.size, 0);
    assert.equal(room.eventSeq, 0);
  });

  it("accepts custom options", () => {
    const room = createRoom("room-2", { maxPlayers: 4, perPlayerFog: true });
    assert.equal(room.maxPlayers, 4);
    assert.equal(room.perPlayerFog, true);
  });
});

describe("addClient", () => {
  it("adds a client successfully", () => {
    const room = createRoom("r1");
    const result = addClient(room, "c1", { displayName: "Alice", role: "player", entityId: "pc-seren" });
    assert.equal(result.ok, true);
    assert.equal(room.clients.size, 1);
    const client = getClient(room, "c1");
    assert.equal(client.displayName, "Alice");
    assert.equal(client.role, "player");
    assert.equal(client.entityId, "pc-seren");
  });

  it("rejects duplicate client", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "Alice", role: "player" });
    const result = addClient(room, "c1", { displayName: "Alice2", role: "player" });
    assert.equal(result.ok, false);
    assert.match(result.error, /already connected/);
  });

  it("rejects when room is full", () => {
    const room = createRoom("r1", { maxPlayers: 1 });
    addClient(room, "c1", { displayName: "A", role: "player" });
    const result = addClient(room, "c2", { displayName: "B", role: "player" });
    assert.equal(result.ok, false);
    assert.match(result.error, /full/);
  });

  it("rejects invalid role", () => {
    const room = createRoom("r1");
    const result = addClient(room, "c1", { displayName: "A", role: "admin" });
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid role/);
  });

  it("uses Anonymous for empty displayName", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "", role: "spectator" });
    assert.equal(getClient(room, "c1").displayName, "Anonymous");
  });
});

describe("removeClient", () => {
  it("removes an existing client", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    assert.equal(removeClient(room, "c1"), true);
    assert.equal(room.clients.size, 0);
  });

  it("returns false for unknown client", () => {
    const room = createRoom("r1");
    assert.equal(removeClient(room, "ghost"), false);
  });
});

describe("listClients", () => {
  it("returns all clients as array", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const list = listClients(room);
    assert.equal(list.length, 2);
  });
});

describe("touchClient + findStaleClients", () => {
  it("touchClient updates lastPing", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    const before = getClient(room, "c1").lastPing;
    touchClient(room, "c1");
    assert.ok(getClient(room, "c1").lastPing >= before);
  });

  it("findStaleClients finds old clients", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    // Force lastPing to be very old
    getClient(room, "c1").lastPing = Date.now() - 60000;
    const stale = findStaleClients(room, 30000);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].clientId, "c1");
  });

  it("findStaleClients excludes fresh clients", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    const stale = findStaleClients(room, 30000);
    assert.equal(stale.length, 0);
  });
});

// ── Message Protocol ────────────────────────────────────────────────────

describe("encodeMessage + decodeMessage", () => {
  it("round-trips correctly", () => {
    const encoded = encodeMessage("TEST_TYPE", { foo: "bar" });
    const decoded = decodeMessage(encoded);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.message.type, "TEST_TYPE");
    assert.equal(decoded.message.payload.foo, "bar");
    assert.ok(decoded.message.timestamp);
  });

  it("includes seq when provided", () => {
    const encoded = encodeMessage("X", {}, { seq: 42 });
    const decoded = decodeMessage(encoded);
    assert.equal(decoded.message.seq, 42);
  });

  it("decodeMessage rejects invalid JSON", () => {
    const result = decodeMessage("not json");
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid JSON/);
  });

  it("decodeMessage rejects missing type", () => {
    const result = decodeMessage(JSON.stringify({ payload: {} }));
    assert.equal(result.ok, false);
    assert.match(result.error, /Missing message type/);
  });
});

// ── MessageType constants ───────────────────────────────────────────────

describe("MessageType", () => {
  it("exports all expected message types", () => {
    const expected = [
      "CLIENT_JOIN", "CLIENT_ACTION", "CLIENT_PING",
      "SERVER_WELCOME", "SERVER_STATE_SYNC", "SERVER_EVENT",
      "SERVER_EVENTS_BATCH", "SERVER_REJECT", "SERVER_PONG",
      "SERVER_PLAYER_JOINED", "SERVER_PLAYER_LEFT", "SERVER_TURN_NOTIFICATION",
    ];
    for (const key of expected) {
      assert.ok(MessageType[key], `Missing MessageType.${key}`);
    }
  });
});

// ── Broadcasting ────────────────────────────────────────────────────────

describe("prepareBroadcast", () => {
  it("sends to all clients", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const events = [{ id: "evt-1", type: "MOVE_APPLIED", payload: {} }];
    const msgs = prepareBroadcast(room, events);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].clientId, "c1");
    assert.equal(msgs[1].clientId, "c2");
    // Verify message content
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.type, MessageType.SERVER_EVENTS_BATCH);
    assert.equal(parsed.payload.eventCount, 1);
  });

  it("increments eventSeq", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    prepareBroadcast(room, [{ id: "e1" }]);
    assert.equal(room.eventSeq, 1);
    prepareBroadcast(room, [{ id: "e2" }]);
    assert.equal(room.eventSeq, 2);
  });

  it("returns empty for no events", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    assert.equal(prepareBroadcast(room, []).length, 0);
    assert.equal(prepareBroadcast(room, null).length, 0);
  });
});

describe("prepareSingleEventBroadcast", () => {
  it("broadcasts a single event", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    const msgs = prepareSingleEventBroadcast(room, { id: "evt-1", type: "ATTACK_RESOLVED" });
    assert.equal(msgs.length, 1);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.type, MessageType.SERVER_EVENT);
  });
});

describe("prepareTurnNotification", () => {
  it("notifies all clients of turn change", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const msgs = prepareTurnNotification(room, "pc-seren", 3);
    assert.equal(msgs.length, 2);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.payload.activeEntityId, "pc-seren");
    assert.equal(parsed.payload.round, 3);
  });
});

describe("preparePlayerJoinedNotification", () => {
  it("notifies other clients (not the joiner)", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const msgs = preparePlayerJoinedNotification(room, "c2");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].clientId, "c1");
  });
});

describe("preparePlayerLeftNotification", () => {
  it("notifies all remaining clients", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    const msgs = preparePlayerLeftNotification(room, "c2", "Bob");
    assert.equal(msgs.length, 1);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.payload.displayName, "Bob");
  });
});

describe("prepareRejectMessage", () => {
  it("creates a reject message for a client", () => {
    const msg = prepareRejectMessage("c1", "Not your turn");
    assert.equal(msg.clientId, "c1");
    const parsed = JSON.parse(msg.message);
    assert.equal(parsed.type, MessageType.SERVER_REJECT);
    assert.equal(parsed.payload.reason, "Not your turn");
  });
});

// ── Welcome + State Sync ────────────────────────────────────────────────

describe("createWelcomeMessage", () => {
  it("includes room info and game state", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    const state = { entities: { players: [] } };
    const raw = createWelcomeMessage(room, "c1", state);
    const msg = JSON.parse(raw);
    assert.equal(msg.type, MessageType.SERVER_WELCOME);
    assert.equal(msg.payload.roomId, "r1");
    assert.equal(msg.payload.clientId, "c1");
    assert.equal(msg.payload.role, "gm");
    assert.deepEqual(msg.payload.gameState, state);
  });
});

describe("prepareStateSync", () => {
  it("creates a state sync message", () => {
    const room = createRoom("r1");
    room.eventSeq = 5;
    const state = { round: 3 };
    const result = prepareStateSync(room, "c1", state);
    assert.equal(result.clientId, "c1");
    const parsed = JSON.parse(result.message);
    assert.equal(parsed.type, MessageType.SERVER_STATE_SYNC);
    assert.equal(parsed.payload.eventSeq, 5);
  });
});

// ── Authorization ───────────────────────────────────────────────────────

describe("authorizeAction", () => {
  it("GM can do anything", () => {
    const room = createRoom("r1");
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    const result = authorizeAction(room, "gm1", { type: "MOVE", entityId: "pc-seren" });
    assert.equal(result.authorized, true);
  });

  it("spectator cannot submit actions", () => {
    const room = createRoom("r1");
    addClient(room, "s1", { displayName: "Viewer", role: "spectator" });
    const result = authorizeAction(room, "s1", { type: "MOVE", entityId: "pc-seren" });
    assert.equal(result.authorized, false);
    assert.match(result.reason, /Spectator/);
  });

  it("player can control own entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "Alice", role: "player", entityId: "pc-seren" });
    const result = authorizeAction(room, "p1", { type: "MOVE", entityId: "pc-seren" });
    assert.equal(result.authorized, true);
  });

  it("player cannot control other entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "Alice", role: "player", entityId: "pc-seren" });
    const result = authorizeAction(room, "p1", { type: "MOVE", entityId: "pc-miri" });
    assert.equal(result.authorized, false);
  });

  it("unknown client is rejected", () => {
    const room = createRoom("r1");
    const result = authorizeAction(room, "ghost", { type: "MOVE" });
    assert.equal(result.authorized, false);
  });

  it("player can submit entity-less actions", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = authorizeAction(room, "p1", { type: "ROLL_INITIATIVE" });
    assert.equal(result.authorized, true);
  });
});
