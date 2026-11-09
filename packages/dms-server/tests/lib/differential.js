'use strict';

/**
 * Run a KIND-auth contract suite against the ROW judge and compare the failures to a pinned list.
 *
 * A kind suite encodes kind auth's contract and stays that way — green on its own default flag, not
 * ours to edit. Pointing it at the row judge is NOT a pass/fail gate: row auth deliberately
 * differs, and expecting identical results is a category error.
 *
 * What it IS, and the only mechanical check we have for it: proof that row auth has not silently
 * dropped a protection kind auth had. So:
 *
 *   - a disagreement that is not in the fixture FAILS — it is a new finding;
 *   - a pinned disagreement that starts passing is REPORTED, never failed, because closing one is
 *     progress and must not break the build. Delete the entry when that happens.
 *
 * Replacing this with a fresh suite that asserts what row auth does today would lose exactly the
 * thing it is for: a fresh suite is green by construction and can never tell you something was
 * given up.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

function runDifferential({ suite, fixturePath, env, doneRe, title }) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const expected = fixture.expected || {};
  const cascade = new Set(fixture.cascade || []);
  const reasons = fixture.reasons || {};

  let out;
  try {
    out = execFileSync(process.execPath, [suite], {
      env: { ...process.env, ...env }, encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;   // a non-zero exit is the NORMAL outcome here
  }
  if (!doneRe.test(out)) {
    console.error('The suite did not run to completion — this check cannot judge its output.\n');
    console.error(out.split('\n').slice(-25).join('\n'));
    process.exit(1);
  }

  const failed = out.split('\n')
    .filter(l => l.trimStart().startsWith('✗'))
    .map(l => l.replace(/^\s*✗\s*/, '').trim());
  const pinned = new Set([...Object.keys(expected), ...cascade]);
  const unexpected = failed.filter(n => !pinned.has(n));
  const resolved = [...pinned].filter(n => !failed.includes(n));

  console.log(`\n${title}: ${failed.length} disagreement(s)\n`);
  const byCategory = {};
  for (const n of failed) {
    const cat = cascade.has(n) ? 'cascade' : (expected[n] || 'UNEXPECTED');
    (byCategory[cat] = byCategory[cat] || []).push(n);
  }
  for (const [cat, names] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat} — ${names.length}`);
    if (reasons[cat]) console.log(`      ${reasons[cat]}`);
    for (const n of names) console.log(`      · ${n}`);
    console.log('');
  }
  if (resolved.length) {
    console.log('  RESOLVED since the fixture was written — remove these entries:');
    for (const n of resolved) console.log(`      · ${n}`);
    console.log('');
  }
  if (unexpected.length) {
    console.log(`  ✗ ${unexpected.length} UNEXPECTED disagreement(s) — row auth differs somewhere nobody recorded:`);
    for (const n of unexpected) console.log(`      · ${n}`);
    console.log(`\n  Decide what it means, then add it to ${fixturePath.split('/').slice(-2).join('/')}`);
    console.log('  WITH A REASON — or fix the judge.\n');
    process.exit(1);
  }
  const open = byCategory.OPEN || [];
  console.log(`  ✓ no unexpected disagreements (${failed.length} pinned, ${resolved.length} resolved)`);
  console.log(open.length
    ? `  ⚠ ${open.length} marked OPEN — must close before this gate goes to enforce\n` : '');
  process.exit(0);
}

module.exports = { runDifferential };
