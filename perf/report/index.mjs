// The HTML report for one saved run, or for a comparison of two. One self-contained file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, METRICS, VISITS, metric } from '../aggregate.mjs';
import { scores, grade, THRESHOLDS, KINDS } from '../score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtMs = (v) => (v == null ? '–' : v >= 10000 ? `${(v / 1000).toFixed(1)} s` : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const fmtBytes = (v) => (v == null ? '–' : v >= 1048576 ? `${(v / 1048576).toFixed(2)} MB` : v >= 1024 ? `${Math.round(v / 1024)} KB` : `${Math.round(v)} B`);
const fmtCount = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtScore = (v) => (v == null ? '–' : v.toFixed(3));
const fmt = (unit) => ({ ms: fmtMs, bytes: fmtBytes, count: fmtCount, score: fmtScore }[unit]);
const VISIT_NAME = { cold: 'Cold load', warm: 'Returning load', click: 'In-app click' };

// Where a page's time goes. The order is the stacking order, bottom to top.
const PHASES = [
  { key: 'server', name: 'Server', what: 'waiting for the first byte of the page' },
  { key: 'script', name: 'Scripts', what: 'the browser is running scripts and the page is frozen (tasks over 50 ms)' },
  { key: 'cdata', name: 'Component data', what: "waiting on a component's data request: dataset rows for a table, card, graph or map" },
  { key: 'data', name: 'Page data', what: "waiting on other data requests: the page's own content, sync, tracking" },
  { key: 'files', name: 'Files', what: 'downloading the page, images, scripts, styles and fonts' },
  { key: 'other', name: 'Other', what: 'short tasks, layout, paint and timers' },
  { key: 'unknown', name: 'Not broken down', what: 'this run was saved before the breakdown existed' },
];
const phaseTotal = (ph) => PHASES.reduce((a, p) => a + (ph?.[p.key] || 0), 0);
const phaseLegend = (used) => `<div class="legend">${PHASES.filter((p) => used.has(p.key)).map((p) => `<span title="${esc(p.what)}"><span class="sw box" style="background:var(--p-${p.key})"></span>${p.name}</span>`).join('')}</div>`;
const GRADE_NAME = { fast: 'Fast', ok: 'OK', slow: 'Slow' };
const GRADE_MARK = { fast: '●', ok: '◐', slow: '○' };
const secs = (ms) => `${+(ms / 1000).toFixed(1)} s`;

/** One thin stacked bar: a page's time by phase, on a shared scale. */
const miniStack = (ph, max, title) => {
  if (!ph) return '';
  const segs = PHASES.filter((p) => ph[p.key] > 0).map((p) => `<i style="width:${(100 * ph[p.key] / max).toFixed(2)}%;background:var(--p-${p.key})"></i>`).join('');
  return `<div class="stack" title="${esc(title)}">${segs}</div>`;
};
const phaseTip = (ph) => PHASES.filter((p) => ph?.[p.key] > 0).map((p) => `${p.name} ${fmtMs(ph[p.key])}`).join('\n');

/** The scorecard: kinds of visit down, goals across. */
function scoreSection(agg, profile, thresholds) {
  const rows = scores(agg.pages, profile, thresholds);
  if (!rows.length) return '';
  const tone = (n) => (n == null ? '' : n >= 75 ? 'fast' : n >= 50 ? 'ok' : 'slow');
  const cellOf = (g) => {
    if (g.score == null) return `<div class="score none"><span class="g">${g.name}</span><span class="n">–</span><span class="d">not measured</span></div>`;
    const bar = ['fast', 'ok', 'slow'].filter((k) => g[k]).map((k) => `<i class="g-${k}" style="flex:${g[k]}" title="${GRADE_NAME[k]}: ${g[k]} page(s)"></i>`).join('');
    return `<div class="score ${tone(g.score)}"><span class="g">${g.name}</span><span class="n">${g.score}</span>
      <div class="dist">${bar}</div>
      <span class="d">${g.fast} fast · ${g.ok} ok · ${g.slow} slow${g.unmeasured ? ` · ${g.unmeasured} not measured` : ''}</span>
      <span class="d lim">fast ≤ ${secs(g.limits[0])} · ok ≤ ${secs(g.limits[1])}</span></div>`;
  };
  const head = `<div class="sc-head"></div>${rows[0].goals.map((g) => `<div class="sc-head"><b>${g.name}</b><span>${g.what}</span></div>`).join('')}`;
  const body = rows.map((r) => `<div class="sc-row"><b>${r.name}</b><span>${r.what} · ${r.pages} pages</span></div>${r.goals.map(cellOf).join('')}`).join('');
  return `<section id="scores"><div class="wrap">
    <h2>Scores</h2>
    <p class="lede">0 to 100: the share of pages that are fast, plus half the share that are ok. Each kind of visit is scored against three goals.</p>
    <div class="scorecard">${head}${body}</div>
    <div class="legend"><span><span class="sw box g-fast"></span>${GRADE_MARK.fast} Fast</span><span><span class="sw box g-ok"></span>${GRADE_MARK.ok} OK</span><span><span class="sw box g-slow"></span>${GRADE_MARK.slow} Slow</span></div>
  </div></section>`;
}

/** Stacked columns: one per page, slowest first, split by where the time went. */
function columnChart(pages, { title, limits }) {
  const rows = pages.filter((p) => p.phases).map((p) => ({ p, total: phaseTotal(p.phases) })).sort((a, b) => b.total - a.total);
  if (!rows.length) return '';
  const n = rows.length, L = 52, R = 64, T = 12, B = n <= 14 ? 64 : 16, H = 300;
  const colW = Math.max(4, Math.min(110, Math.floor(1000 / n))), gap = colW >= 8 ? 2 : 1;
  const W = Math.max(1000 + L + R, L + R + n * colW);
  const max = Math.max(limits[1] * 1.1, ...rows.map((r) => r.total));
  const niceStep = (() => { const raw = max / 4; const pw = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * pw).find((s) => s >= raw); })();
  const top = Math.ceil(max / niceStep) * niceStep;
  const y = (v) => T + (1 - v / top) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, Math.max(320, n * 7 + L + R))}px" role="img" aria-label="${esc(title)}">`;
  for (let v = 0; v <= top + 1e-9; v += niceStep) svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtMs(v))}</text>`;
  const used = new Set();
  rows.forEach(({ p, total }, i) => {
    const x = L + i * colW;
    let acc = 0;
    for (const ph of PHASES) {
      const v = p.phases[ph.key] || 0;
      if (v <= 0) continue;
      used.add(ph.key);
      const y1 = y(acc + v), h = Math.max(0, y(acc) - y1 - (acc > 0 && y(acc) - y1 > 3 ? 1 : 0));
      svg += `<rect x="${x + gap / 2}" y="${y1}" width="${colW - gap}" height="${h}" fill="var(--p-${ph.key})"/>`;
      acc += v;
    }
    const g = grade(total, limits);
    svg += `<rect class="hit" x="${x}" y="${T}" width="${colW}" height="${H - T - B}" fill="transparent" data-tip="${esc(`${p.path}\n${fmtMs(total)} · ${GRADE_NAME[g]}\n${phaseTip(p.phases)}`)}"/>`;
    if (n <= 14) svg += `<text class="axis" x="${x + colW / 2}" y="${H - B + 14}" text-anchor="end" transform="rotate(-35 ${x + colW / 2} ${H - B + 14})">${esc(p.path.split('/').filter(Boolean).pop() || '/')}</text>`;
  });
  [['fast', limits[0]], ['ok', limits[1]]].forEach(([k, v]) => {
    svg += `<line class="limit" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${W - R + 6}" y="${y(v) + 4}">${k} ≤ ${esc(secs(v))}</text>`;
  });
  svg += '</svg>';
  return `<div class="chart"><h3>${esc(title)}</h3>${phaseLegend(used)}<div class="scroll">${svg}</div><div class="tip"></div>${n > 14 ? '<p class="small">One column per page, slowest on the left. Hover a column for the page and its numbers; the table below has every page.</p>' : ''}</div>`;
}

