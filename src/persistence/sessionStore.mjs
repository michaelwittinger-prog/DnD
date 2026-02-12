/**
 * sessionStore.mjs — MIR S2.1 Session Save/Load via IndexedDB.
 *
 * Provides a simple key-value store for game sessions.
 * Each session is stored as:
 *   { id, name, savedAt, gameState, actions }
 *
 * Browser-only module. Falls back gracefully if IndexedDB unavailable.
 */

const DB_NAME = "mir-tabletop";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

let dbInstance = null;

// ── Open/Init ───────────────────────────────────────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${event.target.error?.message}`));
    };
  });
}

// ── CRUD Operations ─────────────────────────────────────────────────────

/**
 * Save a game session.
 * @param {object} session - { id, name, savedAt, gameState, actions? }
 * @returns {Promise<void>}
 */
export async function saveSession(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record = {
      id: session.id,
      name: session.name || "Unnamed Session",
      savedAt: session.savedAt || new Date().toISOString(),
      gameState: session.gameState,
      actions: session.actions || [],
    };
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Save failed: ${e.target.error?.message}`));
  });
}

/**
 * Load a session by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(new Error(`Load failed: ${e.target.error?.message}`));
  });
}

/**
 * List all saved sessions (sorted by most recent first).
 * @returns {Promise<Array<{id, name, savedAt}>>}
 */
export async function listSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = (request.result || [])
        .map(({ id, name, savedAt }) => ({ id, name, savedAt }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      resolve(results);
    };
    request.onerror = (e) => reject(new Error(`List failed: ${e.target.error?.message}`));
  });
}

/**
 * Delete a session by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Delete failed: ${e.target.error?.message}`));
  });
}

/**
 * Delete all sessions (full reset).
 * @returns {Promise<void>}
 */
export async function clearAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Clear failed: ${e.target.error?.message}`));
  });
}

// ── Auto-Save Helper (S2.3) ────────────────────────────────────────────

let autoSaveId = null;
let autoSaveThrottleMs = 2000; // Don't save more often than every 2 seconds
let autoSaveTimer = null;

/**
 * Set up auto-save. Call scheduleAutoSave() after each dispatch.
 * @param {string} sessionId
 * @param {Function} getState - () => currentGameState
 * @param {Function} getActions - () => sessionActions array
 * @param {Function} [onSaved] - callback after save
 */
export function initAutoSave(sessionId, getState, getActions, onSaved) {
  autoSaveId = sessionId;
  return {
    schedule() {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(async () => {
        try {
          await saveSession({
            id: autoSaveId,
            name: getState().map?.name || "Session",
            savedAt: new Date().toISOString(),
            gameState: getState(),
            actions: getActions(),
          });
          if (onSaved) onSaved();
        } catch (err) {
          console.warn("[auto-save] Failed:", err.message);
        }
      }, autoSaveThrottleMs);
    },
  };
}

// ── Campaign Export/Import (S2.5) ──────────────────────────────────────

/**
 * Export a session as a downloadable JSON file.
 * @param {object} session - { id, name, gameState, actions }
 */
export function exportSessionToFile(session) {
  const bundle = {
    format: "mir-session",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    session: {
      id: session.id,
      name: session.name,
      gameState: session.gameState,
      actions: session.actions || [],
    },
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mir-session-${session.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import a session from a JSON file.
 * @param {File} file
 * @returns {Promise<object>} - { id, name, gameState, actions }
 */
export async function importSessionFromFile(file) {
  const text = await file.text();
  const bundle = JSON.parse(text);

  if (bundle.format !== "mir-session" || !bundle.session?.gameState) {
    throw new Error("Invalid session file format");
  }

  return bundle.session;
}
