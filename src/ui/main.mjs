/**
 * main.mjs — MIR S0.8 Tabletop Engine UI entry point.
 *
 * Wires GameState + engine + renderers + input controller.
 * Now includes: pathfinding click-to-move, click-to-attack,
 * NPC auto-turns, event narration, damage floaters, path preview.
 *
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
import { narrateEvent } from "../engine/narrateEvent.mjs";
import { executeNpcTurn, simulateCombat } from "../engine/combatController.mjs";
import { isNpcTurn } from "../engine/npcTurnStrategy.mjs";
import { findPath, isAdjacent } from "../engine/pathfinding.mjs";
import { initSounds, setSoundEnabled, isSoundEnabled, playMove, playHit, playMiss, playKill, playInitiative, playTurnStart, playError, playCombatEnd } from "./sounds.mjs";
import { saveSession, loadSession, listSessions, deleteSession, initAutoSave, exportSessionToFile, importSessionFromFile } from "../persistence/sessionStore.mjs";
import { computeVisibleCells } from "../engine/visibility.mjs";

// ── Constants ───────────────────────────────────────────────────────────

const CELL_PX = 48; // pixels per grid cell (larger for HP bars)
const NPC_TURN_DELAY = 800; // ms delay for NPC auto-turn actions
const FLOATER_DURATION = 1200; // ms for damage/miss floaters

// ── State ───────────────────────────────────────────────────────────────

let gameState = structuredClone(explorationExample);
gameState.rng.mode = "seeded";
gameState.rng.seed = "ui-session-" + Date.now();

const sessionInitialState = structuredClone(gameState);
const sessionActions = [];

// ── UI Overlay State (not game state — visual-only) ─────────────────────

let uiOverlay = {
  pathPreview: [],       // path steps to show on hover
  attackTargets: [],     // hostile positions in melee range
  floaters: [],          // damage/miss text floaters
};

let npcTurnRunning = false;  // prevents double-execution

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
const narrationLogEl = document.getElementById("narration-log");

// ── Render ──────────────────────────────────────────────────────────────

function render() {
  const { width, height } = gameState.map.grid.size;
  canvas.width = width * CELL_PX;
  canvas.height = height * CELL_PX;

  // Compute attack targets for active entity
  computeAttackTargets();

  // Compute fog of war visibility (S1.5)
  if (gameState.map.fogOfWarEnabled) {
    uiOverlay.visibleCells = computeVisibleCells(gameState, "players");
  } else {
    uiOverlay.visibleCells = null;
  }

  renderGrid(ctx, gameState, CELL_PX, uiOverlay);
  renderTokens(ctx, gameState, CELL_PX, uiOverlay);

  renderHeader();
  renderSelectedInfo();
  renderInitiativeOrder();
  renderEventLog();
  renderSeedDisplay();
  updateButtonStates();
  updateIndicators();

  // Clean expired floaters
  uiOverlay.floaters = uiOverlay.floaters.filter(f => Date.now() - f.startTime < f.duration);
}

function computeAttackTargets() {
  uiOverlay.attackTargets = [];
  if (gameState.combat.mode !== "combat") return;
  const activeId = gameState.combat.activeEntityId;
  if (!activeId) return;
  const activeEnt = findEntity(activeId);
  if (!activeEnt || activeEnt.kind !== "player") return;

  // Show red indicators on adjacent hostile entities
  const hostiles = activeEnt.kind === "player" ? gameState.entities.npcs : gameState.entities.players;
  for (const h of hostiles) {
    if (h.conditions.includes("dead")) continue;
    if (isAdjacent(activeEnt.position, h.position)) {
      uiOverlay.attackTargets.push({ ...h.position });
    }
  }
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
  if (!id) { selectedInfoEl.innerHTML = "Click a token to select"; return; }
  const ent = findEntity(id);
  if (!ent) { selectedInfoEl.innerHTML = "Click a token to select"; return; }
  const conditions = ent.conditions.length > 0
    ? `<div class="entity-conditions">${ent.conditions.join(", ")}</div>` : "";
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
    initiativeListEl.innerHTML = `<div class="init-empty">No combat active</div>`;
    return;
  }
  initiativeListEl.innerHTML = gameState.combat.initiativeOrder.map((id) => {
    const ent = findEntity(id);
    if (!ent) return "";
    const isActive = id === gameState.combat.activeEntityId;
    const isDead = ent.conditions.includes("dead");
    const hpPct = ent.stats.hpMax > 0 ? Math.round((ent.stats.hpCurrent / ent.stats.hpMax) * 100) : 0;
    const hpColor = hpPct > 60 ? "#4caf50" : hpPct > 25 ? "#ff9800" : "#f44336";
    const kindIcon = ent.kind === "player" ? "🛡" : ent.kind === "npc" ? "👹" : "📦";
    const conditions = ent.conditions.filter(c => c !== "dead");
    const condIcons = conditions.map(c => {
      const map = { stunned: "💫", poisoned: "☠", prone: "⬇", blessed: "✨", burning: "🔥" };
      return map[c] || `[${c}]`;
    }).join(" ");
    const cls = `init-entry${isActive ? " init-active" : ""}${isDead ? " init-dead" : ""}`;
    return `<div class="${cls}">
      <div class="init-row">
        <span class="init-icon">${isDead ? "💀" : kindIcon}</span>
        <span class="init-name">${ent.name}</span>
        <span class="init-hp-text">${ent.stats.hpCurrent}/${ent.stats.hpMax}</span>
      </div>
      <div class="init-hp-bar-bg"><div class="init-hp-bar" style="width:${hpPct}%;background:${hpColor}"></div></div>
      ${condIcons ? `<div class="init-conditions">${condIcons}</div>` : ""}
    </div>`;
  }).join("");
}

function renderEventLog() {
  const events = gameState.log.events;
  const last10 = events.slice(-10).reverse();
  eventLogEl.innerHTML = last10.map((evt) => {
    const narration = narrateEvent(evt, gameState);
    return `<li><span class="evt-type">${evt.type}</span> <span class="evt-detail">${narration}</span></li>`;
  }).join("");
}

function renderSeedDisplay() {
  if (seedDisplayEl) {
    seedDisplayEl.textContent = `${gameState.rng.mode}: ${gameState.rng.seed || "(none)"}`;
  }
}

function updateButtonStates() {
  const btnRollInit = document.getElementById("btn-roll-init");
  const btnEndTurn = document.getElementById("btn-end-turn");
  const btnAttack = document.getElementById("btn-attack");

  const inCombat = gameState.combat.mode === "combat";
  const isPlayerTurn = inCombat && !isNpcTurn(gameState);

  btnRollInit.disabled = inCombat || npcTurnRunning;
  btnEndTurn.disabled = !isPlayerTurn || npcTurnRunning;
  btnAttack.disabled = !gameState.ui.selectedEntityId || npcTurnRunning;

  // Disable canvas clicks during NPC turns
  canvas.style.pointerEvents = npcTurnRunning ? "none" : "auto";
}

// ── Helpers ─────────────────────────────────────────────────────────────

function findEntity(id) {
  const all = [...gameState.entities.players, ...gameState.entities.npcs, ...gameState.entities.objects];
  return all.find((e) => e.id === id) || null;
}

// ── Narration Log ───────────────────────────────────────────────────────

function addNarration(text, type = "info") {
  if (!narrationLogEl) return;
  const li = document.createElement("li");
  li.className = `narration-${type}`;
  li.textContent = text;
  narrationLogEl.prepend(li);
  // Keep last 20
  while (narrationLogEl.children.length > 20) {
    narrationLogEl.removeChild(narrationLogEl.lastChild);
  }
}

// ── Floaters (damage popups) ────────────────────────────────────────────

function addFloater(x, y, text, color) {
  uiOverlay.floaters.push({
    x, y, text, color,
    startTime: Date.now(),
    duration: FLOATER_DURATION,
  });
}

// Start floater animation loop
function animateFloaters() {
  if (uiOverlay.floaters.length > 0) {
    const { width, height } = gameState.map.grid.size;
    canvas.width = width * CELL_PX;
    canvas.height = height * CELL_PX;
    renderGrid(ctx, gameState, CELL_PX, uiOverlay);
    renderTokens(ctx, gameState, CELL_PX, uiOverlay);
  }
  requestAnimationFrame(animateFloaters);
}

// ── Dispatch ────────────────────────────────────────────────────────────

function dispatch(action) {
  const prevState = gameState;
  const result = applyAction(gameState, action);
  sessionActions.push(structuredClone(action));

  if (result.success) {
    gameState = result.nextState;
    showFeedback(`✓ ${action.type}`, true);

    // Process events for floaters and narration
    for (const evt of result.events) {
      processEventVisuals(evt, prevState);
      addNarration(narrateEvent(evt, gameState));
    }
  } else {
    gameState = result.nextState;
    const msg = result.errors?.[0] || "Action rejected";
    showFeedback(msg, false);
    addNarration(`⚠ ${msg}`, "error");
  }

  render();

  // Auto-save after every dispatch
  if (autoSaver) autoSaver.schedule();

  // Check if it's now an NPC's turn → auto-execute
  if (gameState.combat.mode === "combat" && isNpcTurn(gameState) && !npcTurnRunning) {
    scheduleNpcTurn();
  }
}

function processEventVisuals(evt, prevState) {
  if (evt.type === "MOVE_APPLIED") {
    playMove();
  }
  if (evt.type === "ATTACK_RESOLVED") {
    const p = evt.payload;
    const target = findEntity(p.targetId);
    if (target) {
      if (p.hit) {
        addFloater(target.position.x, target.position.y, `-${p.damage}`, "rgba(255, 80, 80, 1)");
        if (p.targetHpAfter === 0) {
          addFloater(target.position.x, target.position.y - 0.5, "💀", "rgba(255, 255, 255, 1)");
          playKill();
        } else {
          playHit();
        }
      } else {
        addFloater(target.position.x, target.position.y, "MISS", "rgba(200, 200, 200, 1)");
        playMiss();
      }
    }
  }
  if (evt.type === "INITIATIVE_ROLLED") {
    playInitiative();
  }
  if (evt.type === "TURN_ENDED") {
    playTurnStart();
  }
  if (evt.type === "COMBAT_ENDED") {
    const winner = evt.payload.winner === "players" ? "🎉 Heroes Win!" : "💀 Enemies Win!";
    addNarration(winner, "combat");
    playCombatEnd();
  }
  if (evt.type === "ACTION_REJECTED") {
    playError();
  }
}

function showFeedback(msg, success) {
  actionFeedbackEl.textContent = msg;
  actionFeedbackEl.className = success ? "success" : "";
}

// ── NPC Auto-Turn ───────────────────────────────────────────────────────

async function scheduleNpcTurn() {
  if (npcTurnRunning) return;
  npcTurnRunning = true;
  updateButtonStates();

  // Small delay so player can see it's NPC's turn
  await sleep(NPC_TURN_DELAY);

  while (gameState.combat.mode === "combat" && isNpcTurn(gameState)) {
    const activeId = gameState.combat.activeEntityId;
    if (!activeId) break;

    const npc = findEntity(activeId);
    addNarration(`⚔ ${npc?.name || activeId}'s turn...`, "npc");

    const result = executeNpcTurn(gameState, activeId);

    // Show each event with delay
    for (const evt of result.events) {
      processEventVisuals(evt, gameState);
      addNarration(narrateEvent(evt, result.state));
    }

    gameState = result.state;
    render();

    // Delay between NPC turns for readability
    if (gameState.combat.mode === "combat" && isNpcTurn(gameState)) {
      await sleep(NPC_TURN_DELAY);
    }
  }

  npcTurnRunning = false;
  render(); // Re-enable buttons
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Path Preview on Hover ───────────────────────────────────────────────

function onHoverCell(gx, gy) {
  if (gx < 0 || gy < 0) {
    uiOverlay.pathPreview = [];
    render();
    return;
  }

  const state = gameState;
  const inCombat = state.combat.mode === "combat";
  let moverId;

  if (inCombat) {
    moverId = state.combat.activeEntityId;
    // Only show preview for player entities
    const ent = findEntity(moverId);
    if (!ent || ent.kind !== "player") {
      uiOverlay.pathPreview = [];
      return;
    }
  } else {
    moverId = state.ui.selectedEntityId;
  }

  if (!moverId) {
    uiOverlay.pathPreview = [];
    return;
  }

  const mover = findEntity(moverId);
  if (!mover) { uiOverlay.pathPreview = []; return; }

  // Don't path to occupied cells
  const all = [...state.entities.players, ...state.entities.npcs, ...state.entities.objects];
  const occupied = all.find(e => e.position.x === gx && e.position.y === gy);
  if (occupied) { uiOverlay.pathPreview = []; return; }

  const pathResult = findPath(state, mover.position, { x: gx, y: gy }, mover.stats.movementSpeed);
  uiOverlay.pathPreview = pathResult ? pathResult.path : [];
}

// ── AI Proposal ─────────────────────────────────────────────────────

const aiFeedbackEl = document.getElementById("ai-feedback");
const aiDebugEl = document.getElementById("ai-debug");
const AI_BRIDGE_URL = "http://localhost:3002/api/propose";

async function onAiPropose(playerInput) {
  console.log(`[AI] Input: "${playerInput}"`);
  showAiFeedback("⏳ Thinking…", "pending");

  let result;
  let usedBridge = false;

  try {
    const resp = await fetch(AI_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText: playerInput, state: gameState, mode: "real" }),
    });
    const data = await resp.json();
    usedBridge = true;
    result = {
      ok: data.ok, action: data.action,
      reason: data.errors?.[0],
      rawText: JSON.stringify(data.action ?? data.errors),
      durationMs: data.durationMs ?? 0,
      mode: data.mode || "bridge",
    };
  } catch (err) {
    result = proposeActionMock(gameState, playerInput);
  }

  if (aiDebugEl) {
    aiDebugEl.textContent = JSON.stringify({
      input: playerInput, ok: result.ok,
      action: result.action ?? null,
      reason: result.reason ?? null,
      durationMs: result.durationMs,
      mode: result.mode, bridge: usedBridge,
    }, null, 2);
  }

  if (!result.ok) {
    showAiFeedback(`✗ ${result.reason}`, "error");
    return;
  }

  showAiFeedback(`→ ${result.action.type}`, "pending");
  dispatch(result.action);

  const mode = result.mode || "mock";
  const lastEvent = gameState.log.events[gameState.log.events.length - 1];
  if (lastEvent?.type === "ACTION_REJECTED") {
    showAiFeedback(`[${mode}] ✗ ${lastEvent.payload.reasons?.[0] || "unknown"}`, "error");
  } else {
    showAiFeedback(`[${mode}] ✓ ${lastEvent?.type || "OK"} (${result.durationMs}ms)`, "success");
  }
}

function showAiFeedback(msg, className) {
  if (aiFeedbackEl) { aiFeedbackEl.textContent = msg; aiFeedbackEl.className = className || ""; }
}

// ── Replay Export/Import ────────────────────────────────────────────

const replayFeedbackEl = document.getElementById("replay-feedback");
function showReplayFeedback(msg, className) {
  if (replayFeedbackEl) { replayFeedbackEl.textContent = msg; replayFeedbackEl.className = className || ""; }
}

document.getElementById("btn-export-replay")?.addEventListener("click", () => {
  const bundle = {
    meta: { id: "session-" + Date.now(), createdAt: new Date().toISOString(), schemaVersion: "0.1.0", engineVersion: "1.4", notes: `UI session export (${sessionActions.length} actions)` },
    initialState: sessionInitialState,
    steps: sessionActions.map((action) => ({ action })),
    final: { expectedStateHash: stateHash(gameState) },
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `replay-${bundle.meta.id}.json`; a.click();
  URL.revokeObjectURL(url);
  showReplayFeedback(`✓ Exported ${sessionActions.length} steps`, "success");
});

document.getElementById("replay-file-input")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";
  try {
    const text = await file.text();
    const bundle = JSON.parse(text);
    if (!bundle.initialState || !Array.isArray(bundle.steps)) { showReplayFeedback("✗ Invalid replay bundle", "error"); return; }
    gameState = structuredClone(bundle.initialState);
    showReplayFeedback(`⏳ Replaying ${bundle.steps.length} steps…`, "pending");
    render();
    let stepOk = 0;
    for (const step of bundle.steps) {
      const result = applyAction(gameState, step.action);
      gameState = result.nextState; stepOk++; render();
    }
    const finalHash = stateHash(gameState);
    if (bundle.final?.expectedStateHash && finalHash !== bundle.final.expectedStateHash) {
      showReplayFeedback(`⚠ ${stepOk} steps replayed, hash mismatch`, "error");
    } else {
      showReplayFeedback(`✓ ${stepOk} steps replayed`, "success");
    }
  } catch (err) { showReplayFeedback(`✗ ${err.message}`, "error"); }
});

// ── Welcome Panel ───────────────────────────────────────────────────

const replayStatusEl = document.getElementById("replay-status");
const replaySelectEl = document.getElementById("replay-select");
const btnRunReplay = document.getElementById("btn-run-replay");
const indModeEl = document.getElementById("ind-mode");
const indActiveEl = document.getElementById("ind-active");
const indSeedEl = document.getElementById("ind-seed");
const indAiModeEl = document.getElementById("ind-ai-mode");
const indInvariantEl = document.getElementById("ind-invariant");

function loadState(newState) {
  gameState = structuredClone(newState);
  sessionActions.length = 0;
  Object.assign(sessionInitialState, structuredClone(gameState));
  if (narrationLogEl) narrationLogEl.innerHTML = "";
  uiOverlay.floaters = [];
  uiOverlay.pathPreview = [];
  render();
}

function updateIndicators() {
  if (indModeEl) {
    const mode = gameState.combat.mode;
    indModeEl.textContent = mode === "combat" ? `⚔ combat r${gameState.combat.round}` : "🏕 exploration";
  }
  if (indActiveEl) {
    const id = gameState.combat.activeEntityId;
    const ent = id ? findEntity(id) : null;
    indActiveEl.textContent = ent ? `▸ ${ent.name}` : "—";
  }
  if (indSeedEl) indSeedEl.textContent = `seed: ${gameState.rng.seed || "—"}`;
  if (indAiModeEl) indAiModeEl.textContent = `🤖 ${indAiModeEl.dataset.mode || "mock"}`;
  if (indInvariantEl) {
    try {
      const allEnts = [...gameState.entities.players, ...gameState.entities.npcs, ...gameState.entities.objects];
      const ids = allEnts.map(e => e.id);
      const dupFree = new Set(ids).size === ids.length;
      const { width, height } = gameState.map.grid.size;
      const inBounds = allEnts.every(e => e.position.x >= 0 && e.position.x < width && e.position.y >= 0 && e.position.y < height);
      const ok = dupFree && inBounds;
      indInvariantEl.textContent = ok ? "✓ valid" : "⚠ invalid";
      indInvariantEl.className = ok ? "badge-invariant-ok" : "badge-invariant-fail";
    } catch { /* skip */ }
  }
}

