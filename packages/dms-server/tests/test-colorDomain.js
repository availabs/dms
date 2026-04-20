/**
 * Tests for the UDA colorDomain route.
 *
 * Unit tests run always (ckmeans math, dispatcher shape).
 *
 * Integration tests hit a real PostgreSQL DAMA-role database and are GATED
 * on env vars:
 *   COLOR_DOMAIN_TEST_DB — pgEnv config name (e.g. "hazmit_dama")
 *   COLOR_DOMAIN_TEST_VIEW_ID — view_id with sufficient rows
 *   COLOR_DOMAIN_TEST_COLUMN — numeric column on that view
 *
 * Example:
 *   COLOR_DOMAIN_TEST_DB=hazmit_dama \
 *   COLOR_DOMAIN_TEST_VIEW_ID=3342 \
 *   COLOR_DOMAIN_TEST_COLUMN=ttamp_80_pct \
 *   npm run test:colorDomain
 */

const { ckmeans } = require('../src/routes/uda/colorDomain/ckmeans');
const { colorDomain } = require('../src/routes/uda/uda.colorDomain.controller');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    failed++;
  }
}

function isAscending(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) return false;
  }
  return true;
}

async function runTests() {
  console.log('\n=== ckmeans unit tests ===');

  await test('empty input returns empty array', () => {
    assert(Array.isArray(ckmeans([], 3)), 'should return array');
    assert(ckmeans([], 3).length === 0, 'should be empty');
  });

  await test('single value with nClusters=1 returns that value', () => {
    const result = ckmeans([5], 1);
    assert(result.length === 1 && result[0] === 5, `got ${JSON.stringify(result)}`);
  });

  await test('single value with nClusters>data.length returns empty (guard)', () => {
    const result = ckmeans([5], 3);
    assert(result.length === 0, `got ${JSON.stringify(result)}`);
  });

  await test('all-identical values collapse to one break', () => {
    const result = ckmeans([7, 7, 7, 7, 7], 3);
    assert(result.length === 1 && result[0] === 7, `got ${JSON.stringify(result)}`);
  });

  await test('nClusters > data.length returns empty', () => {
    const result = ckmeans([1, 2], 5);
    assert(result.length === 0, `got ${JSON.stringify(result)}`);
  });

  await test('standard example from simple-statistics docs', () => {
    // ckmeans([-1, 2, -1, 2, 4, 5, 6, -1, 2, -1], 3) should cluster into
    // [[-1,-1,-1,-1], [2,2,2], [4,5,6]] — lower bounds are [-1, 2, 4]
    const result = ckmeans([-1, 2, -1, 2, 4, 5, 6, -1, 2, -1], 3);
    assert(result.length === 3, `expected 3 clusters, got ${result.length}`);
    assert(result[0] === -1 && result[1] === 2 && result[2] === 4,
      `expected [-1,2,4], got ${JSON.stringify(result)}`);
  });

  await test('output is ascending', () => {
    const result = ckmeans([10, 1, 5, 8, 3, 2, 9, 7, 4, 6], 4);
    assert(isAscending(result), `not ascending: ${JSON.stringify(result)}`);
  });

  await test('truncates to unique-value count', () => {
    // 5 unique values, request 10 clusters — should get 5 at most
    const result = ckmeans([1, 2, 3, 4, 5, 1, 2, 3, 4, 5], 10);
    assert(result.length <= 5, `expected ≤5 clusters, got ${result.length}`);
  });

  await test('does not mutate input', () => {
    const input = [3, 1, 2];
    const original = [...input];
    ckmeans(input, 2);
    assert(JSON.stringify(input) === JSON.stringify(original), 'input was mutated');
  });

  await test('handles negative, zero, and positive mix', () => {
    const result = ckmeans([-10, -5, 0, 5, 10, 15, 20], 3);
    assert(result.length === 3, `expected 3, got ${result.length}`);
    assert(isAscending(result), `not ascending: ${JSON.stringify(result)}`);
  });

  // ========================= colorDomain dispatcher =========================

  console.log('\n=== colorDomain dispatcher unit tests ===');

  await test('rejects missing column', async () => {
    let threw = false;
    try { await colorDomain('x+y', 1, { method: 'equalInterval', numbins: 5 }); }
    catch (e) { threw = true; assert(/column/i.test(e.message), `wrong error: ${e.message}`); }
    assert(threw, 'should have thrown');
  });

  await test('rejects invalid column name (injection attempt)', async () => {
    let threw = false;
    try {
      await colorDomain('x+y', 1, {
        column: "; DROP TABLE data_items; --",
        method: 'equalInterval',
        numbins: 5,
      });
    } catch (e) { threw = true; }
    assert(threw, 'should have thrown on invalid column');
  });

  // ========================= Integration (real DB) =========================

  const testDb = process.env.COLOR_DOMAIN_TEST_DB;
  const testViewId = process.env.COLOR_DOMAIN_TEST_VIEW_ID;
  const testColumn = process.env.COLOR_DOMAIN_TEST_COLUMN;

  if (!testDb || !testViewId || !testColumn) {
    console.log('\n=== integration tests: SKIPPED ===');
    console.log('  Set COLOR_DOMAIN_TEST_DB / COLOR_DOMAIN_TEST_VIEW_ID / COLOR_DOMAIN_TEST_COLUMN to run');
  } else {
    console.log(`\n=== integration (db=${testDb} view=${testViewId} col=${testColumn}) ===`);

    const baseOpts = { column: testColumn, numbins: 6 };
    let observedCount = null;

    await test('equalInterval returns sensible shape', async () => {
      const result = await colorDomain(testDb, testViewId, { ...baseOpts, method: 'equalInterval' });
      assert(Array.isArray(result.breaks), 'breaks not array');
      assert(isAscending(result.breaks), `breaks not ascending: ${JSON.stringify(result.breaks)}`);
      assert(result.min < result.max, `min/max not ordered: ${result.min} ${result.max}`);
      assert(result.count > 0, `count is 0`);
      assert(result.source === 'aggregate', `expected source=aggregate, got ${result.source}`);
      observedCount = result.count;
    });

    await test('quantile returns sensible shape', async () => {
      const result = await colorDomain(testDb, testViewId, { ...baseOpts, method: 'quantile' });
      assert(isAscending(result.breaks), `breaks not ascending: ${JSON.stringify(result.breaks)}`);
      assert(result.breaks.every(b => b >= result.min && b <= result.max),
        `breaks outside [min, max]: ${JSON.stringify(result.breaks)}`);
      assert(result.source === 'aggregate', `expected source=aggregate, got ${result.source}`);
    });

    await test('standardDeviation returns sensible shape', async () => {
      const result = await colorDomain(testDb, testViewId, { ...baseOpts, method: 'standardDeviation' });
      assert(isAscending(result.breaks), `breaks not ascending: ${JSON.stringify(result.breaks)}`);
      assert(result.breaks.every(b => b >= result.min && b <= result.max),
        `breaks outside clamped [min, max]: ${JSON.stringify(result.breaks)}`);
    });

    await test('ckmeans returns sensible shape + picks correct source path', async () => {
      const result = await colorDomain(testDb, testViewId, { ...baseOpts, method: 'ckmeans' });
      assert(isAscending(result.breaks), `breaks not ascending: ${JSON.stringify(result.breaks)}`);
      const expectedSource = observedCount > 50_000 ? 'histogram' : 'full';
      assert(result.source === expectedSource,
        `expected source=${expectedSource} for count=${observedCount}, got ${result.source}`);
    });

    await test('filter reduces count', async () => {
      const unfiltered = await colorDomain(testDb, testViewId, { ...baseOpts, method: 'equalInterval' });
      // Use an integer midpoint so bigint columns (like year) accept it directly.
      const mid = Math.floor((unfiltered.min + unfiltered.max) / 2);
      const filtered = await colorDomain(testDb, testViewId, {
        ...baseOpts,
        method: 'equalInterval',
        gt: { [testColumn]: mid },
      });
      assert(filtered.count < unfiltered.count,
        `filter did not reduce count: filtered=${filtered.count} unfiltered=${unfiltered.count}`);
    });

    await test('numbins=2 returns exactly 2 breaks (one per bin lower bound)', async () => {
      const result = await colorDomain(testDb, testViewId, { ...baseOpts, numbins: 2, method: 'equalInterval' });
      assert(result.breaks.length === 2, `expected 2 breaks, got ${result.breaks.length}`);
      assert(result.breaks[0] === result.min, `first break should equal min`);
    });

    await test('all methods: first break equals min', async () => {
      for (const method of ['equalInterval', 'quantile', 'standardDeviation', 'ckmeans']) {
        const r = await colorDomain(testDb, testViewId, { ...baseOpts, method });
        assert(r.breaks[0] === r.min,
          `${method}: first break ${r.breaks[0]} != min ${r.min}`);
      }
    });

    await test('small ckmeans path (< threshold) uses full scan', async () => {
      // Force full-scan path by setting threshold > count
      const result = await colorDomain(testDb, testViewId, {
        ...baseOpts,
        method: 'ckmeans',
        ckmeansFullScanThreshold: Number.MAX_SAFE_INTEGER,
      });
      assert(result.source === 'full', `expected source=full, got ${result.source}`);
    });

    await test('large ckmeans path (> threshold) uses histogram', async () => {
      const result = await colorDomain(testDb, testViewId, {
        ...baseOpts,
        method: 'ckmeans',
        ckmeansFullScanThreshold: 1,
      });
      assert(result.source === 'histogram', `expected source=histogram, got ${result.source}`);
    });
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
