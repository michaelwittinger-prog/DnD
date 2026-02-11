/**
 * inputController.mjs — MIR 2.1 Input Controller.
 *
 * Handles canvas clicks and button presses.
 * Dispatches DeclaredActions to the engine via a callback.
 * Never modifies state directly — only creates actions.
 */

/**
 * Build a cardinal-only path from `from` to `to`.
 * Moves horizontally first, then vertically. No pathfinding.
 *
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {{ x: number, y: number }[]}
 */
function buildCardinalPath(from, to) {
  const path = [];
  let { x, y } = from;

  // Horizontal steps
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, y });
  }
  // Vertical steps
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    path.push({ x, y });
  }

  return path;
}

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
 * Set up all input handlers.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {number} opts.cellPx
 * @param {() => object} opts.getState — returns current GameState
 * @param {(action: object) => void} opts.dispatch — sends DeclaredAction to engine
 * @param {(id: string|null) => void} opts.onSelect — UI selection callback
 */
export function initInputController({ canvas, cellPx, getState, dispatch, onSelect, onAiPropose }) {
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

    if (clickedEntity) {
      // Click on entity → select it (or deselect if same)
      if (clickedEntity.id === selectedId) {
        onSelect(null);
      } else {
        onSelect(clickedEntity.id);
      }
    } else if (selectedId) {
      // Click on empty cell with entity selected → MOVE
      const selected = findEntity(state, selectedId);
      if (!selected) return;

      const path = buildCardinalPath(selected.position, { x: gx, y: gy });
      if (path.length === 0) return;

      dispatch({ type: "MOVE", entityId: selectedId, path });
    }
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

      // In combat: attacker is active entity, target is selected
      // In exploration: attacker is first player, target is selected
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
