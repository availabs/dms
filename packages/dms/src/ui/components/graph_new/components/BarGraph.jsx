import React from "react"

import { BarGraph, Legend } from "./avl-graph"

import {
	groups as d3groups,
	range as d3range
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

		if (!indexColumn || !dataColumns.length) return { keys: [] };

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

    const keys = [...keySet];

    if (indexColumn.sort) {
      const sortDir = indexColumn.sort === "desc" ? -1 : 1;
      data.sort((a, b) => {
          const aNaN = strictNaN(+a.index);
          const bNaN = strictNaN(+b.index);
          if (aNaN || bNaN) {
              return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;;
          }
          return (+a.index - +b.index) * sortDir;
      })
    }
    if (categoryColumn.sort) {
      const sortDir = categoryColumn.sort === "desc" ? -1 : 1;
      keys.sort((a, b) => {
          const aNaN = strictNaN(+a);
          const bNaN = strictNaN(+b);
          if (aNaN || bNaN) {
              return (a < b ? -1 : a > b ? 1 : 0) * sortDir;;
          }
          return (+a - +b) * sortDir;
      })
    }

		return { data, keys };
	}, [props.viewData, props.columns]);

// console.log("BarGraphWrapper::dataFromProps", dataFromProps);

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

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: props.colors,
      categories: dataFromProps.keys
    };
  }, [props.legend, props.colors, dataFromProps.keys]);

// console.log("BarGraphWrapper::legend", legend);

// console.log("BarGraphWrapper::hoverComp", props.hoverComp);

	return (
    <div className="w-full bg-inherit flex">
      { !legend.show || legend.position !== "left" ? null :
      	<div className="flex items-center">
        	<Legend { ...legend }/>
        </div>
      }
      <div className="bg-inherit flex-1"
        style={ {
          height: `${ props.height }px`
        } }
      >
				<BarGraph { ...props }
					{ ...dataFromProps }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
      	<div className="flex items-center">
        	<Legend { ...legend }/>
        </div>
      }
    </div>
	)
}

export const BarGraphOption = {
  type: "Bar Graph",
  GraphComp: "BarGraph",
  Component: BarGraphWrapper
}