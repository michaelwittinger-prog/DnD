#!/usr/bin/env node
/**
 * remove-identical-mts-duplicates.mjs
 *
 * Package 5 — Workstream A: Seam burn-down.
 *
 * Finds all .mts files that have a sibling .mjs file with identical content
 * and removes the .mts duplicate. Reports diverged pairs for manual review.
 *
 * Usage:
 *   node scripts/remove-identical-mts-duplicates.mjs          # dry-run (default)
 *   node scripts/remove-identical-mts-duplicates.mjs --apply   # actually delete
 */
import { readdirSync, statSync, readFileSync, unlinkSync } from "node:fs";
import { join, extname, basename } from "node:path";

const apply = process.argv.includes("--apply");
const srcRoot = "src";

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const allFiles = walk(srcRoot);
const mtsFiles = allFiles.filter((f) => extname(f) === ".mts");

const identical = [];
const diverged = [];
const orphaned = []; // .mts with no .mjs sibling

for (const mtsPath of mtsFiles) {
  const mjsPath = mtsPath.replace(/\.mts$/, ".mjs");
  const mjsExists = allFiles.includes(mjsPath);

  if (!mjsExists) {
    orphaned.push(mtsPath);
    continue;
  }

  const mtsContent = readFileSync(mtsPath);
  const mjsContent = readFileSync(mjsPath);

  if (mtsContent.equals(mjsContent)) {
    identical.push(mtsPath);
  } else {
    diverged.push({ mts: mtsPath, mjs: mjsPath, mtsSz: mtsContent.length, mjsSz: mjsContent.length });
  }
}

console.log(`\n=== MTS Duplicate Analysis ===`);
console.log(`Total .mts files: ${mtsFiles.length}`);
console.log(`Identical to .mjs (safe to delete): ${identical.length}`);
console.log(`Diverged from .mjs (manual review): ${diverged.length}`);
console.log(`Orphaned .mts (no .mjs sibling):    ${orphaned.length}`);

if (identical.length > 0) {
  console.log(`\n--- Identical .mts files ${apply ? "(DELETING)" : "(dry-run)"} ---`);
  for (const f of identical.sort()) {
    if (apply) {
      unlinkSync(f);
      console.log(`  DELETED  ${f}`);
    } else {
      console.log(`  would delete  ${f}`);
    }
  }
}

if (diverged.length > 0) {
  console.log(`\n--- Diverged pairs (KEEP BOTH — manual review needed) ---`);
  for (const d of diverged) {
    console.log(`  ${d.mts}  (mts=${d.mtsSz}B  mjs=${d.mjsSz}B)`);
  }
}

if (orphaned.length > 0) {
  console.log(`\n--- Orphaned .mts (no .mjs sibling) ---`);
  for (const f of orphaned.sort()) {
    console.log(`  ${f}`);
  }
}

if (!apply && identical.length > 0) {
  console.log(`\nRun with --apply to actually delete ${identical.length} identical .mts files.`);
}

console.log(`\nDone.`);