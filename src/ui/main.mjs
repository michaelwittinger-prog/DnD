/**
 * main.mjs — MIR 3.3 Tabletop Engine UI entry point.
 *
 * Wires GameState + engine + renderers + input controller.
 * All state changes flow through applyAction. The UI never
 * modifies game-meaningful state directly.
 */

import { applyAction } from "../engine/applyAction.mjs";
import { proposeActionMock } from "../ai/aiClient.mjs";
import { explorationExample, demoEncounter } from "../state/exampleStates.mjs";
import { stateHash } from "../replay/hash.mjs";
import { renderGrid } from "./renderGrid.mjs";
import { renderTokens } from "./renderTokens.mjs";
import { initInputController } from "./inputController.mjs";

// ── Constants ───────────────────────────────────────────────────────────

const CELL_PX = 40; // pixels per grid cell

// ── State ───────────────────────────────────────────────────────────────

let gameState = structuredClone(explorationExample);

// Enable seeded RNG so initiative and attacks work deterministically
gameState.rng.mode = "seeded";
gameState.rng.seed = "ui-session-" + Date.now();

// Track session for replay export
const sessionInitialState = structuredClone(gameState);
const sessionActions = [];

// ── DOM refs ────────────────────────────────────────────────────────────

const canvas = document.getElementById("battlemap");
const ctx = canvas.getContext("2d");
const mapNameEl = document.getElementById("map-name");
const combatStatusEl = document.getElementById("combat-status");
const selectedInfoEl = document.getElementById("selected-info");
const initiativeListEl = document.getElementById("initiative-list");
const eventLogEl = document.getElementById("event-log");
const actionFeedbackEl = document.getElementById("action-feedback");
const seedDisplayEl = document.getElementById("seed-display");

// ── Render ──────────────────────────────────────────────────────────────

function render() {
  const { width, height } = gameState.map.grid.size;

  // Size canvas
  canvas.width = width * CELL_PX;
  canvas.height = height * CELL_PX;

  // Draw grid + tokens
  renderGrid(ctx, gameState, CELL_PX);
  renderTokens(ctx, gameState, CELL_PX);

  // Update sidebar
  renderHeader();
  renderSelectedInfo();
  renderInitiativeOrder();
  renderEventLog();
  renderSeedDisplay();
  updateButtonStates();
  updateIndicators();
}

function renderHeader() {
  mapNameEl.textContent = gameState.map.name;

  const mode = gameState.combat.mode;
  combatStatusEl.textContent = mode === "combat"
    ? `⚔ Combat — Round ${gameState.combat.round}`
    : "🌿 Exploration";
  combatStatusEl.className = mode;
}

function renderSelectedInfo() {
  const id = gameState.ui.selectedEntityId;
  if (!id) {
    selectedInfoEl.innerHTML = "Click a token to select";
    return;
  }

  const ent = findEntity(id);
  if (!ent) {
    selectedInfoEl.innerHTML = "Click a token to select";
    return;
  }

  const conditions = ent.conditions.length > 0
    ? `<div class="entity-conditions">${ent.conditions.join(", ")}</div>`
    : "";

  selectedInfoEl.innerHTML = `
    <div class="entity-name">${ent.name}</div>
    <div>${ent.kind} · ${ent.id}</div>
    <div class="entity-hp">HP: ${ent.stats.hpCurrent}/${ent.stats.hpMax}</div>
    <div class="entity-ac">AC: ${ent.stats.ac} · Speed: ${ent.stats.movementSpeed}</div>
    <div>Position: (${ent.position.x}, ${ent.position.y})</div>
    ${conditions}
  `;
}

function renderInitiativeOrder() {
  if (gameState.combat.mode !== "combat") {
    initiativeListEl.innerHTML = "<li>—</li>";
    return;
  }

  initiativeListEl.innerHTML = gameState.combat.initiativeOrder
    .map((id) => {
      const ent = findEntity(id);
      const name = ent ? ent.name : id;
      const isActive = id === gameState.combat.activeEntityId;
      return `<li class="${isActive ? "active" : ""}">${isActive ? "▸ " : ""}${name}</li>`;
    })
    .join("");
}

function renderEventLog() {
  const events = gameState.log.events;
  const last10 = events.slice(-10).reverse();

  eventLogEl.innerHTML = last10
    .map((evt) => {
      const detail = formatEventDetail(evt);
      return `<li><span class="evt-type">${evt.type}</span> <span class="evt-detail">${detail}</span></li>`;
    })
    .join("");
}

