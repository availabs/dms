import React from "react"

import { GridGraph, generateTestGridData } from "./avl-graph"

import { rollups as d3rollups } from "d3-array"

const mergeData = data => {
    const keys = [];
    const merged = data.reduce((a, c) => {
        a.index = c.index;
        a[c.type] = c.value;
        keys.push(c.type);
        return a;
    }, {});
    return { data: merged, keys };
}

const GridGraphWrapper = props => {

// console.log("GridGraphWrapper::props", props);
// console.log("GridGraphWrapper::width, height", props.width, props.height);
// console.log("GridGraphWrapper::data", props.data);

    const dataFromProps = React.useMemo(() => {
        if (!props.data.length) return {};

        const rollups = d3rollups(props.data, mergeData, d => d.index);

        const keySet = new Set();
        const allData = [];

        for (const [index, { data, keys }] of rollups) {
            allData.push(data);
            keys.forEach(k => keySet.add(k));
        }

        return { data: allData, keys: [...keySet] };
    }, [props.data]);

    const [dataForGraph, setDataForGraph] = React.useState({ data: [], keys: [] });
    const randomData = React.useCallback(e => {
        setDataForGraph(generateTestGridData());
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

// console.log("GridGraphWrapper::dataForGraph", dataForGraph);
// console.log("GridGraphWrapper::hoverComp", hoverComp);

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
                <GridGraph { ...dataForGraph } { ...dataFromProps }
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

export const GridGraphOption = {
    type: "Grid",
    GraphComp: "GridGraph",
    Component: GridGraphWrapper
};