/** Where the time goes, per kind of visit: share bars, then a column per page. */
function timeSection(agg, profile, thresholds) {
  const kinds = KINDS.map((k) => ({ ...k, pages: agg.pages.filter((p) => p.profile === profile && p.visit === k.visit && p.phases) })).filter((k) => k.pages.length);
  if (!kinds.length) return '';
  const used = new Set(), says = [];
  const bars = kinds.map((k) => {
    const sum = Object.fromEntries(PHASES.map((p) => [p.key, k.pages.reduce((a, pg) => a + (pg.phases[p.key] || 0), 0)]));
    const total = phaseTotal(sum) || 1;
    const segs = PHASES.filter((p) => sum[p.key] > 0).map((p) => {
      used.add(p.key);
      const pct = 100 * sum[p.key] / total;
      return `<i style="flex:${pct.toFixed(2)};background:var(--p-${p.key})" title="${p.name}: ${pct.toFixed(0)}% · ${fmtMs(sum[p.key] / k.pages.length)} on the average page">${pct >= 9 ? `<span>${p.name} ${pct.toFixed(0)}%</span>` : ''}</i>`;
    }).join('');
    const topPhase = PHASES.filter((p) => p.key !== 'unknown').sort((a, b) => sum[b.key] - sum[a.key])[0];
    if (sum[topPhase.key] > 0) says.push(`<li><b>${k.name}:</b> ${(100 * sum[topPhase.key] / total).toFixed(0)}% of the wait is <b>${topPhase.name}</b> (${topPhase.what}); ${fmtMs(sum[topPhase.key] / k.pages.length)} of ${fmtMs(total / k.pages.length)} on the average page.</li>`);
    return `<div class="share-row"><div class="share-k"><b>${k.name}</b><span>${fmtMs(total / k.pages.length)} average page</span></div><div class="share">${segs}</div></div>`;
  }).join('');
  const defs = `<dl class="defs">${PHASES.filter((p) => used.has(p.key)).map((p) => `<dt><span class="sw box" style="background:var(--p-${p.key})"></span>${p.name}</dt><dd>${p.what[0].toUpperCase() + p.what.slice(1)}.</dd>`).join('')}</dl>`;
  const charts = kinds.map((k) => columnChart(k.pages, { title: `${k.name}: every page, by where the time went`, limits: thresholds[k.kind].complete })).join('');
  return `<section id="time"><div class="wrap">
    <h2>Where the time goes</h2>
    <p class="lede">The wait until a page is all there, split by what the browser was waiting on. Every millisecond is counted once.</p>
    <div class="shares">${bars}</div>
    <ul class="findings">${says.join('')}</ul>
    ${defs}
    ${charts}
  </div></section>`;
}

