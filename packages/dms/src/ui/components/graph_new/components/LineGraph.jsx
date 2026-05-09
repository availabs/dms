import React from "react"

import { LineGraph, generateTestLineData } from "./avl-graph"

import {
	groups as d3groups
} from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"

const LineGraphWrapper = props => {

// console.log("LineGraphWrapper::props", props);

// console.log("LineGraphWrapper::viewData", props.viewData);
// console.log("LineGraphWrapper::columns", props.columns);

	const dataFromProps = React.useMemo(() => {
		const xColumn = props.columns.find(c => c.target === "xAxis");
		const yColumns = props.columns.filter(c => c.target === "yAxis");
		const idColumn = props.columns.find(c => c.target === "categorize");

		if (!xColumn || !yColumns.length) return [];

		const data = [];

		if (idColumn) {
			const dataGroups = d3groups(props.viewData, d => d[idColumn.name], d => d[xColumn.name]);

			for (const [id, iGroup] of dataGroups) {

				if (id === undefined) continue;

				const line = { id, data: [] };
				for (const [x, xGroup] of iGroup) {
					if (x === undefined) continue;
					let y = 0;
					for (const yc of yColumns) {
						const ycn = yc.name;
						const aggFunc = getAggFunc(yc);
						const v = aggFunc(xGroup, d => d[ycn]);
						if (!strictNaN(v)) {
							y += v;
						}
					}
					line.data.push({ x, y });
				}
				data.push(line);
			}
		}
		else {
			const dataGroups = d3groups(props.viewData, d => d[xColumn.name]);

			for (const yc of yColumns) {
				const ycn = yc.name;
				const aggFunc = getAggFunc(yc);

				const line = { id: ycn, data: [] };

				for (const [x, xGroup] of dataGroups) {
					if (x === undefined) continue;
					const y = aggFunc(xGroup, d => d[ycn]);
					if (!strictNaN(y)) {
						line.data.push({ x, y })
					}
				}
				data.push(line);
			}
		}

		data.forEach(d => {
			d.data.sort((a, b) => {
	      const aNaN = strictNaN(+a.x);
	      const bNaN = strictNaN(+b.x);
	      if (aNaN || bNaN) {
	        return a < b ? -1 : a > b ? 1 : 0;
	      }
	      return +a.x - +b.x;
			})
		})

		return data;
	}, [props.viewData, props.columns]);

// console.log("LineGraphWrapper::dataFromProps", dataFromProps);

	const axisBottom = React.useMemo(() => {
		if (!props.xAxis) return false;
		return { ...props.xAxis };
	}, [props.xAxis]);

	const axisLeft = React.useMemo(() => {
		if (!props.yAxis) return false;
		return { ...props.yAxis };
	}, [props.yAxis]);

	const margin = React.useMemo(() => {
		return {
			top: props.margins?.marginTop || 20,
			right: props.margins?.marginRight || 20,
			bottom: props.margins.marginBottom || 50,
			left: props.margins?.marginLeft || 100
		}
	}, [props.margins]);

	const hoverComp = React.useMemo(() => {
		return { ...props.tooltip };
	}, [props.tooltip]);

	const height = React.useMemo(() => {
		return Math.max(margin.top + margin.bottom + 100, props.height);
	}, [props.height, margin.top, margin.bottom,]);

	return (
		<div className="w-full bg-inherit"
			style={ { height: `${ height }px` } }
		>
			<LineGraph
				data={ dataFromProps }
				colors={ props.colors }
				axisBottom={ axisBottom }
				axisLeft={ axisLeft }
				axisRight={ axisLeft }
				xScale={ props.xScale }
				margin={ margin }
				hoverComp={ hoverComp }
				width={ props.width }
				height={ height }/>
		</div>
	)
}

export const LineGraphOption = {
  type: "Line Graph",
  GraphComp: "LineGraph",
  Component: LineGraphWrapper
}