// Probe AI bridge
(async () => {
  try {
    const r = await fetch(AI_BRIDGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputText: "ping", state: gameState, mode: "real" }) });
    const d = await r.json();
    if (indAiModeEl) { indAiModeEl.dataset.mode = d.mode || "mock"; indAiModeEl.textContent = `🤖 ${d.mode || "mock"}`; }
  } catch {
    if (indAiModeEl) { indAiModeEl.dataset.mode = "offline"; indAiModeEl.textContent = "🤖 offline"; }
  }
})();

// ── Scenario Selector ───────────────────────────────────────────────

const scenarioSelectEl = document.getElementById("scenario-select");
const btnLoadScenario = document.getElementById("btn-load-scenario");
const SCENARIO_FILES = ["tavern_skirmish.scenario.json", "corridor_ambush.scenario.json", "open_field_duel.scenario.json"];

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
    if (replayStatusEl) { replayStatusEl.textContent = `✓ ${bundle.meta?.name || "Scenario"} loaded`; replayStatusEl.className = "success"; }
  } catch (err) {
    if (replayStatusEl) { replayStatusEl.textContent = `✗ ${err.message}`; replayStatusEl.className = "error"; }
  }
});

populateScenarioList();

document.getElementById("btn-demo-encounter")?.addEventListener("click", () => {
  loadState(demoEncounter);
  addNarration("🎲 Demo encounter loaded — Roll Initiative to begin!", "info");
  if (replayStatusEl) replayStatusEl.textContent = "✓ Demo encounter loaded";
});

