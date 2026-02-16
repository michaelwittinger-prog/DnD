/**
 * mapEditorUI.mjs — Map Editor UI Logic (WP1 S1.2, S1.3, S1.4)
 * 
 * Canvas-based map editor with paint/erase/fill tools, terrain palette,
 * layer management, validation, and scenario integration.
 */

import {
  createMapAsset,
  validateMapAsset,
  setTerrainTile,
  clearTerrainTile,
  exportMapAsset,
  importMapAsset,
  mapAssetToStateMap,
} from '../content/mapEditor.mjs';

// Editor state
/** @type {any | null} */
let currentMapAsset = null;
let currentTool = 'paint';
let currentLayer = 'terrain';
let currentTerrain = 'open';
/** @type {HTMLCanvasElement | null} */
let editorCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let editorCtx = null;
let cellSize = 40;
/** @type {any | null} */
let customMapState = null;

// Terrain colors
const TERRAIN_COLORS = {
  open: '#f0f0f0',
  blocked: '#333',
  difficult: '#8b4513',
  water: '#4169e1',
  lava: '#ff4500',
};

/**
 * Initialize the map editor UI
 */
export function initMapEditor() {
  const btnNewMap = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-new-map'));
  const btnSaveMap = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-save-map'));
  const btnLoadMap = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-load-map'));
  const btnExportMap = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-export-map'));
  const btnUseInScenario = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-use-in-scenario'));

  editorCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('map-editor-canvas'));
  editorCtx = editorCanvas?.getContext('2d');

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    const toolBtn = /** @type {HTMLElement} */ (btn);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      toolBtn.classList.add('active');
      currentTool = toolBtn.dataset.tool || 'paint';
    });
  });

  // Layer buttons
  document.querySelectorAll('.layer-btn').forEach(btn => {
    const layerBtn = /** @type {HTMLElement} */ (btn);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      layerBtn.classList.add('active');
      currentLayer = layerBtn.dataset.layer || 'terrain';
      updateTerrainPaletteVisibility();
    });
  });

  // Terrain palette
  document.querySelectorAll('.terrain-btn').forEach(btn => {
    const terrainBtn = /** @type {HTMLElement} */ (btn);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.terrain-btn').forEach(b => b.classList.remove('active'));
      terrainBtn.classList.add('active');
      currentTerrain = terrainBtn.dataset.terrain || 'open';
    });
  });

  // Canvas interaction
  if (editorCanvas) {
    editorCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    editorCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    editorCanvas.addEventListener('mouseup', handleCanvasMouseUp);
  }

  // Buttons
  btnNewMap?.addEventListener('click', handleNewMap);
  btnSaveMap?.addEventListener('click', handleSaveMap);
  btnLoadMap?.addEventListener('click', handleLoadMap);
  btnExportMap?.addEventListener('click', handleExportMap);
  btnUseInScenario?.addEventListener('click', handleUseInScenario);
}

/**
 * Show/hide terrain palette based on active layer
 */
function updateTerrainPaletteVisibility() {
  const palette = document.getElementById('terrain-palette');
  if (palette) {
    palette.style.display = currentLayer === 'terrain' ? 'flex' : 'none';
  }
}

/**
 * Create a new map
 */
function handleNewMap() {
  const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('map-name-input'));
  const widthInput = /** @type {HTMLInputElement | null} */ (document.getElementById('map-width-input'));
  const heightInput = /** @type {HTMLInputElement | null} */ (document.getElementById('map-height-input'));

  const name = nameInput?.value || 'Untitled Map';
  const width = parseInt(widthInput?.value || '15', 10);
  const height = parseInt(heightInput?.value || '15', 10);

  if (width < 5 || width > 50 || height < 5 || height > 50) {
    showFeedback('Map dimensions must be between 5 and 50', 'error');
    return;
  }

  currentMapAsset = createMapAsset({
    id: `map-${Date.now()}`,
    name,
    width,
    height,
    cellSize: 5,
  });

  showCanvasWrap();
  renderMap();
  validateAndDisplay();
  showFeedback(`Created map: ${name} (${width}x${height})`, 'success');
}

/**
 * Show the canvas wrap
 */
