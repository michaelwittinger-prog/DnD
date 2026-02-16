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
import { executeIntent, executePlan } from "../ai/intentExecutor.mjs";
import { planFromIntent } from "../ai/intentPlanner.mjs";
import { parseLLMIntent } from "../ai/llmIntentParser.mjs";
import { createBrowserOpenAIAdapter, saveApiKey, loadApiKey, isApiKeyFormat } from "./browserOpenAIAdapter.mjs";
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
import { applyDifficultyToEntities, getDifficulty } from "../engine/difficulty.mjs";
import { listPresets, PRESET_CHARACTERS, listClasses, CLASS_TEMPLATES, createCharacter } from "../content/characterCreator.mjs";
import { listMapTemplates, getMapTemplate, buildScenario } from "../content/scenarioBuilder.mjs";
import { generateEncounter } from "../content/encounterGenerator.mjs";
import { ABILITY_CATALOGUE } from "../engine/abilities.mjs";
import { listMonsters, filterByCR, searchMonsters, instantiateMonster, MONSTER_CATALOGUE } from "../content/monsterManual.mjs";
import { calculateXpBudget, selectGroupTemplate, GROUP_TEMPLATES } from "../content/encounterGenerator.mjs";
import { initMapEditor } from "./mapEditorUI.mjs";

// ── Constants ───────────────────────────────────────────────────────────

const CELL_PX = 48; // pixels per grid cell (larger for HP bars)
const NPC_TURN_DELAY = 800; // ms delay for NPC auto-turn actions
const FLOATER_DURATION = 1200; // ms for damage/miss floaters

// ── State ───────────────────────────────────────────────────────────────

let gameState = structuredClone(explorationExample);
gameState.rng.mode = "seeded";
gameState.rng.seed = "ui-session-" + Date.now();

/**
 * Custom party roster — characters created via the Character Creator.
 *
 * IMPORTANT: Declared early because encounter-builder preview logic
 * reads this during initial UI setup.
 */
let customParty = [];

const sessionInitialState = structuredClone(gameState);
const sessionActions = [];

// ── UI Overlay State (not game state — visual-only) ─────────────────────

let uiOverlay: {
  pathPreview: any[];
  attackTargets: any[];
  floaters: any[];
  visibleCells: Set<string> | null;
} = {
  pathPreview: [],       // path steps to show on hover
  attackTargets: [],     // hostile positions in melee range
  floaters: [],          // damage/miss text floaters
  visibleCells: null,    // fog of war visible cells
};

let npcTurnRunning = false;  // prevents double-execution

// ── DOM refs ────────────────────────────────────────────────────────────

const canvas = document.getElementById("battlemap") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
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
    uiOverlay.visibleCells = computeVisibleCells(gameState, "players") as Set<string>;
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
  const btnRollInit = document.getElementById("btn-roll-init") as HTMLButtonElement | null;
  const btnEndTurn = document.getElementById("btn-end-turn") as HTMLButtonElement | null;
  const btnAttack = document.getElementById("btn-attack") as HTMLButtonElement | null;
  const btnDefend = document.getElementById("btn-defend") as HTMLButtonElement | null;

  const inCombat = gameState.combat.mode === "combat";
  const isPlayerTurn = inCombat && !isNpcTurn(gameState);

  if (btnRollInit) btnRollInit.disabled = inCombat || npcTurnRunning;
  if (btnEndTurn) btnEndTurn.disabled = !isPlayerTurn || npcTurnRunning;
  if (btnAttack) btnAttack.disabled = !gameState.ui.selectedEntityId || npcTurnRunning;
  if (btnDefend) btnDefend.disabled = !isPlayerTurn || npcTurnRunning;

  // Disable canvas clicks during NPC turns
  canvas.style.pointerEvents = npcTurnRunning ? "none" : "auto";

  // Render ability buttons for active player
  renderAbilityBar(isPlayerTurn);
}

// ── Ability Bar (P7) ────────────────────────────────────────────────────

const abilityBarEl = document.getElementById("ability-bar");

function renderAbilityBar(isPlayerTurn) {
  if (!abilityBarEl) return;

  if (!isPlayerTurn || npcTurnRunning) {
    abilityBarEl.innerHTML = "";
    return;
  }

  const activeId = gameState.combat.activeEntityId;
  const ent = activeId ? findEntity(activeId) : null;
  if (!ent || !ent.abilities || ent.abilities.length === 0) {
    abilityBarEl.innerHTML = `<div class="ability-empty">No abilities</div>`;
    return;
  }

  const selectedTargetId = gameState.ui.selectedEntityId;

  // Resolve string ability IDs to catalogue objects
  const resolvedAbilities = ent.abilities.map(abId => {
    const id = typeof abId === "string" ? abId : abId.name;
    const cat = ABILITY_CATALOGUE[id];
    if (!cat) return null;
    const cooldownRemaining = (ent as any).abilityCooldowns?.[id] ?? 0;
    return { id, ...cat, cooldownRemaining };
  }).filter(Boolean);

  if (resolvedAbilities.length === 0) {
    abilityBarEl.innerHTML = `<div class="ability-empty">No abilities</div>`;
    return;
  }

  abilityBarEl.innerHTML = resolvedAbilities.map(ab => {
    const onCooldown = ab.cooldownRemaining > 0;
    const icon = getAbilityIcon(ab.id);
    const rangeLabel = ab.range > 1 ? `${ab.range}☆` : "melee";
    const cooldownLabel = onCooldown ? ` (CD:${ab.cooldownRemaining})` : "";
    const targetInfo = ab.targeting === "ally" ? "👥ally" : "⚔enemy";
    const disabled = onCooldown ? "disabled" : "";

    return `<button class="ability-btn ${onCooldown ? 'on-cooldown' : ''}" 
      data-ability="${ab.id}" 
      data-targeting="${ab.targeting || 'enemy'}"
      data-range="${ab.range || 1}"
      ${disabled}
      title="${ab.name} (${rangeLabel}, ${targetInfo})${cooldownLabel}">
      <span class="ability-icon">${icon}</span>
      <span class="ability-name">${ab.id.replace(/_/g, ' ')}</span>
      <span class="ability-meta">${rangeLabel}</span>
    </button>`;
  }).join("");

  // Attach click handlers
  abilityBarEl.querySelectorAll(".ability-btn:not([disabled])").forEach(btn => {
    const el = btn as HTMLElement;
    btn.addEventListener("click", () => onAbilityClick(el.dataset.ability, el.dataset.targeting, Number(el.dataset.range)));
  });
}

function getAbilityIcon(name) {
  const icons = {
    firebolt: "🔥",
    healing_word: "💚",
    sneak_attack: "🗡",
    poison_strike: "☠",
    shield_bash: "🛡",
    second_wind: "💨",
    hunters_mark: "🎯",
  };
  return icons[name] || "✨";
}