async function loadReplayList() {
  if (!replaySelectEl) return;
  const REPLAY_FILES = ["demo_showcase.replay.json", "combat_flow.replay.json", "rejected_move.replay.json"];
  for (const name of REPLAY_FILES) {
    const opt = document.createElement("option");
    opt.value = `/replays/${name}`; opt.textContent = name;
    replaySelectEl.appendChild(opt);
  }
}

replaySelectEl?.addEventListener("change", () => { if (btnRunReplay) btnRunReplay.disabled = !replaySelectEl.value; });

btnRunReplay?.addEventListener("click", async () => {
  const url = replaySelectEl?.value;
  if (!url) return;
  btnRunReplay.disabled = true;
  if (replayStatusEl) replayStatusEl.textContent = "⏳ Loading…";
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bundle = await resp.json();
    if (!bundle.initialState || !Array.isArray(bundle.steps)) throw new Error("Invalid replay bundle");
    gameState = structuredClone(bundle.initialState); render();
    if (replayStatusEl) replayStatusEl.textContent = `⏳ Replaying ${bundle.steps.length} steps…`;
    let stepIdx = 0;
    for (const step of bundle.steps) {
      await sleep(600);
      const result = applyAction(gameState, step.action);
      gameState = result.nextState; stepIdx++;
      if (replayStatusEl) replayStatusEl.textContent = `Step ${stepIdx}/${bundle.steps.length}: ${step.action.type}`;
      render();
    }
    const finalHash = stateHash(gameState);
    const hashOk = !bundle.final?.expectedStateHash || finalHash === bundle.final.expectedStateHash;
    if (replayStatusEl) {
      replayStatusEl.textContent = hashOk ? `✓ ${stepIdx} steps replayed` : `⚠ ${stepIdx} steps, hash mismatch`;
      replayStatusEl.className = hashOk ? "success" : "error";
    }
  } catch (err) {
    if (replayStatusEl) { replayStatusEl.textContent = `✗ ${err.message}`; replayStatusEl.className = "error"; }
  }
  btnRunReplay.disabled = false;
});