function showCanvasWrap() {
  const wrap = document.getElementById('map-editor-canvas-wrap');
  if (wrap) {
    wrap.style.display = 'flex';
  }
}

/**
 * Render the map on canvas
 */
function renderMap() {
  if (!currentMapAsset || !editorCtx || !editorCanvas) return;

  const { width, height } = currentMapAsset.grid.size;
  editorCanvas.width = width * cellSize;
  editorCanvas.height = height * cellSize;

  // Clear canvas
  editorCtx.fillStyle = '#1a1a2e';
  editorCtx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Draw grid
  editorCtx.strokeStyle = '#444';
  editorCtx.lineWidth = 1;
  for (let x = 0; x <= width; x++) {
    editorCtx.beginPath();
    editorCtx.moveTo(x * cellSize, 0);
    editorCtx.lineTo(x * cellSize, height * cellSize);
    editorCtx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    editorCtx.beginPath();
    editorCtx.moveTo(0, y * cellSize);
    editorCtx.lineTo(width * cellSize, y * cellSize);
    editorCtx.stroke();
  }

  // Draw terrain
  for (const tile of currentMapAsset.terrain) {
    const color = TERRAIN_COLORS[tile.type] || TERRAIN_COLORS.open;
    editorCtx.fillStyle = color;
    editorCtx.fillRect(tile.x * cellSize + 1, tile.y * cellSize + 1, cellSize - 2, cellSize - 2);

    // Visual indicators for blocking
    if (tile.blocksMovement) {
      editorCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      editorCtx.fillRect(tile.x * cellSize + 1, tile.y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
  }
}

let isDrawing = false;

/**
 * Handle mouse down on canvas
 */
function handleCanvasMouseDown(e) {
  isDrawing = true;
  handleCanvasClick(e);
}

/**
 * Handle mouse move on canvas
 */
function handleCanvasMouseMove(e) {
  if (!isDrawing) return;
  handleCanvasClick(e);
}

/**
 * Handle mouse up
 */
function handleCanvasMouseUp() {
  isDrawing = false;
}

/**
 * Handle canvas click/drag
 */
function handleCanvasClick(e) {
  if (!currentMapAsset || currentLayer !== 'terrain' || !editorCanvas) return;

  const rect = editorCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cellSize);
  const y = Math.floor((e.clientY - rect.top) / cellSize);

  if (currentTool === 'paint') {
    paintTile(x, y);
  } else if (currentTool === 'erase') {
    eraseTile(x, y);
  } else if (currentTool === 'fill') {
    fillArea(x, y);
  }
}

/**
 * Paint a tile
 */
function paintTile(x, y) {
  try {
    const blocksMovement = currentTerrain === 'blocked';
    const blocksVision = currentTerrain === 'blocked';
    currentMapAsset = setTerrainTile(currentMapAsset, x, y, currentTerrain, blocksMovement, blocksVision);
    renderMap();
    validateAndDisplay();
  } catch (err) {
    // Ignore out-of-bounds errors during dragging
  }
}

/**
 * Erase a tile
 */
function eraseTile(x, y) {
  try {
    currentMapAsset = clearTerrainTile(currentMapAsset, x, y);
    renderMap();
    validateAndDisplay();
  } catch (err) {
    // Ignore out-of-bounds errors
  }
}

/**
 * Fill an area (flood fill algorithm)
 */
function fillArea(x, y) {
  const { width, height } = currentMapAsset.grid.size;
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const targetType = getTerrainAt(x, y);
  if (targetType === currentTerrain) return;

  const stack = [[x, y]];
  const visited = new Set();

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    
    if (visited.has(key)) continue;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    if (getTerrainAt(cx, cy) !== targetType) continue;

    visited.add(key);
    paintTile(cx, cy);

    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }
}

/**
 * Get terrain type at position
 */
function getTerrainAt(x, y) {
  const tile = currentMapAsset.terrain.find(t => t.x === x && t.y === y);
  return tile ? tile.type : 'open';
}

/**
 * Validate and display validation results
 */
