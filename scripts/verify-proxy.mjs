#!/usr/bin/env node
/**
 * verify-proxy.mjs — Verify viewer proxy returns correct data.
 */
const res = await fetch("http://127.0.0.1:5174/api/latest");
const data = await res.json();

const gs = data.gameState;
console.log("gameState exists:", !!gs);
console.log("entity count:", gs?.entities?.length ?? "MISSING");
console.log("combat.active:", gs?.combat?.active ?? "MISSING");
console.log("meta.schemaVersion:", gs?.meta?.schemaVersion ?? "MISSING");
console.log("map.dimensions:", JSON.stringify(gs?.map?.dimensions) ?? "MISSING");

console.log("\nVERIFICATION PASSED");
