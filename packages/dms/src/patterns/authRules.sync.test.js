// The auth rules live in the format files (each format's `rules`); dms-server keeps a built-in copy for
// rows stamped before they existed (dms-server/src/routes/auth/kindAuth/authRules.js, see its header).
// This keeps the two identical, and checks what a pattern / site row gets stamped with.
//
// Reads the server file as data only (test-time); the package itself never imports dms-server.
import { createRequire } from 'module';
import { describe, expect, test } from 'vitest';
import './index';
import { getPatternType, stampPatternRow, stampSiteRow } from './registry';
import { deriveAuthRules, validateAuthRules } from './deriveAuthRules';

const require = createRequire(import.meta.url);
const BUILT_IN = require('../../../dms-server/src/routes/auth/kindAuth/authRules.js');

const derived = (name) => getPatternType(name).authRules;

describe('auth rules in the formats', () => {
  test('every built-in kind is declared by exactly the formats of the built-in types, and identically', () => {
    const fromFormats = { ...derived('admin'), ...derived('page'), ...derived('datasets') };
    const { DEFAULT, ...kinds } = BUILT_IN;
    expect(DEFAULT).toEqual({ signedIn: true });
    expect(fromFormats).toEqual(kinds);
  });

  test('each type carries its own kinds', () => {
    expect(Object.keys(derived('admin')).sort()).toEqual(['dmsenv', 'pattern', 'site', 'tenant', 'theme']);
    expect(Object.keys(derived('page')).sort()).toEqual(['component', 'page', 'page-edit']);
    expect(Object.keys(derived('datasets')).sort()).toEqual(['data', 'source', 'view']);
    expect(derived('auth')).toEqual({});
  });

  test('pattern rows get their type\'s rules; admin\'s go on the site row instead', () => {
    expect(stampPatternRow({ pattern_type: 'page' }).authRules).toEqual(derived('page'));
    expect(stampPatternRow({ pattern_type: 'datasets' }).authRules).toEqual(derived('datasets'));
    expect(stampPatternRow({ pattern_type: 'admin' }).authRules).toBeUndefined();
    expect(stampPatternRow({ pattern_type: 'auth' }).authRules).toBeUndefined();
    expect(stampSiteRow({ site_name: 'x' })).toEqual({ site_name: 'x', authRules: derived('admin') });
  });

  test('the stamp still carries the vocabulary and childRefs', () => {
    const row = stampPatternRow({ pattern_type: 'page', name: 'p' });
    expect(row.name).toBe('p');
    expect(row.authVocabulary).toEqual(getPatternType('page').authVocabulary);
    expect(row.childRefs).toEqual(getPatternType('page').childRefs);
    expect(stampPatternRow({ pattern_type: 'nope', name: 'n' })).toEqual({ pattern_type: 'nope', name: 'n' });
  });

  test('later formats win; a rule without ops or with an unknown owner is refused', () => {
    const a = { type: 'x', rules: { x: { owner: 'self-pattern', ops: { '*': ['a'] } } } };
    const b = { type: 'y', rules: { x: { owner: 'self-pattern', ops: { '*': ['b'] } } } };
    expect(deriveAuthRules({ formats: [a, b] }).x.ops['*']).toEqual(['b']);
    expect(() => validateAuthRules({ x: { owner: 'self-pattern' } })).toThrow(/ops/);
    expect(() => validateAuthRules({ x: { owner: 'my-parent', ops: {} } })).toThrow(/my-parent/);
    expect(() => validateAuthRules({ x: { owner: 'self-pattern', ops: { edit: { anyOf: [{ owner: 'typo' }] } } } }))
      .toThrow(/typo/);
  });
});
