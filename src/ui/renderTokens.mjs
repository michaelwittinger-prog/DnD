/**
 * renderTokens.mjs — MIR 2.1 Token Renderer.
 *
 * Draws entity tokens on the canvas: colored circles with labels and HP.
 * Render only — no game logic, no state mutation.
 */

const KIND_COLORS = {
  player: "#2a6dd4",
  npc:    "#d43a2a",
  object: "#777777",
};

const DEAD_COLOR = "#333333";

/**
 * Render all entity tokens on the grid.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — GameState
 * @param {number} cellPx — pixels per cell
 */
export function renderTokens(ctx, state, cellPx) {
  const entities = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];

  const activeId = state.combat.mode === "combat" ? state.combat.activeEntityId : null;
  const selectedId = state.ui.selectedEntityId;

  for (const ent of entities) {
    const cx = ent.position.x * cellPx + cellPx / 2;
    const cy = ent.position.y * cellPx + cellPx / 2;
    const radius = cellPx * 0.36;
    const isDead = ent.conditions.includes("dead");

    // Token circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = isDead ? DEAD_COLOR : (KIND_COLORS[ent.kind] || KIND_COLORS.object);
    ctx.fill();

    // Kind-based border style
    if (ent.kind === "player") {
      ctx.strokeStyle = "#5599ee";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ent.kind === "npc") {
      ctx.strokeStyle = "#ee5544";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Active entity highlight (golden ring)
    if (ent.id === activeId) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffcc00";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Selected entity highlight (green ring)
    if (ent.id === selectedId) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Label (first 4 chars of name)
    const label = ent.name.slice(0, 4);
    const fontSize = Math.max(9, Math.floor(cellPx * 0.26));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(label, cx, cy - (ent.kind !== "object" ? 3 : 0));

    // HP text for players and npcs
    if (ent.kind !== "object") {
      const hpText = `${ent.stats.hpCurrent}/${ent.stats.hpMax}`;
      const hpSize = Math.max(7, Math.floor(cellPx * 0.2));
      ctx.font = `${hpSize}px sans-serif`;
      ctx.fillStyle = isDead ? "#888" : "#cfc";
      ctx.fillText(hpText, cx, cy + radius * 0.6);
    }
  }
}
