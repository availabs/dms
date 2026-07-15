import React from "react"

import { group as d3group, rollups as d3rollups } from "d3-array"
import get from "lodash/get"

import { TreemapGraph, Legend } from "./avl-graph"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const TreemapGraphWrapper = props => {

// console.log("TreemapGraphWrapper::viewData", props.viewData)
  const [indexColumn, dataColumns, categoryColumn] = React.useMemo(() => {
    return [
      props.columns.find(c => c.target === "index"),
      props.columns.filter(c => c.target === "rectangle"),
      props.columns.find(c => c.target === "categorize")
    ]
  }, [props.columns]);

  const dataFromProps = React.useMemo(() => {

    if (!indexColumn || !categoryColumn || !dataColumns.length) return [];

    const groupsArray = [d => d[indexColumn.key]];
    if (categoryColumn) {
      groupsArray.push(d => d[categoryColumn.key]);
    }

    const filteredViewData = props.viewData.filter(d => Boolean(d[indexColumn.key]));

    const reducer = d => {
      return d.reduce((a, c) => {
        return dataColumns.reduce((aa, cc) => {
          return aa + (c[cc.key] || 0.0);
        }, a)
      }, 0)
    };

    const rolled = d3rollups(filteredViewData, reducer, ...groupsArray);

    if (indexColumn.sort) {
      const sortDir = indexColumn.sort === "desc" ? -1 : 1;
      rolled.sort((a, b) => {
        const aNaN = strictNaN(+a[0]);
        const bNaN = strictNaN(+b[0]);
        if (aNaN || bNaN) {
          return (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * sortDir;
        }
        return (+a[0] - +b[0]) * sortDir;
      })
    }
    if (categoryColumn.sort) {
      const sortDir = categoryColumn.sort === "desc" ? -1 : 1;
      rolled.forEach(([i, group]) => {
        group.sort((a, b) => {
          const aNaN = strictNaN(+a[0]);
          const bNaN = strictNaN(+b[0]);
          if (aNaN || bNaN) {
            return (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * sortDir;
          }
          return (+a[0] - +b[0]) * sortDir;
        })
      })
    }

    return rolled.filter(([k, g]) => {
      return g.reduce((a, c) => a + c[1], 0);
    });

  }, [props.viewData, indexColumn, dataColumns, categoryColumn]);

// console.log("TreemapGraphWrapper::dataFromProps", dataFromProps);

  const colors = React.useMemo(() => {
    let colors = [];

    if (props.colors?.type === "palette") {
      colors = props.colors?.value || [];
    }
    else if (props.colors?.type === "scheme") {
      colors = getColorRange(props.colors.scheme, dataFromProps.length);
    }
    return props.colors?.reverse ? [...colors].reverse() : colors;
  }, [props.colors, dataFromProps]);

// console.log("TreemapGraphWrapper::colors", colors);

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

    return [];
  }, [actions, indexColumn, categoryColumn]);

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: colors,
      categories: dataFromProps.map(d => d[0])
    };
  }, [props.legend, colors, dataFromProps]);

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

  const onRectEnter = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column === indexColumn?.key) {
      return (e, data) => {
        publish({
          action: "hover_publish",
          column: provider.args?.column,
          value: data.index
        })
      }
    }
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
  }, [publish, provider, indexColumn, categoryColumn, dataColumns]);

  const onRectLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    if ((provider.args?.column !== indexColumn?.key) &&
        (provider.args?.column !== categoryColumn?.key)) return null;
    return () => publish(null);
  }, [publish, provider, indexColumn, categoryColumn]);

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
        <TreemapGraph { ...props }
          data={ dataFromProps }
          colors={ colors }
          highlights={ highlights }
          onRectEnter={ onRectEnter }
          onRectLeave={ onRectLeave }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
        <div className="flex items-center">
          { InstantiatedLegend }
        </div>
      }
    </div>
  )
}

export const TreemapGraphOption = {
  type: "Treemap Graph",
  GraphComp: "TreemapGraph",
  Component: TreemapGraphWrapper
}