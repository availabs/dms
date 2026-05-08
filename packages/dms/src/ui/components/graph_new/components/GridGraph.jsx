import React from "react"

import { GridGraph, generateTestGridData } from "./avl-graph"

import {
    groups as d3groups
} from "d3-array"

import { scaleLinear } from "d3-scale"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"

const GridGraphWrapper = props => {

// console.log("GridGraphWrapper::props", props);

console.log("GridGraphWrapper::viewData", props.viewData);
console.log("GridGraphWrapper::columns", props.columns);

    const dataFromProps = React.useMemo(() => {
        const xColumn = props.columns.find(c => c.target === "xAxis");
        const yColumn = props.columns.find(c => c.target === "yAxis");
        const colorColumns = props.columns.filter(c => c.target === "color");

        if (!xColumn || !colorColumns.length) return {};

        const data = [];
        const keySet = new Set();

        let min = Infinity;
        let max = -Infinity;

        if (yColumn) {

            const dataGroups = d3groups(props.viewData,
                                            d => d[yColumn.name],
                                            d => d[xColumn.name]
                                        );

            for (const [index, iGroup] of dataGroups) {

                if (index === undefined) continue;

                const grid = { index };

                for (const [key, kGroup] of iGroup) {

                    let value = 0;

                    for (const cc of colorColumns) {
                        const ccn = cc.name;
                        const aggFunc = getAggFunc(cc);
                        const v = aggFunc(kGroup, d => d[ccn]);
                        if (v) {
                            value += v;
                        }
                    }

                    if (value) {
                        keySet.add(key);
                        grid[key] = value;

                        min = Math.min(min, value);
                        max = Math.max(max, value);
                    }
                }

                data.push(grid);
            }

        }
        else {
            const keyGroups = d3groups(props.viewData, d => d[xColumn.name]);

            for (const cc of colorColumns) {
                const aggFunc = getAggFunc(cc);
                const ccn = cc.name;
                const grid = { index: ccn };
                for (const [key, kGroup] of keyGroups) {
                    const v = aggFunc(kGroup, d => d[ccn]);
                    if (v) {
                        keySet.add(key);
                        grid[key] = v;

                        min = Math.min(min, v);
                        max = Math.max(max, v);
                    }
                }
                data.push(grid);
            }
        }


        let colors;

        if ((min < Infinity) && (max > -Infinity)) {
            const mid = min + (max - min) * 0.5;
            colors = scaleLinear().domain([min, mid, max]).range(["green", "yellow", "red"])
        }

        const keys = [...keySet]
            .sort((a, b) => {
                const aNaN = strictNaN(+a);
                const bNaN = strictNaN(+b);
                if (aNaN || bNaN) {
                    return a < b ? -1 : a > b ? 1 : 0;
                }
                return +a - +b;
            })

        return { data, keys, colors };
    }, [props.viewData, props.columns]);

console.log("GridGraphWrapper::dataFromProps", dataFromProps);

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
        <div className="w-full bg-inherit"
            style={ { height: `${ height }px` } }
        >
            <GridGraph colors={ colors }
                { ...dataFromProps }
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

export const GridGraphOption = {
    type: "Grid",
    GraphComp: "GridGraph",
    Component: GridGraphWrapper
};