function onAbilityClick(abilityName, targeting, range) {
  const activeId = gameState.combat.activeEntityId;
  if (!activeId) return;

  let targetId = null;

  if (targeting === "ally") {
    // Auto-target most injured ally
    const allies = gameState.entities.players.filter(
      p => p.id !== activeId && !p.conditions.includes("dead") && p.stats.hpCurrent < p.stats.hpMax
    );
    if (allies.length === 0) {
      // No injured allies — target self if possible
      const self = findEntity(activeId);
      if (self && self.stats.hpCurrent < self.stats.hpMax) {
        targetId = activeId;
      } else {
        showFeedback("No injured allies to heal", false);
        addNarration("⚠ No injured allies to target", "error");
        return;
      }
    } else {
      // Pick most injured
      const mostInjured = allies.sort((a, b) =>
        (a.stats.hpCurrent / a.stats.hpMax) - (b.stats.hpCurrent / b.stats.hpMax)
      )[0];
      targetId = mostInjured.id;
    }
  } else {
    // Enemy targeting — use selected entity or nearest hostile
    const selectedId = gameState.ui.selectedEntityId;
    if (selectedId && selectedId !== activeId) {
      const target = findEntity(selectedId);
      if (target && target.kind === "npc" && !target.conditions.includes("dead")) {
        targetId = selectedId;
      }
    }

    if (!targetId) {
      // Auto-target nearest hostile in range
      const activeEnt = findEntity(activeId);
      if (!activeEnt) return;
      const hostiles = gameState.entities.npcs
        .filter(n => !n.conditions.includes("dead"))
        .map(n => ({
          entity: n,
          dist: Math.abs(n.position.x - activeEnt.position.x) + Math.abs(n.position.y - activeEnt.position.y),
        }))
        .filter(h => h.dist <= range)
        .sort((a, b) => a.dist - b.dist);

      if (hostiles.length === 0) {
        showFeedback(`No enemies in range (${range})`, false);
        addNarration(`⚠ No enemies within ${range} range for ${abilityName.replace(/_/g, ' ')}`, "error");
        return;
      }
      targetId = hostiles[0].entity.id;
    }
  }

  dispatch({
    type: "USE_ABILITY",
    casterId: activeId,
    abilityId: abilityName,
    targetId,
  });
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
    const msg = (result as any).errors?.[0] || "Action rejected";
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
  if (evt.type === "ABILITY_USED") {
    const p = evt.payload;
    const target = findEntity(p.targetId);
    if (target) {
      if (p.abilityType === "attack") {
        if (p.hit) {
          addFloater(target.position.x, target.position.y, `-${p.damage} ${p.abilityName}`, "rgba(200, 100, 255, 1)");
          if (p.targetHpAfter === 0) {
            addFloater(target.position.x, target.position.y - 0.5, "💀", "rgba(255, 255, 255, 1)");
            playKill();
          } else {
            playHit();
          }
        } else {
          addFloater(target.position.x, target.position.y, `MISS ${p.abilityName}`, "rgba(200, 200, 200, 1)");
          playMiss();
        }
      } else if (p.abilityType === "heal") {
        addFloater(target.position.x, target.position.y, `+${p.actualHeal} 💚`, "rgba(100, 255, 100, 1)");
      }
    }
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

  let safetyCounter = 0;
  const MAX_NPC_LOOPS = 20; // prevent infinite loops

  while (gameState.combat.mode === "combat" && isNpcTurn(gameState)) {
    safetyCounter++;
    if (safetyCounter > MAX_NPC_LOOPS) {
      console.error("[NPC] Safety limit reached — breaking NPC turn loop");
      addNarration("⚠ NPC turn loop safety limit reached", "error");
      break;
    }

    const activeId = gameState.combat.activeEntityId;
    if (!activeId) break;

    const prevActiveId = activeId; // track to detect stuck state

    const npc = findEntity(activeId);
    addNarration(`⚔ ${npc?.name || activeId}'s turn...`, "npc");

    const result = executeNpcTurn(gameState, activeId);

    // Show errors if NPC turn failed
    if (!result.success) {
      console.warn(`[NPC] ${npc?.name || activeId} turn failed:`, (result as any).errors);
      addNarration(`⚠ ${npc?.name || activeId} turn failed: ${(result as any).errors?.[0] || "unknown error"}`, "error");
    }

    // Show each event with delay
    for (const evt of result.events) {
      processEventVisuals(evt, gameState);
      addNarration(narrateEvent(evt, result.state));
    }

    gameState = result.state;
    render();

    // Detect stuck state: if activeEntity didn't change, force END_TURN
    if (gameState.combat.mode === "combat" && gameState.combat.activeEntityId === prevActiveId) {
      console.warn(`[NPC] Turn stuck on ${prevActiveId} — forcing END_TURN`);
      addNarration(`⚠ Forcing end of ${npc?.name || prevActiveId}'s turn`, "error");
      const forceResult = applyAction(gameState, { type: "END_TURN", entityId: prevActiveId });
      if (forceResult.success) {
        gameState = forceResult.nextState;
      } else {
        console.error("[NPC] Forced END_TURN also failed:", (forceResult as any).errors);
        addNarration("⚠ Could not advance turn — combat may be stuck", "error");
        break;
      }
      render();
    }

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

// ── AI Mode ─────────────────────────────────────────────────────────
// "mock" = instant keyword parser (always works, no API needed)
// "llm"  = LLM-powered parser (OpenAI, understands narrative language)
//
// Both use the same pipeline: Parse → Plan → Execute
// The difference is HOW the intent is parsed from player text.
// Mock: keyword matching (instant, offline)
// LLM:  OpenAI API call → structured intent JSON (async, needs API key)
// LLM automatically falls back to mock on any failure.

let currentAiMode = "llm";    // "mock" or "llm"
let llmAdapter = null;         // browser OpenAI adapter instance

/**
 * Get or create the LLM adapter using the current API key.
 * Recreates if the key changed.
 */
function getLLMAdapter() {
  const key = loadApiKey();
  if (!key) return null;
  // Recreate adapter if key changed
  if (!llmAdapter || llmAdapter._apiKey !== key) {
    llmAdapter = createBrowserOpenAIAdapter({ apiKey: key });
    llmAdapter._apiKey = key; // track which key was used
  }
  return llmAdapter;
}

async function onAiPropose(playerInput) {
  console.log(`[AI] Input: "${playerInput}" mode: ${currentAiMode}`);
  showAiFeedback("⏳ Processing…", "pending");

  const t0 = Date.now();

  if (currentAiMode === "llm") {
    // ── LLM Path: parseLLMIntent → planFromIntent → executePlan ──
    const adapter = getLLMAdapter();
    if (!adapter) {
      showAiFeedback("✗ No API key set — enter your OpenAI key above", "error");
      addNarration("⚠ LLM mode requires an OpenAI API key", "error");
      return;
    }

    showAiFeedback("⏳ Calling OpenAI…", "pending");

    try {
      const llmResult = await parseLLMIntent(playerInput, gameState, adapter);
      const durationMs = Date.now() - t0;

      // Plan from the parsed intent
      const plan = planFromIntent(gameState, llmResult.intent);
      const execResult = executePlan(gameState, plan);

      const intentResult = {
        ...execResult,
        intent: llmResult.intent,
        plan,
        mode: llmResult.source, // "llm" or "mock" (if fallback)
        durationMs,
        llmLatencyMs: llmResult.latencyMs,
        llmUsage: (llmResult as any).usage,
        llmError: (llmResult as any).error,
      };

      if (aiDebugEl) {
        aiDebugEl.textContent = JSON.stringify({
          input: playerInput,
          ok: intentResult.ok,
          intent: intentResult.intent?.type ?? null,
          source: llmResult.source,
          actionsExecuted: intentResult.actionsExecuted ?? 0,
          narrationHint: intentResult.narrationHint ?? null,
          llmError: (llmResult as any).error ?? null,
          llmLatencyMs: llmResult.latencyMs,
          llmUsage: (llmResult as any).usage ?? null,
          durationMs,
          mode: `llm/${llmResult.source}`,
        }, null, 2);
      }

      applyIntentResult(intentResult, playerInput, `llm/${llmResult.source}`);
    } catch (err) {
      // Total failure — shouldn't happen (parseLLMIntent has internal fallback)
      showAiFeedback(`✗ LLM error: ${err.message}`, "error");
      addNarration(`⚠ LLM error: ${err.message}`, "error");
    }
  } else {
    // ── Mock Path: executeIntent (synchronous) ───────────────────
    const intentResult = executeIntent(gameState, playerInput);
    const mode = "mock";

    if (aiDebugEl) {
      aiDebugEl.textContent = JSON.stringify({
        input: playerInput, ok: intentResult.ok,
        intent: intentResult.intent?.type ?? null,
        actionsExecuted: intentResult.actionsExecuted ?? 0,
        narrationHint: intentResult.narrationHint ?? null,
        error: (intentResult as any).error ?? null,
        durationMs: intentResult.durationMs,
        mode,
      }, null, 2);
    }

    applyIntentResult(intentResult, playerInput, mode);
  }
}

/**
 * Apply the result of either mock or LLM intent processing to the UI.
 * Shared code path for both modes.
 */
function applyIntentResult(intentResult, playerInput, mode) {
  if (!intentResult.ok) {
    showAiFeedback(`✗ ${intentResult.narrationHint || (intentResult as any).error || "Could not understand"}`, "error");
    addNarration(`⚠ ${intentResult.narrationHint || (intentResult as any).error || "Unknown command"}`, "error");
    return;
  }

  // Intent system succeeded — update state and show results
  const prevState = gameState;
  gameState = intentResult.state || intentResult.finalState;
  sessionActions.push(...(intentResult.actions || []));

  // Process events for visuals and narration
  for (const evt of (intentResult.events || intentResult.allEvents || [])) {
    processEventVisuals(evt, prevState);
    addNarration(narrateEvent(evt, gameState));
  }

  // Show the narration hint from the planner
  if (intentResult.narrationHint) {
    addNarration(`🗣 ${intentResult.narrationHint}`, "info");
  }

  render();

  // Auto-save after intent execution
  if (autoSaver) autoSaver.schedule();

  // Check for NPC turn
  if (gameState.combat.mode === "combat" && isNpcTurn(gameState) && !npcTurnRunning) {
    scheduleNpcTurn();
  }

  const latencyInfo = intentResult.llmLatencyMs ? ` (LLM: ${intentResult.llmLatencyMs}ms)` : "";
  const tokenInfo = intentResult.llmUsage?.totalTokens ? ` [${intentResult.llmUsage.totalTokens} tok]` : "";
  showAiFeedback(`[${mode}] ✓ ${intentResult.intent?.type || "OK"} → ${intentResult.actionsExecuted ?? 0} action(s) (${intentResult.durationMs}ms)${latencyInfo}${tokenInfo}`, "success");
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
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";
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
const replaySelectEl = document.getElementById("replay-select") as HTMLSelectElement | null;
const btnRunReplay = document.getElementById("btn-run-replay") as HTMLButtonElement | null;
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

// ── AI Mode Selector (P1 — LLM parser wiring) ──────────────────────────

const aiModeSelectEl = document.getElementById("ai-mode-select") as HTMLSelectElement | null;
const aiApikeyRowEl = document.getElementById("ai-apikey-row");
const aiApikeyInputEl = document.getElementById("ai-apikey-input") as HTMLInputElement | null;
const aiApikeyStatusEl = document.getElementById("ai-apikey-status");

function updateAiModeUI() {
  const mode = currentAiMode;
  // Show/hide API key row
  if (aiApikeyRowEl) {
    aiApikeyRowEl.style.display = mode === "llm" ? "flex" : "none";
  }
  // Update indicator badge
  if (indAiModeEl) {
    indAiModeEl.dataset.mode = mode;
    indAiModeEl.textContent = mode === "llm" ? "🧠 LLM" : "🤖 mock";
  }
  // Update API key status
  updateApiKeyStatus();
  // Update placeholder text for AI input
  const aiInput = document.getElementById("ai-input") as HTMLInputElement | null;
  if (aiInput) {
    (aiInput as HTMLInputElement).placeholder = mode === "llm"
      ? 'e.g. "I cautiously approach the dark figure"'
      : 'e.g. "attack the barkeep"';
  }
}

function updateApiKeyStatus() {
  if (!aiApikeyStatusEl) return;
  const key = loadApiKey();
  if (key && isApiKeyFormat(key)) {
    aiApikeyStatusEl.textContent = "✓ key set";
    aiApikeyStatusEl.className = "ok";
  } else if (currentAiMode === "llm") {
    aiApikeyStatusEl.textContent = "⚠ key needed";
    aiApikeyStatusEl.className = "missing";
  } else {
    aiApikeyStatusEl.textContent = "";
    aiApikeyStatusEl.className = "";
  }
}

// Mode selector change
aiModeSelectEl?.addEventListener("change", () => {
  currentAiMode = aiModeSelectEl.value;
  updateAiModeUI();
  const label = currentAiMode === "llm" ? "LLM (OpenAI)" : "Mock (offline)";
  addNarration(`🧠 AI parser switched to: ${label}`, "info");
});

// API key save button
document.getElementById("btn-apikey-save")?.addEventListener("click", () => {
  const key = aiApikeyInputEl?.value?.trim();
  if (!key) return;
  if (!isApiKeyFormat(key)) {
    if (aiApikeyStatusEl) { aiApikeyStatusEl.textContent = "⚠ invalid format"; aiApikeyStatusEl.className = "missing"; }
    return;
  }
  saveApiKey(key);
  llmAdapter = null; // Force adapter recreation with new key
  if (aiApikeyInputEl) aiApikeyInputEl.value = ""; // Clear input for security
  updateApiKeyStatus();
  addNarration("🔑 OpenAI API key saved (session only)", "info");
});

// Also save key on Enter
aiApikeyInputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    document.getElementById("btn-apikey-save")?.click();
  }
});

// Restore saved key status on load
{
  const savedKey = loadApiKey();
  if (savedKey && isApiKeyFormat(savedKey)) {
    // Key exists in sessionStorage — don't show it, just indicate it's set
    updateApiKeyStatus();
  }
}

// Initialize AI mode UI
updateAiModeUI();

// ── Scenario Selector ───────────────────────────────────────────────

const scenarioSelectEl = document.getElementById("scenario-select") as HTMLSelectElement | null;
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
    const adjusted = applyDifficultyToState(bundle.initialState);
    loadState(adjusted);
    const diff = getSelectedDifficulty();
    const preset = getDifficulty({ difficulty: diff });
    if (replayStatusEl) { replayStatusEl.textContent = `✓ ${bundle.meta?.name || "Scenario"} loaded (${preset.label})`; replayStatusEl.className = "success"; }
  } catch (err) {
    if (replayStatusEl) { replayStatusEl.textContent = `✗ ${err.message}`; replayStatusEl.className = "error"; }
  }
});