/** The scorecard for two runs: each cell is before → after. */
function scoreCompareSection(aggA, aggB, profA, profB, names) {
  const A = scores(aggA.pages, profA), B = scores(aggB.pages, profB);
  const rows = A.map((r) => ({ a: r, b: B.find((x) => x.visit === r.visit) })).filter((x) => x.b);
  if (!rows.length) return '';
  const tone = (n) => (n == null ? '' : n >= 75 ? 'fast' : n >= 50 ? 'ok' : 'slow');
  const dist = (g) => `<div class="dist">${['fast', 'ok', 'slow'].filter((k) => g[k]).map((k) => `<i class="g-${k}" style="flex:${g[k]}" title="${GRADE_NAME[k]}: ${g[k]} page(s)"></i>`).join('')}</div>`;
  const cellOf = (ga, gb) => {
    if (ga.score == null && gb.score == null) return `<div class="score none"><span class="g">${ga.name}</span><span class="n">–</span><span class="d">not measured</span></div>`;
    const d = ga.score == null || gb.score == null ? null : gb.score - ga.score;
    return `<div class="score ${tone(gb.score)}"><span class="g">${ga.name}</span>
      <span class="n"><span class="was">${ga.score ?? '–'} →</span> ${gb.score ?? '–'}${d ? ` <span class="delta ${d > 0 ? 'faster' : 'slower'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''}</span>
      ${dist(ga)}${dist(gb)}
      <span class="d">${ga.fast}/${ga.ok}/${ga.slow} → ${gb.fast}/${gb.ok}/${gb.slow} fast/ok/slow</span>
      <span class="d lim">fast ≤ ${secs(ga.limits[0])} · ok ≤ ${secs(ga.limits[1])}</span></div>`;
  };
  const head = `<div class="sc-head"></div>${rows[0].a.goals.map((g) => `<div class="sc-head"><b>${g.name}</b><span>${g.what}</span></div>`).join('')}`;
  const body = rows.map(({ a, b }) => `<div class="sc-row"><b>${a.name}</b><span>${a.what} · ${a.pages} pages</span></div>${a.goals.map((g, i) => cellOf(g, b.goals[i])).join('')}`).join('');
  return `<section id="scores"><div class="wrap">
    <h2>Scores, ${esc(names[0])} → ${esc(names[1])}</h2>
    <p class="lede">0 to 100: the share of pages that are fast, plus half the share that are ok. In each cell the upper bar is before, the lower bar after.</p>
    <div class="scorecard">${head}${body}</div>
    <div class="legend"><span><span class="sw box g-fast"></span>${GRADE_MARK.fast} Fast</span><span><span class="sw box g-ok"></span>${GRADE_MARK.ok} OK</span><span><span class="sw box g-slow"></span>${GRADE_MARK.slow} Slow</span></div>
  </div></section>`;
}

/** Paired stacked columns: each page before and after, split by where the time went. */
function pairedColumnChart(pairs, { title, limits, names }) {
  const MAXP = 30;
  const rows = pairs.map((x) => ({ ...x, ta: phaseTotal(x.a.phases), tb: phaseTotal(x.b.phases) })).sort((x, y) => y.ta - x.ta);
  const shown = rows.slice(0, MAXP), n = shown.length;
  if (!n) return '';
  const L = 52, R = 64, T = 12, B = 70, H = 320;
  const groupW = Math.max(30, Math.min(150, Math.floor(1000 / n))), colW = Math.floor((groupW - 8) / 2);
  const W = Math.max(1000 + L + R, L + R + n * groupW);
  const max = Math.max(limits[1] * 1.1, ...shown.map((r) => Math.max(r.ta, r.tb)));
  const niceStep = (() => { const raw = max / 4; const pw = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * pw).find((s) => s >= raw); })();
  const top = Math.ceil(max / niceStep) * niceStep;
  const y = (v) => T + (1 - v / top) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, Math.max(320, n * 34 + L + R))}px" role="img" aria-label="${esc(title)}">`;
  for (let v = 0; v <= top + 1e-9; v += niceStep) svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(fmtMs(v))}</text>`;
  const used = new Set();
  const column = (x, ph, total, label, path) => {
    let acc = 0, out = '';
    for (const p of PHASES) {
      const v = ph[p.key] || 0; if (v <= 0) continue; used.add(p.key);
      const y1 = y(acc + v), h = Math.max(0, y(acc) - y1 - (acc > 0 && y(acc) - y1 > 3 ? 1 : 0));
      out += `<rect x="${x}" y="${y1}" width="${colW}" height="${h}" fill="var(--p-${p.key})"/>`; acc += v;
    }
    return out + `<rect class="hit" x="${x}" y="${T}" width="${colW}" height="${H - T - B}" fill="transparent" data-tip="${esc(`${path}\n${label}: ${fmtMs(total)} · ${GRADE_NAME[grade(total, limits)]}\n${phaseTip(ph)}`)}"/>`;
  };
  shown.forEach((r, i) => {
    const x = L + i * groupW + 3;
    svg += column(x, r.a.phases, r.ta, names[0], r.a.path) + column(x + colW + 2, r.b.phases, r.tb, names[1], r.a.path);
    svg += `<text class="axis" x="${x + colW / 2}" y="${H - B + 12}" text-anchor="middle">B</text><text class="axis" x="${x + colW * 1.5 + 2}" y="${H - B + 12}" text-anchor="middle">A</text>`;
    svg += `<text class="axis" x="${x + colW}" y="${H - B + 28}" text-anchor="end" transform="rotate(-35 ${x + colW} ${H - B + 28})">${esc((r.a.path.split('/').filter(Boolean).pop() || '/').slice(0, 22))}</text>`;
  });
  [['fast', limits[0]], ['ok', limits[1]]].forEach(([k, v]) => {
    svg += `<line class="limit" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${W - R + 6}" y="${y(v) + 4}">${k} ≤ ${esc(secs(v))}</text>`;
  });
  svg += '</svg>';
  return `<div class="chart"><h3>${esc(title)}</h3>${phaseLegend(used)}<div class="scroll">${svg}</div><div class="tip"></div><p class="small">Each page has two columns: B is before (${esc(names[0])}), A is after (${esc(names[1])}).${rows.length > n ? ` The ${n} slowest pages before, of ${rows.length}.` : ''} Hover a column for its numbers.</p></div>`;
}

