// Turns a run's raw visits into numbers per page and per visit type.
import { summarize, quantileOf } from './stats.js';

// Every number the report shows. `floor`: the smallest change `compare` treats as real.
export const METRICS = [
  { key: 'ttfb', label: 'Server responded', unit: 'ms', get: (v) => v.ms?.ttfb, floor: 50 },
  { key: 'fcp', label: 'First paint', unit: 'ms', get: (v) => v.ms?.fcp, floor: 50 },
  { key: 'lcp', label: 'Main content', unit: 'ms', get: (v) => v.ms?.lcp, floor: 50 },
  { key: 'complete', label: 'Complete', unit: 'ms', get: (v) => v.ms?.complete, floor: 50 },
  { key: 'idle', label: 'Idle', unit: 'ms', get: (v) => v.ms?.idle, floor: 50 },
  { key: 'tbt', label: 'Blocking time', unit: 'ms', get: (v) => v.tbt, floor: 50 },
  { key: 'cls', label: 'Layout shift', unit: 'score', get: (v) => v.cls, floor: 0.02 },
  { key: 'bytes', label: 'Transferred', unit: 'bytes', get: (v) => v.bytes?.total, floor: 10240 },
  { key: 'dataBytes', label: 'Data transferred', unit: 'bytes', get: (v) => v.bytes?.data, floor: 10240 },
  { key: 'hydrationBytes', label: 'Hydration data', unit: 'bytes', get: (v) => v.bytes?.hydration, floor: 10240 },
  { key: 'dataRequests', label: 'Data requests', unit: 'count', get: (v) => v.requests?.data, floor: 0.5 },
  { key: 'duplicates', label: 'Duplicate requests', unit: 'count', get: (v) => v.requests?.duplicates, floor: 0.5 },
];
export const metric = (key) => METRICS.find((m) => m.key === key);
export const VISITS = ['cold', 'warm', 'click'];

const measured = (v) => !v.error && !v.noLink && v.ms;

export function aggregate(visits) {
  // per page and visit type
  const groups = new Map();
  for (const v of visits) {
    if (!VISITS.includes(v.visit)) continue;
    const key = `${v.profile}|${v.visit}|${v.path}`;
    if (!groups.has(key)) groups.set(key, { key, profile: v.profile, visit: v.visit, path: v.path, page: v.page, rows: [] });
    groups.get(key).rows.push(v);
  }
  const pages = [...groups.values()].map((g) => {
    const ok = g.rows.filter(measured);
    const count = (fn) => g.rows.filter(fn).length;
    return {
      key: g.key, profile: g.profile, visit: g.visit, path: g.path, page: g.page, from: ok[0]?.from,
      n: ok.length,
      metrics: Object.fromEntries(METRICS.map((m) => [m.key, summarize(ok.map(m.get))])),
      flags: {
        errors: count((v) => v.error), timedOut: count((v) => v.timedOut), noLink: count((v) => v.noLink),
        stale: count((v) => v.staleContent), fullLoad: count((v) => v.fullLoad), scripted: count((v) => v.scriptedClick),
        hydration: count((v) => v.errors?.hydration > 0), console: count((v) => (v.errors?.console || 0) + (v.errors?.page || 0) > 0),
        badStatus: count((v) => v.status >= 400), networkFree: count((v) => v.networkFree),
        // a section showed its loading state: its data was fetched in the browser, not preloaded
        loadingSeen: count((v) => v.loadingSeen),
      },
      samples: { error: g.rows.find((v) => v.error)?.error, console: g.rows.find((v) => v.errors?.samples?.length)?.errors.samples[0], duplicate: ok.find((v) => v.duplicateRequests?.length)?.duplicateRequests[0] },
    };
  });

  // per visit type, across pages: the median page and the 75th-percentile page (of the page medians)
  const overall = {};
  for (const p of pages) {
    const k = `${p.profile}|${p.visit}`;
    (overall[k] ||= { profile: p.profile, visit: p.visit, pages: [] }).pages.push(p);
  }
  for (const o of Object.values(overall)) {
    const withData = o.pages.filter((p) => p.n > 0);
    o.count = withData.length;
    o.metrics = Object.fromEntries(METRICS.map((m) => {
      const med = withData.map((p) => p.metrics[m.key]?.median);
      return [m.key, { p50: quantileOf(med, 0.5), p75: quantileOf(med, 0.75), max: quantileOf(med, 1) }];
    }));
    delete o.pages;
  }

  // the journey: per pass and step
  const steps = new Map();
  for (const v of visits) {
    if (v.visit !== 'journey' || v.step == null) continue;
    const k = `${v.profile}|${v.pass}|${v.step}`;
    if (!steps.has(k)) steps.set(k, { profile: v.profile, pass: v.pass, step: v.step, path: v.path, rows: [] });
    steps.get(k).rows.push(v);
  }
  const journey = [...steps.values()].sort((a, b) => a.pass.localeCompare(b.pass) || a.step - b.step).map((s) => {
    const ok = s.rows.filter(measured);
    return {
      profile: s.profile, pass: s.pass, step: s.step, path: s.path, n: ok.length,
      complete: summarize(ok.map((v) => v.ms.complete)), idle: summarize(ok.map((v) => v.ms.idle)),
      cumulative: summarize(ok.map((v) => v.cumulative)), cumulativeIdle: summarize(ok.map((v) => v.cumulativeIdle)),
      dataRequests: summarize(ok.map((v) => v.requests?.data)), dataBytes: summarize(ok.map((v) => v.bytes?.data)),
      networkFree: ok.filter((v) => v.step > 0 && v.networkFree).length,
      problems: s.rows.filter((v) => v.error || v.noLink || v.staleContent || v.fullLoad).length,
    };
  });
  const storage = summarize(visits.filter((v) => v.visit === 'journey-end' && v.pass === 'first').map((v) => v.storageBytes));

  return { pages, overall, journey, storageBytes: storage };
}