populateScenarioList();

// ── Difficulty Selector (Tier 5.3) ──────────────────────────────────────

const difficultySelectEl = document.getElementById("difficulty-select") as HTMLSelectElement | null;

function getSelectedDifficulty() {
  return difficultySelectEl?.value || "normal";
}

function applyDifficultyToState(state) {
  const diff = getSelectedDifficulty();
  if (diff === "normal") return state;
  const adjusted = structuredClone(state);
  adjusted.entities = applyDifficultyToEntities(adjusted.entities, diff);
  (adjusted as any).difficulty = diff;
  return adjusted;
}

document.getElementById("btn-demo-encounter")?.addEventListener("click", () => {
  const adjusted = applyDifficultyToState(demoEncounter);
  loadState(adjusted);
  const diff = getSelectedDifficulty();
  const preset = getDifficulty({ difficulty: diff });
  addNarration(`🎲 Demo encounter loaded (${preset.label}) — Roll Initiative to begin!`, "info");
  if (replayStatusEl) replayStatusEl.textContent = `✓ Demo loaded (${preset.label})`;
});

// ── Random Encounter (Tier 5.4 — Encounter Generator) ──────────────────

document.getElementById("btn-random-encounter")?.addEventListener("click", () => {
  const diff = getSelectedDifficulty();
  const players = gameState.entities?.players ?? [];
  const partySize = Math.max(1, players.filter(p => !p.conditions?.includes("dead")).length);
  const gridSize = gameState.map?.grid?.size ?? { width: 10, height: 10 };
  const playerPositions = players.map(p => p.position);

  const encounter = generateEncounter({
    partySize,
    difficulty: diff,
    gridSize,
    playerPositions,
    placement: "spread",
  });

  if (!encounter.entities || encounter.entities.length === 0) {
    addNarration("⚠ Could not generate encounter — no monsters available", "error");
    return;
  }

  // Replace current NPCs with the generated encounter
  const newState = structuredClone(gameState);
  newState.entities.npcs = encounter.entities;
  newState.combat = { mode: "exploration", round: 0, initiativeOrder: [], activeEntityId: null };
  (newState as any).difficulty = diff;

  loadState(newState);
  const preset = getDifficulty({ difficulty: diff });
  const monsterNames = encounter.entities.map(e => e.name).join(", ");
  addNarration(`🎲 Random encounter generated (${preset.label}): ${encounter.entities.length} monsters — ${monsterNames}`, "info");
  addNarration(`💰 XP budget: ${encounter.budget} (${encounter.template.name} template) — Roll Initiative to begin!`, "info");
  if (replayStatusEl) replayStatusEl.textContent = `✓ Random encounter (${preset.label}, ${encounter.entities.length} monsters)`;
});

