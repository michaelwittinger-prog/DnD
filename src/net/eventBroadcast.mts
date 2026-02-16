/**
 * eventBroadcast.mjs — MIR S3.1 WebSocket Event Broadcast.
 *
 * Manages connected clients and broadcasts EngineEvents.
 * Architecture: server-authoritative event sourcing.
 *
 * The server holds the canonical GameState.
 * Clients receive events (never raw state) and apply locally.
 *
 * Pure data structures + message protocol. No actual WebSocket
 * I/O — that lives in the server layer. This module handles:
 *   - Client registry (connect, disconnect, list)
 *   - Message protocol (encode/decode)
 *   - Event fan-out logic (which clients get which events)
 *   - Per-player fog filtering
 *
 * No side effects. No global state. All functions operate on
 * an explicit Room object.
 */

// ── Message Types ───────────────────────────────────────────────────────

/**
 * All message types in the MIR WebSocket protocol.
 */
export const MessageType = {
  // Client → Server
  CLIENT_JOIN: "CLIENT_JOIN",
  CLIENT_ACTION: "CLIENT_ACTION",
  CLIENT_PING: "CLIENT_PING",

  // Server → Client
  SERVER_WELCOME: "SERVER_WELCOME",
  SERVER_STATE_SYNC: "SERVER_STATE_SYNC",
  SERVER_EVENT: "SERVER_EVENT",
  SERVER_EVENTS_BATCH: "SERVER_EVENTS_BATCH",
  SERVER_REJECT: "SERVER_REJECT",
  SERVER_PONG: "SERVER_PONG",
  SERVER_PLAYER_JOINED: "SERVER_PLAYER_JOINED",
  SERVER_PLAYER_LEFT: "SERVER_PLAYER_LEFT",
  SERVER_TURN_NOTIFICATION: "SERVER_TURN_NOTIFICATION",
  SERVER_YOUR_TURN: "SERVER_YOUR_TURN",
  SERVER_COMBAT_END: "SERVER_COMBAT_END",
  SERVER_ROUND_START: "SERVER_ROUND_START",
};

// ── S3.2 Action Permissions ─────────────────────────────────────────────

/**
 * Per-role permission matrix.
 * Defines which action types each role can submit.
 */
export const ACTION_PERMISSIONS = {
  gm: {
    MOVE: true,
    ATTACK: true,
    ROLL_INITIATIVE: true,
    END_TURN: true,
    USE_ABILITY: true,
    LOAD_SCENARIO: true,
    RESET_GAME: true,
    SET_DIFFICULTY: true,
    KICK_PLAYER: true,
  },
  player: {
    MOVE: true,
    ATTACK: true,
    ROLL_INITIATIVE: true,
    END_TURN: true,
    USE_ABILITY: true,
    LOAD_SCENARIO: false,
    RESET_GAME: false,
    SET_DIFFICULTY: false,
    KICK_PLAYER: false,
  },
  spectator: {
    MOVE: false,
    ATTACK: false,
    ROLL_INITIATIVE: false,
    END_TURN: false,
    USE_ABILITY: false,
    LOAD_SCENARIO: false,
    RESET_GAME: false,
    SET_DIFFICULTY: false,
    KICK_PLAYER: false,
  },
};

/**
 * Check if a role can perform a specific action type.
 *
 * @param {string} role — "gm" | "player" | "spectator"
 * @param {string} actionType — e.g. "MOVE", "ATTACK", "LOAD_SCENARIO"
 * @returns {boolean}
 */
export function canPerformAction(role, actionType) {
  const perms = ACTION_PERMISSIONS[role];
  if (!perms) return false;
  // Unknown action types: GM can, others can't
  return perms[actionType] ?? (role === "gm");
}

/**
 * Full permission check: role + action type + entity ownership.
 *
 * @param {object} room
 * @param {string} clientId
 * @param {object} action — DeclaredAction with type and optionally entityId
 * @returns {{ authorized: boolean, reason?: string }}
 */
