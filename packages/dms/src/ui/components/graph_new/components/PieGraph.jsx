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

  const dataFromProps = React.useMemo(() => {
    const indexColumn = props.columns.find(c => c.target === "index");
    const dataColumns = props.columns.filter(c => c.target === "slice");
    const categoryColumn = props.columns.find(c => c.target === "categorize");

    if (!(indexColumn || categoryColumn) || !dataColumns.length) return { data: [], keys: [] };

// console.log("PieGraphWrapper::indexColumn", indexColumn)
// console.log("PieGraphWrapper::dataColumns", dataColumns)
// console.log("PieGraphWrapper::categoryColumn", categoryColumn)

    const data = [];
    const keySet = new Set();

    if (indexColumn) {
      const groupsArray = [d => d[indexColumn.name]];
      if (categoryColumn) {
        groupsArray.push(d => d[categoryColumn.name])
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
              const dcn = dc.name;
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
            const dcn = dc.name;
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

      const dataGroups = d3groups(props.viewData, d => d[categoryColumn.name]);

      const pie = { index: "" };
      
      for (const [type, tGroup] of dataGroups) {
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
          pie[type] = value;
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
  }, [props.viewData, props.columns]);

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

console.log("PieGraphWrapper::dataFromProps", dataFromProps)

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: colors,
      categories: dataFromProps.keys
    };
  }, [props.legend, colors, dataFromProps.keys]);

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
        <PieGraph { ...props }
          { ...dataFromProps }
          colors={ colors }/>
      </div>
      { !legend.show || legend.position !== "right" ? null :
        <div className="flex items-center">
          <Legend { ...legend }/>
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