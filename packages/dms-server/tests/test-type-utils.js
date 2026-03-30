/**
 * Tests for type-utils.js — type parsing/construction utilities.
 * Pure functions, no database needed.
 */

const {
  parseRowType,
  buildType,
  getKind,
  getParent,
  getInstance,
  isSplitType,
  nameToSlug,
  parseSplitDataType
} = require('../src/db/type-utils.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${e}`);
    console.error(`    got:      ${a}`);
  }
}

// ── parseRowType ──

console.log('parseRowType:');

assertDeepEq(
  parseRowType('prod:site'),
  { parent: null, instance: 'prod', kind: 'site', raw: 'prod:site' },
  'site type'
);

assertDeepEq(
  parseRowType('catalyst:theme'),
  { parent: null, instance: 'catalyst', kind: 'theme', raw: 'catalyst:theme' },
  'theme type'
);

assertDeepEq(
  parseRowType('prod|test-meta-forms:pattern'),
  { parent: 'prod', instance: 'test-meta-forms', kind: 'pattern', raw: 'prod|test-meta-forms:pattern' },
  'pattern type'
);

assertDeepEq(
  parseRowType('test-meta-forms|page'),
  { parent: 'test-meta-forms', instance: null, kind: 'page', raw: 'test-meta-forms|page' },
  'page type (no instance)'
);

assertDeepEq(
  parseRowType('test-meta-forms|component'),
  { parent: 'test-meta-forms', instance: null, kind: 'component', raw: 'test-meta-forms|component' },
  'component type (no instance)'
);

assertDeepEq(
  parseRowType('prod|my-env:dmsenv'),
  { parent: 'prod', instance: 'my-env', kind: 'dmsenv', raw: 'prod|my-env:dmsenv' },
  'dmsenv type'
);

assertDeepEq(
  parseRowType('my-env|adamtest1:source'),
  { parent: 'my-env', instance: 'adamtest1', kind: 'source', raw: 'my-env|adamtest1:source' },
  'source type'
);

assertDeepEq(
  parseRowType('adamtest1|v1:view'),
  { parent: 'adamtest1', instance: 'v1', kind: 'view', raw: 'adamtest1|v1:view' },
  'view type'
);

assertDeepEq(
  parseRowType('adamtest1|v1:data'),
  { parent: 'adamtest1', instance: 'v1', kind: 'data', raw: 'adamtest1|v1:data' },
  'data type'
);

// Edge cases
assertDeepEq(
  parseRowType(''),
  { parent: null, instance: null, kind: '', raw: '' },
  'empty string'
);

assertDeepEq(
  parseRowType(null),
  { parent: null, instance: null, kind: '', raw: '' },
  'null input'
);

assertDeepEq(
  parseRowType(undefined),
  { parent: null, instance: null, kind: '', raw: '' },
  'undefined input'
);

assertDeepEq(
  parseRowType('page'),
  { parent: null, instance: null, kind: 'page', raw: 'page' },
  'bare kind only'
);

// ── buildType ──

console.log('buildType:');

assertEq(
  buildType({ kind: 'site', instance: 'prod' }),
  'prod:site',
  'site'
);

assertEq(
  buildType({ kind: 'pattern', parent: 'prod', instance: 'test-meta-forms' }),
  'prod|test-meta-forms:pattern',
  'pattern with parent and instance'
);

assertEq(
  buildType({ kind: 'page', parent: 'test-meta-forms' }),
  'test-meta-forms|page',
  'page with parent, no instance'
);

assertEq(
  buildType({ kind: 'component', parent: 'test-meta-forms' }),
  'test-meta-forms|component',
  'component with parent'
);

assertEq(
  buildType({ kind: 'data', parent: 'adamtest1', instance: 'v1' }),
  'adamtest1|v1:data',
  'data type'
);

assertEq(
  buildType({ kind: 'dmsenv', parent: 'prod', instance: 'my-env' }),
  'prod|my-env:dmsenv',
  'dmsenv'
);

assertEq(
  buildType({ kind: 'page' }),
  'page',
  'bare kind only'
);

// ── roundtrip: buildType(parseRowType(type)) ──

console.log('roundtrip:');

const roundtripCases = [
  'prod:site',
  'catalyst:theme',
  'prod|test-meta-forms:pattern',
  'test-meta-forms|page',
  'test-meta-forms|component',
  'prod|my-env:dmsenv',
  'my-env|adamtest1:source',
  'adamtest1|v1:view',
  'adamtest1|v1:data',
];

