// node --test src/dms/perf
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, quantileOf, verdict } from './stats.js';
import { resolveRunConfig } from './config.js';
import { aggregate } from './aggregate.mjs';
import { compareRuns } from './compare.mjs';
import { detectFromHtml } from './detect.js';

test('summarize: min, max, average, median; ignores missing values', () => {
  assert.deepEqual(summarize([300, 100, null, 200, undefined, 1000]), { n: 4, min: 100, max: 1000, avg: 400, median: 250 });
  assert.equal(summarize([]), null);
  assert.equal(quantileOf([10, 20, 30, 40, 50], 0.75), 40);
});

test('verdict: a change must beat the floor and half the wider spread', () => {
  const s = (median, min, max) => ({ n: 5, min, max, avg: median, median });
  assert.equal(verdict(s(1000, 990, 1010), s(1030, 1020, 1040)).verdict, 'same');      // under 5 %
  assert.equal(verdict(s(1000, 990, 1010), s(800, 790, 810)).verdict, 'faster');
  assert.equal(verdict(s(1000, 990, 1010), s(1200, 1190, 1210)).verdict, 'slower');
  assert.equal(verdict(s(1000, 700, 1300), s(800, 500, 1100)).verdict, 'same');         // inside the spread
  assert.equal(verdict(null, s(1, 1, 1)).verdict, 'missing');
});

test('run config: file, then flags, then defaults; bad values are refused', () => {
  const cfg = resolveRunConfig({ target: 'http://x.localhost:1/', runs: '3', visits: 'cold,click', sample: '10' });
  assert.equal(cfg.target, 'http://x.localhost:1');
  assert.equal(cfg.runs, 3);
  assert.deepEqual(cfg.visits, ['cold', 'click']);
  assert.equal(cfg.sample, 10);
  assert.throws(() => resolveRunConfig({}), /No target/);
  assert.throws(() => resolveRunConfig({ target: 'http://x', visits: 'cold,hot' }), /Unknown visit type/);
});

test('detectFromHtml: SSR, dev build, hydration size', () => {
  const ssr = '<div id="root"><main>hi</main></div><script>window.__dmsSSRData={}</script><script>window.__staticRouterHydrationData = JSON.parse("{\\"a\\":1}");</script>';
  assert.equal(detectFromHtml(ssr).ssr, true);
  assert.equal(detectFromHtml(ssr).hydrationBytes > 0, true);
  assert.equal(detectFromHtml('<div id="root"></div><script type="module" src="/@vite/client"></script>').ssr, false);
  assert.equal(detectFromHtml('<script type="module" src="/@vite/client"></script>').devBuild, true);
});

const visit = (visit, path, rep, complete, extra = {}) => ({
  profile: 'public', visit, path, page: path.slice(1), rep, ms: { ttfb: 100, fcp: 200, lcp: 300, complete, idle: complete + 100 },
  tbt: 0, cls: 0, bytes: { total: 1000, data: 100, hydration: 10 }, requests: { data: 2, duplicates: 0 }, errors: {}, ...extra,
});
const runOf = (label, visits, mode = {}) => ({ dir: `/tmp/${label}`, run: { label, mode, started: '2026-01-01T00:00:00Z' }, visits });

test('aggregate: per page and visit, and the median page across pages', () => {
  const agg = aggregate([visit('cold', '/a', 1, 1000), visit('cold', '/a', 2, 1200), visit('cold', '/b', 1, 3000), visit('cold', '/b', 2, 3000),
    { profile: 'public', visit: 'click', path: '/a', page: 'a', rep: 1, noLink: true }]);
  const a = agg.pages.find((p) => p.key === 'public|cold|/a');
  assert.equal(a.metrics.complete.median, 1100);
  assert.equal(agg.overall['public|cold'].metrics.complete.p50, 2050);
  assert.equal(agg.pages.find((p) => p.visit === 'click').flags.noLink, 1);
});

test('compare: counts pages that moved, and finds where the journey lines cross', () => {
  const cold = (ms) => [1, 2, 3].flatMap((rep) => [visit('cold', '/a', rep, ms.a), visit('cold', '/b', rep, ms.b)]);
  const journey = (land, click) => [0, 1, 2, 3].map((step) => ({
    ...visit('journey', `/s${step}`, 1, step ? click : land), pass: 'first', step, cumulative: land + step * click, networkFree: false,
  }));
  const base = runOf('nosync', [...cold({ a: 1000, b: 2000 }), ...journey(1000, 1000)], { sync: false });
  const cand = runOf('sync', [...cold({ a: 1000, b: 1200 }), ...journey(2500, 200)], { sync: true });
  const cmp = compareRuns(base, cand);
  const s = cmp.summary.find((x) => x.visit === 'cold' && x.metric === 'complete');
  assert.deepEqual([s.faster, s.slower, s.same], [1, 0, 1]);
  assert.deepEqual(cmp.modeDiffers, ['sync']);
  assert.equal(cmp.journey.crossing, 2);   // 2500+400 < 1000+2000
});