loadReplayList();

// ── Selection ───────────────────────────────────────────────────────────

function onSelect(entityId) {
  gameState = structuredClone(gameState);
  gameState.ui.selectedEntityId = entityId;
  uiOverlay.pathPreview = [];
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
  onHoverCell,
});

// Start floater animation
requestAnimationFrame(animateFloaters);

// Initial render
render();
addNarration("🎲 MIR Tabletop Engine loaded. Select a scenario or start the demo encounter!", "info");

// ── Sound Init (requires user gesture) ──────────────────────────────────

document.addEventListener("click", () => initSounds(), { once: true });

// Sound toggle
const btnSoundToggle = document.getElementById("btn-sound-toggle");
if (btnSoundToggle) {
  btnSoundToggle.addEventListener("click", () => {
    initSounds();
    setSoundEnabled(!isSoundEnabled());
    btnSoundToggle.textContent = isSoundEnabled() ? "🔊 Sound ON" : "🔇 Sound OFF";
    btnSoundToggle.className = isSoundEnabled() ? "btn-sound on" : "btn-sound off";
  });
}

// ── Fog of War Toggle (S1.5) ────────────────────────────────────────────

const btnFogToggle = document.getElementById("btn-fog-toggle");
if (btnFogToggle) {
  // Sync button state with initial gameState
  updateFogButton();

  btnFogToggle.addEventListener("click", () => {
    gameState = structuredClone(gameState);
    gameState.map.fogOfWarEnabled = !gameState.map.fogOfWarEnabled;
    updateFogButton();
    render();
    addNarration(
      gameState.map.fogOfWarEnabled ? "🌫 Fog of War enabled" : "☀ Fog of War disabled",
      "info"
    );
  });
}