// ── Custom Encounter Builder (Tier 6.2 + 6.4) ──────────────────────────

const mapSelectEl = document.getElementById("map-select") as HTMLSelectElement | null;
const partyChecksEl = document.getElementById("party-checkboxes");
const builderDiffEl = document.getElementById("builder-difficulty") as HTMLSelectElement | null;
const builderPreviewEl = document.getElementById("builder-preview");
const builderFeedbackEl = document.getElementById("builder-feedback");

function populateBuilderPanel() {
  // Maps
  if (mapSelectEl) {
    const maps = listMapTemplates();
    for (const m of maps) {
      const opt = document.createElement("option");
      opt.value = m.templateId;
      opt.textContent = `${m.name} (${m.size.width}×${m.size.height})`;
      mapSelectEl.appendChild(opt);
    }
  }
  // Party presets
  if (partyChecksEl) {
    const presets = listPresets();
    for (const p of presets) {
      const tmpl = PRESET_CHARACTERS[p.presetId];
      const label = document.createElement("label");
      label.className = "party-check-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = p.presetId;
      cb.checked = true;
      cb.addEventListener("change", updateBuilderPreview);
      label.appendChild(cb);
      label.append(` ${p.name} (${p.classId})`);
      partyChecksEl.appendChild(label);
    }
  }
  updateBuilderPreview();
}

function getSelectedPartyIds() {
  if (!partyChecksEl) return [];
  return Array.from(partyChecksEl.querySelectorAll("input:checked")).map(cb => (cb as HTMLInputElement).value);
}

function updateBuilderPreview() {
  if (!builderPreviewEl) return;
  const partyIds = getSelectedPartyIds();
  const usingCustomParty = customParty.length > 0;
  const mapId = mapSelectEl?.value;
  const diff = builderDiffEl?.value || "normal";
  if ((!usingCustomParty && !partyIds.length) || !mapId) {
    builderPreviewEl.textContent = "Select at least one party member and a map.";
    return;
  }
  const partyCount = usingCustomParty ? customParty.length : partyIds.length;
  const partySource = usingCustomParty ? "custom" : "presets";
  builderPreviewEl.textContent = `🗺 ${mapId} · 🧙 ${partyCount} heroes (${partySource}) · ⚙ ${diff}`;
}

mapSelectEl?.addEventListener("change", updateBuilderPreview);
builderDiffEl?.addEventListener("change", updateBuilderPreview);

