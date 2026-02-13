/**
 * event_broadcast_test.mjs — Tests for S3.1 WebSocket event broadcast.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MessageType,
  ACTION_PERMISSIONS,
  createRoom, addClient, removeClient, getClient, listClients,
  touchClient, findStaleClients,
  encodeMessage, decodeMessage,
  createWelcomeMessage,
  prepareBroadcast, prepareSingleEventBroadcast,
  prepareTurnNotification, preparePlayerJoinedNotification,
  preparePlayerLeftNotification, prepareRejectMessage,
  authorizeAction, prepareStateSync,
  // S3.2
  canPerformAction, validateActionPermission,
  assignEntityToClient, unassignEntity, getEntityController,
  // S3.3
  generateRoomCode, createRoomRegistry, registryCreateRoom,
  findRoomByCode, listRooms, registryRemoveRoom, joinRoomByCode,
  // S3.5
  prepareYourTurnNotification, prepareCombatEndNotification,
  prepareRoundStartNotification,
  // S3.4
  getEventPosition, isEventVisible, filterEventsForClient,
  prepareFogAwareBroadcast, redactStateForPlayer,
  // S3.6
  createActionQueue, enqueueAction, dequeueAction,
  resolveQueueEntry, getQueueDepth, pruneQueue,
  checkStaleAction, validateTurnAuthority,
  prepareOptimisticAck, processIncomingAction,
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

// ── S3.2 Action Permissions ─────────────────────────────────────────────

describe("ACTION_PERMISSIONS", () => {
  it("defines permissions for all 3 roles", () => {
    assert.ok(ACTION_PERMISSIONS.gm);
    assert.ok(ACTION_PERMISSIONS.player);
    assert.ok(ACTION_PERMISSIONS.spectator);
  });

  it("GM has all permissions", () => {
    for (const [action, allowed] of Object.entries(ACTION_PERMISSIONS.gm)) {
      assert.equal(allowed, true, `GM should have ${action}`);
    }
  });

  it("spectator has no permissions", () => {
    for (const [action, allowed] of Object.entries(ACTION_PERMISSIONS.spectator)) {
      assert.equal(allowed, false, `Spectator should not have ${action}`);
    }
  });

  it("player has combat actions but not admin actions", () => {
    assert.equal(ACTION_PERMISSIONS.player.MOVE, true);
    assert.equal(ACTION_PERMISSIONS.player.ATTACK, true);
    assert.equal(ACTION_PERMISSIONS.player.LOAD_SCENARIO, false);
    assert.equal(ACTION_PERMISSIONS.player.RESET_GAME, false);
    assert.equal(ACTION_PERMISSIONS.player.KICK_PLAYER, false);
  });
});

describe("canPerformAction", () => {
  it("GM can perform all known actions", () => {
    assert.equal(canPerformAction("gm", "MOVE"), true);
    assert.equal(canPerformAction("gm", "LOAD_SCENARIO"), true);
    assert.equal(canPerformAction("gm", "KICK_PLAYER"), true);
  });

  it("GM can perform unknown actions", () => {
    assert.equal(canPerformAction("gm", "CUSTOM_ACTION"), true);
  });

  it("player can do combat actions, not admin", () => {
    assert.equal(canPerformAction("player", "MOVE"), true);
    assert.equal(canPerformAction("player", "ATTACK"), true);
    assert.equal(canPerformAction("player", "LOAD_SCENARIO"), false);
  });

  it("player cannot perform unknown actions", () => {
    assert.equal(canPerformAction("player", "CUSTOM_ACTION"), false);
  });

  it("spectator cannot perform any action", () => {
    assert.equal(canPerformAction("spectator", "MOVE"), false);
    assert.equal(canPerformAction("spectator", "END_TURN"), false);
  });

  it("invalid role returns false", () => {
    assert.equal(canPerformAction("admin", "MOVE"), false);
  });
});

describe("validateActionPermission", () => {
  it("GM passes all action types", () => {
    const room = createRoom("r1");
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    assert.equal(validateActionPermission(room, "gm1", { type: "LOAD_SCENARIO" }).authorized, true);
  });

  it("player blocked from admin actions", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = validateActionPermission(room, "p1", { type: "RESET_GAME" });
    assert.equal(result.authorized, false);
    assert.match(result.reason, /cannot perform/);
  });

  it("spectator blocked from all actions", () => {
    const room = createRoom("r1");
    addClient(room, "s1", { displayName: "V", role: "spectator" });
    const result = validateActionPermission(room, "s1", { type: "MOVE", entityId: "pc-seren" });
    assert.equal(result.authorized, false);
  });

  it("player blocked from controlling other entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = validateActionPermission(room, "p1", { type: "MOVE", entityId: "pc-miri" });
    assert.equal(result.authorized, false);
    assert.match(result.reason, /only control/);
  });

  it("unknown client rejected", () => {
    const room = createRoom("r1");
    const result = validateActionPermission(room, "ghost", { type: "MOVE" });
    assert.equal(result.authorized, false);
  });
});

describe("assignEntityToClient", () => {
  it("assigns entity successfully", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player" });
    const result = assignEntityToClient(room, "p1", "pc-seren");
    assert.equal(result.ok, true);
    assert.equal(getClient(room, "p1").entityId, "pc-seren");
  });

  it("rejects if entity already assigned", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    addClient(room, "p2", { displayName: "B", role: "player" });
    const result = assignEntityToClient(room, "p2", "pc-seren");
    assert.equal(result.ok, false);
    assert.match(result.error, /already assigned/);
  });

  it("rejects unknown client", () => {
    const room = createRoom("r1");
    const result = assignEntityToClient(room, "ghost", "pc-seren");
    assert.equal(result.ok, false);
  });
});

describe("unassignEntity", () => {
  it("clears entity from client", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = unassignEntity(room, "p1");
    assert.equal(result.ok, true);
    assert.equal(getClient(room, "p1").entityId, null);
  });

  it("rejects unknown client", () => {
    const room = createRoom("r1");
    assert.equal(unassignEntity(room, "ghost").ok, false);
  });
});

describe("getEntityController", () => {
  it("finds the client controlling an entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const controller = getEntityController(room, "pc-seren");
    assert.ok(controller);
    assert.equal(controller.clientId, "p1");
  });

  it("returns null for uncontrolled entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    assert.equal(getEntityController(room, "npc-goblin"), null);
  });
});

// ── S3.3 Room Codes & Registry ──────────────────────────────────────────

describe("generateRoomCode", () => {
  it("generates a 6-character code by default", () => {
    const code = generateRoomCode();
    assert.equal(code.length, 6);
  });

  it("generates custom length codes", () => {
    assert.equal(generateRoomCode(4).length, 4);
    assert.equal(generateRoomCode(8).length, 8);
  });

  it("only uses unambiguous characters (no I/O/0/1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      assert.ok(!/[IO01]/.test(code), `Code "${code}" contains ambiguous chars`);
    }
  });

  it("generates different codes", () => {
    const codes = new Set();
    for (let i = 0; i < 20; i++) codes.add(generateRoomCode());
    assert.ok(codes.size > 1, "All codes were identical");
  });
});

describe("createRoomRegistry + registryCreateRoom", () => {
  it("creates a registry with empty maps", () => {
    const reg = createRoomRegistry();
    assert.equal(reg.rooms.size, 0);
    assert.equal(reg.codeIndex.size, 0);
  });

  it("creates a room with a code", () => {
    const reg = createRoomRegistry();
    const result = registryCreateRoom(reg, "room-1");
    assert.equal(result.ok, true);
    assert.ok(result.room);
    assert.ok(result.code);
    assert.equal(result.code.length, 6);
    assert.equal(reg.rooms.size, 1);
    assert.equal(reg.codeIndex.size, 1);
  });

  it("rejects duplicate roomId", () => {
    const reg = createRoomRegistry();
    registryCreateRoom(reg, "room-1");
    const result = registryCreateRoom(reg, "room-1");
    assert.equal(result.ok, false);
    assert.match(result.error, /already exists/);
  });

  it("stores gmClientId in room", () => {
    const reg = createRoomRegistry();
    const result = registryCreateRoom(reg, "r1", { gmClientId: "gm-abc" });
    assert.equal(result.room.gmClientId, "gm-abc");
  });
});

describe("findRoomByCode", () => {
  it("finds a room by its code", () => {
    const reg = createRoomRegistry();
    const { code } = registryCreateRoom(reg, "room-1");
    const room = findRoomByCode(reg, code);
    assert.ok(room);
    assert.equal(room.id, "room-1");
  });

  it("is case-insensitive", () => {
    const reg = createRoomRegistry();
    const { code } = registryCreateRoom(reg, "room-1");
    const room = findRoomByCode(reg, code.toLowerCase());
    assert.ok(room);
  });

  it("returns null for invalid code", () => {
    const reg = createRoomRegistry();
    assert.equal(findRoomByCode(reg, "ZZZZZZ"), null);
  });
});

describe("listRooms", () => {
  it("lists all rooms with summary info", () => {
    const reg = createRoomRegistry();
    registryCreateRoom(reg, "r1");
    registryCreateRoom(reg, "r2");
    const list = listRooms(reg);
    assert.equal(list.length, 2);
    assert.ok(list[0].roomId);
    assert.ok(list[0].code);
    assert.equal(typeof list[0].playerCount, "number");
    assert.equal(typeof list[0].maxPlayers, "number");
  });

  it("returns empty for empty registry", () => {
    assert.equal(listRooms(createRoomRegistry()).length, 0);
  });
});

describe("registryRemoveRoom", () => {
  it("removes a room and its code", () => {
    const reg = createRoomRegistry();
    const { code } = registryCreateRoom(reg, "r1");
    assert.equal(registryRemoveRoom(reg, "r1"), true);
    assert.equal(reg.rooms.size, 0);
    assert.equal(findRoomByCode(reg, code), null);
  });

  it("returns false for nonexistent room", () => {
    const reg = createRoomRegistry();
    assert.equal(registryRemoveRoom(reg, "ghost"), false);
  });
});

describe("joinRoomByCode", () => {
  it("joins a room via code", () => {
    const reg = createRoomRegistry();
    const { code } = registryCreateRoom(reg, "r1");
    const result = joinRoomByCode(reg, code, "p1", { displayName: "Alice", role: "player" });
    assert.equal(result.ok, true);
    assert.ok(result.room);
    assert.equal(result.room.clients.size, 1);
  });

  it("rejects invalid code", () => {
    const reg = createRoomRegistry();
    const result = joinRoomByCode(reg, "ZZZZZZ", "p1", { displayName: "A", role: "player" });
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid room code/);
  });

  it("rejects when room is full", () => {
    const reg = createRoomRegistry();
    const { code } = registryCreateRoom(reg, "r1", { maxPlayers: 1 });
    joinRoomByCode(reg, code, "p1", { displayName: "A", role: "player" });
    const result = joinRoomByCode(reg, code, "p2", { displayName: "B", role: "player" });
    assert.equal(result.ok, false);
    assert.match(result.error, /full/);
  });
});

// ── S3.5 Enhanced Turn Notifications ────────────────────────────────────

describe("MessageType S3.5 additions", () => {
  it("exports YOUR_TURN, COMBAT_END, ROUND_START", () => {
    assert.ok(MessageType.SERVER_YOUR_TURN);
    assert.ok(MessageType.SERVER_COMBAT_END);
    assert.ok(MessageType.SERVER_ROUND_START);
  });
});

describe("prepareYourTurnNotification", () => {
  it("targets the player controlling the active entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "Alice", role: "player", entityId: "pc-seren" });
    addClient(room, "p2", { displayName: "Bob", role: "player", entityId: "pc-miri" });
    const msg = prepareYourTurnNotification(room, "pc-seren", 2);
    assert.ok(msg);
    assert.equal(msg.clientId, "p1");
    const parsed = JSON.parse(msg.message);
    assert.equal(parsed.type, MessageType.SERVER_YOUR_TURN);
    assert.equal(parsed.payload.entityId, "pc-seren");
    assert.equal(parsed.payload.round, 2);
  });

  it("returns null if no player controls the entity", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const msg = prepareYourTurnNotification(room, "npc-goblin", 1);
    assert.equal(msg, null);
  });
});

describe("prepareCombatEndNotification", () => {
  it("notifies all clients", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const msgs = prepareCombatEndNotification(room, "players_win", { rounds: 5 });
    assert.equal(msgs.length, 2);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.type, MessageType.SERVER_COMBAT_END);
    assert.equal(parsed.payload.result, "players_win");
    assert.equal(parsed.payload.rounds, 5);
  });

  it("works with no details", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    const msgs = prepareCombatEndNotification(room, "npcs_win");
    assert.equal(msgs.length, 1);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.payload.result, "npcs_win");
  });
});

describe("prepareRoundStartNotification", () => {
  it("notifies all clients of new round", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "player" });
    addClient(room, "c2", { displayName: "B", role: "player" });
    const msgs = prepareRoundStartNotification(room, 3, ["pc-seren", "npc-goblin"]);
    assert.equal(msgs.length, 2);
    const parsed = JSON.parse(msgs[0].message);
    assert.equal(parsed.type, MessageType.SERVER_ROUND_START);
    assert.equal(parsed.payload.round, 3);
    assert.deepEqual(parsed.payload.initiativeOrder, ["pc-seren", "npc-goblin"]);
  });

  it("defaults to empty initiative order", () => {
    const room = createRoom("r1");
    addClient(room, "c1", { displayName: "A", role: "gm" });
    const msgs = prepareRoundStartNotification(room, 1);
    const parsed = JSON.parse(msgs[0].message);
    assert.deepEqual(parsed.payload.initiativeOrder, []);
  });
});

// ── S3.4 Per-Player Fog of War ──────────────────────────────────────────

describe("getEventPosition", () => {
  it("extracts finalPosition from MOVE", () => {
    const pos = getEventPosition({ payload: { finalPosition: { x: 3, y: 5 } } });
    assert.deepEqual(pos, { x: 3, y: 5 });
  });
  it("extracts targetPosition from ATTACK", () => {
    const pos = getEventPosition({ payload: { targetPosition: { x: 1, y: 2 } } });
    assert.deepEqual(pos, { x: 1, y: 2 });
  });
  it("extracts 'to' field", () => {
    const pos = getEventPosition({ payload: { to: { x: 7, y: 8 } } });
    assert.deepEqual(pos, { x: 7, y: 8 });
  });
  it("returns null for events with no position", () => {
    assert.equal(getEventPosition({ type: "TURN_ENDED", payload: {} }), null);
    assert.equal(getEventPosition({}), null);
  });
});

describe("isEventVisible", () => {
  const vis = new Set(["3,3", "4,4", "5,5"]);

  it("global events are always visible", () => {
    assert.equal(isEventVisible({ type: "INITIATIVE_ROLLED" }, vis), true);
    assert.equal(isEventVisible({ type: "COMBAT_END" }, vis), true);
    assert.equal(isEventVisible({ type: "TURN_ENDED" }, vis), true);
    assert.equal(isEventVisible({ type: "ACTION_REJECTED" }, vis), true);
  });

  it("MOVE visible if destination in range", () => {
    const evt = { type: "MOVE_APPLIED", payload: { from: { x: 0, y: 0 }, finalPosition: { x: 3, y: 3 } } };
    assert.equal(isEventVisible(evt, vis), true);
  });
  it("MOVE visible if origin in range", () => {
    const evt = { type: "MOVE_APPLIED", payload: { from: { x: 4, y: 4 }, finalPosition: { x: 9, y: 9 } } };
    assert.equal(isEventVisible(evt, vis), true);
  });
  it("MOVE hidden if neither in range", () => {
    const evt = { type: "MOVE_APPLIED", payload: { from: { x: 0, y: 0 }, finalPosition: { x: 9, y: 9 } } };
    assert.equal(isEventVisible(evt, vis), false);
  });

  it("ATTACK visible if target position in range", () => {
    const evt = { type: "ATTACK_RESOLVED", payload: { attackerPosition: { x: 0, y: 0 }, targetPosition: { x: 5, y: 5 } } };
    assert.equal(isEventVisible(evt, vis), true);
  });
  it("ATTACK hidden if both out of range", () => {
    const evt = { type: "ATTACK_RESOLVED", payload: { attackerPosition: { x: 0, y: 0 }, targetPosition: { x: 9, y: 9 } } };
    assert.equal(isEventVisible(evt, vis), false);
  });

  it("events with no position are always visible", () => {
    assert.equal(isEventVisible({ type: "CUSTOM_EVENT", payload: {} }, vis), true);
  });
  it("events with position checked against visible cells", () => {
    const evt = { type: "ABILITY_USED", payload: { position: { x: 3, y: 3 } } };
    assert.equal(isEventVisible(evt, vis), true);
    const evt2 = { type: "ABILITY_USED", payload: { position: { x: 9, y: 9 } } };
    assert.equal(isEventVisible(evt2, vis), false);
  });
});

describe("filterEventsForClient", () => {
  const vis = new Set(["3,3", "4,4"]);
  const events = [
    { type: "INITIATIVE_ROLLED", payload: {} },
    { type: "MOVE_APPLIED", payload: { from: { x: 3, y: 3 }, finalPosition: { x: 4, y: 4 } } },
    { type: "MOVE_APPLIED", payload: { from: { x: 8, y: 8 }, finalPosition: { x: 9, y: 9 } } },
    { type: "ATTACK_RESOLVED", payload: { targetPosition: { x: 9, y: 9 } } },
  ];

  it("GM sees all events", () => {
    const client = { role: "gm", entityId: null };
    assert.equal(filterEventsForClient(client, events, vis).length, 4);
  });
  it("spectator sees all events", () => {
    const client = { role: "spectator", entityId: null };
    assert.equal(filterEventsForClient(client, events, vis).length, 4);
  });
  it("player with entity sees visible events + global", () => {
    const client = { role: "player", entityId: "pc-seren" };
    const filtered = filterEventsForClient(client, events, vis);
    assert.equal(filtered.length, 2); // INITIATIVE + visible MOVE
  });
  it("player without entity sees only global events", () => {
    const client = { role: "player", entityId: null };
    const filtered = filterEventsForClient(client, events, vis);
    assert.equal(filtered.length, 1); // INITIATIVE only
  });
});

describe("prepareFogAwareBroadcast", () => {
  it("broadcasts all events when fog disabled", () => {
    const room = createRoom("r1", { perPlayerFog: false });
    addClient(room, "c1", { displayName: "A", role: "player", entityId: "pc-seren" });
    addClient(room, "c2", { displayName: "B", role: "player", entityId: "pc-miri" });
    const events = [{ type: "MOVE_APPLIED", payload: { finalPosition: { x: 5, y: 5 } } }];
    const msgs = prepareFogAwareBroadcast(room, events, {}, () => new Set());
    assert.equal(msgs.length, 2); // everyone gets everything
  });

  it("filters events per player when fog enabled", () => {
    const room = createRoom("r1", { perPlayerFog: true });
    addClient(room, "c1", { displayName: "A", role: "player", entityId: "pc-seren" });
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    const events = [
      { type: "MOVE_APPLIED", payload: { from: { x: 8, y: 8 }, finalPosition: { x: 9, y: 9 } } },
    ];
    // Player can't see 8,8 or 9,9
    const computeVis = () => new Set(["1,1", "2,2"]);
    const msgs = prepareFogAwareBroadcast(room, events, {}, computeVis);
    // GM gets events, player doesn't (hidden move)
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].clientId, "gm1");
  });

  it("returns empty for null/empty events", () => {
    const room = createRoom("r1");
    assert.equal(prepareFogAwareBroadcast(room, [], {}, () => new Set()).length, 0);
    assert.equal(prepareFogAwareBroadcast(room, null, {}, () => new Set()).length, 0);
  });

  it("increments eventSeq", () => {
    const room = createRoom("r1", { perPlayerFog: true });
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    prepareFogAwareBroadcast(room, [{ type: "TURN_ENDED", payload: {} }], {}, () => new Set());
    assert.equal(room.eventSeq, 1);
  });
});

describe("redactStateForPlayer", () => {
  it("hides NPCs outside visible cells", () => {
    const state = {
      entities: {
        players: [{ id: "pc-seren", position: { x: 1, y: 1 } }],
        npcs: [
          { id: "npc-g1", position: { x: 5, y: 5 } },
          { id: "npc-g2", position: { x: 1, y: 2 } },
        ],
      },
    };
    const vis = new Set(["1,1", "1,2"]);
    const redacted = redactStateForPlayer(state, vis);
    assert.equal(redacted.entities.npcs[0].position, null);
    assert.equal(redacted.entities.npcs[0]._fogHidden, true);
    assert.deepEqual(redacted.entities.npcs[1].position, { x: 1, y: 2 });
    assert.equal(redacted.entities.npcs[1]._fogHidden, undefined);
  });

  it("does not modify original state", () => {
    const state = { entities: { npcs: [{ id: "n1", position: { x: 5, y: 5 } }] } };
    redactStateForPlayer(state, new Set());
    assert.deepEqual(state.entities.npcs[0].position, { x: 5, y: 5 });
  });

  it("handles state with no NPCs", () => {
    const state = { entities: { players: [] } };
    const redacted = redactStateForPlayer(state, new Set());
    assert.ok(redacted);
  });
});

// ── S3.6 Conflict Resolution ────────────────────────────────────────────

describe("createActionQueue", () => {
  it("creates empty queue", () => {
    const q = createActionQueue();
    assert.equal(q.queue.length, 0);
    assert.equal(q.seqCounter, 0);
  });
});

describe("enqueueAction + dequeueAction", () => {
  it("enqueues and assigns sequence number", () => {
    const q = createActionQueue();
    const { ok, entry } = enqueueAction(q, "p1", { type: "MOVE" }, 5);
    assert.equal(ok, true);
    assert.equal(entry.seq, 1);
    assert.equal(entry.clientId, "p1");
    assert.equal(entry.status, "pending");
    assert.equal(entry.clientEventSeq, 5);
  });

  it("dequeues in FIFO order", () => {
    const q = createActionQueue();
    enqueueAction(q, "p1", { type: "MOVE" });
    enqueueAction(q, "p2", { type: "ATTACK" });
    const first = dequeueAction(q);
    assert.equal(first.clientId, "p1");
    assert.equal(first.status, "processing");
    const second = dequeueAction(q);
    assert.equal(second.clientId, "p2");
  });

  it("returns null when queue is empty", () => {
    const q = createActionQueue();
    assert.equal(dequeueAction(q), null);
  });

  it("skips processing/resolved entries", () => {
    const q = createActionQueue();
    enqueueAction(q, "p1", { type: "MOVE" });
    enqueueAction(q, "p2", { type: "ATTACK" });
    const first = dequeueAction(q); // p1 → processing
    resolveQueueEntry(first, "resolved");
    const next = dequeueAction(q);
    assert.equal(next.clientId, "p2");
  });
});

describe("resolveQueueEntry", () => {
  it("marks entry as resolved", () => {
    const q = createActionQueue();
    const { entry } = enqueueAction(q, "p1", { type: "MOVE" });
    resolveQueueEntry(entry, "resolved");
    assert.equal(entry.status, "resolved");
    assert.ok(entry.resolvedAt);
  });

  it("marks entry as rejected with reason", () => {
    const q = createActionQueue();
    const { entry } = enqueueAction(q, "p1", { type: "MOVE" });
    resolveQueueEntry(entry, "rejected", "Not your turn");
    assert.equal(entry.status, "rejected");
    assert.equal(entry.reason, "Not your turn");
  });
});

describe("getQueueDepth", () => {
  it("counts pending entries", () => {
    const q = createActionQueue();
    enqueueAction(q, "p1", { type: "MOVE" });
    enqueueAction(q, "p2", { type: "ATTACK" });
    assert.equal(getQueueDepth(q), 2);
    dequeueAction(q); // p1 → processing
    assert.equal(getQueueDepth(q), 1);
  });
});

describe("pruneQueue", () => {
  it("removes resolved and rejected entries", () => {
    const q = createActionQueue();
    const { entry: e1 } = enqueueAction(q, "p1", { type: "MOVE" });
    const { entry: e2 } = enqueueAction(q, "p2", { type: "ATTACK" });
    enqueueAction(q, "p3", { type: "END_TURN" });
    resolveQueueEntry(e1, "resolved");
    resolveQueueEntry(e2, "rejected", "stale");
    const removed = pruneQueue(q);
    assert.equal(removed, 2);
    assert.equal(q.queue.length, 1);
    assert.equal(q.queue[0].clientId, "p3");
  });
});

describe("checkStaleAction", () => {
  it("detects stale action (client behind)", () => {
    const room = createRoom("r1");
    room.eventSeq = 10;
    const result = checkStaleAction(room, 5, 0);
    assert.equal(result.stale, true);
    assert.equal(result.behind, 5);
  });

  it("allows within tolerance", () => {
    const room = createRoom("r1");
    room.eventSeq = 10;
    assert.equal(checkStaleAction(room, 8, 2).stale, false);
    assert.equal(checkStaleAction(room, 9, 2).stale, false);
  });

  it("current seq is not stale", () => {
    const room = createRoom("r1");
    room.eventSeq = 5;
    assert.equal(checkStaleAction(room, 5, 0).stale, false);
  });
});

describe("validateTurnAuthority", () => {
  it("GM can always act", () => {
    const room = createRoom("r1");
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    const result = validateTurnAuthority(room, "gm1", { type: "MOVE", entityId: "npc-g1" }, "pc-seren");
    assert.equal(result.ok, true);
  });

  it("allows actions when no active entity (not in combat)", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = validateTurnAuthority(room, "p1", { type: "MOVE", entityId: "pc-seren" }, null);
    assert.equal(result.ok, true);
  });

  it("allows entity-less actions (ROLL_INITIATIVE)", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player" });
    const result = validateTurnAuthority(room, "p1", { type: "ROLL_INITIATIVE" }, "pc-seren");
    assert.equal(result.ok, true);
  });

  it("rejects if not active entity's turn", () => {
    const room = createRoom("r1");
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    const result = validateTurnAuthority(room, "p1", { type: "MOVE", entityId: "pc-seren" }, "pc-miri");
    assert.equal(result.ok, false);
    assert.match(result.reason, /Not your turn/);
  });

  it("rejects unknown client", () => {
    const room = createRoom("r1");
    assert.equal(validateTurnAuthority(room, "ghost", { type: "MOVE" }, "pc-seren").ok, false);
  });
});

describe("prepareOptimisticAck", () => {
  it("creates an ACK message", () => {
    const ack = prepareOptimisticAck("p1", { type: "MOVE" }, 3);
    assert.equal(ack.clientId, "p1");
    const parsed = JSON.parse(ack.message);
    assert.equal(parsed.type, "SERVER_ACTION_ACK");
    assert.equal(parsed.payload.status, "queued");
    assert.equal(parsed.payload.queueSeq, 3);
    assert.equal(parsed.payload.actionType, "MOVE");
  });
});

describe("processIncomingAction", () => {
  function setupRoom() {
    const room = createRoom("r1");
    addClient(room, "gm1", { displayName: "GM", role: "gm" });
    addClient(room, "p1", { displayName: "A", role: "player", entityId: "pc-seren" });
    addClient(room, "s1", { displayName: "V", role: "spectator" });
    return room;
  }

  it("accepts valid action from player on their turn", () => {
    const room = setupRoom();
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "p1", { type: "MOVE", entityId: "pc-seren" }, 0, "pc-seren");
    assert.equal(result.ok, true);
    assert.ok(result.entry);
    assert.ok(result.ack);
    assert.equal(result.entry.status, "pending");
  });

  it("rejects spectator", () => {
    const room = setupRoom();
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "s1", { type: "MOVE", entityId: "pc-seren" }, 0, "pc-seren");
    assert.equal(result.ok, false);
    assert.ok(result.rejection);
  });

  it("rejects wrong turn", () => {
    const room = setupRoom();
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "p1", { type: "MOVE", entityId: "pc-seren" }, 0, "npc-goblin");
    assert.equal(result.ok, false);
    assert.ok(result.rejection);
  });

  it("rejects stale action", () => {
    const room = setupRoom();
    room.eventSeq = 10;
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "p1", { type: "MOVE", entityId: "pc-seren" }, 2, "pc-seren", { staleTolerance: 2 });
    assert.equal(result.ok, false);
  });

  it("GM bypasses turn authority", () => {
    const room = setupRoom();
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "gm1", { type: "MOVE", entityId: "npc-goblin" }, 0, "pc-seren");
    assert.equal(result.ok, true);
  });

  it("allows stale within tolerance", () => {
    const room = setupRoom();
    room.eventSeq = 3;
    const q = createActionQueue();
    const result = processIncomingAction(room, q, "p1", { type: "MOVE", entityId: "pc-seren" }, 1, "pc-seren", { staleTolerance: 2 });
    assert.equal(result.ok, true);
  });
});