function updateFogButton() {
  if (!btnFogToggle) return;
  const on = gameState.map.fogOfWarEnabled;
  btnFogToggle.textContent = on ? "🌫 Fog ON" : "☀ Fog OFF";
  btnFogToggle.className = on ? "btn-fog on" : "btn-fog off";
}

// ── Zoom + Pan (S1.6) ──────────────────────────────────────────────────

let zoomLevel = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
const canvasWrap = document.getElementById("canvas-wrap");

canvasWrap?.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel + delta));
  canvas.style.transform = `scale(${zoomLevel})`;
  canvas.style.transformOrigin = "top left";
  updateZoomDisplay();
}, { passive: false });

function updateZoomDisplay() {
  const el = document.getElementById("zoom-display");
  if (el) el.textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Zoom buttons
document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
  zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
  canvas.style.transform = `scale(${zoomLevel})`;
  canvas.style.transformOrigin = "top left";
  updateZoomDisplay();
});
document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
  zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
  canvas.style.transform = `scale(${zoomLevel})`;
  canvas.style.transformOrigin = "top left";
  updateZoomDisplay();
});
document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
  zoomLevel = 1;
  canvas.style.transform = `scale(1)`;
  canvas.style.transformOrigin = "top left";
  updateZoomDisplay();
});