for (const type of roundtripCases) {
  const parsed = parseRowType(type);
  const rebuilt = buildType(parsed);
  assertEq(rebuilt, type, `roundtrip: ${type}`);
}

// ── getKind ──

console.log('getKind:');

assertEq(getKind('prod:site'), 'site', 'site kind');
assertEq(getKind('prod|test-meta-forms:pattern'), 'pattern', 'pattern kind');
assertEq(getKind('test-meta-forms|page'), 'page', 'page kind');
assertEq(getKind('adamtest1|v1:data'), 'data', 'data kind');
assertEq(getKind('test-meta-forms|component'), 'component', 'component kind');
assertEq(getKind(''), '', 'empty string kind');

// ── getParent ──

console.log('getParent:');

assertEq(getParent('prod:site'), null, 'site has no parent');
assertEq(getParent('prod|test-meta-forms:pattern'), 'prod', 'pattern parent is site');
assertEq(getParent('test-meta-forms|page'), 'test-meta-forms', 'page parent is pattern');
assertEq(getParent('my-env|adamtest1:source'), 'my-env', 'source parent is dmsenv');
assertEq(getParent('adamtest1|v1:data'), 'adamtest1', 'data parent is source');

// ── getInstance ──

console.log('getInstance:');

assertEq(getInstance('prod:site'), 'prod', 'site instance');
assertEq(getInstance('prod|test-meta-forms:pattern'), 'test-meta-forms', 'pattern instance');
assertEq(getInstance('test-meta-forms|page'), null, 'page has no instance');
assertEq(getInstance('my-env|adamtest1:source'), 'adamtest1', 'source instance');
assertEq(getInstance('adamtest1|v1:data'), 'v1', 'data view instance');

// ── isSplitType ──

console.log('isSplitType:');

assert(isSplitType('adamtest1|v1:data'), 'data type is split');
assert(isSplitType('foo|bar:data'), 'any :data is split');
assert(!isSplitType('prod:site'), 'site is not split');
assert(!isSplitType('prod|test-meta-forms:pattern'), 'pattern is not split');
assert(!isSplitType('test-meta-forms|page'), 'page is not split');
assert(!isSplitType('my-env|adamtest1:source'), 'source is not split');
assert(!isSplitType('adamtest1|v1:view'), 'view is not split');
assert(!isSplitType(''), 'empty string is not split');
assert(!isSplitType(null), 'null is not split');
assert(!isSplitType(undefined), 'undefined is not split');

// ── nameToSlug ──

console.log('nameToSlug:');

assertEq(nameToSlug('My Dataset'), 'my_dataset', 'spaces to underscores');
assertEq(nameToSlug('Traffic Counts'), 'traffic_counts', 'typical dataset name');
assertEq(nameToSlug('test-meta-forms'), 'test_meta_forms', 'hyphens to underscores');
assertEq(nameToSlug('  Leading Spaces  '), 'leading_spaces', 'trim whitespace');
assertEq(nameToSlug('Special! @#$ Chars'), 'special__chars', 'strip special chars (leaves adjacent underscores)');
assertEq(nameToSlug('MiXeD CaSe'), 'mixed_case', 'lowercase');
assertEq(nameToSlug('already_valid'), 'already_valid', 'already valid slug');
assertEq(nameToSlug(''), '', 'empty string');
assertEq(nameToSlug(null), '', 'null');
assertEq(nameToSlug(undefined), '', 'undefined');
assertEq(nameToSlug('multi---hyphens'), 'multi_hyphens', 'consecutive hyphens');
assertEq(nameToSlug('spaces   and   tabs'), 'spaces_and_tabs', 'consecutive spaces');

// ── parseSplitDataType ──

console.log('parseSplitDataType:');

assertDeepEq(
  parseSplitDataType('adamtest1|v1:data'),
  { source: 'adamtest1', view: 'v1' },
  'standard data type'
);

assertDeepEq(
  parseSplitDataType('traffic_counts|v2:data'),
  { source: 'traffic_counts', view: 'v2' },
  'named source with view'
);

assertEq(parseSplitDataType('prod:site'), null, 'non-data type returns null');
assertEq(parseSplitDataType('test-meta-forms|page'), null, 'page returns null');
assertEq(parseSplitDataType(''), null, 'empty returns null');
assertEq(parseSplitDataType(null), null, 'null returns null');

// data type without parent (malformed but handle gracefully)
assertEq(parseSplitDataType('v1:data'), null, 'data without parent returns null');

// ── Summary ──

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