document.getElementById("btn-generate-play")?.addEventListener("click", () => {
  const partyIds = getSelectedPartyIds();
  const usingCustomParty = customParty.length > 0;
  const mapId = mapSelectEl?.value;
  const diff = builderDiffEl?.value || "normal";

  if (!usingCustomParty && !partyIds.length) {
    if (builderFeedbackEl) { builderFeedbackEl.textContent = "⚠ Select at least one party member"; builderFeedbackEl.className = "error"; }
    return;
  }
  if (!mapId) {
    if (builderFeedbackEl) { builderFeedbackEl.textContent = "⚠ Select a map template"; builderFeedbackEl.className = "error"; }
    return;
  }

  // If custom party exists, use it directly as the encounter party (P3 completion)
  if (usingCustomParty) {
    const mapTemplate = getMapTemplate(mapId);
    if (!mapTemplate) {
      if (builderFeedbackEl) { builderFeedbackEl.textContent = `✗ Unknown map template: ${mapId}`; builderFeedbackEl.className = "error"; }
      return;
    }

    const players = customParty.map((pc, idx) => ({
      ...structuredClone(pc),
      position: structuredClone(mapTemplate.playerSpawns[idx] ?? { x: idx, y: mapTemplate.grid.size.height - 1 }),
    }));

    const encounter = generateEncounter({
      partySize: players.length,
      difficulty: diff,
      gridSize: mapTemplate.grid.size,
      playerPositions: players.map(p => p.position),
      placement: "spread",
    });

    if (!encounter.entities || encounter.entities.length === 0) {
      if (builderFeedbackEl) { builderFeedbackEl.textContent = "✗ Could not generate monsters for custom party"; builderFeedbackEl.className = "error"; }
      return;
    }

    const normalizedState = {
      schemaVersion: "0.5.0",
      map: {
        name: `Custom ${mapTemplate.name} Encounter`,
        grid: mapTemplate.grid,
        terrain: mapTemplate.terrain,
        fogOfWarEnabled: false,
      },
      entities: {
        players,
        npcs: encounter.entities,
        objects: [],
      },
      combat: {
        mode: "exploration",
        round: 0,
        initiativeOrder: [],
        activeEntityId: null,
      },
      log: { events: [] },
      rng: { mode: "seeded", seed: String(Date.now()), current: Date.now() },
      ui: { selectedEntityId: null },
    };

    loadState(normalizedState);
    const preset = getDifficulty({ difficulty: diff });
    addNarration(`🛠 Custom party encounter generated: ${players.length} heroes vs ${encounter.entities.length} monsters on ${mapTemplate.name} (${preset.label})`, "info");
    if (builderFeedbackEl) { builderFeedbackEl.textContent = `✓ Generated with custom party (${players.length} heroes)`; builderFeedbackEl.className = "success"; }
    if (replayStatusEl) replayStatusEl.textContent = `✓ Custom party encounter (${preset.label})`;

    const detailsEl = document.getElementById("create-encounter-panel");
    if (detailsEl) (detailsEl as HTMLDetailsElement).open = false;
    return;
  }

  const seed = Math.floor(Math.random() * 100000);
  const { scenario, errors } = buildScenario({
    name: `Custom ${mapId} Encounter`,
    description: `Player-created ${diff} encounter.`,
    mapTemplateId: mapId,
    partyPresetIds: partyIds,
    difficulty: diff,
    seed,
  });

  if (errors.length > 0 || !scenario) {
    if (builderFeedbackEl) { builderFeedbackEl.textContent = `✗ ${errors.join(", ")}`; builderFeedbackEl.className = "error"; }
    return;
  }

  // Normalize scenario state to match UI expectations
  const s = scenario.initialState;
  const rawTerrain = s.map.terrain;
  const terrainArray = Array.isArray(rawTerrain)
    ? rawTerrain
    : (rawTerrain && typeof rawTerrain === "object" ? Object.values(rawTerrain) : []);
  const normalizedState = {
    schemaVersion: s.schemaVersion || "0.5.0",
    map: {
      name: scenario.meta.name,
      grid: s.map.grid,
      terrain: terrainArray,
      fogOfWarEnabled: s.map.fogOfWar?.enabled ?? false,
    },
    entities: s.entities,
    combat: {
      mode: s.combat.active ? "combat" : "exploration",
      round: s.combat.round || 0,
      initiativeOrder: s.combat.initiativeOrder || [],
      activeEntityId: s.combat.activeEntityId || null,
    },
    log: { events: s.eventLog || [] },
    rng: { mode: "seeded", seed: String(seed), current: s.rng?.current ?? seed },
    ui: { selectedEntityId: null },
  };

  loadState(normalizedState);
  const preset = getDifficulty({ difficulty: diff });
  addNarration(`🛠 Custom encounter generated: ${partyIds.length} heroes vs ${scenario.meta.monsterCount} monsters on ${scenario.meta.mapTemplate} (${preset.label})`, "info");
  if (builderFeedbackEl) { builderFeedbackEl.textContent = `✓ Generated! ${partyIds.length} heroes vs ${scenario.meta.monsterCount} monsters`; builderFeedbackEl.className = "success"; }
  if (replayStatusEl) replayStatusEl.textContent = `✓ Custom encounter (${preset.label})`;

  // Close the details panel
  const detailsEl = document.getElementById("create-encounter-panel");
  if (detailsEl) (detailsEl as HTMLDetailsElement).open = false;
});

populateBuilderPanel();

// ── Enhanced Encounter Builder (P2) ─────────────────────────────────────

const builderTemplateEl = document.getElementById("builder-template") as HTMLSelectElement | null;
const encMonsterSelectEl = document.getElementById("enc-monster-select") as HTMLSelectElement | null;
const encounterRosterEl = document.getElementById("encounter-roster");
const xpBudgetLabelEl = document.getElementById("xp-budget-label");
const xpBudgetBarEl = document.getElementById("xp-budget-bar");
const xpBudgetDetailEl = document.getElementById("xp-budget-detail");

/** Encounter roster — monsters manually added by the user */
let encounterRoster: Array<{ templateId: string; name: string; cr: string; xp: number }> = [];

const CR_XP_MAP: Record<string, number> = { minion: 25, standard: 100, elite: 450, boss: 1100 };
const DIFF_XP_PER_PLAYER: Record<string, number> = { easy: 50, normal: 100, hard: 200, deadly: 350 };

function populateEncounterBuilder() {
  // Group template dropdown
  if (builderTemplateEl) {
    for (const tmpl of GROUP_TEMPLATES) {
      const opt = document.createElement("option");
      opt.value = tmpl.name;
      const w = (tmpl as any).weights;
      const wDesc = w ? Object.entries(w).filter(([,v]) => (v as number) > 0).map(([k,v]) => `${k}:${v}`).join(", ") : "";
      opt.textContent = `${tmpl.name} (${wDesc})`;
      builderTemplateEl.appendChild(opt);
    }
  }

  // Monster select dropdown (sorted by CR then name)
  if (encMonsterSelectEl) {
    const sorted = Object.values(MONSTER_CATALOGUE).sort((a: any, b: any) => {
      const crOrder = ["minion", "standard", "elite", "boss"];
      const aCr = crOrder.indexOf(a.cr);
      const bCr = crOrder.indexOf(b.cr);
      if (aCr !== bCr) return aCr - bCr;
      return a.name.localeCompare(b.name);
    });
    for (const m of sorted as any[]) {
      const opt = document.createElement("option");
      opt.value = m.templateId;
      opt.textContent = `${m.name} (${m.cr}, ${CR_XP_MAP[m.cr] || 0} XP)`;
      encMonsterSelectEl.appendChild(opt);
    }
  }

  updateXpBudgetDisplay();
  renderEncounterRoster();
}

