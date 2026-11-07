/* global process */
// What the registry declares for dms-server: the rows of its `formats` table (declarations.js) and,
// for one more release, the stamp on new rows (stampPatternRow / stampSiteRow). The server's built-in
// rules copy (dms-server/src/routes/auth/rules.js) stays identical to the formats while it exists.
//
// Reads the server file and runs the emitter as data only (test-time); the package never imports dms-server.
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import './index';
import { declarations, getPatternType, listPatternTypes, stampPatternRow, stampSiteRow } from './registry';
import { declarationsOf, plainData } from './declarations';
import { deriveAuthRules, validateAuthRules } from './deriveAuthRules';
import { deriveDmsEnvVocabulary } from './deriveAuthVocabulary';
import siteFormat, { dmsEnvFormat } from './admin/admin.format';

const require = createRequire(import.meta.url);
const BUILT_IN = require('../../../dms-server/src/routes/auth/rules.js');

const derived = (name) => getPatternType(name).authRules;
const rows = declarations();
const row = (type) => rows.find(r => r.type === type);
const isPlain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
  || (Array.isArray(v) ? v.every(isPlain) : Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every(isPlain));

describe('declarations(): the formats table rows', () => {
  test('one row per format key, sorted, all plain data', () => {
    expect(rows.map(r => r.type)).toEqual([...rows.map(r => r.type)].sort());
    expect(new Set(rows.map(r => r.type)).size).toBe(rows.length);
    for (const r of rows) expect(isPlain(r), r.type).toBe(true);
    expect(rows.map(r => r.type)).toEqual(expect.arrayContaining([
      'admin+site', 'admin+pattern', 'admin+dmsenv', 'admin+theme', 'admin+tenant',
      'datasets+source', 'datasets+view', 'datasets+form-manager', 'dms-site+page', 'dms-site+component', 'dms-site+page-edit',
      'page+pattern', 'datasets+pattern', 'auth+pattern', 'admin+pattern',
    ]));
  });

  test('every registered type has a `<name>+pattern` row with its vocabulary and childRefs', () => {
    for (const t of listPatternTypes()) {
      const r = row(`${t.name}+pattern`);
      expect(r, t.name).toBeTruthy();
      expect(r.authVocabulary).toEqual(t.authVocabulary);
      expect(r.childRefs).toEqual(t.childRefs || null);
    }
    expect(row('page+pattern').childRefs).toEqual({ page: { sections: 'component', draft_sections: 'component', history: 'page-edit' } });
    expect(row('auth+pattern').authVocabulary.descendants).toBeUndefined();   // the auth stub declares no verbs beneath it
    expect(row('page+pattern').attributes).toBeNull();
    // admin's is both the pattern-row format and the admin type's row
    expect(row('admin+pattern').attributes.some(a => a.key === 'pattern_type')).toBe(true);
    expect(row('admin+pattern').authVocabulary).toEqual(getPatternType('admin').authVocabulary);
  });

  test('format rows carry their rules; the union is exactly what the types derive', () => {
    const fromRows = Object.assign({}, ...rows.map(r => r.authRules || {}));
    const fromTypes = Object.assign({}, ...listPatternTypes().map(t => t.authRules));
    expect(fromRows).toEqual(fromTypes);
    expect(Object.keys(row('dms-site+page').authRules)).toEqual(['page']);
    expect(Object.keys(row('datasets+source').authRules).sort()).toEqual(['data', 'source']);
    expect(row('datasets+view').authRules.view).toEqual(BUILT_IN.view);
  });

  test('site-level containers (a rulesOn:site type\'s formats with children) carry their own vocabulary; nothing else does', () => {
    expect(row('admin+site').authVocabulary).toEqual(deriveDmsEnvVocabulary(siteFormat));
    expect(row('admin+dmsenv').authVocabulary).toEqual(deriveDmsEnvVocabulary(dmsEnvFormat));
    for (const t of ['admin+theme', 'admin+tenant', 'dms-site+page', 'dms-site+component', 'datasets+view', 'datasets+form-manager']) {
      expect(row(t).authVocabulary, t).toBeNull();
    }
  });

  test('attributes are the format\'s, as data: components, functions and component-only objects dropped', () => {
    const page = row('dms-site+page').attributes;
    expect(page.find(a => a.key === 'sections')).toEqual({ key: 'sections', type: 'dms-format', isArray: true, format: 'dms-site+component' });
    expect(JSON.stringify(page)).not.toMatch(/DisplayComp|\$\$typeof/);
    expect(plainData({ a: 1, f: () => 1, el: { $$typeof: Symbol.for('react.element') }, both: { EditComp: () => 1 }, empty: {}, list: [1, () => 2, 'x'], u: undefined, get computed() { return [1]; } }))
      .toEqual({ a: 1, empty: {}, list: [1, 'x'] });
    expect(row('admin+pattern').attributes.find(a => a.key === 'pattern_type')).toEqual({ key: 'pattern_type', type: 'select', required: true, default: 'page' });
  });

  test('declarationsOf: a key met twice keeps the first attributes and the later rules', () => {
    const a = { app: 'x', type: 'k', attributes: [{ key: 'a' }], rules: { k: { owner: 'self', ops: { '*': ['a'] } } } };
    const b = { app: 'x', type: 'k', attributes: [{ key: 'b' }], rules: { k: { owner: 'self', ops: { '*': ['b'] } }, j: { owner: 'self', ops: {} } } };
    const out = declarationsOf([{ name: 't1', formats: [a] }, { name: 't2', formats: [b] }]);
    expect(out.map(r => r.type)).toEqual(['t1+pattern', 't2+pattern', 'x+k']);
    expect(row.call(null, 'x+k') === undefined).toBe(true);
    const xk = out.find(r => r.type === 'x+k');
    expect(xk.attributes).toEqual([{ key: 'a' }]);
    expect(xk.authRules.k.ops['*']).toEqual(['b']);
    expect(Object.keys(xk.authRules).sort()).toEqual(['j', 'k']);
  });

  test('the emitter (scripts/emit-formats.mjs, what the CLI pushes) prints the same rows', () => {
    const script = fileURLToPath(new URL('../../scripts/emit-formats.mjs', import.meta.url));
    const emitted = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', maxBuffer: 1 << 24 }));
    expect(emitted).toEqual(rows);
  }, 60_000);
});