updateZoomDisplay();

// ── Persistence (S2.1 + S2.3 + S2.5) ───────────────────────────────────

const SESSION_ID = "mir-current-session";
const saveFeedbackEl = document.getElementById("save-feedback");
const saveListEl = document.getElementById("save-list");

function showSaveFeedback(msg, cls) {
  if (saveFeedbackEl) { saveFeedbackEl.textContent = msg; saveFeedbackEl.className = cls || ""; }
}

// Auto-save on every dispatch (S2.3)
let autoSaver = null;
try {
  autoSaver = initAutoSave(
    SESSION_ID,
    () => gameState,
    () => sessionActions,
    () => showSaveFeedback("💾 auto-saved", "success"),
  );
} catch { /* IndexedDB not available — skip auto-save */ }

// Manual save
document.getElementById("btn-save-session")?.addEventListener("click", async () => {
  try {
    const name = gameState.map?.name || "Session";
    await saveSession({
      id: "save-" + Date.now(),
      name: `${name} — ${new Date().toLocaleTimeString()}`,
      gameState: structuredClone(gameState),
      actions: structuredClone(sessionActions),
    });
    showSaveFeedback("✓ Saved!", "success");
    refreshSaveList();
  } catch (err) { showSaveFeedback(`✗ ${err.message}`, "error"); }
});

