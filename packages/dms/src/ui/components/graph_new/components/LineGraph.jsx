import React from "react"

import { LineGraph, Legend } from "./avl-graph"

import { groups as d3groups } from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const LineGraphWrapper = props => {

// console.log("LineGraphWrapper::props", props);

// console.log("LineGraphWrapper::viewData", props.viewData);
// console.log("LineGraphWrapper::columns", props.columns);

	const dataFromProps = React.useMemo(() => {
		const xColumn = props.columns.find(c => c.target === "xAxis");
		const yColumns = props.columns.filter(c => c.target === "yAxis");
		const idColumn = props.columns.find(c => c.target === "categorize");

		if (!xColumn || !yColumns.length) return [];

		// The dataWrapper keys each row by `normalName || name` (see
		// dataWrapper/getData.js). For a CALCULATED column `name` is the full SQL
		// expression and `normalName` is the query alias the row is actually keyed
		// on — so reading `row[name]` returns undefined and the series renders empty.
		// Resolve every series/axis value by `normalName || name`, matching Card.jsx.
		const xKey = xColumn.normalName || xColumn.name;
		const idKey = idColumn ? (idColumn.normalName || idColumn.name) : undefined;

		const data = [];

		if (idColumn) {
			const dataGroups = d3groups(props.viewData, d => d[idKey], d => d[xKey]);

			for (const [id, iGroup] of dataGroups) {

				if (id === undefined) continue;

				// In categorize mode every series shares the single yColumn's
				// per-series visuals (interpolation / area).
				const line = { id, data: [], interpolation: yColumns[0]?.interpolation };
				if (yColumns[0]?.area !== undefined) line.area = yColumns[0].area;
				for (const [x, xGroup] of iGroup) {
					if (x === undefined) continue;
					let y = 0;
					for (const yc of yColumns) {
						const ycn = yc.normalName || yc.name;
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
				if (line.data.length) {
					data.push(line);
				}
			}
		}
		else {
			const dataGroups = d3groups(props.viewData, d => d[xKey]);

			for (const yc of yColumns) {
				const ycn = yc.normalName || yc.name;
				const aggFunc = getAggFunc(yc);

				// Each yColumn is its own series; carry its per-series visuals through.
				// `displayName` flows to the hover tooltip so a calc column doesn't surface
				// its raw SQL — the d3 series key (`id`) stays the SQL-safe alias.
				const line = {
					id: ycn,
					displayName: yc.customName || yc.display_name || ycn,
					data: [],
					interpolation: yc.interpolation
				};
				if (yc.area !== undefined) line.area = yc.area;
				if (yc.color) line.color = yc.color;
				if (yc.dashArray) line.dashArray = yc.dashArray;
				if (yc.showMarks !== undefined) line.showMarks = yc.showMarks;

				for (const [x, xGroup] of dataGroups) {
					if (x === undefined) continue;
					const y = aggFunc(xGroup, d => d[ycn]);
					if (y) {
						line.data.push({ x, y })
					}
				}
				if (line.data.length) {
					data.push(line);
				}
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

    if (idColumn?.sort) {
      const sortDir = idColumn.sort === "desc" ? -1 : 1;
			(data || []).sort((a, b) => {
	      const aNaN = strictNaN(+a.index);
	      const bNaN = strictNaN(+b.index);
	      if (aNaN || bNaN) {
	        return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;
	      }
	      return (+a.index - +b.index) * sortDir;
			})
		}

		return data;
	}, [props.viewData, props.columns]);

  const colors = React.useMemo(() => {
    let colors = [];

    if (props.colors?.type === "palette") {
      colors = props.colors?.value || [];
    }
    else if (props.colors?.type === "scheme") {
      colors = getColorRange(props.colors.scheme, dataFromProps?.length);
    }
    return props.colors?.reverse ? colors.reverse() : colors;
  }, [props.colors, dataFromProps?.length]);

// console.log("LineGraphWrapper::dataFromProps", dataFromProps);

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
      type: "categorical",
      colors: colors,
      categories: dataFromProps.map(l => l.id)
    };
  }, [props.legend, colors, dataFromProps]);

// console.log("LineGraphWrapper::legend", legend);

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
				<LineGraph { ...props }
					data={ dataFromProps }
					colors={ colors }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }
					axisRight={ axisLeft }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
      	<div className="flex items-center">
        	<Legend { ...legend }/>
        </div>
      }
    </div>
	)
}

export const LineGraphOption = {
  type: "Line Graph",
  GraphComp: "LineGraph",
  Component: LineGraphWrapper
}
