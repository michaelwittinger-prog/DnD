import { useRef, useEffect, useCallback } from 'react';

const CELL_SIZE = 48;
const GRID_COLOR = '#3a3a3a';
const BG_COLOR = '#1a1a2e';
const BLOCKED_COLOR = '#4a2020';
const DIFFICULT_COLOR = '#3a3a20';
const OBJECT_COLOR = '#555577';
const PC_COLOR = '#2288cc';
const ENEMY_COLOR = '#cc3333';
const ACTIVE_RING_COLOR = '#ffdd44';
const SELECTED_RING_COLOR = '#44ffaa';
const LABEL_COLOR = '#ffffff';

interface Pos {
  x: number;
  y: number;
}

interface Token {
  shape: 'circle' | 'square';
  label: string;
}

interface EntityOnMap {
  entity_id: string;
  pos: Pos;
  token: Token;
}

interface MapObject {
  id: string;
  kind: string;
  name: string;
  pos: Pos;
  blocks_movement: boolean;
  blocks_line_of_sight: boolean;
}

interface Grid {
  type: 'square' | 'hex';
  unit: string;
  width: number;
  height: number;
}

interface Terrain {
  blocked: Pos[];
  difficult?: Pos[];
}

interface BattlemapCanvasProps {
  grid: Grid;
  terrain: Terrain;
  objects: MapObject[];
  entitiesOnMap: EntityOnMap[];
  activeEntityId: string;
  selectedEntityId: string | null;
  entityRoles: Record<string, string>;
  onTokenClick?: (entityId: string) => void;
}

export function BattlemapCanvas({
  grid,
  terrain,
  objects,
  entitiesOnMap,
  activeEntityId,
  selectedEntityId,
  entityRoles,
  onTokenClick,
}: BattlemapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWidth = grid.width * CELL_SIZE;
  const canvasHeight = grid.height * CELL_SIZE;

  // Handle canvas click — detect which token was clicked
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onTokenClick) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const gridX = Math.floor(clickX / CELL_SIZE);
      const gridY = Math.floor(clickY / CELL_SIZE);

      // Find entity at clicked grid position
      const clickedEntity = entitiesOnMap.find(
        (ent) => ent.pos.x === gridX && ent.pos.y === gridY
      );

      if (clickedEntity) {
        onTokenClick(clickedEntity.entity_id);
      }
    },
    [entitiesOnMap, onTokenClick]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw blocked terrain
    ctx.fillStyle = BLOCKED_COLOR;
    for (const pos of terrain.blocked) {
      ctx.fillRect(pos.x * CELL_SIZE, pos.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }

    // Draw difficult terrain
    if (terrain.difficult) {
      ctx.fillStyle = DIFFICULT_COLOR;
      for (const pos of terrain.difficult) {
        ctx.fillRect(pos.x * CELL_SIZE, pos.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
      // Draw hatch pattern for difficult terrain
      ctx.strokeStyle = '#6a6a30';
      ctx.lineWidth = 1;
      for (const pos of terrain.difficult) {
        const px = pos.x * CELL_SIZE;
        const py = pos.y * CELL_SIZE;
        for (let i = 0; i < CELL_SIZE; i += 8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px, py + i);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px + CELL_SIZE, py + i);
          ctx.lineTo(px + i, py + CELL_SIZE);
          ctx.stroke();
        }
      }
    }

    // Draw map objects
    for (const obj of objects) {
      const px = obj.pos.x * CELL_SIZE;
      const py = obj.pos.y * CELL_SIZE;
      ctx.fillStyle = OBJECT_COLOR;
      ctx.fillRect(px + 4, py + 4, CELL_SIZE - 8, CELL_SIZE - 8);
      // Object label
      ctx.fillStyle = '#aaaacc';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(obj.kind, px + CELL_SIZE / 2, py + CELL_SIZE - 2);
    }

    // Draw grid lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x <= grid.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= grid.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(canvasWidth, y * CELL_SIZE);
      ctx.stroke();
    }

    // Draw tokens
    for (const ent of entitiesOnMap) {
      const cx = ent.pos.x * CELL_SIZE + CELL_SIZE / 2;
      const cy = ent.pos.y * CELL_SIZE + CELL_SIZE / 2;
      const role = entityRoles[ent.entity_id] || 'neutral';
      const isActive = ent.entity_id === activeEntityId;
      const isSelected = ent.entity_id === selectedEntityId;

      // Token color based on role
      const tokenColor =
        role === 'pc' || role === 'ally' ? PC_COLOR : role === 'enemy' ? ENEMY_COLOR : '#888888';

      // Selected entity highlight ring (green)
      if (isSelected) {
        ctx.strokeStyle = SELECTED_RING_COLOR;
        ctx.lineWidth = 3;
        if (ent.token.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(cx, cy, CELL_SIZE / 2 - 1, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(
            ent.pos.x * CELL_SIZE + 1,
            ent.pos.y * CELL_SIZE + 1,
            CELL_SIZE - 2,
            CELL_SIZE - 2
          );
        }
      }

      // Active entity highlight ring (yellow)
      if (isActive) {
        ctx.strokeStyle = ACTIVE_RING_COLOR;
        ctx.lineWidth = 2;
        if (ent.token.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(cx, cy, CELL_SIZE / 2 - 4, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(
            ent.pos.x * CELL_SIZE + 4,
            ent.pos.y * CELL_SIZE + 4,
            CELL_SIZE - 8,
            CELL_SIZE - 8
          );
        }
      }

      // Draw token shape
      ctx.fillStyle = tokenColor;
      if (ent.token.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_SIZE / 2 - 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(
          ent.pos.x * CELL_SIZE + 8,
          ent.pos.y * CELL_SIZE + 8,
          CELL_SIZE - 16,
          CELL_SIZE - 16
        );
      }

      // Draw label
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ent.token.label, cx, cy);
    }
  }, [grid, terrain, objects, entitiesOnMap, activeEntityId, selectedEntityId, entityRoles, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      onClick={handleCanvasClick}
      style={{ border: '2px solid #555', borderRadius: '4px', cursor: 'pointer' }}
    />
  );
}