export function validateActionPermission(room, clientId, action) {
  const client = getClient(room, clientId);
  if (!client) return { authorized: false, reason: "Unknown client" };

  // Check role can perform this action type
  if (!canPerformAction(client.role, action.type)) {
    return { authorized: false, reason: `Role "${client.role}" cannot perform action "${action.type}"` };
  }

  // For players, check entity ownership
  if (client.role === "player") {
    const actionEntityId = action.entityId || action.attackerId || action.casterId;
    if (actionEntityId && actionEntityId !== client.entityId) {
      return { authorized: false, reason: `You can only control entity "${client.entityId}"` };
    }
  }

  return { authorized: true };
}

/**
 * Assign an entity to a client.
 *
 * @param {object} room
 * @param {string} clientId
 * @param {string} entityId
 * @returns {{ ok: boolean, error?: string }}
 */
export function assignEntityToClient(room, clientId, entityId) {
  const client = getClient(room, clientId);
  if (!client) return { ok: false, error: "Unknown client" };

  // Check if entity is already assigned to another client
  for (const c of room.clients.values()) {
    if (c.clientId !== clientId && c.entityId === entityId) {
      return { ok: false, error: `Entity "${entityId}" is already assigned to "${c.displayName}"` };
    }
  }

  client.entityId = entityId;
  return { ok: true };
}

/**
 * Unassign entity from a client.
 *
 * @param {object} room
 * @param {string} clientId
 * @returns {{ ok: boolean, error?: string }}
 */
export function unassignEntity(room, clientId) {
  const client = getClient(room, clientId);
  if (!client) return { ok: false, error: "Unknown client" };
  client.entityId = null;
  return { ok: true };
}

/**
 * Get which client controls a given entity.
 *
 * @param {object} room
 * @param {string} entityId
 * @returns {ClientInfo|null}
 */
export function getEntityController(room, entityId) {
  for (const c of room.clients.values()) {
    if (c.entityId === entityId) return c;
  }
  return null;
}

// ── S3.3 Room Codes & Registry ──────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion

/**
 * Generate a random 6-character room code.
 *
 * @param {number} [length=6]
 * @returns {string}
 */
export function generateRoomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Create a room registry (manages multiple rooms).
 *
 * @returns {object} — RoomRegistry
 */
export function createRoomRegistry() {
  return {
    rooms: new Map(),     // roomId → Room
    codeIndex: new Map(), // code → roomId
  };
}

/**
 * Create a room in a registry and assign a join code.
 *
 * @param {object} registry — RoomRegistry
 * @param {string} roomId
 * @param {object} [options] — room options + gmClientId
 * @returns {{ ok: boolean, room?: object, code?: string, error?: string }}
 */
export function registryCreateRoom(registry, roomId, options = {}) {
  if (registry.rooms.has(roomId)) {
    return { ok: false, error: `Room "${roomId}" already exists` };
  }

  // Generate unique code
  let code;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
  } while (registry.codeIndex.has(code) && attempts < 100);

  if (attempts >= 100) {
    return { ok: false, error: "Failed to generate unique room code" };
  }

  const room = createRoom(roomId, options);
  room.code = code;
  room.gmClientId = options.gmClientId || null;

  registry.rooms.set(roomId, room);
  registry.codeIndex.set(code, roomId);

  return { ok: true, room, code };
}

/**
 * Find a room by join code.
 *
 * @param {object} registry
 * @param {string} code — 6-char room code
 * @returns {object|null} — Room or null
 */
export function findRoomByCode(registry, code) {
  const roomId = registry.codeIndex.get(code.toUpperCase());
  if (!roomId) return null;
  return registry.rooms.get(roomId) || null;
}

/**
 * List all rooms in the registry (for GM lobby view).
 *
 * @param {object} registry
 * @returns {Array<{ roomId: string, code: string, playerCount: number, maxPlayers: number }>}
 */