function formatEventDetail(evt) {
  const p = evt.payload;
  switch (evt.type) {
    case "MOVE_APPLIED":
      return `${p.entityId} → (${p.finalPosition.x},${p.finalPosition.y})`;
    case "ATTACK_RESOLVED":
      return `${p.attackerId}→${p.targetId} roll:${p.attackRoll} ${p.hit ? "HIT" : "miss"} dmg:${p.damage}`;
    case "INITIATIVE_ROLLED":
      return p.order.map((o) => `${o.entityId}:${o.roll}`).join(", ");
    case "TURN_ENDED":
      return `${p.entityId}→${p.nextEntityId} r${p.round}`;
    case "RNG_SEED_SET":
      return `seed=${p.nextSeed}`;
    case "ACTION_REJECTED":
      return p.reasons?.[0] || "rejected";
    default:
      return JSON.stringify(p).slice(0, 60);
  }
}

function renderSeedDisplay() {
  if (seedDisplayEl) {
    const seed = gameState.rng.seed || "(none)";
    const mode = gameState.rng.mode;
    seedDisplayEl.textContent = `${mode}: ${seed}`;
  }
}

function updateButtonStates() {
  const btnRollInit = document.getElementById("btn-roll-init");
  const btnEndTurn = document.getElementById("btn-end-turn");
  const btnAttack = document.getElementById("btn-attack");

  const inCombat = gameState.combat.mode === "combat";

  btnRollInit.disabled = inCombat;
  btnEndTurn.disabled = !inCombat;
  btnAttack.disabled = !gameState.ui.selectedEntityId;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function findEntity(id) {
  const all = [
    ...gameState.entities.players,
    ...gameState.entities.npcs,
    ...gameState.entities.objects,
  ];
  return all.find((e) => e.id === id) || null;
}

// ── Dispatch ────────────────────────────────────────────────────────────

function dispatch(action) {
  const result = applyAction(gameState, action);

  // Track for replay export
  sessionActions.push(structuredClone(action));

  if (result.success) {
    gameState = result.nextState;
    showFeedback(`✓ ${action.type}`, true);
  } else {
    // On action rejection, adopt the nextState (which has the rejection event in log)
    gameState = result.nextState;
    const msg = result.errors?.[0] || "Action rejected";
    showFeedback(msg, false);
  }

  render();
}

function showFeedback(msg, success) {
  actionFeedbackEl.textContent = msg;
  actionFeedbackEl.className = success ? "success" : "";
}

// ── AI Proposal ─────────────────────────────────────────────────────────

const aiFeedbackEl = document.getElementById("ai-feedback");
const aiDebugEl = document.getElementById("ai-debug");

const AI_BRIDGE_URL = "http://localhost:3002/api/propose";

async function onAiPropose(playerInput) {
  console.log(`[AI] Input: "${playerInput}"`);
  showAiFeedback("⏳ Thinking…", "pending");

  let result;
  let usedBridge = false;

  // Try bridge first, fall back to local mock
  try {
    const resp = await fetch(AI_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText: playerInput, state: gameState, mode: "real" }),
    });
    const data = await resp.json();
    usedBridge = true;
    result = {
      ok: data.ok,
      action: data.action,
      reason: data.errors?.[0],
      rawText: JSON.stringify(data.action ?? data.errors),
      durationMs: data.durationMs ?? 0,
      mode: data.mode || "bridge",
    };
    console.log(`[AI] Bridge response: ok=${data.ok} mode=${data.mode}`);
  } catch (err) {
    // Bridge unreachable — fall back to local mock
    console.log(`[AI] Bridge unreachable (${err.message}), using local mock`);
    result = proposeActionMock(gameState, playerInput);
  }

  console.log(`[AI] Raw:   ${result.rawText}`);
  console.log(`[AI] Parse: ok=${result.ok}${result.reason ? " — " + result.reason : ""}`);

  // Update debug panel
  if (aiDebugEl) {
    aiDebugEl.textContent = JSON.stringify({
      input: playerInput,
      ok: result.ok,
      action: result.action ?? null,
      reason: result.reason ?? null,
      durationMs: result.durationMs,
      mode: result.mode,
      bridge: usedBridge,
    }, null, 2);
  }

  if (!result.ok) {
    const modeTag = result.mode || "mock";
    showAiFeedback(`[${modeTag}] ✗ ${result.reason}`, "error");
    return;
  }

  // Pass validated action to engine
  showAiFeedback(`→ ${result.action.type}`, "pending");
  dispatch(result.action);

  // Update AI feedback based on engine result
  const mode = result.mode || "mock";
  const lastEvent = gameState.log.events[gameState.log.events.length - 1];
  if (lastEvent?.type === "ACTION_REJECTED") {
    showAiFeedback(`[${mode}] ✗ Engine rejected: ${lastEvent.payload.reasons?.[0] || "unknown"}`, "error");
    console.log(`[AI] Engine: ✗ ACTION_REJECTED`);
  } else {
    showAiFeedback(`[${mode}] ✓ ${lastEvent?.type || "OK"} (${result.durationMs}ms)`, "success");
    console.log(`[AI] Engine: ✓ ${lastEvent?.type}`);
  }
}