function getEncounterBudget(): number {
  const partyIds = getSelectedPartyIds();
  const partySize = Math.max(1, partyIds.length);
  const diff = builderDiffEl?.value || "normal";
  return (DIFF_XP_PER_PLAYER[diff] || 100) * partySize;
}

function getEncounterSpent(): number {
  return encounterRoster.reduce((sum, m) => sum + m.xp, 0);
}

function updateXpBudgetDisplay() {
  const budget = getEncounterBudget();
  const spent = getEncounterSpent();
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 150) : 0;

  if (xpBudgetLabelEl) xpBudgetLabelEl.textContent = `${spent} / ${budget} XP`;

  if (xpBudgetBarEl) {
    xpBudgetBarEl.style.width = `${Math.min(pct, 100)}%`;
    xpBudgetBarEl.className = "xp-budget-bar" +
      (pct > 100 ? " over" : pct > 80 ? " near" : "");
  }

  if (xpBudgetDetailEl) {
    const remaining = budget - spent;
    const rosterCount = encounterRoster.length;
    const diff = builderDiffEl?.value || "normal";
    xpBudgetDetailEl.textContent = remaining >= 0
      ? `${remaining} XP remaining · ${rosterCount} monster${rosterCount !== 1 ? "s" : ""} · ${diff}`
      : `⚠ ${Math.abs(remaining)} XP over budget · ${rosterCount} monsters · ${diff}`;
  }
}

function renderEncounterRoster() {
  if (!encounterRosterEl) return;

  if (encounterRoster.length === 0) {
    encounterRosterEl.innerHTML = `<div class="enc-roster-empty">No monsters added — use Add Monster or Auto-Fill</div>`;
    return;
  }

  encounterRosterEl.innerHTML = encounterRoster.map((m, i) => `
    <div class="enc-roster-entry" data-idx="${i}">
      <span class="enc-roster-name">${m.name}</span>
      <span class="enc-roster-cr monster-cr-badge ${m.cr}">${m.cr}</span>
      <span class="enc-roster-xp">${m.xp} XP</span>
      <button class="enc-roster-remove" data-idx="${i}" title="Remove">✕</button>
    </div>
  `).join("");

  encounterRosterEl.querySelectorAll(".enc-roster-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number((e.target as any).dataset.idx);
      if (!isNaN(idx) && idx >= 0 && idx < encounterRoster.length) {
        encounterRoster.splice(idx, 1);
        renderEncounterRoster();
        updateXpBudgetDisplay();
        updateBuilderPreview();
      }
    });
  });
}

// Add monster to encounter roster
document.getElementById("btn-enc-add-monster")?.addEventListener("click", () => {
  const templateId = encMonsterSelectEl?.value;
  if (!templateId) return;
  const m = (MONSTER_CATALOGUE as any)[templateId];
  if (!m) return;
  encounterRoster.push({
    templateId: m.templateId,
    name: m.name,
    cr: m.cr,
    xp: CR_XP_MAP[m.cr] || 0,
  });
  renderEncounterRoster();
  updateXpBudgetDisplay();
  updateBuilderPreview();
});

// Auto-fill: use encounter generator to fill remaining budget
document.getElementById("btn-auto-fill")?.addEventListener("click", () => {
  const diff = builderDiffEl?.value || "normal";
  const partyIds = getSelectedPartyIds();
  const partySize = Math.max(1, partyIds.length);
  const budget = getEncounterBudget();
  const spent = getEncounterSpent();
  const remaining = budget - spent;

  if (remaining <= 0) {
    if (builderFeedbackEl) { builderFeedbackEl.textContent = "⚠ Budget already full or over"; builderFeedbackEl.className = "error"; }
    return;
  }

  // Use fillEncounterSlots with remaining budget
  const template = builderTemplateEl?.value === "auto"
    ? selectGroupTemplate(diff)
    : GROUP_TEMPLATES.find((t: any) => t.name === builderTemplateEl?.value) || selectGroupTemplate(diff);

  const gridSize = gameState.map?.grid?.size ?? { width: 10, height: 10 };
  const encounter = generateEncounter({
    partySize,
    difficulty: diff,
    gridSize,
    playerPositions: [],
    placement: "spread",
  });

  if (!encounter.entities || encounter.entities.length === 0) {
    if (builderFeedbackEl) { builderFeedbackEl.textContent = "⚠ Could not generate monsters"; builderFeedbackEl.className = "error"; }
    return;
  }

  // Add generated monsters to roster (respecting remaining budget)
  let addedXp = 0;
  let addedCount = 0;
  for (const ent of encounter.entities) {
    const cr = (ent as any).cr || "standard";
    const xp = CR_XP_MAP[cr] || 100;
    if (addedXp + xp > remaining + 50) break; // small tolerance
    encounterRoster.push({
      templateId: (ent as any).templateId || ent.id,
      name: ent.name,
      cr,
      xp,
    });
    addedXp += xp;
    addedCount++;
  }

  renderEncounterRoster();
  updateXpBudgetDisplay();
  updateBuilderPreview();
  if (builderFeedbackEl) { builderFeedbackEl.textContent = `✓ Auto-filled ${addedCount} monsters (+${addedXp} XP)`; builderFeedbackEl.className = "success"; }
});

// Update budget display when difficulty or party changes
builderDiffEl?.addEventListener("change", () => { updateXpBudgetDisplay(); updateBuilderPreview(); });
// Listen for party checkbox changes to update budget
partyChecksEl?.addEventListener("change", () => { updateXpBudgetDisplay(); updateBuilderPreview(); });

populateEncounterBuilder();

// ── Replay List ─────────────────────────────────────────────────────────

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

// ── Defend Button (DEFEND action) ───────────────────────────────────────

