import {
	sum as d3sum,
	mean as d3mean
} from "d3-array"

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