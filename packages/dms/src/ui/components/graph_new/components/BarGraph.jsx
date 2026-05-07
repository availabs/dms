import React from "react"

import { BarGraph, generateTestBarData } from "./avl-graph"

import {
	groups as d3groups
} from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"

const BarGraphWrapper = props => {

// console.log("BarGraphWrapper::viewData", props.viewData);
// console.log("BarGraphWrapper::columns", props.columns);
// console.log("BarGraphWrapper::width, height", props.width, props.height);

	const dataFromProps = React.useMemo(() => {
		const indexColumn = props.columns.find(c => c.target === "xAxis");
		const dataColumns = props.columns.filter(c => c.target === "yAxis");
		const categoryColumn = props.columns.find(c => c.target === "categorize");

		if (!indexColumn || !dataColumns.length) return {};

// console.log("BarGraphWrapper::indexColumn", indexColumn)
// console.log("BarGraphWrapper::dataColumns", dataColumns)
// console.log("BarGraphWrapper::categoryColumn", categoryColumn)

		const groupsArray = [d => d[indexColumn.name]];
		if (categoryColumn) {
			groupsArray.push(d => d[categoryColumn.name])
		}

		const dataGroups = d3groups(props.viewData, ...groupsArray);

		const data = [];
		const keySet = new Set();

		for (const [index, iGroup] of dataGroups) {

			if (index === undefined) continue;

// console.log("index", index, iGroup.length)

			const bar = { index };

			if (categoryColumn) {
				for (const [type, tGroup] of iGroup) {
					keySet.add(type);
					let value = 0;
					for (const dc of dataColumns) {
						const dcn = dc.name;
						const aggFunc = getAggFunc(dc);
						const v = aggFunc(tGroup, d => d[dcn]);
						if (v) {
							value += v;
						}
					}
					if (value) {
						bar[type] = value;
					}
				}
			}
			else {
				for (const dc of dataColumns) {
					const dcn = dc.name;
					keySet.add(dcn);
					const aggFunc = getAggFunc(dc);
					const value = aggFunc(iGroup, d => d[dcn]);
					if (value) {
						bar[dcn] = value;
					}
				}
			}
			if (Object.keys(bar).length > 1) {
				data.push(bar);
			}
		}

		return { data, keys: [...keySet] };
	}, [props.viewData, props.columns]);

// console.log("BarGraphWrapper::dataFromProps", dataFromProps);

	const colors = React.useMemo(() => {
		if (props.colors?.type === "palette") {
			return props.colors?.value || [];
		}
	}, [props.colors]);

	const axisBottom = React.useMemo(() => {
		if (props.orientation === "vertical") {
			if (!props.xAxis) return false;
			return { ...props.xAxis };
		}
		else {
			if (!props.yAxis) return false;
			return { ...props.yAxis };
		}
	}, [props.orientation, props.xAxis, props.yAxis]);

	const axisLeft = React.useMemo(() => {
		if (props.orientation === "vertical") {
			if (!props.yAxis) return false;
			return { ...props.yAxis };
		}
		else {
			if (!props.xAxis) return false;
			return { ...props.xAxis };
		}
	}, [props.orientation, props.xAxis, props.yAxis]);

// console.log("BarGraphWrapper::axisLeft", axisLeft);

	const margin = React.useMemo(() => {
		return {
			top: props.margins?.marginTop || 20,
			right: props.margins?.marginRight || 20,
			bottom: props.margins.marginBottom || 50,
			left: props.margins?.marginLeft || 100
		}
	}, [props.margins]);

	const height = React.useMemo(() => {
		return Math.max(margin.top + margin.bottom + 100, props.height);
	}, [props.height, margin.top, margin.bottom]);

	const hoverComp = React.useMemo(() => {
		return {
			...props.tooltip
		};
	}, [props.tooltip, props.yAxis]);

// console.log("BarGraphWrapper::dataForGraph", dataForGraph);
// console.log("BarGraphWrapper::hoverComp", hoverComp);

	const shouldComponentUpdate = React.useMemo(() => {
		return ["width", "height"];
	}, []);

	return (
		<div className="w-full bg-inherit"
			style={ { height: `${ height }px` } }
		>
			<BarGraph { ...dataFromProps }
				orientation={ props.orientation }
				colors={ colors }
				groupMode={ props.groupMode }
				axisBottom={ axisBottom }
				axisLeft={ axisLeft }
				margin={ margin }
				hoverComp={ hoverComp }
				shouldComponentUpdate={ shouldComponentUpdate }
				width={ props.width }
				height={ height }/>
		</div>
	)
}

export const BarGraphOption = {
  type: "Bar Graph",
  GraphComp: "BarGraph",
  Component: BarGraphWrapper
}