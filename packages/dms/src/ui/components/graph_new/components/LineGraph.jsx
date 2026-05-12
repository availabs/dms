import React from "react"

import { LineGraph, Legend } from "./avl-graph"

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
					if (y) {
						line.data.push({ x, y });
					}
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
					if (y) {
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
	        return a.x < b.x ? -1 : a.x > b.x ? 1 : 0;
	      }
	      return +a.x - +b.x;
			})
		})
		if (idColumn.sort) {
			data.sort((a, b) => {
	      const aNaN = strictNaN(+a.index);
	      const bNaN = strictNaN(+b.index);
	      if (aNaN || bNaN) {
	        return a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
	      }
	      return +a.index - +b.index;
			})
		}

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

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: props.colors,
      categories: dataFromProps.map(l => l.id)
    };
  }, [props.legend, props.colors, dataFromProps]);

// console.log("GraphComponent::legend", legend);

	return (
    <div className="w-full bg-inherit flex">
      { !legend.show || legend.position !== "left" ? null :
        <Legend { ...legend }/>
      }
      <div className="bg-inherit flex-1"
        style={ {
          height: `${ props.height }px`
        } }
      >
				<LineGraph
					data={ dataFromProps }
					colors={ props.colors }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }
					axisRight={ axisLeft }
					xScale={ props.xScale }
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

export const LineGraphOption = {
  type: "Line Graph",
  GraphComp: "LineGraph",
  Component: LineGraphWrapper
}