document.getElementById("btn-defend")?.addEventListener("click", () => {
  const activeId = gameState.combat?.activeEntityId;
  if (!activeId) return;
  dispatch({ type: "DEFEND", entityId: activeId });
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
    const session = await loadSession(id) as any;
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
    const sessions = await listSessions() as any[];
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
  const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
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
  const fileInput = e.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  if (!file) return;
  fileInput.value = "";
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

// ── Character Creator Panel (P3 — Content UI) ──────────────────────────

const classSelectEl = document.getElementById("class-select");
const classDetailEl = document.getElementById("class-detail");
const charNameInputEl = document.getElementById("char-name-input");
const charCreatorFeedbackEl = document.getElementById("char-creator-feedback");
const partyRosterEl = document.getElementById("party-roster");
const partyCountEl = document.getElementById("party-count");
const presetButtonsEl = document.getElementById("preset-buttons");

function populateCharacterCreator() {
  // ── Class dropdown ────────────────────────────────────────────────
  if (classSelectEl) {
    const classes = listClasses();
    for (const c of classes) {
      const opt = document.createElement("option");
      opt.value = c.classId;
      opt.textContent = `${c.name} — ${c.description}`;
      classSelectEl.appendChild(opt);
    }
  }

  // ── Preset quick-add buttons ──────────────────────────────────────
  if (presetButtonsEl) {
    const presets = listPresets();
    for (const p of presets) {
      const btn = document.createElement("button");
      btn.textContent = `${p.name} (${p.classId})`;
      btn.title = `Quick-add ${p.name}`;
      btn.addEventListener("click", () => addPresetToParty(p.presetId));
      presetButtonsEl.appendChild(btn);
    }
  }

  // ── Show initial class detail ─────────────────────────────────────
  updateClassDetail();
}

function updateClassDetail() {
  if (!classDetailEl || !classSelectEl) return;
  const classId = (classSelectEl as any).value;
  const tmpl = CLASS_TEMPLATES[classId];
  if (!tmpl) {
    classDetailEl.innerHTML = "<em>Select a class to see details</em>";
    return;
  }
  const stats = tmpl.baseStats;
  const abilities = tmpl.abilities?.join(", ") || "none";
  const equipment = (tmpl as any).startingEquipment?.join(", ") || "none";
  const tags = (tmpl as any).tags?.join(", ") || "none";
  classDetailEl.innerHTML = `
    <div><strong>${tmpl.name}</strong> — ${tmpl.description}</div>
    <div class="class-stats">
      <span class="stat-badge">HP: ${stats.hpMax}</span>
      <span class="stat-badge">AC: ${stats.ac}</span>
      <span class="stat-badge">Spd: ${stats.movementSpeed}</span>
      <span class="stat-badge">Atk: +${stats.attackBonus}</span>
      <span class="stat-badge">Dmg: ${stats.damageDice.join("d")}</span>
      <span class="stat-badge">Rng: ${stats.attackRange}</span>
    </div>
    <div class="class-abilities">⚡ Abilities: ${abilities}</div>
    <div class="class-equipment">🎒 Equipment: ${equipment}</div>
    <div class="class-tags">🏷 Tags: ${tags}</div>
  `;
}

classSelectEl?.addEventListener("change", updateClassDetail);

function addPresetToParty(presetId) {
  const preset = PRESET_CHARACTERS[presetId];
  if (!preset) return;

  // Check for duplicates
  if (customParty.find(c => c.presetId === presetId)) {
    showCharCreatorFeedback(`⚠ ${preset.name} is already in the party`, "error");
    return;
  }

  const classId = preset.classId;
  const tmpl = CLASS_TEMPLATES[classId];
  if (!tmpl) return;

  const entityId = `pc-${preset.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const pos = { x: customParty.length, y: 0 }; // Placeholder position
  const char = createCharacter(classId, entityId, preset.name, pos);

  if (!char) {
    showCharCreatorFeedback(`✗ Could not create ${preset.name}`, "error");
    return;
  }

  customParty.push({ ...char, presetId });
  showCharCreatorFeedback(`✓ Added ${preset.name} (${classId})`, "success");
  renderPartyRoster();
}

document.getElementById("btn-create-char")?.addEventListener("click", () => {
  const classId = (classSelectEl as any)?.value;
  const name = (charNameInputEl as any)?.value?.trim();

  if (!classId) {
    showCharCreatorFeedback("⚠ Select a class", "error");
    return;
  }
  if (!name || name.length < 2) {
    showCharCreatorFeedback("⚠ Enter a name (at least 2 characters)", "error");
    return;
  }

  // Check for duplicate names
  if (customParty.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showCharCreatorFeedback(`⚠ "${name}" already in party`, "error");
    return;
  }

  const entityId = `pc-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const pos = { x: customParty.length, y: 0 };
  const char = createCharacter(classId, entityId, name, pos);

  if (!char) {
    showCharCreatorFeedback(`✗ Could not create character`, "error");
    return;
  }

  customParty.push(char);
  showCharCreatorFeedback(`✓ Created ${name} (${classId})`, "success");
  if (charNameInputEl) (charNameInputEl as any).value = "";
  renderPartyRoster();
});

document.getElementById("btn-clear-party")?.addEventListener("click", () => {
  customParty = [];
  showCharCreatorFeedback("Party cleared", "info");
  renderPartyRoster();
});

function renderPartyRoster() {
  if (!partyRosterEl) return;
  if (partyCountEl) partyCountEl.textContent = String(customParty.length);

  if (customParty.length === 0) {
    partyRosterEl.innerHTML = `<div style="color:#666;font-style:italic;font-size:0.78rem;">No characters yet — use Quick Add or create custom</div>`;
    return;
  }

  partyRosterEl.innerHTML = customParty.map((c, i) => {
    const abilities = c.abilities?.length > 0 ? c.abilities.slice(0, 2).join(", ") : "";
    const abilityExtra = c.abilities?.length > 2 ? ` +${c.abilities.length - 2}` : "";
    const abilityLabel = abilities ? `⚡ ${abilities}${abilityExtra}` : "";
    return `
    <div class="roster-entry" data-idx="${i}">
      <div class="roster-main">
        <span class="roster-name">${c.name}</span>
        <div class="roster-stats">
          <span class="stat-badge-sm">HP ${c.stats?.hpMax || "?"}</span>
          <span class="stat-badge-sm">AC ${c.stats?.ac || "?"}</span>
          <span class="stat-badge-sm">Spd ${c.stats?.movementSpeed || "?"}</span>
        </div>
        ${abilityLabel ? `<div class="roster-abilities">${abilityLabel}</div>` : ""}
      </div>
      <button class="roster-remove" data-idx="${i}" title="Remove">✕</button>
    </div>
  `;}).join("");

  // Attach remove handlers
  partyRosterEl.querySelectorAll(".roster-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number((e.target as any).dataset.idx);
      if (!isNaN(idx) && idx >= 0 && idx < customParty.length) {
        const removed = customParty.splice(idx, 1)[0];
        showCharCreatorFeedback(`Removed ${removed.name}`, "info");
        renderPartyRoster();
      }
    });
  });

  // Also update the custom encounter builder party checkboxes to include custom chars
  syncPartyToBuilder();
}

/**
 * Sync custom party to the encounter builder's party checkboxes.
 * If user has built a custom party, auto-check those entries.
 */
function syncPartyToBuilder() {
  // P3 completion: custom party is now integrated by generation flow.
  // If custom characters exist, the builder uses them automatically
  // when Generate & Play is clicked.
  updateBuilderPreview();
}

function showCharCreatorFeedback(msg, cls) {
  if (charCreatorFeedbackEl) {
    charCreatorFeedbackEl.textContent = msg;
    charCreatorFeedbackEl.className = cls || "";
  }
}

populateCharacterCreator();
renderPartyRoster();

// ── Monster Manual Browser (P3) ─────────────────────────────────────────

const monsterCrFilterEl = document.getElementById("monster-cr-filter") as HTMLSelectElement | null;
const monsterSearchEl = document.getElementById("monster-search") as HTMLInputElement | null;
const monsterTagFiltersEl = document.getElementById("monster-tag-filters");
const monsterListEl = document.getElementById("monster-list");
const monsterDetailEl = document.getElementById("monster-detail");
const monsterFeedbackEl = document.getElementById("monster-feedback");