export function listRooms(registry) {
  const result = [];
  for (const room of registry.rooms.values()) {
    result.push({
      roomId: room.id,
      code: room.code || "N/A",
      playerCount: room.clients.size,
      maxPlayers: room.maxPlayers,
    });
  }
  return result;
}

/**
 * Remove a room from the registry.
 *
 * @param {object} registry
 * @param {string} roomId
 * @returns {boolean}
 */
export function registryRemoveRoom(registry, roomId) {
  const room = registry.rooms.get(roomId);
  if (!room) return false;
  if (room.code) registry.codeIndex.delete(room.code);
  return registry.rooms.delete(roomId);
}

/**
 * Join a room via code.
 *
 * @param {object} registry
 * @param {string} code — 6-char room code
 * @param {string} clientId
 * @param {{ displayName: string, role: string, entityId?: string }} info
 * @returns {{ ok: boolean, room?: object, error?: string }}
 */
export function joinRoomByCode(registry, code, clientId, info) {
  const room = findRoomByCode(registry, code);
  if (!room) return { ok: false, error: "Invalid room code" };

  const result = addClient(room, clientId, info);
  if (!result.ok) return result;

  return { ok: true, room };
}

// ── Room Management ─────────────────────────────────────────────────────

/**
 * Create a new room.
 *
 * @param {string} roomId — unique room identifier
 * @param {object} [options] — room options
 * @param {number} [options.maxPlayers=6] — max connected players
 * @param {boolean} [options.perPlayerFog=false] — enable per-player fog filtering
 * @returns {object} — Room object
 */
export function createRoom(roomId, options = {}) {
  return {
    id: roomId,
    createdAt: new Date().toISOString(),
    maxPlayers: options.maxPlayers ?? 6,
    perPlayerFog: options.perPlayerFog ?? false,
    clients: new Map(),   // clientId → ClientInfo
    eventSeq: 0,          // monotonic event sequence number
  };
}

/**
 * @typedef {object} ClientInfo
 * @property {string} clientId
 * @property {string} displayName
 * @property {string} role — "gm" | "player" | "spectator"
 * @property {string|null} entityId — controlled entity (null for GM/spectator)
 * @property {number} joinedAt — timestamp
 * @property {number} lastPing — timestamp of last ping
 */

/**
 * Add a client to a room.
 *
 * @param {object} room — Room object
 * @param {string} clientId
 * @param {{ displayName: string, role: string, entityId?: string }} info
 * @returns {{ ok: boolean, error?: string }}
 */
export function addClient(room, clientId, info) {
  if (room.clients.size >= room.maxPlayers) {
    return { ok: false, error: "Room is full" };
  }
  if (room.clients.has(clientId)) {
    return { ok: false, error: "Client already connected" };
  }
  const validRoles = ["gm", "player", "spectator"];
  if (!validRoles.includes(info.role)) {
    return { ok: false, error: `Invalid role "${info.role}". Must be: ${validRoles.join(", ")}` };
  }

  room.clients.set(clientId, {
    clientId,
    displayName: info.displayName || "Anonymous",
    role: info.role,
    entityId: info.entityId || null,
    joinedAt: Date.now(),
    lastPing: Date.now(),
  });

  return { ok: true };
}

/**
 * Remove a client from a room.
 *
 * @param {object} room
 * @param {string} clientId
 * @returns {boolean} — true if client was removed
 */
export function removeClient(room, clientId) {
  return room.clients.delete(clientId);
}

/**
 * Get a client by ID.
 *
 * @param {object} room
 * @param {string} clientId
 * @returns {ClientInfo|null}
 */
export function getClient(room, clientId) {
  return room.clients.get(clientId) || null;
}

/**
 * List all clients in a room.
 *
 * @param {object} room
 * @returns {ClientInfo[]}
 */
export function listClients(room) {
  return Array.from(room.clients.values());
}

/**
 * Update last ping timestamp for a client.
 *
 * @param {object} room
 * @param {string} clientId
 */
export function touchClient(room, clientId) {
  const client = room.clients.get(clientId);
  if (client) client.lastPing = Date.now();
}

