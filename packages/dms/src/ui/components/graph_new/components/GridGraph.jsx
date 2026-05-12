import React from "react"

import { GridGraph, Legend } from "./avl-graph"

import {
    groups as d3groups
} from "d3-array"

import { scaleLinear } from "d3-scale"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"

const GridGraphWrapper = props => {

// console.log("GridGraphWrapper::props", props);

// console.log("GridGraphWrapper::viewData", props.viewData);
// console.log("GridGraphWrapper::columns", props.columns);

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

        return { data, keys, colors };
    }, [props.viewData, props.columns]);

// console.log("GridGraphWrapper::dataFromProps", dataFromProps);

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

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      position: "top-left",
      type: "linear",
      scale: dataFromProps.colors,
      format: props.hoverComp.valueFormat
    };
  }, [props.legend, props.colors, props.hoverComp, dataFromProps]);

// console.log("GridGraphWrapper::dataForGraph", dataForGraph);
// console.log("GridGraphWrapper::hoverComp", hoverComp);
// console.log("GridGraphWrapper::colors", props.colors);

    return (
        <div className={ `
                w-full bg-inherit
                ${ legend.position.includes("-") ? "" : "flex" }
            ` }>
          { !legend.show || legend.position !== "top-left" ? null :
            <Legend { ...legend }/>
          }
          { !legend.show || legend.position !== "left" ? null :
            <Legend { ...legend }/>
          }
          <div className="bg-inherit flex-1"
            style={ {
              height: `${ props.height }px`
            } }
          >
            <GridGraph
                colors={ props.colors }
                { ...dataFromProps }
                axisBottom={ axisBottom }
                axisLeft={ axisLeft }
                margin={ margin }
                hoverComp={ props.hoverComp }
                width={ props.width }
                height={ props.height }
                bgColor={ props.bgColor }/>
          </div>
          { !legend.show || legend.position !== "right" ? null :
            <Legend { ...legend }/>
          }
        </div>
    )
}

export const GridGraphOption = {
    type: "Grid",
    GraphComp: "GridGraph",
    Component: GridGraphWrapper
};