/**
 * campaignStore.mjs — MIR S2.2 Campaign Model.
 *
 * A Campaign is an ordered list of sessions sharing entity rosters.
 * Stored in IndexedDB alongside sessions.
 *
 * Campaign shape:
 *   {
 *     id: string,
 *     name: string,
 *     createdAt: string (ISO),
 *     updatedAt: string (ISO),
 *     description: string,
 *     sessionIds: string[],       // ordered session references
 *     roster: EntityRoster[],     // persistent entity data across sessions
 *   }
 *
 * EntityRoster entry:
 *   { id, name, kind, stats, conditions, inventory }
 *
 * Browser-only module. Falls back gracefully if IndexedDB unavailable.
 */

const DB_NAME = "mir-tabletop";
const DB_VERSION = 2; // bumped from v1 to add campaigns store
const SESSION_STORE = "sessions";
const CAMPAIGN_STORE = "campaigns";

let dbInstance = null;

// ── Open/Init ───────────────────────────────────────────────────────────

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
      // Sessions store (from S2.1 — recreated if missing)
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const sStore = db.createObjectStore(SESSION_STORE, { keyPath: "id" });
        sStore.createIndex("savedAt", "savedAt", { unique: false });
        sStore.createIndex("name", "name", { unique: false });
      }
      // Campaigns store (S2.2)
      if (!db.objectStoreNames.contains(CAMPAIGN_STORE)) {
        const cStore = db.createObjectStore(CAMPAIGN_STORE, { keyPath: "id" });
        cStore.createIndex("updatedAt", "updatedAt", { unique: false });
        cStore.createIndex("name", "name", { unique: false });
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

// ── Campaign CRUD ───────────────────────────────────────────────────────

/**
 * Create a new campaign.
 * @param {{ name: string, description?: string }} opts
 * @returns {Promise<object>} — the created campaign
 */
export async function createCampaign({ name, description = "" }) {
  const db = await openDB();
  const campaign = {
    id: "campaign-" + Date.now(),
    name,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessionIds: [],
    roster: [],
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPAIGN_STORE, "readwrite");
    const store = tx.objectStore(CAMPAIGN_STORE);
    const request = store.put(campaign);
    request.onsuccess = () => resolve(campaign);
    request.onerror = (e) => reject(new Error(`Create campaign failed: ${e.target.error?.message}`));
  });
}

/**
 * Save/update a campaign.
 * @param {object} campaign — full campaign object
 * @returns {Promise<void>}
 */
export async function saveCampaign(campaign) {
  const db = await openDB();
  campaign.updatedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPAIGN_STORE, "readwrite");
    const store = tx.objectStore(CAMPAIGN_STORE);
    const request = store.put(campaign);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Save campaign failed: ${e.target.error?.message}`));
  });
}

/**
 * Load a campaign by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadCampaign(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPAIGN_STORE, "readonly");
    const store = tx.objectStore(CAMPAIGN_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(new Error(`Load campaign failed: ${e.target.error?.message}`));
  });
}

/**
 * List all campaigns (most recently updated first).
 * @returns {Promise<Array<{id, name, updatedAt, sessionCount}>>}
 */
export async function listCampaigns() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPAIGN_STORE, "readonly");
    const store = tx.objectStore(CAMPAIGN_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = (request.result || [])
        .map(({ id, name, updatedAt, sessionIds }) => ({
          id, name, updatedAt, sessionCount: sessionIds?.length ?? 0,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(results);
    };
    request.onerror = (e) => reject(new Error(`List campaigns failed: ${e.target.error?.message}`));
  });
}

/**
 * Delete a campaign by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCampaign(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CAMPAIGN_STORE, "readwrite");
    const store = tx.objectStore(CAMPAIGN_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Delete campaign failed: ${e.target.error?.message}`));
  });
}

// ── Session Management ──────────────────────────────────────────────────

/**
 * Add a session ID to a campaign's ordered session list.
 * @param {string} campaignId
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function addSessionToCampaign(campaignId, sessionId) {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign "${campaignId}" not found`);
  if (!campaign.sessionIds.includes(sessionId)) {
    campaign.sessionIds.push(sessionId);
  }
  await saveCampaign(campaign);
}

/**
 * Remove a session ID from a campaign.
 * @param {string} campaignId
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function removeSessionFromCampaign(campaignId, sessionId) {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign "${campaignId}" not found`);
  campaign.sessionIds = campaign.sessionIds.filter(id => id !== sessionId);
  await saveCampaign(campaign);
}

// ── Roster Management (S2.4 — character persistence) ────────────────────

/**
 * Update roster from a game state's entities (snapshot after session).
 * Merges player entity data into the persistent roster.
 *
 * @param {string} campaignId
 * @param {object} gameState — the post-session GameState
 * @returns {Promise<void>}
 */
export async function updateRosterFromState(campaignId, gameState) {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) throw new Error(`Campaign "${campaignId}" not found`);

  const players = gameState.entities?.players ?? [];
  for (const player of players) {
    const existing = campaign.roster.find(r => r.id === player.id);
    const entry = {
      id: player.id,
      name: player.name,
      kind: player.kind,
      stats: { ...player.stats },
      conditions: [...player.conditions.filter(c => c !== "dead")],
      inventory: player.inventory ? player.inventory.map(i => ({ ...i })) : [],
    };

    if (existing) {
      Object.assign(existing, entry);
    } else {
      campaign.roster.push(entry);
    }
  }

  await saveCampaign(campaign);
}

/**
 * Apply roster data to a game state (restore characters for next session).
 * Overwrites player entity stats/conditions/inventory from roster.
 *
 * @param {object} campaign — loaded campaign object
 * @param {object} gameState — GameState to modify (cloned)
 * @returns {object} — modified gameState
 */
export function applyRosterToState(campaign, gameState) {
  const state = structuredClone(gameState);
  for (const rosterEntry of campaign.roster) {
    const player = state.entities?.players?.find(p => p.id === rosterEntry.id);
    if (player) {
      player.stats = { ...rosterEntry.stats };
      player.conditions = [...rosterEntry.conditions];
      if (rosterEntry.inventory) {
        player.inventory = rosterEntry.inventory.map(i => ({ ...i }));
      }
    }
  }
  return state;
}

// ── Export/Import ───────────────────────────────────────────────────────

/**
 * Export campaign as a JSON bundle (for file download).
 * @param {object} campaign
 * @returns {object} — exportable bundle
 */
export function exportCampaign(campaign) {
  return {
    format: "mir-campaign",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    campaign: structuredClone(campaign),
  };
}

/**
 * Import a campaign from a JSON bundle.
 * @param {object} bundle — parsed JSON
 * @returns {object} — campaign object
 */
export function importCampaign(bundle) {
  if (bundle.format !== "mir-campaign" || !bundle.campaign?.id) {
    throw new Error("Invalid campaign file format");
  }
  return bundle.campaign;
}