/**
 * Find stale clients (no ping in `timeoutMs`).
 *
 * @param {object} room
 * @param {number} [timeoutMs=30000] — 30 seconds default
 * @returns {ClientInfo[]}
 */
export function findStaleClients(room, timeoutMs = 30000) {
  const now = Date.now();
  return listClients(room).filter(c => now - c.lastPing > timeoutMs);
}

// ── Message Protocol ────────────────────────────────────────────────────

/**
 * Encode a message for sending over WebSocket.
 *
 * @param {string} type — MessageType
 * @param {object} payload
 * @param {object} [meta] — optional metadata
 * @returns {string} — JSON string
 */
export function encodeMessage(type, payload, meta = {}) {
  return JSON.stringify({
    type,
    payload,
    seq: meta.seq ?? null,
    timestamp: new Date().toISOString(),
    ...meta,
  });
}

/**
 * Decode a WebSocket message.
 *
 * @param {string} raw — raw JSON string
 * @returns {{ ok: boolean, message?: object, error?: string }}
 */
export function decodeMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (!msg.type) return { ok: false, error: "Missing message type" };
    return { ok: true, message: msg };
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}` };
  }
}

// ── Welcome Message ─────────────────────────────────────────────────────

/**
 * Create a SERVER_WELCOME message for a newly connected client.
 *
 * @param {object} room
 * @param {string} clientId
 * @param {object} gameState — current game state to sync
 * @returns {string} — encoded message
 */
export function createWelcomeMessage(room, clientId, gameState) {
  const client = getClient(room, clientId);
  return encodeMessage(MessageType.SERVER_WELCOME, {
    roomId: room.id,
    clientId,
    role: client?.role || "spectator",
    entityId: client?.entityId || null,
    players: listClients(room).map(c => ({
      clientId: c.clientId,
      displayName: c.displayName,
      role: c.role,
      entityId: c.entityId,
    })),
    gameState,
  });
}

// ── Event Broadcasting ──────────────────────────────────────────────────

/**
 * Prepare event messages for broadcasting to all clients.
 * Returns a list of { clientId, message } pairs.
 *
 * If perPlayerFog is enabled, events may be filtered per client.
 * For now, all clients receive all events (fog filtering = future S3.4).
 *
 * @param {object} room
 * @param {object[]} events — array of EngineEvents
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareBroadcast(room, events) {
  if (!events || events.length === 0) return [];

  room.eventSeq += 1;
  const seq = room.eventSeq;

  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_EVENTS_BATCH, {
    events,
    eventCount: events.length,
  }, { seq });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a single event message for broadcasting.
 *
 * @param {object} room
 * @param {object} event — single EngineEvent
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareSingleEventBroadcast(room, event) {
  room.eventSeq += 1;
  const seq = room.eventSeq;

  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_EVENT, { event }, { seq });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a turn notification message.
 *
 * @param {object} room
 * @param {string} activeEntityId — entity whose turn it is
 * @param {number} round — current combat round
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareTurnNotification(room, activeEntityId, round) {
  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_TURN_NOTIFICATION, {
    activeEntityId,
    round,
  });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a player-joined notification.
 *
 * @param {object} room
 * @param {string} newClientId — the client that joined
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function preparePlayerJoinedNotification(room, newClientId) {
  const newClient = getClient(room, newClientId);
  if (!newClient) return [];

  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_PLAYER_JOINED, {
    clientId: newClient.clientId,
    displayName: newClient.displayName,
    role: newClient.role,
    entityId: newClient.entityId,
  });

  for (const client of room.clients.values()) {
    if (client.clientId === newClientId) continue; // don't notify self
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a player-left notification.
 *
 * @param {object} room
 * @param {string} leftClientId
 * @param {string} displayName
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function preparePlayerLeftNotification(room, leftClientId, displayName) {
  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_PLAYER_LEFT, {
    clientId: leftClientId,
    displayName,
  });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a rejection message for a specific client.
 *
 * @param {string} clientId
 * @param {string} reason
 * @param {object} [originalAction] — the action that was rejected
 * @returns {{ clientId: string, message: string }}
 */
export function prepareRejectMessage(clientId, reason, originalAction = null) {
  return {
    clientId,
    message: encodeMessage(MessageType.SERVER_REJECT, {
      reason,
      originalAction,
    }),
  };
}

// ── Action Authorization ────────────────────────────────────────────────

/**
 * Check if a client is authorized to submit an action.
 *
 * Rules:
 * - GM can submit any action
 * - Player can only submit actions for their controlled entity
 * - Spectators cannot submit actions
 *
 * @param {object} room
 * @param {string} clientId
 * @param {object} action — DeclaredAction
 * @returns {{ authorized: boolean, reason?: string }}
 */
export function authorizeAction(room, clientId, action) {
  const client = getClient(room, clientId);
  if (!client) return { authorized: false, reason: "Unknown client" };

  if (client.role === "spectator") {
    return { authorized: false, reason: "Spectators cannot submit actions" };
  }

  if (client.role === "gm") {
    return { authorized: true }; // GM can do anything
  }

  // Player role — check entity ownership
  if (client.role === "player") {
    const actionEntityId = action.entityId || action.attackerId || action.casterId;
    if (!actionEntityId) {
      // Actions without entity (e.g., ROLL_INITIATIVE) — allow for players
      return { authorized: true };
    }
    if (actionEntityId !== client.entityId) {
      return { authorized: false, reason: `You can only control entity "${client.entityId}"` };
    }
    return { authorized: true };
  }

  return { authorized: false, reason: "Unknown role" };
}

// ── State Sync ──────────────────────────────────────────────────────────

/**
 * Create a full state sync message for a specific client.
 * Used for reconnection or initial sync.
 *
 * @param {object} room
 * @param {string} clientId
 * @param {object} gameState
 * @returns {{ clientId: string, message: string }}
 */
export function prepareStateSync(room, clientId, gameState) {
  return {
    clientId,
    message: encodeMessage(MessageType.SERVER_STATE_SYNC, {
      gameState,
      eventSeq: room.eventSeq,
    }),
  };
}

// ── S3.5 Enhanced Turn Notifications ────────────────────────────────────

/**
 * Prepare a YOUR_TURN notification targeted to the player
 * who controls the active entity.
 *
 * @param {object} room
 * @param {string} activeEntityId — entity whose turn it is
 * @param {number} round — current combat round
 * @returns {{ clientId: string, message: string }|null} — null if no player controls entity
 */
export function prepareYourTurnNotification(room, activeEntityId, round) {
  const controller = getEntityController(room, activeEntityId);
  if (!controller) return null;

  return {
    clientId: controller.clientId,
    message: encodeMessage(MessageType.SERVER_YOUR_TURN, {
      entityId: activeEntityId,
      entityName: activeEntityId, // caller can override with real name
      round,
      message: `It's your turn! (${activeEntityId})`,
    }),
  };
}

