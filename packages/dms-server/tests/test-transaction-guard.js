/**
 * Guard: no hand-rolled transactions outside the adapters (dms-server-real-transactions.md).
 *
 * A "transaction" built from BEGIN / COMMIT sent through the adapter's ordinary query() — or
 * the removed beginTransaction/commitTransaction/rollbackTransaction — is not one: on Postgres
 * each statement draws an arbitrary pooled connection (Bug 14), and on SQLite every other
 * caller's queries land inside it. Only db.withTransaction(fn) is safe. This test fails the
 * build when one of those patterns reappears in src/ or tests/.
 *
 * Allowed: src/db/adapters/ (they implement withTransaction) and src/scripts/ (single-caller
 * maintenance scripts that already hold a dedicated getConnection() client for BEGIN/COMMIT).
 * No database needed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN = ['src', 'tests'];
const ALLOWED = [
  path.join('src', 'db', 'adapters') + path.sep,
  path.join('src', 'scripts') + path.sep,
  path.join('tests', path.basename(__filename)),
];

const PATTERNS = [
  { re: /\b(begin|commit|rollback)Transaction\s*\(/, why: 'removed API — use db.withTransaction(fn)' },
  { re: /\bquery\s*\(\s*['"`]\s*BEGIN\b/i, why: 'BEGIN through query() is not a transaction — use db.withTransaction(fn)' },
  { re: /\bexec\s*\(\s*['"`]\s*BEGIN\b/i, why: 'raw BEGIN on the shared SQLite connection bypasses its lock — use db.withTransaction(fn)' },
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(c|m)?js$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
let scanned = 0;
for (const top of SCAN) {
  for (const file of walk(path.join(ROOT, top), [])) {
    const rel = path.relative(ROOT, file);
    if (ALLOWED.some((a) => rel === a || rel.startsWith(a))) continue;
    scanned++;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, ''); // ignore end-of-line comments
      if (/^\s*\*/.test(code)) return;          // ignore JSDoc/block-comment lines
      for (const { re, why } of PATTERNS) {
        if (re.test(code)) violations.push(`${rel}:${i + 1}: ${line.trim()}\n      → ${why}`);
      }
    });
  }
}

console.log(`=== Transaction guard: scanned ${scanned} files in ${SCAN.join(', ')} ===`);
if (violations.length) {
  console.log(`  ✗ ${violations.length} hand-rolled transaction(s) outside the adapters:\n`);
  for (const v of violations) console.log(`    ${v}`);
  process.exit(1);
}
console.log('  ✓ no begin/commit/rollbackTransaction( or query/exec(\'BEGIN\' outside src/db/adapters and src/scripts');
