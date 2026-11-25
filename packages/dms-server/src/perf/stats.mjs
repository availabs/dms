// Numbers from repeated visits. Every measurement is repeated; the report shows min, max, average and
// median, and comparisons use the median (one slow outlier moves an average, not a median).

export function summarize(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  return { n: v.length, min: v[0], max: v[v.length - 1], avg: sum / v.length, median: quantile(v, 0.5) };
}

/** `sorted` ascending. Linear interpolation between ranks. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export const quantileOf = (values, q) => quantile(values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b), q);

/**
 * Did a number move between two runs, beyond the noise?
 * A change counts only when it is larger than a floor (both an absolute amount and a share of the
 * baseline) AND larger than half the wider of the two runs' own spreads (max − min). So a page whose
 * repetitions already vary by 400 ms needs a move of more than 200 ms to count.
 */
export function verdict(base, cand, { floorAbs = 50, floorPct = 0.05 } = {}) {
  if (!base || !cand) return { change: null, verdict: 'missing' };
  const change = cand.median - base.median;
  const floor = Math.max(floorAbs, Math.abs(base.median) * floorPct);
  const noise = Math.max(base.max - base.min, cand.max - cand.min) / 2;
  const real = Math.abs(change) > floor && Math.abs(change) > noise;
  return { change, pct: base.median ? change / base.median : null, verdict: !real ? 'same' : change < 0 ? 'faster' : 'slower' };
}
