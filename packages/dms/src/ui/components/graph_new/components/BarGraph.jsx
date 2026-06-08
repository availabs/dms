import React from "react"

import { BarGraph, Legend } from "./avl-graph"

import {
	groups as d3groups
} from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const BarGraphWrapper = props => {

// console.log("BarGraphWrapper::viewData", props.viewData);
// console.log("BarGraphWrapper::columns", props.columns);
// console.log("BarGraphWrapper::width, height", props.width, props.height);

	const [indexColumn, dataColumns, categoryColumn] = React.useMemo(() => {
		const columns = Array.isArray(props.columns) ? props.columns : [];
		return [
			columns.find(c => c.target === "xAxis"),
			columns.filter(c => c.target === "yAxis"),
			columns.find(c => c.target === "categorize")
		]
	}, [props.columns]);

	const dataFromProps = React.useMemo(() => {

		if (!indexColumn || !dataColumns.length) return { data: [], keys: [] };

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
						keySet.add(type);
						bar[type] = value;
					}
				}
			}
			else {
				for (const dc of dataColumns) {
					const dcn = dc.name;
					const aggFunc = getAggFunc(dc);
					const value = aggFunc(iGroup, d => d[dcn]);
					if (value) {
						keySet.add(dcn);
						bar[dcn] = value;
					}
				}
			}
			if (Object.keys(bar).length > 1) {
				data.push(bar);
			}
		}

    const keys = [...keySet];

    if (indexColumn?.sort) {
      const sortDir = indexColumn.sort === "desc" ? -1 : 1;
      (data || []).sort((a, b) => {
          const aNaN = strictNaN(+a.index);
          const bNaN = strictNaN(+b.index);
          if (aNaN || bNaN) {
              return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;;
          }
          return (+a.index - +b.index) * sortDir;
      })
    }
    if (categoryColumn?.sort) {
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
	}, [props.viewData, indexColumn, dataColumns, categoryColumn]);

// console.log("BarGraphWrapper::highlights", highlights);

  const colors = React.useMemo(() => {
    let colors = [];

    if (props.colors?.type === "palette") {
      colors = props.colors?.value || [];
    }
    else if (props.colors?.type === "scheme") {
      colors = getColorRange(props.colors.scheme, dataFromProps.keys?.length);
    }
    return props.colors?.reverse ? colors.reverse() : colors;
  }, [props.colors, dataFromProps.keys?.length]);

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
      colors: colors,
      categories: dataFromProps.keys
    };
  }, [props.legend, colors, dataFromProps.keys]);

// console.log("BarGraphWrapper::legend", legend);

// console.log("BarGraphWrapper::hoverComp", props.hoverComp);

  const {
  	publishHoverData: publish,
  	hoverProvider: provider,
  	actions
  } = props;

	const highlights = React.useMemo(() => {

		const hhlActions = actions.filter(a => a.action === "hover_highlight");

		if (indexColumn && categoryColumn) {
			return hhlActions.reduce((a, c) => {
				if (c.column === indexColumn.name) {
					for (const v of c.value) {
						a.push({
							type: "index",
							value: v
						})
					}
				}
				else if (c.column === categoryColumn.name) {
					for (const v of c.value) {
						a.push({
							type: "key",
							value: v
						})
					}
				}
				return a;
			}, [])
		}
		else if (indexColumn && dataColumns.length) {
			return hhlActions.reduce((a, c) => {
				if (c.column === indexColumn.name) {
					for (const v of c.value) {
						a.push({
							type: "index",
							value: v
						})
					}
				}
				else {
					for (const dc of dataColumns) {
						for (const v of c.value) {
							if (dc.name === c.column) {
								a.push({
									type: "key",
									value: dc.name
								})
							}
						}
					}
				}
				return a;
			}, [])
		}
		return [];

	}, [actions, indexColumn, dataColumns, categoryColumn]);

// console.log("BarGraphWrapper::publish", publish);
// console.log("BarGraphWrapper::provider", provider);

  const onLegendEnter = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	return key => {
	  	publish({
	  		action: "hover_publish",
	  		column: provider.args?.column,
	  		value: key
	  	})
  	}
  }, [publish, provider]);

  const onLegendLeave = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	return () => publish(null);
  }, [publish, provider]);

  const InstantiatedLegend = React.useMemo(() => {
  	return !legend.show ? null : (
      <Legend { ...legend } actions={ actions }
      	onEnter={ onLegendEnter }
      	onLeave={ onLegendLeave }/>
		)
  }, [legend, actions, onLegendEnter, onLegendLeave]);

  const onBarEnter = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column !== indexColumn?.name) return null;
		return (e, data) => {
			publish({
	  		action: "hover_publish",
	  		column: provider.args?.column,
	  		value: data.index
	  	})
		}
  }, [publish, provider, indexColumn]);

  const onBarLeave = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column !== indexColumn?.name) return null;
		return () => publish(null);
  }, [publish, provider, indexColumn]);

  const onStackEnter = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column === categoryColumn?.name) {
			return (e, data) => {
				publish({
		  		action: "hover_publish",
		  		column: provider.args?.column,
		  		value: data.key
		  	})
			}
		}
		if (dataColumns.length) {
			return (e, data) => {
				const dc = dataColumns.find(dc => dc.name === provider.args?.column);
				if (dc) {
					publish({
			  		action: "hover_publish",
			  		column: provider.args?.column,
			  		value: data.data[dc.name]
			  	})
				}
			}
		}
		return null;
  }, [publish, provider, categoryColumn, dataColumns]);

  const onStackLeave = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column !== categoryColumn?.name) return null;
		return () => publish(null);
  }, [publish, provider, categoryColumn]);

	return (
    <div className="w-full bg-inherit flex">
      { !legend.show || legend.position !== "left" ? null :
      	<div className="flex items-center">
        	{ InstantiatedLegend }
        </div>
      }
      <div className="bg-inherit flex-1"
        style={ {
          height: `${ props.height }px`
        } }
      >
				<BarGraph { ...props }
					{ ...dataFromProps }
					colors={ colors }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }
					highlights={ highlights }
					onBarEnter={ onBarEnter }
					onBarLeave={ onBarLeave }
					onStackEnter={ onStackEnter }
					onStackLeave={ onStackLeave }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
      	<div className="flex items-center">
        	{ InstantiatedLegend }
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
