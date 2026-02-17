import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');

const SUSPICIOUS_PATTERNS = [
  /replays[_-]?temp[_-]?state/i,
  /^c[:\u003a]?users.*replays.*state.*\.json$/i
];

function listRootFiles() {
  return readdirSync(ROOT)
    .filter((name) => {
      const p = path.join(ROOT, name);
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function isSuspiciousFileName(name) {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(name));
}

function main() {
  const rootFiles = listRootFiles();
  const hits = rootFiles.filter(isSuspiciousFileName);

  if (hits.length === 0) {
    console.log('Temp artifact check passed: no suspicious root temp-state files found.');
    process.exit(0);
  }

  const prefix = STRICT ? 'Temp artifact check failed.' : 'Temp artifact check warning.';
  console.error(`${prefix} Suspicious root files detected:`);
  for (const file of hits) {
    console.error(`- ${file}`);
  }
  console.error('Action: remove or relocate these artifacts, then rerun check.');
  if (STRICT) {
    process.exit(1);
  }
  console.error('Non-strict mode enabled; continuing with warning only.');
  process.exit(0);
}

if (!existsSync(ROOT)) {
  console.error('Unable to resolve repository root.');
  process.exit(1);
}

main();
