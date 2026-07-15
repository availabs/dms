import {
	sum as d3sum,
	mean as d3mean
} from "d3-array"

import { scaleLinear } from "d3-scale"

// `exempt` = "already aggregated server-side" (e.g. a calculated column whose SQL
// does its own sum()/case, grouped by the xAxis column → one row per x). The d3 agg
// funcs take (array, accessor); the old `id = x => x` fallback ignored the accessor
// and returned the GROUP ARRAY, so a calc series came back as NaN. Pull the first
// non-empty accessed value instead — the pre-aggregated number for that x.
const first = (arr, acc) => {
	for (const d of arr) {
		const v = acc(d);
		if (v !== null && v !== undefined && v !== "") return +v;
	}
	return 0;
}
const AggFuncs = {
	sum: d3sum,
	avg: d3mean,
	count: d => d.length,
	exempt: first
}

export const getAggFunc = column => {
	const type = (column.fn || column.defaultFn || "count").toLowerCase();
	return AggFuncs?.[type] || first;
}

export const getColumnName = column => column.normalName || column.name;

// A d3 scaleLinear domain/range pair must be the same length to use every
// color — a 3-point [min, mid, max] domain against a longer palette silently
// truncates to that palette's first 3 entries (d3 zips to the shorter side).
// Spread one domain stop per color instead, so the whole palette is reachable.
// Always returns a real scaleLinear (never a bare function) — callers like
// the Legend's linear renderer call `.domain()`/`.range()` on this
// unconditionally, so degenerate cases (one color, or a constant series)
// still need a genuine scale, just with identical range endpoints.
// Per-graph minutes/seconds auto-switch (user-reported: sub-70-second travel-
// time-in-minutes values render as unreadable decimals like "0.045"). The
// unit decision is made ONCE from the graph's own domain max — not per value
// — so a single legend never mixes units; values stay expressed as minutes
// internally (the proven SPEED_EXPR/TRAVEL_TIME_EXPR two-level semantics are
// unchanged), this only affects display.
export const formatMinutesAuto = (maxMinutes) => {
	if (Number.isFinite(maxMinutes) && maxMinutes * 60 < 70) {
		return d => `${ (d * 60).toFixed(1) } sec`;
	}
	return d => `${ d.toFixed(2) } min`;
}

export const buildValueColorScale = (min, max, colors) => {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !colors?.length) return undefined;
	if (colors.length === 1) {
		return scaleLinear().domain([min, max]).range([colors[0], colors[0]]);
	}
	if (min === max) {
		const mid = colors[Math.floor((colors.length - 1) / 2)];
		return scaleLinear().domain([min, max]).range([mid, mid]);
	}
	const domain = colors.map((_, i) => min + (i * (max - min)) / (colors.length - 1));
	return scaleLinear().domain(domain).range(colors);
}