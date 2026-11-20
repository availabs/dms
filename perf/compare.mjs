// Two saved runs: what moved by more than the noise.
import { aggregate, METRICS, VISITS } from './aggregate.mjs';
import { verdict } from './stats.js';

const COMPARED = ['complete', 'usable', 'idle', 'lcp', 'fcp', 'ttfb', 'tbt', 'bytes', 'dataRequests', 'componentRequests'];

export function compareRuns(base, cand) {
  const A = aggregate(base.visits), B = aggregate(cand.visits);
  const byKey = new Map(A.pages.map((p) => [p.key, p]));
  const rows = [];
  for (const b of B.pages) {
    const a = byKey.get(b.key);
    if (!a || !a.n || !b.n) continue;
    const changes = {};
    for (const key of COMPARED) {
      const m = METRICS.find((x) => x.key === key);
      changes[key] = { base: a.metrics[key], cand: b.metrics[key], ...verdict(a.metrics[key], b.metrics[key], { floorAbs: m.floor, floorPct: 0.05 }) };
    }
    rows.push({ profile: b.profile, visit: b.visit, path: b.path, changes });
  }
  // per visit type and number: how many pages moved each way, and the typical page before and after
  const summary = [];
  for (const visit of VISITS) {
    const set = rows.filter((r) => r.visit === visit);
    if (!set.length) continue;
    for (const key of COMPARED) {
      const c = set.map((r) => r.changes[key]).filter((x) => x.verdict !== 'missing');
      if (!c.length) continue;
      const count = (v) => c.filter((x) => x.verdict === v).length;
      const ok = `${set[0].profile}|${visit}`;
      summary.push({
        visit, metric: key, pages: c.length, faster: count('faster'), slower: count('slower'), same: count('same'),
        before: A.overall[ok]?.metrics[key], after: B.overall[ok]?.metrics[key],
      });
    }
  }
  const movers = (visit, key, dir) => rows.filter((r) => r.visit === visit && r.changes[key]?.verdict === dir)
    .sort((x, y) => (dir === 'faster' ? x.changes[key].change - y.changes[key].change : y.changes[key].change - x.changes[key].change))
    .slice(0, 10).map((r) => ({ path: r.path, ...r.changes[key] }));

  // the journey: cumulative wait, step by step, and where the two lines cross
  const first = (J) => J.journey.filter((s) => s.pass === 'first');
  const ja = first(A), jb = first(B);
  const sameRoute = ja.length && ja.length === jb.length && ja.every((s, i) => s.path === jb[i].path);
  let crossing = null;
  if (sameRoute) {
    const lead0 = Math.sign((jb[0].cumulative?.median ?? 0) - (ja[0].cumulative?.median ?? 0));
    for (let i = 1; i < ja.length; i++) {
      const d = Math.sign((jb[i].cumulative?.median ?? 0) - (ja[i].cumulative?.median ?? 0));
      if (lead0 && d && d !== lead0) { crossing = i; break; }
    }
  }
  return {
    base: { label: base.run.label, dir: base.dir, mode: base.run.mode, started: base.run.started },
    cand: { label: cand.run.label, dir: cand.dir, mode: cand.run.mode, started: cand.run.started },
    modeDiffers: ['ssr', 'sync', 'preload', 'devBuild'].filter((k) => base.run.mode?.[k] !== cand.run.mode?.[k]),
    pagesCompared: new Set(rows.map((r) => r.path)).size,
    summary, rows,
    movers: Object.fromEntries(VISITS.map((v) => [v, { faster: movers(v, 'complete', 'faster'), slower: movers(v, 'complete', 'slower') }])),
    journey: {
      sameRoute, base: ja, cand: jb, crossing,
      // the same noise rule as a page: is the landing, or a click, really different?
      steps: sameRoute ? ja.map((s, i) => verdict(s.complete, jb[i].complete)) : [],
    },
  };
}

const ms = (v) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);

export function compareSummaryText(cmp) {
  const lines = [`${cmp.base.label} → ${cmp.cand.label} · ${cmp.pagesCompared} pages`];
  if (cmp.modeDiffers.length) lines.push(`mode differs: ${cmp.modeDiffers.map((k) => `${k} ${cmp.base.mode?.[k]} → ${cmp.cand.mode?.[k]}`).join(', ')}`);
  for (const s of cmp.summary.filter((x) => x.metric === 'complete')) {
    lines.push(`${s.visit.padEnd(5)} Complete: median page ${ms(s.before?.p50)} → ${ms(s.after?.p50)} · ${s.faster} faster, ${s.slower} slower, ${s.same} no change`);
  }
  if (cmp.journey.sameRoute) {
    const last = cmp.journey.base.length - 1;
    lines.push(`journey (${last} clicks): cumulative ${ms(cmp.journey.base[last].cumulative?.median)} → ${ms(cmp.journey.cand[last].cumulative?.median)}` +
      (cmp.journey.crossing != null ? ` · the lines cross at step ${cmp.journey.crossing}` : ''));
  }
  return lines.join('\n');
}
