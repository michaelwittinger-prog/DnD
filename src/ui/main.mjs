/**
 * main.mjs — MIR 2.1 Tabletop Engine UI entry point.
 *
 * Wires GameState + engine + renderers + input controller.
 * All state changes flow through applyAction. The UI never
 * modifies game-meaningful state directly.
 */

import { applyAction } from "../engine/applyAction.mjs";
import { explorationExample } from "../state/exampleStates.mjs";
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
});

// Initial render
render();

console.log("MIR 2.2 — Tabletop Engine UI loaded");
console.log("State:", gameState.map.name, `${gameState.map.grid.size.width}×${gameState.map.grid.size.height}`);
