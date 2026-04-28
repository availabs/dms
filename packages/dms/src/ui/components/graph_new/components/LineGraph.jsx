import React from "react"

import { LineGraph, generateTestLineData } from "./avl-graph"

import { rollups as d3rollups } from "d3-array"

const mergeData = data => {
	const merged = data.reduce((a, c) => {
		a.index = c.index;
		a[c.type] = c.value;
		return a;
	}, {});
	return data;
} 

const LineGraphWrapper = props => {

console.log("LineGraphWrapper::props", props);

	const dataFromProps = React.useMemo(() => {
		if (!props.data.length) return [];

		const rollups = d3rollups(props.data, mergeData, d => d.type);

		return rollups.map(([type, group]) => {
			return {
				id: type,
				data: group.map(g => ({ x: g.index, y: g.value }))
			}
		})

console.log("ROLLUPS:", rollups);

		return [];
	}, [props.data]);

console.log("LineGraphWrapper::dataFromProps", dataFromProps);

	const [dataForGraph, setDataForGraph] = React.useState([]);
	const randomData = React.useCallback(e => {
		setDataForGraph(generateTestLineData());
	}, []);
	const clearData = React.useCallback(e => {
		setDataForGraph([]);
	}, []);

// console.log("LineGraphWrapper::dataForGraph", dataForGraph);

	const colors = React.useMemo(() => {
		if (props.colors?.type === "palette") {
			return props.colors?.value || [];
		}
	}, [props.colors]);

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

	const shouldComponentUpdate = React.useMemo(() => {
		return ["width", "height"];
	}, []);

	return (
		<div className="bg-inherit">
			<div className="w-full bg-inherit"
				style={ { height: `${ height }px` } }
			>
				<LineGraph
					data={
						dataFromProps.length ? dataFromProps : dataForGraph
					}
					colors={ colors }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }
					margin={ margin }
					hoverComp={ hoverComp }
					shouldComponentUpdate={ shouldComponentUpdate }
					width={ props.width }
					height={ height }/>
			</div>
			<button
				className="bg-gray-200"
				onClick={ randomData }
			>
				random data
			</button>
			<button
				className="bg-gray-200"
				onClick={ clearData }
			>
				clear data
			</button>
		</div>
	)
}

export const LineGraphOption = {
  type: "Line Graph",
  GraphComp: "LineGraph",
  Component: LineGraphWrapper
}