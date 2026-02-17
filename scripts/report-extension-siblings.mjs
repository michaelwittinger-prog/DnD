import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOT = path.join(ROOT, 'src');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function walk(dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.mjs') && !entry.name.endsWith('.mts')) continue;
    out.push(full);
  }
  return out;
}

function main() {
  if (!statSync(SCAN_ROOT).isDirectory()) {
    console.log('No src directory found.');
    process.exit(0);
  }

  const files = walk(SCAN_ROOT);
  const byBase = new Map();

  for (const file of files) {
    const rel = toPosix(path.relative(ROOT, file));
    const ext = path.extname(rel);
    const base = rel.slice(0, -ext.length);
    const exts = byBase.get(base) || new Set();
    exts.add(ext);
    byBase.set(base, exts);
  }

  const siblings = [...byBase.entries()]
    .filter(([, exts]) => exts.has('.mjs') && exts.has('.mts'))
    .map(([base]) => base)
    .sort();

  console.log('Extension sibling inventory (.mjs + .mts):');
  console.log(`- total sibling pairs: ${siblings.length}`);
  for (const base of siblings) {
    console.log(`  - ${base}.{mjs,mts}`);
  }
}

main();
