import React from "react"

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

// A categorical legend sizes to its own content (no width of its own), sitting as
// an unconstrained flex sibling of the chart's `flex-1` div. A long/unbreakable
// label (e.g. a raw SQL alias with no spaces) wins the flex-shrink negotiation —
// `min-width:auto` refuses to shrink either box below its content size, so the
// legend keeps its full natural width and the chart gets squeezed toward zero
// (the round-34 "legend/flex width-squeeze"). Capping the legend with a fixed
// `max-w` fixes it, but a STATIC cap would also clip legends that render fine
// today on other sites sharing this component. Only apply the cap once we've
// actually measured that the legend's natural (unconstrained) width would
// exceed it — a page that's fine today never flips `squeezed` and renders
// byte-identical to before this hook existed.
//
// One-directional per pass: once `squeezed` is true we stop re-measuring (the
// capped legend is smaller, so re-measuring it would find it "fits" and uncap
// it, which grows it back to natural size, which re-triggers the squeeze —
// infinite flip). `resetKey` should change whenever the legend's own content
// changes (e.g. its category list) so a genuinely different legend gets
// re-evaluated from a natural, unconstrained render. A real viewport resize
// (not one caused by our own cap toggling) is the other legitimate reason to
// re-evaluate, so a `window resize` always re-opens the natural render too.
export const useLegendSqueezeGuard = (containerRef, legendRef, { capFraction = 0.4, resetKey, enabled = true } = {}) => {
	const [squeezed, setSqueezed] = React.useState(false);

	React.useLayoutEffect(() => {
		setSqueezed(false);
	}, [resetKey, enabled]);

	// No dependency array on purpose: cheap DOM read, internally a no-op once
	// `squeezed` is true, and needs to re-check across the render(s) right
	// after `resetKey`/`enabled` flips it back to false above.
	React.useLayoutEffect(() => {
		if (!enabled || squeezed) return;
		const container = containerRef.current;
		const legend = legendRef.current;
		if (!container || !legend) return;
		const containerWidth = container.getBoundingClientRect().width;
		const legendWidth = legend.getBoundingClientRect().width;
		if (containerWidth > 0 && legendWidth > containerWidth * capFraction) {
			setSqueezed(true);
		}
	});

	React.useEffect(() => {
		const onResize = () => setSqueezed(false);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	return enabled && squeezed;
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