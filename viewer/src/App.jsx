import { useState, useEffect, useCallback } from "react";
import "./App.css";

const API_BASE = "/api";
const STATE_URL = "/game_state.view.json";
const RULES_URL = "/rules_report.view.json";
const AI_URL = "/ai_response.view.json";
const LOG_LIMIT = 10;

const FIXTURE_OPTIONS = [
  { label: "None (use OpenAI)", value: "" },
  { label: "Legal move", value: "fixtures/ai_response_legal_move.json" },
  { label: "Illegal: collision", value: "fixtures/ai_response_illegal_collision.json" },
  { label: "Illegal: spawn no GM", value: "fixtures/ai_response_illegal_spawn_no_gm.json" },
];

export default function App() {
  const [state, setState] = useState(null);
  const [rulesReport, setRulesReport] = useState(null);
  const [aiResponse, setAiResponse] = useState(null);
  const [errors, setErrors] = useState({});
  const [lastLoaded, setLastLoaded] = useState(null);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [apiAvailable, setApiAvailable] = useState(null); // null=unknown, true/false
  const [turnResult, setTurnResult] = useState(null); // last turn result toast

  // ── Check API availability ────────────────────────────────────────
  const checkApi = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + "/health");
      if (res.ok) { setApiAvailable(true); return true; }
    } catch {}
    setApiAvailable(false);
    return false;
  }, []);

  // ── Load data: prefer API, fallback to files ──────────────────────
  const loadAll = useCallback(async () => {
    const errs = {};

    // Try API first
    const hasApi = await checkApi();
    if (hasApi) {
      try {
        const res = await fetch(API_BASE + "/latest");
        if (res.ok) {
          const data = await res.json();
          if (data.gameState) { setState(data.gameState); setLastLoaded(new Date().toLocaleTimeString()); }
          else errs.state = "API returned null gameState";
          setAiResponse(data.aiResponse || null);
          setRulesReport(data.rulesReport || null);
          setErrors(errs);
          return;
        }
      } catch {}
    }

    // Fallback: load from public files
    try {
      const res = await fetch(STATE_URL + "?t=" + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState(await res.json());
      setLastLoaded(new Date().toLocaleTimeString());
    } catch (err) {
      errs.state = err.message;
    }

    try {
      const res = await fetch(AI_URL + "?t=" + Date.now());
      if (res.ok) setAiResponse(await res.json());
      else setAiResponse(null);
    } catch { setAiResponse(null); }

    try {
      const res = await fetch(RULES_URL + "?t=" + Date.now());
      if (res.ok) setRulesReport(await res.json());
      else setRulesReport(null);
    } catch { setRulesReport(null); }

    setErrors(errs);
  }, [checkApi]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const selectedEntity = state?.entities?.find((e) => e.id === selectedEntityId) ?? null;

  // ── Error banners ────────────────────────────────────────────────
  if (errors.state) {
    return (
      <div className="app">
        <h1>⚔ Battlemap Viewer</h1>
        <div className="error-banner">⛔ Failed to load game state: {errors.state}</div>
        {apiAvailable === false && (
          <div className="error-banner">
            ℹ Local API not running. Start it with: <code>npm run api</code>
          </div>
        )}
        <button onClick={loadAll}>Retry</button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="app">
        <h1>⚔ Battlemap Viewer</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>⚔ {state.map?.name || "Battlemap"}</h1>
          <TurnIndicator state={state} />
          {apiAvailable === true && <span className="api-badge">API ●</span>}
          {apiAvailable === false && <span className="api-badge offline">API ○</span>}
        </div>
        <button onClick={loadAll}>↻ Reload</button>
      </header>

      {turnResult && <TurnResultBanner result={turnResult} onDismiss={() => setTurnResult(null)} />}

      <div className="main-layout">
        <div className="map-column">
          <Battlemap state={state} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} />
        </div>
        <div className="side-column">
          <EntityInspector entity={selectedEntity} />
          <IntentPanel apiAvailable={apiAvailable} onTurnComplete={(r) => { setTurnResult(r); loadAll(); }} />
        </div>
      </div>

      <AiProposalPanel aiResponse={aiResponse} rulesReport={rulesReport} />
      <ViolationsPanel report={rulesReport} />
      <EventLogPanel state={state} />
      <DebugPanel state={state} lastLoaded={lastLoaded} />
    </div>
  );
}

/* ── Turn Result Banner ─────────────────────────────────────────────── */

function TurnResultBanner({ result, onDismiss }) {
  const cls = result.ok ? "toast toast-pass" : "toast toast-fail";
  return (
    <div className={cls}>
      <div className="toast-header">
        <strong>{result.ok ? "✅ PASS" : "❌ FAIL"}</strong>
        {result.failureGate && <span> — {result.failureGate}</span>}
        <button className="btn-sm toast-close" onClick={onDismiss}>✕</button>
      </div>
      {result.bundleName && (
        <div className="toast-bundle">
          📦 <code>{result.bundleName}</code>
          <button className="btn-sm" onClick={() => navigator.clipboard?.writeText(result.bundlePath || result.bundleName)}>Copy</button>
        </div>
      )}
      {result.violations?.length > 0 && (
        <ul className="toast-violations">
          {result.violations.map((v, i) => (
            <li key={i}><code>{v.code}</code> — {v.message}</li>
          ))}
        </ul>
      )}
      {result.error && <p className="toast-error">{result.error}</p>}
    </div>
  );
}

/* ── Intent Panel ───────────────────────────────────────────────────── */

function IntentPanel({ apiAvailable, onTurnComplete }) {
  const [intentText, setIntentText] = useState("I move Seren two squares east and attack Captain Voss.");
  const [fixture, setFixture] = useState("");
  const [seed, setSeed] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (running) return;
    setRunning(true);

    const body = {
      intent: {
        player_id: "pc-01",
        action: intentText,
        free_text: intentText,
      },
    };
    if (fixture) body.useFixture = fixture;
    if (seed) body.seed = Number(seed);

    try {
      const res = await fetch(API_BASE + "/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      onTurnComplete(data);
    } catch (err) {
      onTurnComplete({ ok: false, error: "API not reachable: " + err.message, violations: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel intent-panel">
      <strong>🎯 Player Intent</strong>
      <textarea
        className="intent-textarea"
        rows={3}
        value={intentText}
        onChange={(e) => setIntentText(e.target.value)}
        placeholder="Describe what your character does..."
      />
      <div className="intent-row">
        <label>
          Fixture:
          <select value={fixture} onChange={(e) => setFixture(e.target.value)}>
            {FIXTURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="intent-row">
        <label>
          Seed: <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="optional" className="seed-input" />
        </label>
      </div>
      <button
        className={running ? "btn-run btn-running" : "btn-run"}
        onClick={handleRun}
        disabled={running || apiAvailable === false}
      >
        {running ? "⏳ Running…" : "▶ Run Turn"}
      </button>
      {apiAvailable === false && (
        <p className="muted">API offline — start with <code>npm run api</code></p>
      )}
    </div>
  );
}

/* ── Turn Indicator ─────────────────────────────────────────────────── */

function TurnIndicator({ state }) {
  const turn = state.timeline?.turn;
  if (turn === undefined) return null;
  return <span className="turn-badge">Turn {turn}</span>;
}

/* ── Grid Battlemap ─────────────────────────────────────────────────── */

function Battlemap({ state, selectedEntityId, onSelectEntity }) {
  const { width, height } = state.map.dimensions;
  const entities = state.entities || [];
  const tiles = state.map.tiles || [];

  const terrainMap = {};
  for (const t of tiles) terrainMap[`${t.x},${t.y}`] = t.terrain;

  const entityMap = {};
  for (const e of entities) {
    if (e.position) entityMap[`${e.position.x},${e.position.y}`] = e;
  }

  const cellSize = Math.min(40, Math.floor(800 / Math.max(width, height)));

  const handleCellClick = (entity) => {
    if (entity) onSelectEntity(entity.id === selectedEntityId ? null : entity.id);
    else onSelectEntity(null);
  };

  const rows = [];
  for (let y = 0; y < height; y++) {
    const cells = [];
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const terrain = terrainMap[key];
      const entity = entityMap[key];
      const isSelected = entity && entity.id === selectedEntityId;

      const classNames = ["cell"];
      if (terrain) classNames.push(`terrain-${terrain}`);
      if (entity) classNames.push("has-entity");
      if (isSelected) classNames.push("cell-selected");

      cells.push(
        <td key={key} className={classNames.join(" ")} style={{ width: cellSize, height: cellSize }}
          title={`(${x},${y})${terrain ? " " + terrain : ""}${entity ? " — " + entity.name : ""}`}
          onClick={() => handleCellClick(entity)}
        >
          {entity && <Token entity={entity} size={cellSize} isSelected={isSelected} />}
        </td>
      );
    }
    rows.push(<tr key={y}>{cells}</tr>);
  }

  return (
    <div className="battlemap-wrapper">
      <table className="battlemap"><tbody>{rows}</tbody></table>
    </div>
  );
}

/* ── Token ──────────────────────────────────────────────────────────── */

function Token({ entity, size, isSelected }) {
  const label = entity.name.slice(0, 3).toUpperCase();
  const hp = entity.stats?.hp;
  const isPlayer = entity.type === "player";
  const tokenSize = Math.max(size - 8, 16);

  const classNames = ["token"];
  classNames.push(isPlayer ? "token-player" : "token-npc");
  if (isSelected) classNames.push("token-selected");

  return (
    <div className={classNames.join(" ")} style={{ width: tokenSize, height: tokenSize }}>
      <span className="token-label">{label}</span>
      {hp !== undefined && <span className="token-hp">{hp}</span>}
    </div>
  );
}

/* ── Entity Inspector ───────────────────────────────────────────────── */

function EntityInspector({ entity }) {
  if (!entity) {
    return (
      <div className="panel inspector-panel">
        <strong>🔍 Entity Inspector</strong>
        <p className="muted">Click a token to inspect.</p>
      </div>
    );
  }

  const rows = [["id", entity.id], ["name", entity.name], ["type", entity.type]];
  if (entity.position) rows.push(["position", `(${entity.position.x}, ${entity.position.y})`]);
  if (entity.stats) {
    for (const [k, v] of Object.entries(entity.stats)) rows.push([k, String(v)]);
  }

  return (
    <div className="panel inspector-panel">
      <strong>🔍 {entity.name}</strong>
      <table className="inspector-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td className="inspector-key">{k}</td><td className="inspector-val">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── AI Proposal Panel ──────────────────────────────────────────────── */

function AiProposalPanel({ aiResponse, rulesReport }) {
  if (!aiResponse) return null;

  const mapOps = aiResponse.map_updates ?? [];
  const stateOps = aiResponse.state_updates ?? [];
  const allOps = [
    ...mapOps.map((op, i) => ({ ...op, _path: `map_updates[${i}]` })),
    ...stateOps.map((op, i) => ({ ...op, _path: `state_updates[${i}]` })),
  ];

  const violationPaths = new Set();
  for (const v of rulesReport?.violations ?? []) violationPaths.add(v.path);

  return (
    <div className="panel proposal-panel">
      <strong>🤖 AI Proposal</strong>
      {aiResponse.narration && <p className="narration">"{aiResponse.narration}"</p>}
      {allOps.length === 0 ? (
        <p className="muted">No operations proposed.</p>
      ) : (
        <table className="ops-table">
          <thead><tr><th>Op</th><th>Target</th><th>Details</th><th></th></tr></thead>
          <tbody>
            {allOps.map((op, i) => {
              const hasViolation = violationPaths.has(op._path);
              return (
                <tr key={i} className={hasViolation ? "op-violated" : ""}>
                  <td><code>{op.op}</code></td>
                  <td><code>{op.entity_id || op.entity?.id || "—"}</code></td>
                  <td className="op-details">{opDetails(op)}</td>
                  <td>{hasViolation && <span className="violation-marker">⛔</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function opDetails(op) {
  switch (op.op) {
    case "move_entity": return `→ (${op.to?.x}, ${op.to?.y})`;
    case "spawn_entity": return `at (${op.entity?.pos?.x}, ${op.entity?.pos?.y})`;
    case "remove_entity": return "remove";
    case "set_hp": return `hp = ${op.current}`;
    case "add_event_log": return op.event?.intent ?? "log";
    case "advance_turn": return `turn ${op.turn_index ?? "?"}`;
    default: return JSON.stringify(op).slice(0, 40);
  }
}

/* ── Violations Panel ───────────────────────────────────────────────── */

function ViolationsPanel({ report }) {
  if (!report) return null;
  const violations = report.violations ?? [];
  const errs = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  return (
    <div className="panel violations-panel">
      <strong>📋 Rules Report</strong>
      {violations.length === 0 ? (
        <p className="rules-pass">✅ All rules passed</p>
      ) : (
        <>
          {errs.length > 0 && (
            <div className="violation-group">
              <span className="violation-group-label error-label">Errors ({errs.length})</span>
              <ul>{errs.map((v, i) => (
                <li key={i} className="violation-error"><code>{v.code}</code><span className="violation-path">@ {v.path}</span><br /><span className="violation-msg">{v.message}</span></li>
              ))}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="violation-group">
              <span className="violation-group-label warning-label">Warnings ({warnings.length})</span>
              <ul>{warnings.map((v, i) => (
                <li key={i} className="violation-warning"><code>{v.code}</code><span className="violation-path">@ {v.path}</span><br /><span className="violation-msg">{v.message}</span></li>
              ))}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Event Log Panel ────────────────────────────────────────────────── */

function EventLogPanel({ state }) {
  const [expanded, setExpanded] = useState(false);
  const logs = state.logs ?? [];
  if (logs.length === 0) return null;
  const visible = expanded ? logs : logs.slice(-LOG_LIMIT);

  return (
    <div className="panel log-panel">
      <div className="panel-header-row">
        <strong>📜 Event Log ({logs.length})</strong>
        {logs.length > LOG_LIMIT && (
          <button className="btn-sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Collapse" : `Show all ${logs.length}`}
          </button>
        )}
      </div>
      <ul className="log-list">
        {visible.map((log) => (
          <li key={log.id} className="log-entry">
            {log.timestamp && <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>}
            <span className="log-msg">{log.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Debug Panel ────────────────────────────────────────────────────── */

function DebugPanel({ state, lastLoaded }) {
  const entityCount = state.entities?.length ?? 0;
  const schemaVersion = state.meta?.schemaVersion ?? "?";

  return (
    <div className="debug-panel">
      <strong>Debug</strong>
      <span>schemaVersion: <code>{schemaVersion}</code></span>
      <span>entities: <code>{entityCount}</code></span>
      <span>map: <code>{state.map.dimensions.width}×{state.map.dimensions.height}</code></span>
      {lastLoaded && <span>loaded: <code>{lastLoaded}</code></span>}
    </div>
  );
}
