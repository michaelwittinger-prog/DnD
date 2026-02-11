/**
 * gen-demo-replay.mjs — Generate demo_showcase.replay.json
 * MIR 4.3
 */
import { readFileSync, writeFileSync } from "fs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { stateHash } from "../src/replay/hash.mjs";

const scenario = JSON.parse(readFileSync("scenarios/tavern_skirmish.scenario.json", "utf-8"));
let state = structuredClone(scenario.initialState);
const steps = [];

function step(action, expectReject = false) {
  const r = applyAction(state, action);
  state = r.nextState;
  const s = {
    action: expectReject ? { ...action, _expectReject: true } : action,
    expectedEvents: r.events.map((e) => ({ type: e.type })),
    expectedStateHash: stateHash(state),
  };
  steps.push(s);
  const label = r.success ? "✓" : "✗";
  console.log(`  ${label} ${action.type} → ${r.events.map((e) => e.type).join(",")}`);
}

console.log("Building demo_showcase replay...");

// 1. Move Seren
step({ type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] });

// 2. Roll initiative
step({ type: "ROLL_INITIATIVE" });

// 3. Attack from active entity
const active1 = state.combat.activeEntityId;
const targets = state.combat.initiativeOrder.filter((id) => id !== active1);
step({ type: "ATTACK", attackerId: active1, targetId: targets[0] });

// 4. End turn
step({ type: "END_TURN", entityId: active1 });

// 5. Rejected move (blocked cell) — mark as expected rejection
const active2 = state.combat.activeEntityId;
const blocked = state.map.terrain.find((t) => t.blocksMovement);
step({ type: "MOVE", entityId: active2, path: [{ x: blocked.x, y: blocked.y }] }, true);

// 6. Valid move from active entity
const ent = [...state.entities.players, ...state.entities.npcs].find((e) => e.id === active2);
const newX = Math.min(ent.position.x + 1, state.map.grid.size.width - 1);
step({ type: "MOVE", entityId: active2, path: [{ x: newX, y: ent.position.y }] });

const bundle = {
  meta: {
    id: "demo-showcase",
    createdAt: "2026-02-11T18:00:00Z",
    schemaVersion: "0.1.0",
    engineVersion: "1.4",
    notes: "MIR 4.3 Demo Showcase: move, initiative, attack, end turn, rejected move, valid move",
  },
  initialState: scenario.initialState,
  steps,
  final: { expectedStateHash: stateHash(state) },
};

writeFileSync("replays/demo_showcase.replay.json", JSON.stringify(bundle, null, 2));
console.log(`Written: replays/demo_showcase.replay.json (${steps.length} steps, hash: ${stateHash(state)})`);
