import React from "react"

import { GridGraph, Legend } from "./avl-graph"

import { groups as d3groups } from "d3-array"

import { scaleLinear } from "d3-scale"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const GridGraphWrapper = props => {

// console.log("GridGraphWrapper::props", props);

// console.log("GridGraphWrapper::viewData", props.viewData);
// console.log("GridGraphWrapper::columns", props.columns);
// console.log("GridGraphWrapper::colors", props.colors);

      const colors = React.useMemo(() => {
        let colors = [];

        if (props.colors?.type === "palette") {
          colors = props.colors?.value || [];
        }
        else if (props.colors?.type === "scheme") {
          colors = getColorRange(props.colors.scheme, 3);
        }
        return props.colors?.reverse ? colors.reverse() : colors;
      }, [props.colors]);

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


        let colorFunc;

        if ((min < Infinity) && (max > -Infinity)) {
            const mid = min + (max - min) * 0.5;
            colorFunc = scaleLinear().domain([min, mid, max]).range(colors);
        }

        const keys = [...keySet];

        if (xColumn.sort) {
            const sortDir = xColumn.sort === "desc" ? -1 : 1;
            keys.sort((a, b) => {
                const aNaN = strictNaN(+a);
                const bNaN = strictNaN(+b);
                if (aNaN || bNaN) {
                    return (a < b ? -1 : a > b ? 1 : 0) * sortDir;;
                }
                return (+a - +b) * sortDir;
            })
        }
        if (yColumn.sort) {
            const sortDir = xColumn.sort === "desc" ? -1 : 1;
            data.sort((a, b) => {
                const aNaN = strictNaN(+a.index);
                const bNaN = strictNaN(+b.index);
                if (aNaN || bNaN) {
                    return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;;
                }
                return (+a.index - +b.index) * sortDir;
            }).reverse()
        }

        return { data, keys, colors: colorFunc };
    }, [props.viewData, props.columns, colors]);

// console.log("GridGraphWrapper::dataFromProps", dataFromProps);

    const axisBottom = React.useMemo(() => {
        if (!props.xAxis) return false;
        return { ...props.xAxis };
    }, [props.xAxis]);

    const axisLeft = React.useMemo(() => {
        if (!props.yAxis) return false;
        return { ...props.yAxis };
    }, [props.yAxis]);

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "linear",
      orientation: ["right", "left"].includes(props.legend.position || "right") ? "vertical" : "horizontal",
      scale: dataFromProps.colors,
      format: props.hoverComp?.valueFormat
    };
  }, [props.legend, props.colors, props.hoverComp?.valueFormat, dataFromProps]);

// console.log("GridGraphWrapper::legend", legend);

// console.log("GridGraphWrapper::dataForGraph", dataForGraph);
// console.log("GridGraphWrapper::hoverComp", hoverComp);
// console.log("GridGraphWrapper::colors", props.colors);

const TopOrBottomRegex = /^top|bottom/;
const LeftOrRightRegex = /^(left|right)$/;

    return (
        <div
            className={ `
                w-full bg-inherit flex
                ${ TopOrBottomRegex.test(legend.position) ? "flex-col" : "" }
            ` }
        >
          { !legend.show || !legend.position.includes("top") ? null :
            <div
                className={ `
                    flex
                    ${ legend.position === "top-right" ? "justify-end" : "" }
                ` }
            >
                <Legend { ...legend }/>
            </div>
          }
          { !legend.show || (legend.position !== "left") ? null :
            <div className="flex items-center">
                <Legend { ...legend }/>
            </div>
          }
          <div
            className={ `
                bg-inherit
                ${ LeftOrRightRegex.test(legend.position) ? "flex-1" : "" }
            ` }
            style={ {
              height: `${ props.height }px`
            } }
          >
            <GridGraph { ...props }
                { ...dataFromProps }
                axisBottom={ axisBottom }
                axisLeft={ axisLeft }/>
          </div>
          { !legend.show || !legend.position.includes("bottom") ? null :
            <div
                className={ `
                    flex
                    ${ legend.position === "bottom-right" ? "justify-end" : "" }
                ` }
            >
                <Legend { ...legend }/>
            </div>
          }
          { !legend.show || (legend.position !== "right") ? null :
            <div className="flex items-center">
                <Legend { ...legend }/>
            </div>
          }
        </div>
    )
}

export const GridGraphOption = {
    type: "Grid",
    GraphComp: "GridGraph",
    Component: GridGraphWrapper
};