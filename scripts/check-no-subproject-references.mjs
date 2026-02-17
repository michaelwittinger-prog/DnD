import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'subprojects', '_registry.json');

const SCAN_ROOTS = ['src', 'scripts', 'docs', '.github/workflows'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'archive']);
const TEXT_FILE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.js',
  '.mjs',
  '.ts',
  '.mts',
  '.cjs',
  '.cts'
]);

function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.subprojects)) {
    throw new Error('Invalid subprojects/_registry.json: missing subprojects array');
  }
  return parsed.subprojects;
}

function collectFiles(dir, out = []) {
  if (!statSync(dir).isDirectory()) return out;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.DS_Store')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(fullPath, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_FILE_EXTENSIONS.has(ext)) out.push(fullPath);
    }
  }
  return out;
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function normalizedNeedles(subprojectPath) {
  const posix = toPosix(subprojectPath).replace(/^\.\//, '');
  const win = posix.replace(/\//g, '\\');
  return [posix, win];
}

function main() {
  const subprojects = loadRegistry();
  const blocked = subprojects.filter((s) => s.status === 'finalized' || s.status === 'archived');

  if (blocked.length === 0) {
    console.log('No finalized/archived subprojects in registry. Check skipped.');
    process.exit(0);
  }

  const filesToScan = SCAN_ROOTS.flatMap((scanRoot) => {
    const abs = path.join(ROOT, scanRoot);
    try {
      return collectFiles(abs);
    } catch {
      return [];
    }
  });

  const violations = [];

  for (const file of filesToScan) {
    const rel = toPosix(path.relative(ROOT, file));

    // Explicitly do not treat subproject files as violations in this checker.
    if (rel.startsWith('subprojects/')) continue;

    const content = readFileSync(file, 'utf8');
    for (const item of blocked) {
      const needles = normalizedNeedles(item.path || `subprojects/${item.id}`);
      for (const needle of needles) {
        if (needle && content.includes(needle)) {
          violations.push({ file: rel, subprojectId: item.id, needle });
          break;
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('Blocked references to finalized/archived subprojects detected:');
    for (const v of violations) {
      console.error(`- ${v.file} -> ${v.subprojectId} (${v.needle})`);
    }
    process.exit(1);
  }

  console.log('Subproject reference check passed: no blocked references found.');
}

main();
