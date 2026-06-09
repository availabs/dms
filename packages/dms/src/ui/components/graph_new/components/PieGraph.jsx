import React from "react"

import {
  groups as d3groups
} from "d3-array"
import get from "lodash/get"

import { PieGraph, Legend } from "./avl-graph"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const PieGraphWrapper = props => {

  const [indexColumn, dataColumns, categoryColumn] = React.useMemo(() => {
    return [
      props.columns.find(c => c.target === "index"),
      props.columns.filter(c => c.target === "slice"),
      props.columns.find(c => c.target === "categorize")
    ]
  }, [props.columns]);

// console.log("PieGraphWrapper::indexColumn, dataColumns, categoryColumn", indexColumn, dataColumns, categoryColumn);

  const dataFromProps = React.useMemo(() => {

    // if (!(indexColumn || categoryColumn) || !dataColumns.length) return { data: [], keys: [] };

    const data = [];
    const keySet = new Set();

    if (indexColumn) {
      const groupsArray = [d => d[indexColumn.key]];
      if (categoryColumn) {
        groupsArray.push(d => d[categoryColumn.key])
      }

      const dataGroups = d3groups(props.viewData, ...groupsArray);

      for (const [index, iGroup] of dataGroups) {

        if (index === undefined) continue;

  // console.log("index", index, iGroup.length)

        const pie = { index };

        if (categoryColumn) {
          for (const [type, tGroup] of iGroup) {
            let value = 0;
            for (const dc of dataColumns) {
              const dcn = dc.key;
              const aggFunc = getAggFunc(dc);
              const v = aggFunc(tGroup, d => d[dcn]);
              if (v) {
                value += v;
              }
            }
            if (value) {
              keySet.add(type);
              pie[type] = value;
            }
          }
        }
        else {
          for (const dc of dataColumns) {
            const dcn = dc.key;
            const aggFunc = getAggFunc(dc);
            const value = aggFunc(iGroup, d => d[dcn]);
            if (value) {
              keySet.add(dcn);
              pie[dcn] = value;
            }
          }
        }
        if (Object.keys(pie).length > 1) {
          data.push(pie);
        }
      }
    }
    else if (categoryColumn) {

      const dataGroups = d3groups(props.viewData, d => d[categoryColumn.key]);

      const pie = { index: "" };

      for (const [type, tGroup] of dataGroups) {
        let value = 0;
        for (const dc of dataColumns) {
          const dcn = dc.key;
          const aggFunc = getAggFunc(dc);
          const v = aggFunc(tGroup, d => d[dcn]);
          if (v) {
            value += v;
          }
        }
        if (value) {
          keySet.add(type);
          pie[type] = value;
        }
      }
      if (Object.keys(pie).length > 1) {
        data.push(pie);
      }
    }
    else if (dataColumns.length) {

      const pie = { index: "" };

      for (const dc of dataColumns) {
        const dcn = dc.key;
        const aggFunc = getAggFunc(dc);
        const value = aggFunc(props.viewData, d => d[dcn]);
        if (value) {
          keySet.add(dcn);
          pie[dcn] = value;
        }
      }

      if (Object.keys(pie).length > 1) {
        data.push(pie);
      }
    }

    const keys = [...keySet];

    data.forEach(d => {
      d.sum = keys.reduce((a, c) => a + get(d, c, 0), 0);
    });

    if (indexColumn?.sort) {
      const sortDir = indexColumn.sort === "desc" ? -1 : 1;
      data.sort((a, b) => {
          const aNaN = strictNaN(a.index);
          const bNaN = strictNaN(b.index);
          if (aNaN || bNaN) {
              return (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) * sortDir;;
          }
          return (+a.index - +b.index) * sortDir;
      })
    }
    if (categoryColumn?.sort) {
      const sortDir = categoryColumn.sort === "desc" ? -1 : 1;
      keys.sort((a, b) => {
          const aNaN = strictNaN(a);
          const bNaN = strictNaN(b);
          if (aNaN || bNaN) {
              return (a < b ? -1 : a > b ? 1 : 0) * sortDir;;
          }
          return (+a - +b) * sortDir;
      })
    }

    return { data, keys };
  }, [props.viewData, indexColumn, dataColumns, categoryColumn]);

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

// console.log("PieGraphWrapper::dataFromProps", dataFromProps)

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
    else if (categoryColumn && dataColumns.length) {
      return hhlActions.reduce((a, c) => {
        if (c.column === categoryColumn.key) {
          for (const v of c.value) {
            a.push({
              type: "key",
              value: v
            })
          }
        }
        return a;
      }, []);
    }
    return [];

  }, [actions, indexColumn, dataColumns, categoryColumn]);

// console.log("PieGraphWrapper::highlights", highlights);

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: colors,
      categories: dataFromProps.keys
    };
  }, [props.legend, colors, dataFromProps.keys]);

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

  const onPieEnter = React.useMemo(() => {
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

  const onPieLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== indexColumn?.key) return null;
    return () => publish(null);
  }, [publish, provider, indexColumn]);

  const onSliceEnter = React.useMemo(() => {
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

  const onSliceLeave = React.useMemo(() => {
    if (!publish || !provider) return null;
    if (provider.args?.column !== categoryColumn?.key) return null;
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
        <PieGraph { ...props }
          { ...dataFromProps }
          colors={ colors }
          highlights={ highlights }
          onPieEnter={ onPieEnter }
          onPieLeave={ onPieLeave }
          onSliceEnter={ onSliceEnter }
          onSliceLeave={ onSliceLeave }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
        <div className="flex items-center">
          { InstantiatedLegend }
        </div>
      }
    </div>
  )
}

export const PieGraphOption = {
  type: "Pie Graph",
  GraphComp: "PieGraph",
  Component: PieGraphWrapper
}