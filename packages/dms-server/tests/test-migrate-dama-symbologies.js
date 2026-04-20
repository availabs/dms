/**
 * Unit tests for the DAMA symbology migration script's pure logic
 * (the planRewrite function). Full integration testing is done via dry-run
 * against real databases, not here.
 */

const { planRewrite } = require('../src/scripts/migrate-dama-symbologies');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

// Helper to build a component with a given symbologies object.
function component(symbologies) {
  return {
    id: 42,
    data: {
      element: {
        'element-type': 'Map',
        'element-data': JSON.stringify({
          tabs: [],
          symbologies,
        }),
      },
    },
  };
}

function parseElementData(rewrite) {
  return JSON.parse(rewrite.newElementDataString);
}

console.log('\n=== planRewrite unit tests ===');

test('no symbologies → returns null', () => {
  const r = planRewrite(component({}), new Map());
  assert(r === null, `expected null, got ${JSON.stringify(r)}`);
});

test('only DMS refs (id set, no symbology_id) → returns null', () => {
  const sym = { id: 100, name: 'Foo', symbology: { id: 100 } };
  const r = planRewrite(component({ '100': sym }), new Map([[235, 500]]));
  assert(r === null, `expected null, got ${JSON.stringify(r)}`);
});

test('DAMA ref with mapping → rekeys under new id', () => {
  const sym = { symbology_id: 235, name: 'Census NRI', symbology: { isDamaSymbology: true, layers: {} } };
  const r = planRewrite(component({ '235': sym }), new Map([[235, 5001]]));
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['5001'], `expected key '5001', got keys=${Object.keys(ed.symbologies)}`);
  assert(!ed.symbologies['235'], `old key '235' should be gone`);
  assert(ed.symbologies['5001'].id === 5001, `id should be 5001`);
  assert(ed.symbologies['5001'].symbology_id === undefined, `symbology_id should be undefined, got ${ed.symbologies['5001'].symbology_id}`);
  assert(ed.symbologies['5001'].symbology.id === 5001, `nested symbology.id should be 5001`);
  assert(ed.symbologies['5001'].symbology.isDamaSymbology === false, `isDamaSymbology should be false`);
});

test('DAMA ref with no mapping (dangling) + prune → drops entry', () => {
  const sym = { symbology_id: 183, name: 'Missing' };
  const r = planRewrite(component({ '183': sym }), new Map(), { pruneDangling: true });
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(Object.keys(ed.symbologies).length === 0, `expected empty, got ${JSON.stringify(ed.symbologies)}`);
  assert(r.dangling.includes(183), `expected 183 in dangling, got ${r.dangling}`);
});

test('DAMA ref with no mapping, no prune → returns null (no change)', () => {
  const sym = { symbology_id: 183, name: 'Missing' };
  const r = planRewrite(component({ '183': sym }), new Map(), { pruneDangling: false });
  assert(r === null, `expected null, got ${JSON.stringify(r)}`);
});

test('mixed DMS + DAMA refs → only DAMA gets rewritten', () => {
  const dmsSym = { id: 100, name: 'DMS' };
  const damaSym = { symbology_id: 235, name: 'DAMA' };
  const r = planRewrite(component({ '100': dmsSym, '235': damaSym }), new Map([[235, 5001]]));
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['100'].id === 100, 'DMS entry should be preserved');
  assert(ed.symbologies['5001'], 'DAMA entry should be rekeyed');
  assert(!ed.symbologies['235'], 'old DAMA key should be gone');
});

test('legacy DAMA with id === symbology_id → treated as DAMA ref', () => {
  // Some saved components may have set `id` equal to `symbology_id` at save
  // time. Detection should still recognize these as DAMA-backed.
  const sym = { id: 235, symbology_id: 235, name: 'Legacy' };
  const r = planRewrite(component({ '235': sym }), new Map([[235, 5001]]));
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['5001'], `expected rekey to 5001, got keys=${Object.keys(ed.symbologies)}`);
});

test('element-data is already parsed object (not string) → still works', () => {
  const comp = {
    id: 1,
    data: {
      element: {
        'element-type': 'Map',
        'element-data': { symbologies: { '235': { symbology_id: 235, name: 'X' } } },
      },
    },
  };
  const r = planRewrite(comp, new Map([[235, 5001]]));
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['5001'], 'expected rekey');
});

test('no element / no element-data → returns null', () => {
  const comp1 = { id: 1, data: {} };
  const comp2 = { id: 2, data: { element: {} } };
  assert(planRewrite(comp1, new Map()) === null, 'no element should return null');
  assert(planRewrite(comp2, new Map()) === null, 'no element-data should return null');
});

test('malformed element-data string → returns null (safe)', () => {
  const comp = {
    id: 1,
    data: { element: { 'element-data': '{ not valid json', 'element-type': 'Map' } },
  };
  const r = planRewrite(comp, new Map());
  assert(r === null, 'malformed element-data should return null, not throw');
});

test('multiple DAMA refs → all get rewritten', () => {
  const r = planRewrite(
    component({
      '235': { symbology_id: 235 },
      '236': { symbology_id: 236 },
      '237': { symbology_id: 237 },
    }),
    new Map([[235, 5001], [236, 5002], [237, 5003]])
  );
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['5001'] && ed.symbologies['5002'] && ed.symbologies['5003'],
    `expected all three rekeyed, got ${Object.keys(ed.symbologies)}`);
});

test('dangling + mapped mixed → prunes dangling, rekeys mapped', () => {
  const r = planRewrite(
    component({
      '235': { symbology_id: 235 },  // mapped
      '183': { symbology_id: 183 },  // dangling
    }),
    new Map([[235, 5001]]),
    { pruneDangling: true }
  );
  assert(r !== null, 'expected rewrite plan');
  const ed = parseElementData(r);
  assert(ed.symbologies['5001'], '235 should be rekeyed to 5001');
  assert(!ed.symbologies['183'], '183 should be pruned');
  assert(r.dangling.includes(183), '183 should be in dangling');
});

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