/** Where the time goes in two runs: share bars on one scale, then paired columns per page. */
function timeCompareSection(aggA, aggB, profA, profB, names) {
  const kinds = KINDS.map((k) => {
    const pa = aggA.pages.filter((p) => p.profile === profA && p.visit === k.visit && p.phases);
    const pb = new Map(aggB.pages.filter((p) => p.profile === profB && p.visit === k.visit && p.phases).map((p) => [p.path, p]));
    return { ...k, pairs: pa.filter((p) => pb.has(p.path)).map((p) => ({ a: p, b: pb.get(p.path) })) };
  }).filter((k) => k.pairs.length);
  if (!kinds.length) return '';
  const used = new Set(), says = [];
  const bars = kinds.map((k) => {
    const sumOf = (side) => Object.fromEntries(PHASES.map((p) => [p.key, k.pairs.reduce((a, x) => a + (x[side].phases[p.key] || 0), 0) / k.pairs.length]));
    const sa = sumOf('a'), sb = sumOf('b'), ta = phaseTotal(sa), tb = phaseTotal(sb), scale = Math.max(ta, tb) || 1;
    const row = (sum, total, name) => `<div class="share-row"><div class="share-k"><b>${k.name}</b><span>${esc(name)} · ${fmtMs(total)} average page</span></div><div class="share" style="width:${(100 * total / scale).toFixed(1)}%">${PHASES.filter((p) => sum[p.key] > 0).map((p) => {
      used.add(p.key);
      const pct = 100 * sum[p.key] / total;
      return `<i style="flex:${pct.toFixed(2)};background:var(--p-${p.key})" title="${p.name}: ${fmtMs(sum[p.key])} (${pct.toFixed(0)}%)">${pct * total / scale >= 11 ? `<span>${p.name} ${fmtMs(sum[p.key])}</span>` : ''}</i>`;
    }).join('')}</div></div>`;
    const moved = PHASES.map((p) => ({ p, d: (sb[p.key] || 0) - (sa[p.key] || 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    if (Math.abs(tb - ta) >= 50) says.push(`<li><b>${k.name}:</b> the average page goes from ${fmtMs(ta)} to ${fmtMs(tb)}. The largest part of that is <b>${moved.p.name}</b>: ${fmtMs(sa[moved.p.key] || 0)} → ${fmtMs(sb[moved.p.key] || 0)}.</li>`);
    return row(sa, ta, names[0]) + row(sb, tb, names[1]);
  }).join('');
  const charts = kinds.map((k) => pairedColumnChart(k.pairs, { title: `${k.name}: each page before and after, by where the time went`, limits: THRESHOLDS[k.kind].complete, names })).join('');
  return `<section id="time"><div class="wrap">
    <h2>Where the time goes, before and after</h2>
    <p class="lede">The wait until a page is all there, split by what the browser was waiting on. Both bars of a pair are on the same scale, so a shorter bar is a shorter wait.</p>
    <div class="shares">${bars}</div>
    <ul class="findings">${says.join('')}</ul>
    ${phaseLegend(used)}
    ${charts}
  </div></section>`;
}

/** A number with its spread: the median, and min–max under it. */
const cell = (s, unit, { range = true } = {}) => {
  if (!s) return '<td class="num">–</td>';
  const f = fmt(unit);
  return `<td class="num" data-v="${s.median}">${f(s.median)}${range && s.n > 1 ? `<span class="range">${f(s.min)} – ${f(s.max)}</span>` : ''}</td>`;
};

function modePills(run) {
  const m = run.mode || {};
  const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
  return [
    pill(m.ssr ? 'Server-rendered' : 'SPA shell', 'on'),
    pill(m.sync ? 'Sync on' : 'Sync off', m.sync ? 'on' : ''),
    pill(m.preload ? 'Preload on' : 'Preload off', m.preload ? 'on' : ''),
    pill(m.signedIn ? 'Signed in' : 'Signed out'),
    m.devBuild ? pill('Dev build', 'warn') : pill('Production build', 'go'),
  ].join('');
}

function runMeta(run) {
  const e = run.environment || {};
  return [
    `${esc(run.connection?.app)}+${esc(run.connection?.type)} · pattern ${esc(run.pattern?.name)}`,
    `${run.pages.length} pages × ${run.config.runs} run(s) · ${run.config.parallel > 1 ? `${run.config.parallel} pages at a time` : 'one page at a time'} · ${esc(run.config.visits.join(', '))}`,
    `started ${esc(run.started?.slice(0, 16).replace('T', ' '))} UTC`,
    `Chrome ${esc(e.chrome)} · ${esc(e.cpu)} (${e.cores} cores) · ${esc(e.host)}`,
    `commits: app ${esc(e.commits?.app)} · dms ${esc(e.commits?.dms)}`,
  ].join('<br>');
}

/** A line chart of a few series over the journey's steps. Hover a point for its value. */
function lineChart(series, { xLabels, yUnit = 'ms', title }) {
  const W = 760, H = 300, L = 54, R = 150, T = 14, B = 34;
  const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const niceStep = (() => { const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw); })();
  const top = Math.ceil(max / niceStep) * niceStep;
  const n = xLabels.length;
  const x = (i) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : 0);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const f = fmt(yUnit);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (let v = 0; v <= top + 1e-9; v += niceStep) {
    svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${esc(f(v))}</text>`;
  }
  xLabels.forEach((l, i) => { svg += `<text class="axis" x="${x(i)}" y="${H - 12}" text-anchor="middle">${esc(l)}</text>`; });
  // direct labels at the line ends, nudged apart when they would collide
  const ends = series.map((s, si) => { const i = s.values.findLastIndex((v) => v != null); return { si, i, y: i < 0 ? null : y(s.values[i]) }; }).filter((e) => e.y != null).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (!pts.length) return;
    svg += `<polyline fill="none" stroke="var(--s${si + 1})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
    s.values.forEach((v, i) => {
      if (v == null) return;
      svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="var(--s${si + 1})" stroke="var(--panel)" stroke-width="2"/>` +
        `<circle class="hit" cx="${x(i)}" cy="${y(v)}" r="13" fill="transparent" data-tip="${esc(`${s.name} · ${xLabels[i]}: ${f(v)}${s.tips?.[i] ? ` · ${s.tips[i]}` : ''}`)}"/>`;
    });
    const end = ends.find((e) => e.si === si);
    if (end) svg += `<text class="lbl" x="${x(end.i) + 10}" y="${end.y + 4}">${esc(s.name)}</text>`;
  });
  svg += '</svg>';
  const legend = `<div class="legend">${series.map((s, si) => `<span><span class="sw" style="background:var(--s${si + 1})"></span>${esc(s.name)}</span>`).join('')}</div>`;
  return `<div class="chart">${legend}${svg}<div class="tip"></div></div>`;
}

const SCRIPT = `
document.querySelectorAll('table[data-sortable]').forEach(function (table) {
  table.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var i = Array.prototype.indexOf.call(th.parentNode.children, th);
      var dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
      table.querySelectorAll('th').forEach(function (o) { o.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', dir);
      var rows = Array.prototype.slice.call(table.tBodies[0].rows);
      var val = function (r) { var c = r.cells[i]; var v = c.getAttribute('data-v'); return v === null ? c.textContent.trim() : (v === '' ? -Infinity : +v); };
      rows.sort(function (a, b) { var x = val(a), y = val(b); var d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return dir === 'ascending' ? d : -d; });
      rows.forEach(function (r) { table.tBodies[0].appendChild(r); });
    });
  });
});
document.querySelectorAll('input.filter').forEach(function (input) {
  var table = document.getElementById(input.getAttribute('data-for'));
  input.addEventListener('input', function () {
    var q = input.value.toLowerCase();
    Array.prototype.forEach.call(table.tBodies[0].rows, function (r) { r.style.display = r.textContent.toLowerCase().indexOf(q) < 0 ? 'none' : ''; });
  });
});
document.querySelectorAll('.chart').forEach(function (chart) {
  var tip = chart.querySelector('.tip');
  chart.querySelectorAll('.hit').forEach(function (hit) {
    hit.addEventListener('mouseenter', function () {
      var c = chart.getBoundingClientRect(), h = hit.getBoundingClientRect();
      tip.textContent = hit.getAttribute('data-tip');
      tip.style.left = (h.left + h.width / 2 - c.left) + 'px'; tip.style.top = (h.top + h.height / 2 - c.top) + 'px'; tip.style.display = 'block';
    });
    hit.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  });
});`;

const DEFINITIONS = `
<dl class="defs">
  <dt>Server responded</dt><dd>First byte of the document (TTFB).</dd>
  <dt>First paint</dt><dd>Something is on screen (FCP).</dd>
  <dt>Main content</dt><dd>The largest element is painted (LCP). For an in-app click it needs Chrome's soft-navigation entries, and a real (not scripted) click.</dd>
  <dt>Usable</dt><dd>The page has stopped freezing: after Main content, the first moment with no main-thread task over 50 ms running and none starting in the next second. A click or scroll before this can go unanswered.</dd>
  <dt>Complete</dt><dd>The page the visitor sees has stopped arriving: no section carries <code>data-dms-loading</code>, no nodes are being added, no image, script or stylesheet is still loading. Measured once the browser is idle, as the time of the last visible change. A map's canvas repainting is not seen.</dd>
  <dt>Idle</dt><dd>The browser has nothing left to do: Complete, plus background requests (sync's bootstrap, prefetches) and long tasks.</dd>
  <dt>Blocking time</dt><dd>The part of every main-thread task past 50 ms, after First paint.</dd>
  <dt>Cold / returning / click</dt><dd>Cold: a new browser profile, straight to the URL. Returning: a browser that has already been to the site (its files cached, sync's copy of the site saved) goes straight to the URL. Click: one session walks the pattern, clicking the real link from each page to the next. Times for a click run from the click.</dd>
  <dt>Scores</dt><dd>For each goal a page is fast, ok or slow against two limits (shown under each score). Score = % of pages fast + half the % ok. A page with no measurement (no link to click) is left out.</dd>
  <dt>Median, range</dt><dd>Each visit is repeated. Cells show the median, with min – max under it. "Median page" and "75th-percentile page" are taken across the pages' medians.</dd>
</dl>`;

function overviewTable(agg, profile) {
  const cols = ['ttfb', 'fcp', 'lcp', 'usable', 'complete', 'idle', 'tbt', 'bytes', 'dataRequests'];
  const head = `<tr><th>Visit</th><th class="num">Pages</th>${cols.map((k) => `<th class="num">${esc(metric(k).label)}</th>`).join('')}</tr>`;
  const rows = VISITS.map((v) => agg.overall[`${profile}|${v}`]).filter(Boolean).map((o) =>
    `<tr><td class="k">${VISIT_NAME[o.visit]}</td><td class="num">${o.count}</td>${cols.map((k) => {
      const m = o.metrics[k], f = fmt(metric(k).unit);
      return `<td class="num">${f(m.p50)}<span class="range">p75 ${f(m.p75)}</span></td>`;
    }).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/** What the numbers say about whether each mode is doing its job. */
function findings(run, agg, profile) {
  const m = run.mode || {}, out = [];
  const o = (v) => agg.overall[`${profile}|${v}`]?.metrics;
  const cold = o('cold'), warm = o('warm'), click = o('click');
  const load = cold || warm, loadName = cold ? 'cold load' : 'load by a returning visitor', loadVisit = cold ? 'cold' : 'warm';
  if (m.devBuild) out.push(`<b>This target is a dev server.</b> Its modules are unbundled and uncompiled, so load times and sizes are not what a visitor gets. Use it to try the tool, not to judge a change.`);
  if (load) {
    const cold = load;
    out.push(m.ssr
      ? `<b>Server rendering:</b> on a ${loadName} the median page first paints at ${fmtMs(cold.fcp.p50)} and is complete at ${fmtMs(cold.complete.p50)}.`
      : `<b>SPA shell:</b> on a ${loadName} the median page first paints at ${fmtMs(cold.fcp.p50)} and is complete at ${fmtMs(cold.complete.p50)}; nothing is in the document until the scripts run.`);
    if (cold.idle.p50 - cold.complete.p50 > 2000) out.push(`<b>Background work:</b> the browser stays busy for ${fmtMs(cold.idle.p50 - cold.complete.p50)} after the median page is complete (idle at ${fmtMs(cold.idle.p50)}).${m.sync ? ' With sync on, this is where its bootstrap shows.' : ''}`);
  }
  {
    const colds = agg.pages.filter((p) => p.visit === loadVisit && p.profile === profile && p.n);
    const waited = colds.filter((p) => p.flags.loadingSeen).length;
    out.push(m.preload
      ? `<b>Preload is on for this pattern:</b> the loader fetches each data section's rows before the first render. A section still showed its loading state on ${waited} of ${colds.length} pages (over the preload budget, set to load on demand, or a type that doesn't preload).`
      : `<b>Preload is off for this pattern</b> (the default for a pattern that never set it): data sections fetch after the page renders. A section showed its loading state on ${waited} of ${colds.length} pages.`);
  }
  if (cold && warm) {
    out.push(`<b>A returning visitor's load</b> transfers ${fmtBytes(warm.bytes.p50)} against ${fmtBytes(cold.bytes.p50)} cold, and is complete at ${fmtMs(warm.complete.p50)} against ${fmtMs(cold.complete.p50)}.` +
      (warm.dataBytes.p50 > 0.8 * cold.dataBytes.p50 && cold.dataBytes.p50 > 51200 ? ` It fetches about as much data again (${fmtBytes(warm.dataBytes.p50)} of ${fmtBytes(cold.dataBytes.p50)}).` : ''));
  }
  if (click) out.push(`<b>An in-app click</b> is complete ${fmtMs(click.complete.p50)} after the click on the median page, with ${fmtCount(click.dataRequests.p50)} data requests.`);
  const clicks = agg.pages.filter((p) => p.visit === 'click' && p.profile === profile);
  if (m.sync && clicks.length) {
    const free = clicks.filter((p) => p.n && p.flags.networkFree === p.n).length;
    out.push(`<b>Sync:</b> ${free} of ${clicks.filter((p) => p.n).length} pages opened by a click with no data request at all.`);
  }
  const sum = (k) => agg.pages.filter((p) => p.profile === profile).reduce((a, p) => a + (p.flags[k] ? 1 : 0), 0);
  const stale = sum('stale'), full = clicks.filter((p) => p.flags.fullLoad).length, noLink = clicks.filter((p) => p.flags.noLink && !p.n).length;
  if (stale) out.push(`<b>${stale} page-visit(s) changed the URL but not the page</b> (stale content after a click). See Problems.`);
  if (full) out.push(`<b>${full} page(s) reloaded the whole document on a click</b> instead of navigating in the app.`);
  if (noLink) out.push(`${noLink} page(s) have no click measurement: no measured page links to them, so a visitor reaches them only by URL.`);
  const navStale = clicks.filter((p) => p.flags.navStale).length;
  if (navStale) out.push(`<b>${navStale} page(s) lost their link after an in-app navigation:</b> the page before them links to them when loaded directly, but the link was not there after the session clicked its way to that page. See Problems.`);
  if (sum('hydration')) out.push(`<b>Hydration errors</b> on ${sum('hydration')} page-visit group(s): React threw the server's HTML away there.`);
  {
    const lp = agg.pages.filter((p) => p.visit === loadVisit && p.profile === profile && p.n && p.metrics.componentRequests?.median != null);
    if (lp.length) {
      const fetching = lp.filter((p) => p.metrics.componentRequests.median > 0);
      const share = (() => { const t = lp.reduce((a, p) => a + phaseTotal(p.phases), 0); return t ? 100 * lp.reduce((a, p) => a + (p.phases?.cdata || 0), 0) / t : 0; })();
      out.push(fetching.length
        ? `<b>Components fetching data in the browser:</b> ${fetching.length} of ${lp.length} pages send component data requests on a ${loadName} (${fmtCount(medianOf(fetching.map((p) => p.metrics.componentRequests.median)))} on the median such page). Waiting on them is ${share.toFixed(0)}% of the total wait.`
        : `<b>No component fetches data in the browser</b> on a ${loadName}: every page's data requests are for its own content, sync or tracking.`);
    }
  }
  const dup = load?.duplicates.p50;
  if (dup >= 1) out.push(`<b>Duplicate requests:</b> the median page sends ${fmtCount(dup)} data request(s) it has already sent in the same load.`);
  return out;
}

function journeySection(run, agg, profile) {
  const steps = agg.journey.filter((s) => s.profile === profile);
  const first = steps.filter((s) => s.pass === 'first'), ret = steps.filter((s) => s.pass === 'return');
  if (!first.length) return '';
  const labels = first.map((s) => (s.step === 0 ? 'landing' : `click ${s.step}`));
  const chart = lineChart([
    { name: 'First visit', values: first.map((s) => s.cumulative?.median ?? null), tips: first.map((s) => s.path) },
    ...(ret.length ? [{ name: 'Return visit', values: first.map((_, i) => ret[i]?.cumulative?.median ?? null), tips: first.map((s) => s.path) }] : []),
  ], { xLabels: labels, title: 'Cumulative wait across the journey' });
  const rows = first.map((s, i) => `<tr><td class="k">${esc(labels[i])}</td><td class="path">${esc(s.path)}</td>${cell(s.complete, 'ms')}${cell(s.cumulative, 'ms', { range: false })}${cell(s.dataRequests, 'count', { range: false })}${cell(s.dataBytes, 'bytes', { range: false })}` +
    `${cell(ret[i]?.complete, 'ms')}${cell(ret[i]?.cumulative, 'ms', { range: false })}${cell(ret[i]?.dataRequests, 'count', { range: false })}</tr>`).join('');
  const last = first[first.length - 1];
  const clicks = first.slice(1);
  const free = clicks.filter((s) => s.n && s.networkFree === s.n).length;
  return `<section id="journey"><div class="wrap">
    <h2>One visitor's session</h2>
    <p class="lede">A cold landing on the pattern's home page, then ${clicks.length} in-app clicks along a fixed route; then the same route again in the same browser (the return visit). The chart adds up the wait for Complete, step by step. This is where local-first sync should show: a costlier landing, then cheaper clicks.</p>
    <div class="tiles">
      <div class="tile"><span class="k">Landing</span><span class="v">${fmtMs(first[0].complete?.median)}</span><span class="d">complete; idle at ${fmtMs(first[0].idle?.median)}</span></div>
      <div class="tile"><span class="k">Median click</span><span class="v">${fmtMs(medianOf(clicks.map((s) => s.complete?.median)))}</span><span class="d">${free} of ${clicks.length} clicks with no data request</span></div>
      <div class="tile"><span class="k">Whole session</span><span class="v">${fmtMs(last.cumulative?.median)}</span><span class="d">return visit: ${fmtMs(ret[ret.length - 1]?.cumulative?.median)}</span></div>
      ${agg.storageBytes ? `<div class="tile"><span class="k">Kept in the browser</span><span class="v">${fmtBytes(agg.storageBytes.median)}</span><span class="d">site storage after the session</span></div>` : ''}
    </div>
    ${chart}
    <div class="tbl-wrap"><table><thead><tr><th>Step</th><th>Page</th><th class="num">Complete</th><th class="num">Cumulative</th><th class="num">Data requests</th><th class="num">Data</th><th class="num">Return: complete</th><th class="num">Return: cumulative</th><th class="num">Return: requests</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></section>`;
}
const medianOf = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : null; };

function pagesSection(agg, profile) {
  const byPath = new Map();
  for (const p of agg.pages.filter((x) => x.profile === profile)) (byPath.get(p.path) || byPath.set(p.path, {}).get(p.path))[p.visit] = p;
  const main = [...byPath.values()].some((v) => v.cold) ? 'cold' : 'warm', mainName = main === 'cold' ? 'cold load' : "returning visitor's load";
  const maxComplete = Math.max(1, ...[...byPath.values()].map((v) => v[main]?.metrics.complete?.median || 0));
  const flagsOf = (v) => {
    const f = [];
    for (const [visit, p] of Object.entries(v)) {
      if (p.flags.errors) f.push(`<span class="pill bad" title="${esc(p.samples.error)}">${visit}: failed</span>`);
      if (p.flags.badStatus) f.push(`<span class="pill bad">${visit}: HTTP error</span>`);
      if (p.flags.timedOut) f.push(`<span class="pill warn">${visit}: never idle</span>`);
      if (p.flags.hydration) f.push(`<span class="pill bad">${visit}: hydration</span>`);
      if (p.flags.stale) f.push(`<span class="pill bad">click: stale</span>`);
      if (p.flags.fullLoad) f.push(`<span class="pill warn">click: full load</span>`);
      if (visit === main && p.flags.loadingSeen) f.push(`<span class="pill">sections loaded in browser</span>`);
      if (visit === 'click' && p.flags.noLink && !p.n) f.push(`<span class="pill">no link</span>`);
      if (p.flags.navStale) f.push(`<span class="pill warn">link missing after navigation</span>`);
    }
    return f.join(' ');
  };
  const rows = [...byPath.entries()].sort((a, b) => (b[1][main]?.metrics.complete?.median || 0) - (a[1][main]?.metrics.complete?.median || 0)).map(([p, v]) => {
    const c = v[main]?.metrics, w = v.warm?.metrics, k = v.click?.metrics;
    const slow = v[main]?.samples.slowest;
    const bar = c?.complete ? miniStack(v[main].phases, maxComplete, `${fmtMs(c.complete.median)}\n${phaseTip(v[main].phases)}`) : '';
    return `<tr><td class="path">${esc(p)}</td><td data-v="${c?.complete?.median ?? ''}">${bar}</td>${cell(c?.ttfb, 'ms', { range: false })}${cell(c?.fcp, 'ms', { range: false })}${cell(c?.lcp, 'ms', { range: false })}${cell(c?.usable, 'ms', { range: false })}${cell(c?.complete, 'ms')}${cell(c?.idle, 'ms', { range: false })}${cell(c?.tbt, 'ms', { range: false })}${main === 'cold' ? cell(w?.complete, 'ms') : ''}${cell(k?.usable, 'ms', { range: false })}${cell(k?.complete, 'ms')}${cell(k?.dataRequests, 'count', { range: false })}${cell(c?.bytes, 'bytes', { range: false })}${cell(c?.hydrationBytes, 'bytes', { range: false })}${cell(c?.dataRequests, 'count', { range: false })}${cell(c?.componentRequests, 'count', { range: false })}${cell(c?.duplicates, 'count', { range: false })}<td class="small">${slow ? `${fmtMs(slow.ms)} · ${fmtBytes(slow.bytes)} · ${esc(slow.what.slice(0, 120))}` : ''}</td><td>${flagsOf(v)}</td></tr>`;
  }).join('');
  return `<section id="pages"><div class="wrap">
    <h2>Every page</h2>
    <p class="lede">One row per page, slowest ${mainName} first. The bar is that load's wait until Complete, coloured by where the time went (legend above). Click a column to sort.</p>
    <input class="filter" data-for="pages-table" type="search" placeholder="Filter pages" aria-label="Filter pages">
    <div class="tbl-wrap"><table id="pages-table" data-sortable><thead><tr><th data-sort>Page</th><th data-sort>${main === 'cold' ? 'Cold load' : 'Load'}</th><th class="num" data-sort>Server responded</th><th class="num" data-sort>First paint</th><th class="num" data-sort>Main content</th><th class="num" data-sort>Usable</th><th class="num" data-sort>Complete</th><th class="num" data-sort>Idle</th><th class="num" data-sort>Blocking time</th>${main === 'cold' ? '<th class="num" data-sort>Warm: complete</th>' : ''}<th class="num" data-sort>Click: usable</th><th class="num" data-sort>Click: complete</th><th class="num" data-sort>Click: data requests</th><th class="num" data-sort>Transferred</th><th class="num" data-sort>Hydration data</th><th class="num" data-sort>Data requests</th><th class="num" data-sort>Component data requests</th><th class="num" data-sort>Duplicates</th><th>Slowest data request</th><th>Flags</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div></section>`;
}

function problemsSection(agg, profile) {
  const items = [];
  for (const p of agg.pages.filter((x) => x.profile === profile)) {
    const f = p.flags, add = (what, detail = '') => items.push(`<tr><td class="path">${esc(p.path)}</td><td>${VISIT_NAME[p.visit]}</td><td class="k">${what}</td><td class="small">${esc(detail)}</td></tr>`);
    if (f.errors) add('Did not load', p.samples.error);
    if (f.badStatus) add('HTTP error status');
    if (f.timedOut) add('Never went idle', 'still busy at the time limit');
    if (f.hydration) add('Hydration error', p.samples.console);
    else if (f.console) add('Console error', p.samples.console);
    if (f.stale) add('Stale content after a click', `from ${p.from}: the URL changed, the page did not`);
    if (f.fullLoad) add('Full document load on a click', `from ${p.from}`);
    if (f.navStale) add('Link missing after an in-app navigation', `${p.from} links to this page when loaded directly, but not after the session navigated to it`);
    if (f.orphan) add('No page links to it', 'reached only by its URL: no click measurement');
    if (p.metrics.duplicates?.median >= 1) add(`${fmtCount(p.metrics.duplicates.median)} duplicate request(s)`, p.samples.duplicate);
  }
  if (!items.length) return `<section id="problems"><div class="wrap"><h2>Problems</h2><p class="lede">None found: every visit loaded, went idle, and logged no errors.</p></div></section>`;
  return `<section id="problems"><div class="wrap"><h2>Problems</h2>
    <p class="lede">Visits that failed, never settled, logged errors, or repeated requests.</p>
    <div class="tbl-wrap"><table data-sortable><thead><tr><th data-sort>Page</th><th data-sort>Visit</th><th data-sort>What</th><th>Detail</th></tr></thead><tbody>${items.join('')}</tbody></table></div></div></section>`;
}

function singleRun(loaded) {
  const { run, visits } = loaded;
  const agg = aggregate(visits);
  const profile = run.config.profiles[0];
  const o = (v) => agg.overall[`${profile}|${v}`]?.metrics;
  const tile = (k, s, d) => `<div class="tile"><span class="k">${k}</span><span class="v">${s}</span><span class="d">${d}</span></div>`;
  const tiles = VISITS.filter((v) => o(v)).map((v) => tile(`${VISIT_NAME[v]} · complete`, fmtMs(o(v).complete.p50), `median page; 75th-percentile page ${fmtMs(o(v).complete.p75)}`)).join('');
  const f = findings(run, agg, profile);
  const thresholds = run.config.thresholds || THRESHOLDS;
  return {
    title: `Performance: ${run.pattern?.name} (${run.label})`,
    body: `<header class="top"><div class="wrap">
      <span class="eyebrow">DMS performance run · ${esc(run.label)}</span>
      <h1>${esc(run.pattern?.name)} on ${esc(run.config.target)}</h1>
      <div class="pills">${modePills(run)}</div>
      <p class="meta">${runMeta(run)}</p>
    </div></header>
    ${scoreSection(agg, profile, thresholds)}
    ${timeSection(agg, profile, thresholds)}
    <section id="overview"><div class="wrap">
      <h2>How long a visitor waits</h2>
      <div class="tiles">${tiles}</div>
      ${overviewTable(agg, profile)}
      <p class="small">Each cell: the median page, with the 75th-percentile page under it.</p>
    </div></section>
    <section id="findings"><div class="wrap"><h2>What the numbers say</h2><ul class="findings">${f.map((x) => `<li>${x}</li>`).join('')}</ul></div></section>
    ${journeySection(run, agg, profile)}
    ${pagesSection(agg, profile)}
    ${problemsSection(agg, profile)}
    <section id="reading"><div class="wrap"><h2>How to read this</h2>${DEFINITIONS}</div></section>
    <footer><div class="wrap">dms perf · ${esc(loaded.dir)}</div></footer>`,
  };
}

function comparison(base, cand, cmp) {
  const cls = (v) => (v === 'faster' ? 'faster' : v === 'slower' ? 'slower' : 'same');
  const sign = (v, f) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`);
  const modeLine = (k, name) => `<tr><td class="k">${name}</td><td>${esc(String(cmp.base.mode?.[k]))}</td><td>${esc(String(cmp.cand.mode?.[k]))}</td></tr>`;
  const summaryRows = cmp.summary.map((s) => {
    const m = metric(s.metric), f = fmt(m.unit);
    const d = s.before && s.after ? s.after.p50 - s.before.p50 : null;
    const real = s.faster + s.slower > 0;
    return `<tr><td class="k">${VISIT_NAME[s.visit]}</td><td>${esc(m.label)}</td><td class="num">${f(s.before?.p50)}</td><td class="num">${f(s.after?.p50)}</td><td class="num ${!real ? 'same' : d < 0 ? 'faster' : 'slower'}">${sign(d, f)}</td><td class="num">${f(s.before?.p75)} → ${f(s.after?.p75)}</td><td class="num faster">${s.faster}</td><td class="num slower">${s.slower}</td><td class="num same">${s.same}</td></tr>`;
  }).join('');
  const headline = cmp.summary.filter((s) => s.metric === 'complete').map((s) => {
    const d = s.after.p50 - s.before.p50;
    const word = s.faster > s.slower && s.faster > 0 ? 'faster' : s.slower > s.faster ? 'slower' : 'same';
    return `<div class="tile"><span class="k">${VISIT_NAME[s.visit]} · complete</span><span class="v ${cls(word)}">${sign(d, fmtMs)}</span><span class="d">median page ${fmtMs(s.before.p50)} → ${fmtMs(s.after.p50)} · ${s.faster} faster, ${s.slower} slower, ${s.same} no change</span></div>`;
  }).join('');
  const moversTable = (visit, dir) => {
    const list = cmp.movers[visit]?.[dir] || [];
    if (!list.length) return '';
    return `<h3>${VISIT_NAME[visit]}: ${dir === 'faster' ? 'largest gains' : 'largest losses'}</h3><div class="tbl-wrap"><table><thead><tr><th>Page</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>${list.map((r) =>
      `<tr><td class="path">${esc(r.path)}</td>${cell(r.base, 'ms')}${cell(r.cand, 'ms')}<td class="num ${dir}">${sign(r.change, fmtMs)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  let journey = '';
  const J = cmp.journey;
  if (J.sameRoute) {
    const labels = J.base.map((s) => (s.step === 0 ? 'landing' : `click ${s.step}`));
    const syncDiffers = cmp.modeDiffers.includes('sync');
    const d0 = (J.cand[0].complete?.median ?? 0) - (J.base[0].complete?.median ?? 0);
    const clicksMoved = { faster: 0, slower: 0, same: 0, missing: 0 };
    J.steps.slice(1).forEach((v) => { clicksMoved[v.verdict]++; });
    const clickGain = medianOf(J.base.slice(1).map((s, i) => (J.cand[i + 1].complete?.median ?? 0) - (s.complete?.median ?? 0)));
    journey = `<section id="journey"><div class="wrap">
      <h2>${syncDiffers ? "Sync's trade: the first load against every later one" : "One visitor's session, before and after"}</h2>
      <p class="lede">The same route in both runs: a cold landing, then ${J.base.length - 1} in-app clicks. The chart adds up the wait for Complete. ${syncDiffers ? 'Sync pays for a bootstrap on the landing so later pages read from the browser; where the lines cross is how many pages a visitor must open before that has paid off.' : ''}</p>
      <div class="tiles">
        <div class="tile"><span class="k">Landing</span><span class="v ${cls(J.steps[0]?.verdict)}">${sign(d0, fmtMs)}</span><span class="d">${fmtMs(J.base[0].complete?.median)} → ${fmtMs(J.cand[0].complete?.median)}; idle ${fmtMs(J.base[0].idle?.median)} → ${fmtMs(J.cand[0].idle?.median)}</span></div>
        <div class="tile"><span class="k">Median click</span><span class="v ${clicksMoved.faster > clicksMoved.slower ? 'faster' : clicksMoved.slower > clicksMoved.faster ? 'slower' : 'same'}">${sign(clickGain, fmtMs)}</span><span class="d">per later page · ${clicksMoved.faster} faster, ${clicksMoved.slower} slower, ${clicksMoved.same} no change</span></div>
        <div class="tile"><span class="k">Break-even</span><span class="v">${J.crossing != null ? `click ${J.crossing}` : 'never'}</span><span class="d">${J.crossing != null ? 'the cumulative lines cross here' : 'the lines do not cross on this route'}. Grey numbers are within the noise.</span></div>
      </div>
      ${lineChart([{ name: cmp.base.label, values: J.base.map((s) => s.cumulative?.median ?? null), tips: J.base.map((s) => s.path) }, { name: cmp.cand.label, values: J.cand.map((s) => s.cumulative?.median ?? null), tips: J.cand.map((s) => s.path) }], { xLabels: labels, title: 'Cumulative wait across the journey, both runs' })}
      <div class="tbl-wrap"><table><thead><tr><th>Step</th><th>Page</th><th class="num">${esc(cmp.base.label)}: complete</th><th class="num">${esc(cmp.cand.label)}: complete</th><th class="num">${esc(cmp.base.label)}: cumulative</th><th class="num">${esc(cmp.cand.label)}: cumulative</th><th class="num">Data requests</th></tr></thead><tbody>${J.base.map((s, i) =>
        `<tr><td class="k">${labels[i]}</td><td class="path">${esc(s.path)}</td>${cell(s.complete, 'ms')}${cell(J.cand[i].complete, 'ms')}${cell(s.cumulative, 'ms', { range: false })}${cell(J.cand[i].cumulative, 'ms', { range: false })}<td class="num">${fmtCount(s.dataRequests?.median)} → ${fmtCount(J.cand[i].dataRequests?.median)}</td></tr>`).join('')}</tbody></table></div>
    </div></section>`;
  }
  const aggA = aggregate(base.visits), aggB = aggregate(cand.visits);
  const profA = base.run.config.profiles[0], profB = cand.run.config.profiles[0], names = [cmp.base.label, cmp.cand.label];
  return {
    title: `Performance: ${cmp.base.label} → ${cmp.cand.label}`,
    body: `<header class="top"><div class="wrap">
      <span class="eyebrow">DMS performance comparison</span>
      <h1>${esc(cmp.base.label)} → ${esc(cmp.cand.label)}</h1>
      <p class="sub">${cmp.pagesCompared} pages measured in both runs. A change counts only when it is larger than a floor (50 ms and 5 %) and larger than half the wider of the two runs' own spreads.</p>
      <p class="meta">before: ${runMeta(base.run)}<br><br>after: ${runMeta(cand.run)}</p>
    </div></header>
    ${cmp.modeDiffers.length ? `<section><div class="wrap"><div class="callout info"><b>The two runs are in different modes:</b> ${cmp.modeDiffers.map(esc).join(', ')}. This comparison is between modes, not between versions of the code.</div></div></section>` : ''}
    ${scoreCompareSection(aggA, aggB, profA, profB, names)}
    ${timeCompareSection(aggA, aggB, profA, profB, names)}
    <section id="overview"><div class="wrap">
      <h2>Did it move?</h2>
      <div class="tiles">${headline}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Visit</th><th>Number</th><th class="num">Median page before</th><th class="num">After</th><th class="num">Change</th><th class="num">75th-percentile page</th><th class="num">Pages faster</th><th class="num">Slower</th><th class="num">No change</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
      <p class="small">"Change" is coloured only when at least one page moved by more than the noise.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Mode</th><th>${esc(cmp.base.label)}</th><th>${esc(cmp.cand.label)}</th></tr></thead><tbody>${modeLine('ssr', 'Server-rendered')}${modeLine('sync', 'Sync')}${modeLine('preload', 'Preload')}${modeLine('devBuild', 'Dev build')}</tbody></table></div>
    </div></section>
    ${journey}
    <section id="movers"><div class="wrap"><h2>Pages that moved most</h2>${VISITS.map((v) => moversTable(v, 'faster') + moversTable(v, 'slower')).join('') || '<p class="lede">No page moved by more than the noise.</p>'}</div></section>
    <section id="reading"><div class="wrap"><h2>How to read this</h2>${DEFINITIONS}</div></section>
    <footer><div class="wrap">dms perf · ${esc(base.dir)} → ${esc(cand.dir)}</div></footer>`,
  };
}

/** `loaded`: one run (its report) or two with a comparison. Returns the file written. */
export function writeReport(loaded, outFile, cmp = null) {
  const { title, body } = cmp ? comparison(loaded[0], loaded[1], cmp) : singleRun(loaded[0]);
  const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${css}</style></head>
<body>${body}<script>${SCRIPT}</script></body></html>`;
  fs.writeFileSync(outFile, html);
  return outFile;
}

export { METRICS };