describe('the stamp (one more release) and the server\'s built-in copy', () => {
  test('every built-in kind is declared by exactly the formats of the built-in types, and identically', () => {
    const fromFormats = { ...derived('admin'), ...derived('page'), ...derived('datasets') };
    expect(fromFormats).toEqual(BUILT_IN);
  });

  test('pattern rows get their type\'s rules, vocabulary and childRefs; admin\'s rules go on the site row', () => {
    expect(stampPatternRow({ pattern_type: 'page' }).authRules).toEqual(derived('page'));
    expect(stampPatternRow({ pattern_type: 'admin' }).authRules).toBeUndefined();
    expect(stampSiteRow({ site_name: 'x' })).toEqual({ site_name: 'x', authRules: derived('admin') });
    const r = stampPatternRow({ pattern_type: 'page', name: 'p' });
    expect([r.name, r.authVocabulary, r.childRefs]).toEqual(['p', getPatternType('page').authVocabulary, getPatternType('page').childRefs]);
    expect(stampPatternRow({ pattern_type: 'nope', name: 'n' })).toEqual({ pattern_type: 'nope', name: 'n' });
  });

  test('later formats win; a rule without ops or with an unknown owner is refused', () => {
    const a = { type: 'x', rules: { x: { owner: 'self-pattern', ops: { '*': ['a'] } } } };
    const b = { type: 'y', rules: { x: { owner: 'self-pattern', ops: { '*': ['b'] } } } };
    expect(deriveAuthRules({ formats: [a, b] }).x.ops['*']).toEqual(['b']);
    expect(() => validateAuthRules({ x: { owner: 'self-pattern' } })).toThrow(/ops/);
    expect(() => validateAuthRules({ x: { owner: 'my-parent', ops: {} } })).toThrow(/my-parent/);
    expect(() => validateAuthRules({ x: { owner: ['ancestor:pattern', 'self'], ops: { read: { anyOf: [{ blank: true }, { perms: ['v'] }] } } } })).not.toThrow();
    expect(() => validateAuthRules({ x: { owner: 'self', ops: { read: { anyOf: [{ blank: 'nowhere' }] } } } })).toThrow(/nowhere/);
  });
});
