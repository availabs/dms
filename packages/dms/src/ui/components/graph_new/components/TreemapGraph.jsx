import React from "react"

import { group as d3group, rollups as d3rollups } from "d3-array"
import get from "lodash/get"

import { TreemapGraph, Legend } from "./avl-graph"

import { strictNaN } from "../utils"
import { getAggFunc } from "./utils"
import { getColorRange } from "../colorSchemeUnifier"

const TreemapGraphWrapper = props => {

// console.log("TreemapGraphWrapper::viewData", props.viewData)

  const dataFromProps = React.useMemo(() => {
    const indexColumn = props.columns.find(c => c.target === "index");
    const dataColumns = props.columns.filter(c => c.target === "rectangle");
    const categoryColumn = props.columns.find(c => c.target === "categorize");

    if (!indexColumn || !categoryColumn || !dataColumns.length) return [];

// console.log("TreemapGraphWrapper::indexColumn", indexColumn)
// console.log("TreemapGraphWrapper::dataColumns", dataColumns)
// console.log("TreemapGraphWrapper::categoryColumn", categoryColumn)

    const groupsArray = [d => d[indexColumn.name]];
    if (categoryColumn) {
      groupsArray.push(d => d[categoryColumn.name]);
    }

    const filteredViewData = props.viewData.filter(d => Boolean(d[indexColumn.name]));

    const reducer = d => {
      return d.reduce((a, c) => {
        return dataColumns.reduce((aa, cc) => {
          return aa + (c[cc.name] || 0.0);
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

  }, [props.viewData, props.columns]);

// console.log("TreemapGraphWrapper::dataFromProps", dataFromProps);

  const colors = React.useMemo(() => {
    let colors = [];

    if (props.colors?.type === "palette") {
      colors = props.colors?.value || [];
    }
    else if (props.colors?.type === "scheme") {
      colors = getColorRange(props.colors.scheme, dataFromProps.length);
    }
    return props.colors?.reverse ? colors.reverse() : colors;
  }, [props.colors, dataFromProps]);

// console.log("TreemapGraphWrapper::colors", colors);

  const legend = React.useMemo(() => {
    return {
      ...props.legend,
      type: "categorical",
      colors: colors,
      categories: dataFromProps.map(d => d[0])
    };
  }, [props.legend, colors, dataFromProps]);

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
        <TreemapGraph { ...props }
          data={ dataFromProps }
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

export const TreemapGraphOption = {
  type: "Treemap Graph",
  GraphComp: "TreemapGraph",
  Component: TreemapGraphWrapper
}