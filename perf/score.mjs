// Scores: how many pages meet a speed goal, 0-100.
//
// Three goals, per kind of visit:
//   visible   the main content is painted (LCP; for a click, Chrome's soft-navigation paint)
//   usable    the page has stopped freezing: no main-thread task over 50 ms for a second
//   complete  everything the visitor sees has arrived
// A page is "fast" under the first limit, "ok" under the second, "slow" past it.
// Score = the share of pages that are fast, plus half the share that are ok.
export const THRESHOLDS = {
  load: { visible: [2500, 4000], usable: [3500, 7000], complete: [5000, 10000] },
  click: { visible: [500, 1000], usable: [500, 1000], complete: [1000, 2500] },
};
export const GOALS = [
  { key: 'visible', name: 'See it', metric: 'lcp', what: 'main content painted' },
  { key: 'usable', name: 'Use it', metric: 'usable', what: 'the page stops freezing' },
  { key: 'complete', name: 'All there', metric: 'complete', what: 'everything has arrived' },
];
export const KINDS = [
  { visit: 'cold', name: 'First load', kind: 'load', what: 'a new visitor opens the URL' },
  { visit: 'warm', name: 'Returning load', kind: 'load', what: 'a visitor who has been here opens the URL' },
  { visit: 'click', name: 'Navigate', kind: 'click', what: 'a click from one page to another' },
];
export const grade = (ms, [fast, ok]) => (ms == null ? null : ms <= fast ? 'fast' : ms <= ok ? 'ok' : 'slow');

/** `pages`: aggregate().pages. Returns one row per kind of visit that was measured. */
export function scores(pages, profile, thresholds = THRESHOLDS) {
  return KINDS.map((k) => {
    const rows = pages.filter((p) => p.profile === profile && p.visit === k.visit);
    if (!rows.length) return null;
    const goals = GOALS.map((g) => {
      const limits = thresholds[k.kind][g.key];
      const c = { fast: 0, ok: 0, slow: 0 };
      let unmeasured = 0;
      for (const p of rows) {
        const failed = !p.n && (p.flags.errors || p.flags.timedOut);
        const gr = failed ? 'slow' : grade(p.metrics[g.metric]?.median ?? null, limits);
        if (gr) c[gr]++; else unmeasured++;
      }
      const n = c.fast + c.ok + c.slow;
      return { ...g, limits, ...c, n, unmeasured, score: n ? Math.round((100 * (c.fast + 0.5 * c.ok)) / n) : null };
    });
    return { ...k, pages: rows.length, goals };
  }).filter(Boolean);
}
