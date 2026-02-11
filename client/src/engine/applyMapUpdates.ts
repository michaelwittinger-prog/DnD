/**
 * applyMapUpdates.ts
 *
 * Pure function that applies map_updates from an AI GM response
 * to the current game state. Compatible with aiResponse.schema.json.
 *
 * Currently supports:
 * - move_entity
 *
 * Future ops (not yet implemented):
 * - spawn_entity
 * - remove_entity
 * - add_object
 * - update_object_state
 * - remove_object
 */

export interface Pos {
  x: number;
  y: number;
}

export interface MoveEntity {
  op: 'move_entity';
  entity_id: string;
  from: Pos;
  to: Pos;
}

// Union type — extend as more ops are implemented
export type MapUpdate = MoveEntity;

export interface Token {
  shape: 'circle' | 'square';
  label: string;
}

export interface EntityOnMap {
  entity_id: string;
  pos: Pos;
  token: Token;
}

export interface MapObject {
  id: string;
  kind: string;
  name: string;
  pos: Pos;
  blocks_movement: boolean;
  blocks_line_of_sight: boolean;
  state?: Record<string, string | number | boolean | null>;
}

export interface Grid {
  type: 'square' | 'hex';
  unit: string;
  width: number;
  height: number;
}

export interface Terrain {
  blocked: Pos[];
  difficult?: Pos[];
}

export interface GameMap {
  grid: Grid;
  terrain: Terrain;
  objects: MapObject[];
  entities_on_map: EntityOnMap[];
}

/**
 * Applies an array of map updates to a game map immutably.
 * Returns a new map with the updates applied.
 */
export function applyMapUpdates(map: GameMap, updates: MapUpdate[]): GameMap {
  let result = map;

  for (const update of updates) {
    switch (update.op) {
      case 'move_entity':
        result = applyMoveEntity(result, update);
        break;
      default:
        console.warn(`Unknown map update op: ${(update as { op: string }).op}`);
    }
  }

  return result;
}

function applyMoveEntity(map: GameMap, update: MoveEntity): GameMap {
  return {
    ...map,
    entities_on_map: map.entities_on_map.map((ent) => {
      if (ent.entity_id === update.entity_id) {
        return {
          ...ent,
          pos: { ...update.to },
        };
      }
      return ent;
    }),
  };
}