/**
 * Prepare a combat end notification for all clients.
 *
 * @param {object} room
 * @param {string} result — e.g. "players_win", "npcs_win", "draw"
 * @param {object} [details] — additional details (rounds, kills, etc.)
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareCombatEndNotification(room, result, details = {}) {
  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_COMBAT_END, {
    result,
    ...details,
  });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

/**
 * Prepare a round start notification for all clients.
 *
 * @param {object} room
 * @param {number} round — the new round number
 * @param {string[]} [initiativeOrder] — turn order for the round
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareRoundStartNotification(room, round, initiativeOrder = []) {
  const messages = [];
  const encoded = encodeMessage(MessageType.SERVER_ROUND_START, {
    round,
    initiativeOrder,
  });

  for (const client of room.clients.values()) {
    messages.push({
      clientId: client.clientId,
      message: encoded,
    });
  }

  return messages;
}

// ── S3.4 Per-Player Fog of War ──────────────────────────────────────────

/**
 * Extract the position associated with an event (for fog visibility check).
 * Returns { x, y } or null if the event has no spatial component.
 *
 * @param {object} event — EngineEvent
 * @returns {{ x: number, y: number }|null}
 */
export function getEventPosition(event) {
  const p = event.payload || event;

  // MOVE events — use destination
  if (p.finalPosition) return p.finalPosition;
  if (p.to) return p.to;
  if (p.position) return p.position;

  // ATTACK events — use target position
  if (p.targetPosition) return p.targetPosition;

  // Generic — use entityPosition or origin
  if (p.entityPosition) return p.entityPosition;
  if (p.origin) return p.origin;

  return null;
}

