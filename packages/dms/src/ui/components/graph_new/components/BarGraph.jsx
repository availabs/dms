import React from "react"

import { BarGraph, Legend } from "./avl-graph"

import {
	groups as d3groups
} from "d3-array"

import { strictNaN } from "../utils"
import { getAggFunc, buildValueColorScale, useLegendSqueezeGuard } from "./utils"
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

		if (!indexColumn || !dataColumns.length) return { data: [], keys: [], min: Infinity, max: -Infinity };

// console.log("BarGraphWrapper::indexColumn", indexColumn)
// console.log("BarGraphWrapper::dataColumns", dataColumns)
// console.log("BarGraphWrapper::categoryColumn", categoryColumn)

		const groupsArray = [d => d[indexColumn.key]];
		if (categoryColumn) {
			groupsArray.push(d => d[categoryColumn.key])
		}

		const dataGroups = d3groups(props.viewData, ...groupsArray);

		const data = [];
		const keySet = new Set();
		let min = Infinity;
		let max = -Infinity;

		for (const [index, iGroup] of dataGroups) {

			if (index === undefined) continue;

// console.log("index", index, iGroup.length)

			const bar = { index };

			if (categoryColumn) {
				for (const [type, tGroup] of iGroup) {
					let value = 0;
					let hasValue = false;
					for (const dc of dataColumns) {
						const dcn = dc.key;
						const aggFunc = getAggFunc(dc);
						const v = aggFunc(tGroup, d => d[dcn]);
						if (!strictNaN(v)) {
							value += v;
							hasValue = true;
						}
					}
					if (hasValue) {
						keySet.add(type);
						bar[type] = value;
						min = Math.min(min, value);
						max = Math.max(max, value);
					}
				}
			}
			else {
				for (const dc of dataColumns) {
					const dcn = dc.key;
					const aggFunc = getAggFunc(dc);
					const value = aggFunc(iGroup, d => d[dcn]);
					if (!strictNaN(value)) {
						keySet.add(dcn);
						bar[dcn] = value;
						min = Math.min(min, value);
						max = Math.max(max, value);
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

		return { data, keys, min, max };
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
    if (props.colors?.reverse) {
      colors = [...colors].reverse();
    }
    // Default coloring is per-series (one color per key/route) — the common
    // case for a multi-series comparison bar graph. `byValue` opts a
    // single-series magnitude chart (e.g. "more delay = darker") into a
    // per-bar scale instead, mirroring GridGraph's value-scaled coloring.
    // Deliberately no array fallback here: the Legend's linear renderer calls
    // `scale.domain()` on whatever this returns, so before data loads (when
    // min/max aren't finite yet) this must stay undefined, not a plain array.
    if (props.colors?.byValue) {
      // byValueSymmetric centers the scale on zero (±max(|min|, |max|)), so
      // "no change" lands on the middle color and equal-magnitude positive/
      // negative values get equal intensity — for difference/diverging charts
      // (the old NPMRDS Route Difference Graph's symmetric quantize ramp).
      if (props.colors?.byValueSymmetric) {
        const m = Math.max(Math.abs(dataFromProps.min), Math.abs(dataFromProps.max));
        return buildValueColorScale(-m, m, colors);
      }
      return buildValueColorScale(dataFromProps.min, dataFromProps.max, colors);
    }
    return colors;
  }, [props.colors, dataFromProps.keys?.length, dataFromProps.min, dataFromProps.max]);

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

  // Series-mode keys are column aliases (normalName — often a raw SQL alias like
  // "tons_share"), which read terribly in a legend or tooltip. Show the column's
  // custom/display name instead. Categorize-mode keys are data VALUES and pass
  // through unchanged. Shared by the legend and the hover tooltip below.
  const labelForKey = React.useCallback(key => {
    const dc = dataColumns.find(c => (c.normalName || c.key || c.name) === key || c.key === key);
    return dc?.customName || dc?.display_name || key;
  }, [dataColumns]);

  const legend = React.useMemo(() => {
    if (props.colors?.byValue) {
      // `colors` is the scaleLinear built above, not a plain array — same
      // shape GridGraph's linear legend already consumes.
      return {
        ...props.legend,
        type: "linear",
        orientation: ["right", "left"].includes(props.legend.position || "right") ? "vertical" : "horizontal",
        scale: colors,
        format: props.hoverComp?.valueFormat
      };
    }
    return {
      ...props.legend,
      type: "categorical",
      colors: colors,
      categories: dataFromProps.keys.map(labelForKey)
    };
  }, [props.legend, colors, dataFromProps.keys, labelForKey, props.colors?.byValue, props.hoverComp?.valueFormat]);

  // Mirror labelForKey into the tooltip's key column, same as LineGraph's
  // displayName — otherwise DefaultHoverComp's keyFormat defaults to Identity
  // and the tooltip shows the raw SQL alias the legend already fixed.
  const hoverComp = React.useMemo(() => {
    return { ...props.hoverComp, keyFormat: labelForKey };
  }, [props.hoverComp, labelForKey]);

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
				if (c.column === indexColumn.key) {
					for (const v of c.value) {
						a.push({
							type: "index",
							value: v
						})
					}
				}
				else if (c.column === categoryColumn.key) {
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
				if (c.column === indexColumn.key) {
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
							if (dc.key === c.column) {
								a.push({
									type: "key",
									value: dc.key
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

  // Only the categorical legend (per-series names) is unbounded-width content
  // that can squeeze the chart — the byValue linear legend is a fixed pixel
  // width by design (see Legend.jsx's SizeMap), same shape GridGraph already
  // ships safely. Scope the guard to the diagnosed case only.
  const containerRef = React.useRef(null);
  const legendRef = React.useRef(null);
  const squeezed = useLegendSqueezeGuard(containerRef, legendRef, {
  	resetKey: legend.categories?.join("|"),
  	enabled: legend.show && legend.type === "categorical"
  });
  const legendWrapClass = squeezed ? "flex items-center max-w-[40%] min-w-0 overflow-hidden" : "flex items-center";

  const onBarEnter = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column !== indexColumn?.key) return null;
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
  	if (provider.args?.column !== indexColumn?.key) return null;
		return () => publish(null);
  }, [publish, provider, indexColumn]);

  const onStackEnter = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column === categoryColumn?.key) {
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
				const dc = dataColumns.find(dc => dc.key === provider.args?.column);
				if (dc) {
					publish({
			  		action: "hover_publish",
			  		column: provider.args?.column,
			  		value: data.data[dc.key]
			  	})
				}
			}
		}
		return null;
  }, [publish, provider, categoryColumn, dataColumns]);

  const onStackLeave = React.useMemo(() => {
  	if (!publish || !provider) return null;
  	if (provider.args?.column !== categoryColumn?.key) return null;
		return () => publish(null);
  }, [publish, provider, categoryColumn]);

	return (
    <div className="w-full bg-inherit flex" ref={ containerRef }>
      { !legend.show || legend.position !== "left" ? null :
      	<div className={ legendWrapClass } ref={ legendRef }>
        	{ InstantiatedLegend }
        </div>
      }
      <div className="bg-inherit flex-1 min-w-0"
        style={ {
          height: `${ props.height }px`
        } }
      >
				<BarGraph { ...props }
					{ ...dataFromProps }
					colors={ colors }
					axisBottom={ axisBottom }
					axisLeft={ axisLeft }
					hoverComp={ hoverComp }
					highlights={ highlights }
					onBarEnter={ onBarEnter }
					onBarLeave={ onBarLeave }
					onStackEnter={ onStackEnter }
					onStackLeave={ onStackLeave }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
      	<div className={ legendWrapClass } ref={ legendRef }>
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
