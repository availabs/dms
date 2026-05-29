import {
	sum as d3sum,
	mean as d3mean
} from "d3-array"

const AggFuncs = {
	sum: d3sum,
	avg: d3mean,
	count: d => d.length
}
const id = x =>  x

export const getAggFunc = column => {
	const type = (column.fn || column.defaultFn || "count").toLowerCase();
	return AggFuncs?.[type] || id;
}