let monsterBrowserState = {
  selectedMonsterId: null as string | null,
  crFilter: "all",
  activeTags: new Set<string>(),
  searchQuery: "",
};

function populateMonsterBrowser() {
  // Build tag filter chips
  if (monsterTagFiltersEl) {
    const allTags = new Set<string>();
    for (const m of Object.values(MONSTER_CATALOGUE)) {
      (m as any).tags?.forEach((t: string) => allTags.add(t));
    }
    monsterTagFiltersEl.innerHTML = [...allTags].sort().map(tag =>
      `<span class="tag-filter-chip" data-tag="${tag}">${tag}</span>`
    ).join("");

    monsterTagFiltersEl.addEventListener("click", (e) => {
      const chip = (e.target as HTMLElement).closest(".tag-filter-chip") as HTMLElement | null;
      if (!chip) return;
      const tag = chip.dataset.tag!;
      if (monsterBrowserState.activeTags.has(tag)) {
        monsterBrowserState.activeTags.delete(tag);
        chip.classList.remove("active");
      } else {
        monsterBrowserState.activeTags.add(tag);
        chip.classList.add("active");
      }
      renderMonsterList();
    });
  }

  renderMonsterList();
}

function getFilteredMonsters() {
  let monsters = Object.values(MONSTER_CATALOGUE) as any[];

  // CR filter
  if (monsterBrowserState.crFilter !== "all") {
    monsters = monsters.filter(m => m.cr === monsterBrowserState.crFilter);
  }

  // Tag filter (any match)
  if (monsterBrowserState.activeTags.size > 0) {
    const tags = [...monsterBrowserState.activeTags];
    monsters = monsters.filter(m => tags.some(t => m.tags?.includes(t)));
  }

  // Search filter
  const q = monsterBrowserState.searchQuery.toLowerCase();
  if (q) {
    monsters = monsters.filter(m =>
      m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    );
  }

  return monsters;
}

function renderMonsterList() {
  if (!monsterListEl) return;
  const filtered = getFilteredMonsters();

  if (filtered.length === 0) {
    monsterListEl.innerHTML = `<div style="padding:0.8rem;text-align:center;color:#666;font-size:0.8rem;">No monsters match filters</div>`;
    return;
  }

  const sel = monsterBrowserState.selectedMonsterId;
  monsterListEl.innerHTML = filtered.map((m: any) => `
    <div class="monster-card${m.templateId === sel ? " selected" : ""}" data-id="${m.templateId}">
      <div>
        <span class="monster-name">${m.name}</span>
      </div>
      <span class="monster-cr-badge ${m.cr}">${m.cr}</span>
    </div>
  `).join("");

  monsterListEl.querySelectorAll(".monster-card").forEach(card => {
    card.addEventListener("click", () => {
      monsterBrowserState.selectedMonsterId = (card as HTMLElement).dataset.id!;
      renderMonsterList();
      renderMonsterDetail();
    });
  });
}

function renderMonsterDetail() {
  if (!monsterDetailEl) return;
  const id = monsterBrowserState.selectedMonsterId;
  if (!id) { monsterDetailEl.innerHTML = `<em>Select a monster to see details</em>`; return; }

  const m = (MONSTER_CATALOGUE as any)[id];
  if (!m) return;

  const abilities = m.abilities?.length > 0 ? m.abilities.join(", ") : "none";
  const tags = m.tags?.join(", ") || "none";

  monsterDetailEl.innerHTML = `
    <div><strong>${m.name}</strong> <span class="monster-cr-badge ${m.cr}">${m.cr}</span></div>
    <div style="margin:0.4rem 0;font-style:italic;color:#888;">${m.description || ""}</div>
    <div class="monster-stats">
      <div class="stat-badge">HP: ${m.stats.hpMax}</div>
      <div class="stat-badge">AC: ${m.stats.ac}</div>
      <div class="stat-badge">Spd: ${m.stats.movementSpeed}</div>
      <div class="stat-badge">Atk: +${m.stats.attackBonus}</div>
      <div class="stat-badge">Dmg: ${m.stats.damageDice.join("d")}</div>
      <div class="stat-badge">Rng: ${m.stats.attackRange}</div>
    </div>
    <div style="font-size:0.75rem;">⚡ <strong>Abilities:</strong> ${abilities}</div>
    <div style="font-size:0.75rem;">🏷 <strong>Tags:</strong> ${tags}</div>
    <button class="btn-spawn" id="btn-spawn-monster">➕ Spawn ${m.name}</button>
  `;

  document.getElementById("btn-spawn-monster")?.addEventListener("click", () => {
    spawnMonsterOnGrid(id);
  });
}

function spawnMonsterOnGrid(templateId: string) {
  const { width, height } = gameState.map.grid.size;
  const allEnts = [...gameState.entities.players, ...gameState.entities.npcs, ...gameState.entities.objects];

  // Find free cell (scan from top-right)
  let freePos: { x: number; y: number } | null = null;
  for (let x = width - 1; x >= 0 && !freePos; x--) {
    for (let y = 0; y < height && !freePos; y++) {
      if (!allEnts.some(e => e.position.x === x && e.position.y === y)) {
        freePos = { x, y };
      }
    }
  }

  if (!freePos) {
    showMonsterFeedback("⚠ No free cells on grid", "error");
    return;
  }

  const entityId = `${templateId}-spawned-${Date.now()}`;
  const monster = instantiateMonster(templateId, entityId, freePos);
  if (!monster) {
    showMonsterFeedback("✗ Could not instantiate monster", "error");
    return;
  }

  gameState = structuredClone(gameState);
  gameState.entities.npcs.push(monster as any);
  render();
  showMonsterFeedback(`✓ Spawned ${monster.name} at (${freePos.x}, ${freePos.y})`, "success");
  addNarration(`👹 ${monster.name} spawned at (${freePos.x}, ${freePos.y})`, "info");
  if (autoSaver) autoSaver.schedule();
}

function showMonsterFeedback(msg: string, cls: string) {
  if (monsterFeedbackEl) {
    monsterFeedbackEl.textContent = msg;
    monsterFeedbackEl.className = cls;
  }
}

// Event listeners
monsterCrFilterEl?.addEventListener("change", () => {
  monsterBrowserState.crFilter = monsterCrFilterEl.value;
  renderMonsterList();
});

monsterSearchEl?.addEventListener("input", () => {
  monsterBrowserState.searchQuery = monsterSearchEl.value.trim();
  renderMonsterList();
});

// Initialize
populateMonsterBrowser();

// Initialize Map Editor (WP1 S1.2, S1.3, S1.4)
initMapEditor();

console.log("MIR S2.x — Tabletop Engine UI loaded (persistence + sounds + zoom/pan + character creator + monster manual + map editor)");
console.log("State:", gameState.map.name, `${gameState.map.grid.size.width}×${gameState.map.grid.size.height}`);