// Load saved session
async function onLoadSave(id) {
  try {
    const session = await loadSession(id);
    if (!session?.gameState) { showSaveFeedback("✗ Session not found", "error"); return; }
    loadState(session.gameState);
    sessionActions.length = 0;
    if (session.actions) sessionActions.push(...session.actions);
    showSaveFeedback(`✓ Loaded: ${session.name}`, "success");
    addNarration(`📂 Loaded saved session: ${session.name}`, "info");
  } catch (err) { showSaveFeedback(`✗ ${err.message}`, "error"); }
}

// Delete saved session
async function onDeleteSave(id) {
  try {
    await deleteSession(id);
    showSaveFeedback("✓ Deleted", "success");
    refreshSaveList();
  } catch (err) { showSaveFeedback(`✗ ${err.message}`, "error"); }
}

// Refresh save list
async function refreshSaveList() {
  if (!saveListEl) return;
  try {
    const sessions = await listSessions();
    // Filter out auto-save entry
    const userSaves = sessions.filter(s => s.id !== SESSION_ID);
    if (userSaves.length === 0) {
      saveListEl.innerHTML = `<div class="save-empty">No saves yet</div>`;
      return;
    }
    saveListEl.innerHTML = userSaves.slice(0, 8).map(s => {
      const time = new Date(s.savedAt).toLocaleString();
      return `<div class="save-entry" data-id="${s.id}">
        <span class="save-name">${s.name}</span>
        <span class="save-time">${time}</span>
        <button class="save-load-btn" data-action="load" data-id="${s.id}" title="Load">📂</button>
        <button class="save-del-btn" data-action="delete" data-id="${s.id}" title="Delete">🗑</button>
      </div>`;
    }).join("");
  } catch { saveListEl.innerHTML = `<div class="save-empty">IndexedDB unavailable</div>`; }
}

// Delegate click events for save list
saveListEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "load") onLoadSave(id);
  if (btn.dataset.action === "delete") onDeleteSave(id);
});

// Export session to file (S2.5)
document.getElementById("btn-export-session")?.addEventListener("click", () => {
  exportSessionToFile({
    id: SESSION_ID,
    name: gameState.map?.name || "Session",
    gameState: structuredClone(gameState),
    actions: structuredClone(sessionActions),
  });
  showSaveFeedback("✓ Exported to file", "success");
});

// Import session from file (S2.5)
document.getElementById("session-file-input")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";
  try {
    const session = await importSessionFromFile(file);
    loadState(session.gameState);
    if (session.actions) { sessionActions.length = 0; sessionActions.push(...session.actions); }
    showSaveFeedback(`✓ Imported: ${session.name || "Session"}`, "success");
    addNarration(`📂 Imported session: ${session.name || "Session"}`, "info");
  } catch (err) { showSaveFeedback(`✗ ${err.message}`, "error"); }
});

// Init: refresh save list on load
refreshSaveList();

console.log("MIR S2.x — Tabletop Engine UI loaded (persistence + sounds + zoom/pan)");
console.log("State:", gameState.map.name, `${gameState.map.grid.size.width}×${gameState.map.grid.size.height}`);