/**
 * Check if an event is visible to a given set of visible cells.
 *
 * Rules:
 * - Events with no spatial component (INITIATIVE, COMBAT_END, TURN_ENDED) → always visible
 * - Events with a position → visible if position is in visibleCells set
 * - MOVE events → visible if EITHER origin or destination is visible
 *
 * @param {object} event
 * @param {Set<string>} visibleCells — Set of "x,y" keys
 * @returns {boolean}
 */
export function isEventVisible(event, visibleCells) {
  const type = event.type || "";

  // Global events are always visible
  const globalTypes = [
    "INITIATIVE_ROLLED", "INITIATIVE_SET", "COMBAT_END",
    "TURN_ENDED", "ROUND_START", "ACTION_REJECTED",
  ];
  if (globalTypes.includes(type)) return true;

  const p = event.payload || event;

  // MOVE events: visible if origin OR destination is visible
  if (type === "MOVE_APPLIED") {
    const from = p.from || p.originalPosition;
    const to = p.finalPosition || p.to;
    if (from && visibleCells.has(`${from.x},${from.y}`)) return true;
    if (to && visibleCells.has(`${to.x},${to.y}`)) return true;
    return false;
  }

  // ATTACK events: visible if attacker OR target position is visible
  if (type === "ATTACK_RESOLVED") {
    if (p.attackerPosition && visibleCells.has(`${p.attackerPosition.x},${p.attackerPosition.y}`)) return true;
    if (p.targetPosition && visibleCells.has(`${p.targetPosition.x},${p.targetPosition.y}`)) return true;
    // Fallback to generic position check
    const pos = getEventPosition(event);
    if (pos) return visibleCells.has(`${pos.x},${pos.y}`);
    return true; // if no position data, show it
  }

  // All other events: check position
  const pos = getEventPosition(event);
  if (!pos) return true; // no position → always visible
  return visibleCells.has(`${pos.x},${pos.y}`);
}

/**
 * Filter events for a specific client based on their entity's vision.
 *
 * @param {object} client — ClientInfo
 * @param {object[]} events — array of EngineEvents
 * @param {Set<string>} visibleCells — visible cells for this client's entity
 * @returns {object[]} — filtered events
 */
export function filterEventsForClient(client, events, visibleCells) {
  // GM and spectators see everything
  if (client.role === "gm" || client.role === "spectator") {
    return events;
  }

  // No entity → see global events only
  if (!client.entityId) {
    return events.filter(e => {
      const type = e.type || "";
      return ["INITIATIVE_ROLLED", "INITIATIVE_SET", "COMBAT_END",
              "TURN_ENDED", "ROUND_START", "ACTION_REJECTED"].includes(type);
    });
  }

  return events.filter(e => isEventVisible(e, visibleCells));
}

/**
 * Fog-aware broadcast: each player gets only events they can see.
 *
 * @param {object} room
 * @param {object[]} events — array of EngineEvents
 * @param {object} gameState — current GameState (for visibility computation)
 * @param {function} computeVisibleCellsFn — (state, entityId) => Set<string>
 * @returns {Array<{ clientId: string, message: string }>}
 */