function validateAndDisplay() {
  if (!currentMapAsset) return;

  const result = validateMapAsset(currentMapAsset);
  const list = document.getElementById('map-validation-list');
  
  if (!list) return;

  list.innerHTML = '';

  if (result.valid) {
    const li = document.createElement('li');
    li.className = 'validation-ok';
    li.textContent = '✓ Map is valid';
    list.appendChild(li);
  } else {
    for (const error of result.errors) {
      const li = document.createElement('li');
      li.className = 'validation-error';
      li.textContent = `✗ ${error}`;
      list.appendChild(li);
    }
  }
}

/**
 * Save map to localStorage
 */
function handleSaveMap() {
  if (!currentMapAsset) {
    showFeedback('No map to save', 'error');
    return;
  }

  const result = validateMapAsset(currentMapAsset);
  if (!result.valid) {
    showFeedback('Cannot save invalid map. Fix errors first.', 'error');
    return;
  }

  try {
    const key = `map-${currentMapAsset.meta.id}`;
    localStorage.setItem(key, exportMapAsset(currentMapAsset));
    showFeedback(`Map saved: ${currentMapAsset.meta.name}`, 'success');
  } catch (err) {
    showFeedback(`Save failed: ${err.message}`, 'error');
  }
}

/**
 * Load map from localStorage
 */
function handleLoadMap() {
  const mapKeys = Object.keys(localStorage).filter(k => k.startsWith('map-'));
  
  if (mapKeys.length === 0) {
    showFeedback('No saved maps found', 'info');
    return;
  }

  // Simple prompt for now (could be enhanced with a modal)
  const mapList = mapKeys.map((k, i) => {
    const data = JSON.parse(localStorage.getItem(k));
    return `${i + 1}. ${data.meta.name} (${data.grid.size.width}x${data.grid.size.height})`;
  }).join('\n');

  const choice = prompt(`Select map to load:\n${mapList}\n\nEnter number:`);
  const index = parseInt(choice || '', 10) - 1;

  if (index >= 0 && index < mapKeys.length) {
    const key = mapKeys[index];
    const json = localStorage.getItem(key);
    const result = importMapAsset(json);

    if (result.ok) {
      currentMapAsset = result.mapAsset;
      showCanvasWrap();
      renderMap();
      validateAndDisplay();
      showFeedback(`Loaded map: ${currentMapAsset.meta.name}`, 'success');
    } else {
      showFeedback(`Load failed: ${result.errors.join(', ')}`, 'error');
    }
  }
}

/**
 * Export map as JSON file
 */
function handleExportMap() {
  if (!currentMapAsset) {
    showFeedback('No map to export', 'error');
    return;
  }

  const json = exportMapAsset(currentMapAsset);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentMapAsset.meta.name.replace(/\s+/g, '_')}.map.json`;
  a.click();
  URL.revokeObjectURL(url);
  showFeedback('Map exported', 'success');
}

/**
 * Use map in scenario builder (S1.4 Integration)
 */
function handleUseInScenario() {
  if (!currentMapAsset) {
    showFeedback('No map to use', 'error');
    return;
  }

  const result = validateMapAsset(currentMapAsset);
  if (!result.valid) {
    showFeedback('Cannot use invalid map. Fix errors first.', 'error');
    return;
  }

  // Convert map asset to state.map format
  const stateMap = mapAssetToStateMap(currentMapAsset);

  // Store in module state (avoids unsafe global augmentation)
  customMapState = stateMap;

  // Add to map selector if it exists
  const mapSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('map-select'));
  if (mapSelect) {
    const option = document.createElement('option');
    option.value = stateMap.id;
    option.textContent = `${stateMap.name} (Custom)`;
    mapSelect.appendChild(option);
    mapSelect.value = stateMap.id;
  }

  showFeedback(`Map ready for use in scenario: ${stateMap.name}`, 'success');
}

/**
 * Show feedback message
 */
function showFeedback(message, type) {
  const feedback = document.getElementById('map-editor-feedback');
  if (!feedback) return;

  feedback.textContent = message;
  feedback.className = type;

  setTimeout(() => {
    feedback.textContent = '';
    feedback.className = '';
  }, 3000);
}

/**
 * Get current custom map (for scenario builder integration)
 */
export function getCurrentCustomMap() {
  return customMapState;
}