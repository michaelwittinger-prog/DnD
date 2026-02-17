/**
 * repo-cleanup-safe.mjs
 *
 * Shell-agnostic, idempotent, path-validated repo cleanup runner.
 *
 * Design goals:
 *  - Works on Windows PowerShell 5.1, PowerShell 7, Bash, Git Bash.
 *  - No external tools required (no rg, no ripgrep, no bash-only operators).
 *  - Validates each target before acting; reports skip/delete/error per entry.
 *  - Exits 0 (clean), 1 (actionable warning), 2 (hard error).
 *  - Dry-run mode: pass --dry-run to preview without deleting.
 *  - Idempotent: running twice is safe and produces the same result.
 *
 * Usage:
 *   node scripts/repo-cleanup-safe.mjs              # live run
 *   node scripts/repo-cleanup-safe.mjs --dry-run    # preview only
 *   node scripts/repo-cleanup-safe.mjs --verify     # alias for --dry-run (CI-friendly)
 */

import { existsSync, rmSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('--verify');

// ─────────────────────────────────────────────────────────────
// Windows reserved device names — never valid as file paths
// ─────────────────────────────────────────────────────────────
const WINDOWS_RESERVED = new Set([
  'nul', 'con', 'prn', 'aux',
  'com1','com2','com3','com4','com5','com6','com7','com8','com9',
  'lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9',
]);

// ─────────────────────────────────────────────────────────────
// Targets to remove (repo-relative paths)
// Add entries here for any future cleanup tasks.
// ─────────────────────────────────────────────────────────────
const TARGETS = [
  // Legacy .mts siblings that were replaced by .mjs equivalents
  'src/ui/main.mts',
  'src/ui/serve.mts',
  'src/ui/browserOpenAIAdapter.mts',
  'src/server/localApiServer.mts',
  // Temp artifacts
  'turn_request.json',
  'cUsersmichaDnDreplays_temp_state.json',  // garbled temp dump (may already be gone)
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isReservedDeviceName(p) {
  const name = basename(p).toLowerCase().replace(/\.[^.]*$/, '');
  return WINDOWS_RESERVED.has(name);
}

function safeRemove(relPath) {
  const absPath = resolve(ROOT, relPath);

  // Guard 1: reserved device name
  if (isReservedDeviceName(relPath)) {
    return { status: 'SKIPPED', reason: 'Windows reserved device name', path: relPath };
  }

  // Guard 2: path must be inside repo root
  if (!absPath.startsWith(ROOT)) {
    return { status: 'ERROR', reason: 'Path escapes repo root (security block)', path: relPath };
  }

  // Guard 3: existence check
  if (!existsSync(absPath)) {
    return { status: 'SKIPPED', reason: 'does not exist (already clean)', path: relPath };
  }

  // Guard 4: must be a file, not a directory
  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    return { status: 'SKIPPED', reason: 'is a directory — manual review required', path: relPath };
  }

  if (DRY_RUN) {
    return { status: 'DRY_RUN', reason: 'would be deleted', path: relPath };
  }

  try {
    rmSync(absPath, { force: true });
    return { status: 'DELETED', reason: '', path: relPath };
  } catch (err) {
    return { status: 'ERROR', reason: err.message, path: relPath };
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

console.log(`\nrepo-cleanup-safe  [${DRY_RUN ? 'DRY-RUN / VERIFY' : 'LIVE'}]`);
console.log(`Root: ${ROOT}\n`);

const results = TARGETS.map(safeRemove);

// Print report
const pad = Math.max(...results.map(r => r.path.length)) + 2;
for (const r of results) {
  const label = r.status.padEnd(10);
  const path  = r.path.padEnd(pad);
  const note  = r.reason ? `  (${r.reason})` : '';
  console.log(`  [${label}]  ${path}${note}`);
}

const deleted = results.filter(r => r.status === 'DELETED').length;
const dryRun  = results.filter(r => r.status === 'DRY_RUN').length;
const skipped = results.filter(r => r.status === 'SKIPPED').length;
const errors  = results.filter(r => r.status === 'ERROR').length;

console.log('\n─────────────────────────────────');
if (DRY_RUN) {
  console.log(`Summary: ${dryRun} would be deleted | ${skipped} already clean | ${errors} errors`);
} else {
  console.log(`Summary: ${deleted} deleted | ${skipped} already clean | ${errors} errors`);
}
console.log('─────────────────────────────────\n');

if (errors > 0) {
  console.error('ERROR: one or more entries could not be processed. See details above.');
  process.exit(2);
}

if (DRY_RUN && dryRun > 0) {
  console.log('Dry-run complete. Re-run without --dry-run to apply changes.');
}

process.exit(0);
