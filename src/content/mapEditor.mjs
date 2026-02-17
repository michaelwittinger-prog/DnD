/**
 * mapEditor.mjs — Map Editor Domain Module (Tier 6.1)
 * 
 * Provides core map editing functionality:
 * - Map asset creation and validation
 * - Terrain tile manipulation (paint/erase/fill)
 * - Import/export serialization
 * - Conversion to game state map format
 */

/**
 * Create a new map asset
 * @param {Object} config
 * @param {string} config.id - Unique map ID
 * @param {string} config.name - Display name
 * @param {number} config.width - Grid width in cells
 * @param {number} config.height - Grid height in cells
 * @param {number} config.cellSize - Cell size in feet (default 5)
 * @returns {Object} New map asset
 */
export function createMapAsset({ id, name, width, height, cellSize = 5 }) {
  if (!id || typeof id !== 'string') {
    throw new Error('Map ID is required');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('Map name is required');
  }
  if (width < 5 || width > 50) {
    throw new Error('Width must be between 5 and 50');
  }
  if (height < 5 || height > 50) {
    throw new Error('Height must be between 5 and 50');
  }

  return {
    meta: {
      id,
      name,
      version: '1.0.0',
      created: new Date().toISOString(),
    },
    grid: {
      size: { width, height },
      cellSize,
    },
    terrain: [],
    objects: [],
  };
}

/**
 * Validate a map asset
 * @param {Object} mapAsset
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMapAsset(mapAsset) {
  const errors = [];

  // Check structure
  if (!mapAsset) {
    return { valid: false, errors: ['Map asset is null or undefined'] };
  }
  if (!mapAsset.meta || !mapAsset.meta.id || !mapAsset.meta.name) {
    errors.push('Missing or invalid metadata');
  }
  if (!mapAsset.grid || !mapAsset.grid.size) {
    errors.push('Missing grid configuration');
  }
  if (!Array.isArray(mapAsset.terrain)) {
    errors.push('Terrain must be an array');
  }

  // Check dimensions
  if (mapAsset.grid && mapAsset.grid.size) {
    const { width, height } = mapAsset.grid.size;
    if (width < 5 || width > 50) {
      errors.push(`Invalid width: ${width} (must be 5-50)`);
    }
    if (height < 5 || height > 50) {
      errors.push(`Invalid height: ${height} (must be 5-50)`);
    }

    // Check terrain tiles are in bounds
    if (Array.isArray(mapAsset.terrain)) {
      for (const tile of mapAsset.terrain) {
        if (tile.x < 0 || tile.x >= width || tile.y < 0 || tile.y >= height) {
          errors.push(`Terrain tile out of bounds: (${tile.x}, ${tile.y})`);
        }
        if (!tile.type) {
          errors.push(`Terrain tile missing type at (${tile.x}, ${tile.y})`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Set a terrain tile (immutable)
 * @param {Object} mapAsset - Current map asset
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} type - Terrain type (open, blocked, difficult, water, lava)
 * @param {boolean} blocksMovement - Whether tile blocks movement
 * @param {boolean} blocksVision - Whether tile blocks vision
 * @returns {Object} New map asset with updated terrain
 */
export function setTerrainTile(mapAsset, x, y, type, blocksMovement, blocksVision) {
  const { width, height } = mapAsset.grid.size;

  // Bounds check
  if (x < 0 || x >= width || y < 0 || y >= height) {
    throw new Error(`Tile (${x}, ${y}) is out of bounds`);
  }

  // Remove existing tile at this position
  const terrain = mapAsset.terrain.filter(t => !(t.x === x && t.y === y));

  // Add new tile
  terrain.push({
    x,
    y,
    type,
    blocksMovement,
    blocksVision,
  });

  return {
    ...mapAsset,
    terrain,
  };
}

/**
 * Clear a terrain tile (immutable)
 * @param {Object} mapAsset - Current map asset
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object} New map asset with tile removed
 */
export function clearTerrainTile(mapAsset, x, y) {
  const { width, height } = mapAsset.grid.size;

  // Bounds check
  if (x < 0 || x >= width || y < 0 || y >= height) {
    throw new Error(`Tile (${x}, ${y}) is out of bounds`);
  }

  const terrain = mapAsset.terrain.filter(t => !(t.x === x && t.y === y));

  return {
    ...mapAsset,
    terrain,
  };
}

/**
 * Export map asset as JSON string
 * @param {Object} mapAsset
 * @returns {string} JSON string
 */
export function exportMapAsset(mapAsset) {
  return JSON.stringify(mapAsset, null, 2);
}

/**
 * Import map asset from JSON string
 * @param {string} json - JSON string
 * @returns {{ ok: boolean, mapAsset?: Object, errors?: string[] }}
 */
export function importMapAsset(json) {
  try {
    const mapAsset = JSON.parse(json);
    const validation = validateMapAsset(mapAsset);

    if (!validation.valid) {
      return {
        ok: false,
        errors: validation.errors,
      };
    }

    return {
      ok: true,
      mapAsset,
    };
  } catch (err) {
    return {
      ok: false,
      errors: [`Parse error: ${err.message}`],
    };
  }
}

/**
 * Convert map asset to game state map format
 * @param {Object} mapAsset
 * @returns {Object} State map compatible with game engine
 */
export function mapAssetToStateMap(mapAsset) {
  const { width, height } = mapAsset.grid.size;

  // Initialize grid cells (all passable by default)
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push({
        x,
        y,
        passable: true,
        opaque: false,
      });
    }
  }

  // Apply terrain modifications
  for (const tile of mapAsset.terrain) {
    const cell = cells.find(c => c.x === tile.x && c.y === tile.y);
    if (cell) {
      cell.passable = !tile.blocksMovement;
      cell.opaque = tile.blocksVision;
      // Add terrain type if not 'open' (default)
      if (tile.type !== 'open') {
        // @ts-ignore - Dynamic property assignment valid in JavaScript
        cell.terrain = tile.type;
      }
    }
  }

  return {
    id: mapAsset.meta.id,
    name: mapAsset.meta.name,
    width,
    height,
    cells,
  };
}