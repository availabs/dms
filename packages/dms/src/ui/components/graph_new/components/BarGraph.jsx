import React from "react"

import { BarGraph, generateTestBarData } from "./avl-graph"

import { rollups as d3rollups } from "d3-array"

const mergeIndex = data => {
	const keys = [];
	const merged = data.reduce((a, c) => {
		a.index = c.index;
		a[c.type] = c.value;
		keys.push(c.type);
		return a;
	}, {});
	return { data: merged, keys };
}

const BarGraphWrapper = props => {

// console.log("BarGraphWrapper::data", props.data);
// console.log("BarGraphWrapper::width, height", props.width, props.height);

	const dataFromProps = React.useMemo(() => {
		if (!props.data.length) return {};

		// const filteredData = props.data.filter(d => d.index !== undefined);

		const rollups = d3rollups(props.data, mergeIndex, d => `${ d.index }`);

		const keySet = new Set();
		const allData = [];

		for (const [index, { data, keys }] of rollups) {
			allData.push(data);
			keys.forEach(k => keySet.add(k));
		}

		return { data: allData, keys: [...keySet] };
	}, [props.data]);

// console.log("BarGraphWrapper::dataFromProps", dataFromProps);

	const [dataForGraph, setDataForGraph] = React.useState({ data: [], keys: [] });
	const randomData = React.useCallback(e => {
		setDataForGraph(generateTestBarData());
	}, []);
	const clearData = React.useCallback(e => {
		setDataForGraph({ data: [], keys: [] });
	}, []);

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
			...props.tooltip,
			valueFormat: props.yAxis.format
		};
	}, [props.tooltip, props.yAxis]);

// console.log("BarGraphWrapper::dataForGraph", dataForGraph);
// console.log("BarGraphWrapper::hoverComp", hoverComp);

	const shouldComponentUpdate = React.useMemo(() => {
		return ["width", "height"];
	}, []);

	return (
		<div className="bg-inherit">
			<div className="w-full bg-inherit"
				style={ { height: `${ height }px` } }
			>
				<BarGraph { ...dataForGraph } { ...dataFromProps }
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

export const BarGraphOption = {
  type: "Bar Graph",
  GraphComp: "BarGraph",
  Component: BarGraphWrapper
}