export function prepareFogAwareBroadcast(room, events, gameState, computeVisibleCellsFn) {
  if (!events || events.length === 0) return [];

  room.eventSeq += 1;
  const seq = room.eventSeq;

  // If fog is disabled, broadcast everything to everyone
  if (!room.perPlayerFog) {
    const encoded = encodeMessage(MessageType.SERVER_EVENTS_BATCH, {
      events,
      eventCount: events.length,
    }, { seq });

    const messages = [];
    for (const client of room.clients.values()) {
      messages.push({ clientId: client.clientId, message: encoded });
    }
    return messages;
  }

  // Fog enabled: filter per client
  const messages = [];
  for (const client of room.clients.values()) {
    let clientEvents;

    if (client.role === "gm" || client.role === "spectator") {
      clientEvents = events;
    } else if (!client.entityId) {
      clientEvents = filterEventsForClient(client, events, new Set());
    } else {
      const visibleCells = computeVisibleCellsFn(gameState, client.entityId);
      clientEvents = filterEventsForClient(client, events, visibleCells);
    }

    if (clientEvents.length > 0) {
      const encoded = encodeMessage(MessageType.SERVER_EVENTS_BATCH, {
        events: clientEvents,
        eventCount: clientEvents.length,
      }, { seq });
      messages.push({ clientId: client.clientId, message: encoded });
    }
  }

  return messages;
}

/**
 * Redact NPC positions from game state for a player who can't see them.
 *
 * @param {object} gameState — full GameState
 * @param {Set<string>} visibleCells — cells the player can see
 * @returns {object} — redacted copy of gameState
 */
export function redactStateForPlayer(gameState, visibleCells) {
  const redacted = JSON.parse(JSON.stringify(gameState));

  if (redacted.entities?.npcs) {
    redacted.entities.npcs = redacted.entities.npcs.map(npc => {
      const pos = npc.position;
      if (pos && !visibleCells.has(`${pos.x},${pos.y}`)) {
        return {
          ...npc,
          position: null, // hidden
          _fogHidden: true,
        };
      }
      return npc;
    });
  }

  return redacted;
}

// ── S3.6 Conflict Resolution ────────────────────────────────────────────

/**
 * Create an action queue for a room.
 *
 * @returns {object} — ActionQueue
 */
export function createActionQueue() {
  return {
    queue: [],         // ordered action entries
    seqCounter: 0,     // monotonic sequence number
  };
}

/**
 * Enqueue an action from a client.
 *
 * @param {object} actionQueue — ActionQueue
 * @param {string} clientId
 * @param {object} action — DeclaredAction
 * @param {number} clientEventSeq — client's last known eventSeq
 * @returns {{ ok: boolean, entry?: object, error?: string }}
 */
export function enqueueAction(actionQueue, clientId, action, clientEventSeq = 0) {
  actionQueue.seqCounter += 1;
  const entry = {
    seq: actionQueue.seqCounter,
    clientId,
    action,
    clientEventSeq,
    enqueuedAt: Date.now(),
    status: "pending",   // pending | processing | resolved | rejected
  };
  actionQueue.queue.push(entry);
  return { ok: true, entry };
}

/**
 * Dequeue the next pending action.
 *
 * @param {object} actionQueue
 * @returns {object|null} — next pending entry or null
 */
export function dequeueAction(actionQueue) {
  const idx = actionQueue.queue.findIndex(e => e.status === "pending");
  if (idx === -1) return null;
  actionQueue.queue[idx].status = "processing";
  return actionQueue.queue[idx];
}

/**
 * Resolve an action entry (mark as completed).
 *
 * @param {object} entry — action queue entry
 * @param {string} status — "resolved" | "rejected"
 * @param {string} [reason] — rejection reason
 */
export function resolveQueueEntry(entry, status, reason = null) {
  entry.status = status;
  entry.resolvedAt = Date.now();
  if (reason) entry.reason = reason;
}

/**
 * Get queue depth (number of pending actions).
 *
 * @param {object} actionQueue
 * @returns {number}
 */
export function getQueueDepth(actionQueue) {
  return actionQueue.queue.filter(e => e.status === "pending").length;
}

/**
 * Clear resolved/rejected entries from the queue.
 *
 * @param {object} actionQueue
 * @returns {number} — number of entries cleared
 */
