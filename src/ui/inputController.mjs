/**
 * inputController.mjs — MIR S0.6 Input Controller.
 *
 * Handles canvas clicks and button presses.
 * Now uses A* pathfinding for movement and supports click-to-attack.
 * Dispatches DeclaredActions to the engine via a callback.
 * Never modifies state directly — only creates actions.
 */

import { findPath, isAdjacent } from "../engine/pathfinding.mjs";

/**
 * Find the entity at a given grid cell, or null.
 */
function entityAtCell(state, gx, gy) {
  const all = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];
  return all.find((e) => e.position.x === gx && e.position.y === gy) || null;
}

/**
 * Find an entity by id.
 */
function findEntity(state, id) {
  const all = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];
  return all.find((e) => e.id === id) || null;
}

/**
 * Determine if an entity is hostile to the active entity.
 * Players are hostile to NPCs and vice versa.
 */
function isHostile(state, entityA, entityB) {
  if (!entityA || !entityB) return false;
  const aKind = entityA.kind;
  const bKind = entityB.kind;
  return (aKind === "player" && bKind === "npc") || (aKind === "npc" && bKind === "player");
}

/**
 * Set up all input handlers.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {number} opts.cellPx
 * @param {() => object} opts.getState — returns current GameState
 * @param {(action: object) => void} opts.dispatch — sends DeclaredAction to engine
 * @param {(id: string|null) => void} opts.onSelect — UI selection callback
 * @param {function} opts.onAiPropose — AI proposal callback
 * @param {function} [opts.onHoverCell] — cell hover callback for path preview
 */
export function initInputController({ canvas, cellPx, getState, dispatch, onSelect, onAiPropose, onHoverCell }) {
  // ── Canvas click ──────────────────────────────────────────────────
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = Math.floor(mx / cellPx);
    const gy = Math.floor(my / cellPx);

    const state = getState();
    const { width, height } = state.map.grid.size;
    if (gx < 0 || gx >= width || gy < 0 || gy >= height) return;

    const clickedEntity = entityAtCell(state, gx, gy);
    const selectedId = state.ui.selectedEntityId;
    const inCombat = state.combat.mode === "combat";
    const activeId = inCombat ? state.combat.activeEntityId : null;

    // Get the active entity (in combat) or selected entity
    const activeEntity = activeId ? findEntity(state, activeId) : null;

    // CLICK ON ENTITY
    if (clickedEntity) {
      // If in combat and clicking a hostile while it's our turn → ATTACK
      if (inCombat && activeEntity && clickedEntity.id !== activeId) {
        if (isHostile(state, activeEntity, clickedEntity) && !clickedEntity.conditions.includes("dead")) {
          // Check if adjacent for melee
          if (isAdjacent(activeEntity.position, clickedEntity.position)) {
            dispatch({ type: "ATTACK", attackerId: activeId, targetId: clickedEntity.id });
            return;
          }
          // Not adjacent — select the hostile (user can then move closer)
        }
      }

      // Regular click: select/deselect
      if (clickedEntity.id === selectedId) {
        onSelect(null);
      } else {
        onSelect(clickedEntity.id);
      }
      return;
    }

    // CLICK ON EMPTY CELL
    if (inCombat && activeEntity) {
      // In combat: move the active entity using pathfinding
      const pathResult = findPath(state, activeEntity.position, { x: gx, y: gy }, activeEntity.stats.movementSpeed);
      if (pathResult && pathResult.path.length > 0) {
        dispatch({ type: "MOVE", entityId: activeId, path: pathResult.path });
      }
    } else if (selectedId) {
      // In exploration: move selected entity using pathfinding
      const selected = findEntity(state, selectedId);
      if (!selected) return;
      const pathResult = findPath(state, selected.position, { x: gx, y: gy }, selected.stats.movementSpeed);
      if (pathResult && pathResult.path.length > 0) {
        dispatch({ type: "MOVE", entityId: selectedId, path: pathResult.path });
      }
    }
  });

  // ── Canvas hover for path preview ──────────────────────────────────
  canvas.addEventListener("mousemove", (e) => {
    if (!onHoverCell) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = Math.floor(mx / cellPx);
    const gy = Math.floor(my / cellPx);
    onHoverCell(gx, gy);
  });

  canvas.addEventListener("mouseleave", () => {
    if (onHoverCell) onHoverCell(-1, -1);
  });

  // ── Roll Initiative button ────────────────────────────────────────
  const btnRollInit = document.getElementById("btn-roll-init");
  if (btnRollInit) {
    btnRollInit.addEventListener("click", () => {
      dispatch({ type: "ROLL_INITIATIVE" });
    });
  }

  // ── End Turn button ───────────────────────────────────────────────
  const btnEndTurn = document.getElementById("btn-end-turn");
  if (btnEndTurn) {
    btnEndTurn.addEventListener("click", () => {
      const state = getState();
      if (state.combat.mode === "combat" && state.combat.activeEntityId) {
        dispatch({ type: "END_TURN", entityId: state.combat.activeEntityId });
      }
    });
  }

  // ── Set Seed button ───────────────────────────────────────────────
  const btnSetSeed = document.getElementById("btn-set-seed");
  const seedInput = document.getElementById("seed-input");
  if (btnSetSeed && seedInput) {
    const applySeed = () => {
      const val = seedInput.value.trim();
      if (val) {
        dispatch({ type: "SET_SEED", seed: val });
        seedInput.value = "";
      }
    };
    btnSetSeed.addEventListener("click", applySeed);
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applySeed();
    });
  }

  // ── AI Propose button ─────────────────────────────────────────────
  const btnAiPropose = document.getElementById("btn-ai-propose");
  const aiInput = document.getElementById("ai-input");
  if (btnAiPropose && aiInput && onAiPropose) {
    const submitAi = () => {
      const val = aiInput.value.trim();
      if (val) {
        onAiPropose(val);
        aiInput.value = "";
      }
    };
    btnAiPropose.addEventListener("click", submitAi);
    aiInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitAi();
    });
  }

  // ── Attack button ─────────────────────────────────────────────────
  const btnAttack = document.getElementById("btn-attack");
  if (btnAttack) {
    btnAttack.addEventListener("click", () => {
      const state = getState();
      const selectedId = state.ui.selectedEntityId;
      if (!selectedId) return;

      let attackerId;
      if (state.combat.mode === "combat") {
        attackerId = state.combat.activeEntityId;
      } else {
        attackerId = state.entities.players[0]?.id;
      }

      if (!attackerId || attackerId === selectedId) return;

      dispatch({ type: "ATTACK", attackerId, targetId: selectedId });
    });
  }
}