function showAiFeedback(msg, className) {
  if (aiFeedbackEl) {
    aiFeedbackEl.textContent = msg;
    aiFeedbackEl.className = className || "";
  }
}

// ── Replay Export/Import ────────────────────────────────────────────

const replayFeedbackEl = document.getElementById("replay-feedback");

function showReplayFeedback(msg, className) {
  if (replayFeedbackEl) {
    replayFeedbackEl.textContent = msg;
    replayFeedbackEl.className = className || "";
  }
}

document.getElementById("btn-export-replay")?.addEventListener("click", () => {
  const bundle = {
    meta: {
      id: "session-" + Date.now(),
      createdAt: new Date().toISOString(),
      schemaVersion: "0.1.0",
      engineVersion: "1.4",
      notes: `UI session export (${sessionActions.length} actions)`,
    },
    initialState: sessionInitialState,
    steps: sessionActions.map((action) => ({ action })),
    final: { expectedStateHash: stateHash(gameState) },
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `replay-${bundle.meta.id}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showReplayFeedback(`✓ Exported ${sessionActions.length} steps`, "success");
});

document.getElementById("replay-file-input")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = ""; // reset for re-import

  try {
    const text = await file.text();
    const bundle = JSON.parse(text);

    if (!bundle.initialState || !Array.isArray(bundle.steps)) {
      showReplayFeedback("✗ Invalid replay bundle", "error");
      return;
    }

    // Load initial state
    gameState = structuredClone(bundle.initialState);
    showReplayFeedback(`⏳ Replaying ${bundle.steps.length} steps…`, "pending");
    render();

    // Replay steps
    let stepOk = 0;
    for (const step of bundle.steps) {
      const result = applyAction(gameState, step.action);
      gameState = result.nextState;
      stepOk++;
      render();
    }

    // Check final hash
    const finalHash = stateHash(gameState);
    if (bundle.final?.expectedStateHash && finalHash !== bundle.final.expectedStateHash) {
      showReplayFeedback(`⚠ ${stepOk} steps replayed, hash mismatch: ${finalHash}`, "error");
    } else {
      showReplayFeedback(`✓ ${stepOk} steps replayed (hash: ${finalHash})`, "success");
    }
  } catch (err) {
    showReplayFeedback(`✗ ${err.message}`, "error");
  }
});

// ── Welcome Panel (MIR 4.1) ─────────────────────────────────────────────

const replayStatusEl = document.getElementById("replay-status");
const replaySelectEl = document.getElementById("replay-select");
const btnRunReplay = document.getElementById("btn-run-replay");
const indModeEl = document.getElementById("ind-mode");
const indActiveEl = document.getElementById("ind-active");
const indSeedEl = document.getElementById("ind-seed");

function loadState(newState) {
  gameState = structuredClone(newState);
  sessionActions.length = 0;
  Object.assign(sessionInitialState, structuredClone(gameState));
  render();
}

function updateIndicators() {
  if (indModeEl) {
    const mode = gameState.combat.mode;
    indModeEl.textContent = mode === "combat"
      ? `⚔ combat r${gameState.combat.round}`
      : "🏕 exploration";
  }
  if (indActiveEl) {
    const id = gameState.combat.activeEntityId;
    const ent = id ? findEntity(id) : null;
    indActiveEl.textContent = ent ? `▸ ${ent.name}` : "—";
  }
  if (indSeedEl) {
    indSeedEl.textContent = `seed: ${gameState.rng.seed || "—"}`;
  }
}

// ── Scenario Selector (MIR 4.2) ─────────────────────────────────────────

const scenarioSelectEl = document.getElementById("scenario-select");
const btnLoadScenario = document.getElementById("btn-load-scenario");

const SCENARIO_FILES = [
  "tavern_skirmish.scenario.json",
  "corridor_ambush.scenario.json",
  "open_field_duel.scenario.json",
];

function populateScenarioList() {
  if (!scenarioSelectEl) return;
  for (const name of SCENARIO_FILES) {
    const opt = document.createElement("option");
    opt.value = `/scenarios/${name}`;
    opt.textContent = name.replace(".scenario.json", "").replace(/_/g, " ");
    scenarioSelectEl.appendChild(opt);
  }
}

btnLoadScenario?.addEventListener("click", async () => {
  const url = scenarioSelectEl?.value;
  if (!url) return;
  if (replayStatusEl) replayStatusEl.textContent = "⏳ Loading scenario…";

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bundle = await resp.json();
    if (!bundle.initialState) throw new Error("Invalid scenario bundle");

    loadState(bundle.initialState);
    if (replayStatusEl) {
      replayStatusEl.textContent = `✓ ${bundle.meta?.name || "Scenario"} loaded`;
      replayStatusEl.className = "success";
    }
    console.log(`[MIR 4.2] Scenario loaded: ${bundle.meta?.name}`);
  } catch (err) {
    if (replayStatusEl) { replayStatusEl.textContent = `✗ ${err.message}`; replayStatusEl.className = "error"; }
  }
});

populateScenarioList();

// Demo encounter button
document.getElementById("btn-demo-encounter")?.addEventListener("click", () => {
  loadState(demoEncounter);
  if (replayStatusEl) replayStatusEl.textContent = "✓ Demo encounter loaded";
  console.log("[MIR 4.1] Demo encounter loaded");
});

// Replay selector — fetch available replays from server
async function loadReplayList() {
  if (!replaySelectEl) return;
  const REPLAY_FILES = ["combat_flow.replay.json", "rejected_move.replay.json"];
  for (const name of REPLAY_FILES) {
    const opt = document.createElement("option");
    opt.value = `/replays/${name}`;
    opt.textContent = name;
    replaySelectEl.appendChild(opt);
  }
}

replaySelectEl?.addEventListener("change", () => {
  if (btnRunReplay) btnRunReplay.disabled = !replaySelectEl.value;
});

btnRunReplay?.addEventListener("click", async () => {
  const url = replaySelectEl?.value;
  if (!url) return;
  btnRunReplay.disabled = true;
  if (replayStatusEl) replayStatusEl.textContent = "⏳ Loading…";

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bundle = await resp.json();
    if (!bundle.initialState || !Array.isArray(bundle.steps)) {
      throw new Error("Invalid replay bundle");
    }

    // Load initial state and render
    gameState = structuredClone(bundle.initialState);
    render();
    if (replayStatusEl) replayStatusEl.textContent = `⏳ Replaying ${bundle.steps.length} steps…`;

    // Play steps with delay for visibility
    let stepIdx = 0;
    for (const step of bundle.steps) {
      await new Promise((r) => setTimeout(r, 600));
      const result = applyAction(gameState, step.action);
      gameState = result.nextState;
      stepIdx++;
      if (replayStatusEl) replayStatusEl.textContent = `Step ${stepIdx}/${bundle.steps.length}: ${step.action.type}`;
      render();
    }

    const finalHash = stateHash(gameState);
    const hashOk = !bundle.final?.expectedStateHash || finalHash === bundle.final.expectedStateHash;
    if (replayStatusEl) {
      replayStatusEl.textContent = hashOk
        ? `✓ ${stepIdx} steps replayed (hash: ${finalHash})`
        : `⚠ ${stepIdx} steps, hash mismatch: ${finalHash}`;
      replayStatusEl.className = hashOk ? "success" : "error";
    }
  } catch (err) {
    if (replayStatusEl) { replayStatusEl.textContent = `✗ ${err.message}`; replayStatusEl.className = "error"; }
  }
  btnRunReplay.disabled = false;
});

loadReplayList();

// ── Selection (UI-only state change) ────────────────────────────────────

function onSelect(entityId) {
  // UI selection is the one field we update locally.
  // It does not affect game logic.
  gameState = structuredClone(gameState);
  gameState.ui.selectedEntityId = entityId;
  render();
}

// ── Init ────────────────────────────────────────────────────────────────

initInputController({
  canvas,
  cellPx: CELL_PX,
  getState: () => gameState,
  dispatch,
  onSelect,
  onAiPropose,
});

// Initial render
render();

console.log("MIR 3.3 — Tabletop Engine UI loaded");
console.log("State:", gameState.map.name, `${gameState.map.grid.size.width}×${gameState.map.grid.size.height}`);
