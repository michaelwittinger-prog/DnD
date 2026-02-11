import { useState, useEffect, useCallback } from 'react';
import { BattlemapCanvas } from './components/BattlemapCanvas';
import { InfoPanel } from './components/InfoPanel';
import { sampleGameState } from './data/sampleGameState';
import { applyMapUpdates } from './engine/applyMapUpdates';
import type { MapUpdate, GameMap } from './engine/applyMapUpdates';
import './App.css';

// ---------------------------------------------------------------------------
// Client-side GameState type — wide enough for both local fixture & server data
// ---------------------------------------------------------------------------
interface GameState {
  session: {
    id: string;
    system: string;
    language: 'de' | 'en';
    scene_id: string;
    round: number;
    turn_index: number;
    active_entity_id: string;
    phase: 'setup' | 'exploration' | 'combat';
  };
  map: GameMap;
  entities: Array<{
    id: string;
    name: string;
    type: 'player' | 'npc';
    role: 'pc' | 'enemy' | 'ally' | 'neutral';
    stats: { ac: number; speed: number; attack_bonus: number; damage: string };
    hp: { current: number; max: number };
    conditions: string[];
    intent?: string;
    notes?: string;
  }>;
  rules_profile: Record<string, unknown>;
  log_compact: Record<string, unknown>;
}

/**
 * Hardcoded demo update: moves Aria from (2,3) to (4,3).
 * Conforms to aiResponse.schema.json move_entity operation.
 */
const DEMO_MAP_UPDATES: MapUpdate[] = [
  {
    op: 'move_entity',
    entity_id: 'pc-aria',
    from: { x: 2, y: 3 },
    to: { x: 4, y: 3 },
  },
];

function App() {
  const [gameState, setGameState] = useState<GameState>(sampleGameState as GameState);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [updateApplied, setUpdateApplied] = useState(false);
  const [serverStatus, setServerStatus] = useState<'loading' | 'ok' | 'fallback'>('loading');

  // Fetch initial gameState from server on mount
  useEffect(() => {
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: GameState) => {
        setGameState(data);
        setServerStatus('ok');
        console.log('[App] Loaded gameState from server');
      })
      .catch((err) => {
        console.warn('[App] Server unavailable, using local fixture:', err.message);
        setServerStatus('fallback');
      });
  }, []);

  const { session, map, entities } = gameState;

  // Build a lookup: entity_id -> role
  const entityRoles: Record<string, string> = {};
  for (const e of entities) {
    entityRoles[e.id] = e.role;
  }

  // Handle token click — toggle selection
  const handleTokenClick = useCallback((entityId: string) => {
    setSelectedEntityId((prev) => (prev === entityId ? null : entityId));
  }, []);

  // Apply demo map update
  const handleApplyDemoUpdate = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      map: applyMapUpdates(prev.map, DEMO_MAP_UPDATES),
    }));
    setUpdateApplied(true);
  }, []);

  // Reset — re-fetch from server or fall back to local fixture
  const handleReset = useCallback(() => {
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: GameState) => {
        setGameState(data);
      })
      .catch(() => {
        setGameState(sampleGameState as GameState);
      });
    setSelectedEntityId(null);
    setUpdateApplied(false);
  }, []);

  // Find selected entity details
  const selectedEntity = selectedEntityId
    ? entities.find((e) => e.id === selectedEntityId)
    : null;

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>AI GM RPG — Battlemap MVP</h1>
        <span className="server-badge">
          {serverStatus === 'loading' && '⏳ connecting…'}
          {serverStatus === 'ok' && '🟢 server'}
          {serverStatus === 'fallback' && '🟡 local'}
        </span>
      </header>
      <main className="app-main">
        <div className="battlemap-column">
          <BattlemapCanvas
            grid={map.grid}
            terrain={map.terrain}
            objects={map.objects}
            entitiesOnMap={map.entities_on_map}
            activeEntityId={session.active_entity_id}
            selectedEntityId={selectedEntityId}
            entityRoles={entityRoles}
            onTokenClick={handleTokenClick}
          />

          {/* Selection info */}
          {selectedEntity && (
            <div className="selection-bar">
              Selected: <strong>{selectedEntity.name}</strong> ({selectedEntity.role})
              — HP: {selectedEntity.hp.current}/{selectedEntity.hp.max}
              {selectedEntity.conditions.length > 0 &&
                ` — Conditions: ${selectedEntity.conditions.join(', ')}`}
            </div>
          )}

          {/* Action buttons */}
          <div className="action-bar">
            <button
              className="action-btn"
              onClick={handleApplyDemoUpdate}
              disabled={updateApplied}
            >
              {updateApplied ? '✓ Demo update applied' : '▶ Apply demo update (move Aria → 4,3)'}
            </button>
            {updateApplied && (
              <button className="action-btn reset-btn" onClick={handleReset}>
                ↺ Reset
              </button>
            )}
          </div>
        </div>

        <aside className="info-panel-container">
          <InfoPanel session={session} entities={entities} />
        </aside>
      </main>
    </div>
  );
}

export default App;