export function pruneQueue(actionQueue) {
  const before = actionQueue.queue.length;
  actionQueue.queue = actionQueue.queue.filter(
    e => e.status === "pending" || e.status === "processing"
  );
  return before - actionQueue.queue.length;
}

/**
 * Check if a client's action is stale (based on eventSeq).
 * An action is stale if the client's eventSeq is behind the room's.
 *
 * @param {object} room
 * @param {number} clientEventSeq — the seq the client last saw
 * @param {number} [tolerance=0] — how many events behind is acceptable
 * @returns {{ stale: boolean, behind: number }}
 */
export function checkStaleAction(room, clientEventSeq, tolerance = 0) {
  const behind = room.eventSeq - clientEventSeq;
  return {
    stale: behind > tolerance,
    behind,
  };
}

/**
 * Validate action is for the active turn entity (server authority).
 *
 * @param {object} room
 * @param {string} clientId
 * @param {object} action
 * @param {string|null} activeEntityId — whose turn it currently is
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateTurnAuthority(room, clientId, action, activeEntityId) {
  const client = getClient(room, clientId);
  if (!client) return { ok: false, reason: "Unknown client" };

  // GM can always act
  if (client.role === "gm") return { ok: true };

  // If not in combat (no activeEntity), allow
  if (!activeEntityId) return { ok: true };

  // Actions without entity (ROLL_INITIATIVE) — allow
  const actionEntityId = action.entityId || action.attackerId || action.casterId;
  if (!actionEntityId) return { ok: true };

  // Entity must match active entity
  if (actionEntityId !== activeEntityId) {
    return { ok: false, reason: `Not your turn. Active entity is "${activeEntityId}"` };
  }

  return { ok: true };
}

/**
 * Prepare an optimistic acknowledgment for the client.
 * Sent immediately on action receipt, before processing.
 *
 * @param {string} clientId
 * @param {object} action
 * @param {number} queueSeq — position in the action queue
 * @returns {{ clientId: string, message: string }}
 */
export function prepareOptimisticAck(clientId, action, queueSeq) {
  return {
    clientId,
    message: encodeMessage("SERVER_ACTION_ACK", {
      status: "queued",
      queueSeq,
      actionType: action.type,
    }),
  };
}

/**
 * Full server-authoritative action processing pipeline.
 *
 * 1. Check permissions
 * 2. Check turn authority
 * 3. Check staleness
 * 4. Enqueue
 *
 * @param {object} room
 * @param {object} actionQueue
 * @param {string} clientId
 * @param {object} action
 * @param {number} clientEventSeq
 * @param {string|null} activeEntityId
 * @param {object} [options]
 * @param {number} [options.staleTolerance=2]
 * @returns {{ ok: boolean, entry?: object, ack?: object, rejection?: object }}
 */
export function processIncomingAction(room, actionQueue, clientId, action, clientEventSeq, activeEntityId, options = {}) {
  const staleTolerance = options.staleTolerance ?? 2;

  // 1. Permission check
  const perm = validateActionPermission(room, clientId, action);
  if (!perm.authorized) {
    return {
      ok: false,
      rejection: prepareRejectMessage(clientId, perm.reason, action),
    };
  }

  // 2. Turn authority check
  const turn = validateTurnAuthority(room, clientId, action, activeEntityId);
  if (!turn.ok) {
    return {
      ok: false,
      rejection: prepareRejectMessage(clientId, turn.reason, action),
    };
  }

  // 3. Staleness check
  const stale = checkStaleAction(room, clientEventSeq, staleTolerance);
  if (stale.stale) {
    return {
      ok: false,
      rejection: prepareRejectMessage(clientId, `Action is stale (${stale.behind} events behind)`, action),
    };
  }

  // 4. Enqueue
  const { entry } = enqueueAction(actionQueue, clientId, action, clientEventSeq);
  const ack = prepareOptimisticAck(clientId, action, entry.seq);

  return { ok: true, entry, ack };
}
