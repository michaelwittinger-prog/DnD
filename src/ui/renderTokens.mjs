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
 * @param {object} [uiOverlay] — optional overlay data (visibleCells for fog)
 */
export function renderTokens(ctx, state, cellPx, uiOverlay) {
  const entities = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];

  const activeId = state.combat.mode === "combat" ? state.combat.activeEntityId : null;
  const selectedId = state.ui.selectedEntityId;

  for (const ent of entities) {
    // Fog of War: hide non-player entities on non-visible cells
    if (uiOverlay?.visibleCells && state.map.fogOfWarEnabled && ent.kind !== "player") {
      const cellKey = `${ent.position.x},${ent.position.y}`;
      if (!uiOverlay.visibleCells.has(cellKey)) continue;
    }

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

    // HP bar for players and npcs
    if (ent.kind !== "object") {
      const barW = cellPx * 0.7;
      const barH = 4;
      const barX = cx - barW / 2;
      const barY = cy + radius + 4;
      const hpPct = ent.stats.hpMax > 0 ? ent.stats.hpCurrent / ent.stats.hpMax : 0;

      // Bar background
      ctx.fillStyle = "#333";
      ctx.fillRect(barX, barY, barW, barH);

      // Bar fill — color by health percentage
      if (!isDead) {
        const barColor = hpPct > 0.5 ? "#4caf50" : hpPct > 0.25 ? "#ff9800" : "#f44336";
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, barY, barW * Math.max(0, hpPct), barH);
      }

      // Bar border
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barW, barH);

      // HP text
      const hpText = `${ent.stats.hpCurrent}/${ent.stats.hpMax}`;
      const hpSize = Math.max(7, Math.floor(cellPx * 0.2));
      ctx.font = `${hpSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = isDead ? "#888" : "#fff";
      ctx.fillText(hpText, cx, barY + barH + hpSize + 1);
    }
  }
}
