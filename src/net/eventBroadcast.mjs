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
};

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
