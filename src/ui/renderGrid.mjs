/**
 * renderGrid.mjs — MIR 2.1 Grid Renderer.
 *
 * Draws the square grid, terrain tiles, and selection highlights on a canvas.
 * Render only — no game logic, no state mutation.
 */

const TERRAIN_COLORS = {
  open:      "#e8dfc0",
  blocked:   "#4a4040",
  difficult: "#c9b458",
  water:     "#4a7fb5",
  pit:       "#2a2020",
};

const GRID_LINE   = "#8888881a";
const GRID_BORDER = "#666";
const CELL_SELECT = "#00ff00";
const CELL_ACTIVE = "#ffcc00";

/**
 * Render the grid background, terrain, and highlights.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — GameState
 * @param {number} cellPx — pixels per cell
 */
export function renderGrid(ctx, state, cellPx) {
  const { width, height } = state.map.grid.size;
  const W = width * cellPx;
  const H = height * cellPx;

  // 1. Fill all cells with default open color
  ctx.fillStyle = TERRAIN_COLORS.open;
  ctx.fillRect(0, 0, W, H);

  // 2. Draw terrain tiles
  for (const tile of state.map.terrain) {
    const color = TERRAIN_COLORS[tile.type] || TERRAIN_COLORS.open;
    ctx.fillStyle = color;
    ctx.fillRect(tile.x * cellPx, tile.y * cellPx, cellPx, cellPx);

    // Blocked tiles get a cross pattern for extra distinction
    if (tile.blocksMovement) {
      ctx.strokeStyle = "#6a5a5a";
      ctx.lineWidth = 1;
      const x0 = tile.x * cellPx;
      const y0 = tile.y * cellPx;
      ctx.beginPath();
      ctx.moveTo(x0 + 4, y0 + 4);
      ctx.lineTo(x0 + cellPx - 4, y0 + cellPx - 4);
      ctx.moveTo(x0 + cellPx - 4, y0 + 4);
      ctx.lineTo(x0 + 4, y0 + cellPx - 4);
      ctx.stroke();
    }
  }

  // 3. Draw grid lines
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellPx + 0.5, 0);
    ctx.lineTo(x * cellPx + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellPx + 0.5);
    ctx.lineTo(W, y * cellPx + 0.5);
    ctx.stroke();
  }

  // 4. Highlight active entity cell (combat)
  if (state.combat.mode === "combat" && state.combat.activeEntityId) {
    const ent = findEntity(state, state.combat.activeEntityId);
    if (ent) {
      ctx.strokeStyle = CELL_ACTIVE;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ent.position.x * cellPx + 1,
        ent.position.y * cellPx + 1,
        cellPx - 2,
        cellPx - 2
      );
    }
  }

  // 5. Highlight selected entity cell
  if (state.ui.selectedEntityId) {
    const ent = findEntity(state, state.ui.selectedEntityId);
    if (ent) {
      ctx.strokeStyle = CELL_SELECT;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        ent.position.x * cellPx + 1,
        ent.position.y * cellPx + 1,
        cellPx - 2,
        cellPx - 2
      );
      ctx.setLineDash([]);
    }
  }
}

function findEntity(state, id) {
  const all = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];
  return all.find((e) => e.id === id) || null;
}
