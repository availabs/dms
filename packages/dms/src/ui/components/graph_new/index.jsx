import React, {useEffect, useMemo} from "react";
import {isEqual} from "lodash-es";
import { groups as d3groups, range as d3range } from "d3-array"

import {GraphComponent} from "./GraphComponent";
import { ThemeContext, getComponentTheme } from '../../useTheme';
// import {getColorRange} from "./colorRange";
// import { graphTheme } from "./theme";
//import TableHeaderCell from "../table/components/TableHeaderCell";
import {strictNaN} from "./utils";


import { getColorRange } from "./colorSchemeUnifier"

// Merge the theme's brand chart defaults UNDER the section's own display settings, so a
// section with a sparse `display` inherits brand visuals (colors/margins/axes) while any
// explicit per-section setting still wins. One level of nesting (margin/xAxis/yAxis) is
// deep-merged; everything else is a shallow override. BC: a section whose `display`
// already carries these keys is unchanged.
const mergeChartDefaults = (defaults = {}, display = {}) => {
    const out = { ...defaults, ...display };
    for (const k of ["margin", "xAxis", "yAxis", "legend", "title", "colors"]) {
        if (defaults[k] && typeof defaults[k] === "object") {
            out[k] = { ...defaults[k], ...(display[k] || {}) };
        }
    }
    return out;
};

export default function Graph ({
    isEdit, columns=[], data=[], display={}, controls={}, state={}, setState=() => {}, isActive, activeStyle
}) {
    // const { theme: themeFromContext = {avlGraph: graphTheme}} = React.useContext(ThemeContext) || {};
    // const theme = {...themeFromContext, avlGraph: {...graphTheme, ...(themeFromContext.avlGraph || {})}};

  const { theme: contextTheme } = React.useContext(ThemeContext) || { theme: { avlGraph: {} } };
  const theme = getComponentTheme(contextTheme, 'avlGraph', activeStyle);

  const subCfg = state.display?._functions?.subscribers?.find(s => s.functionId === 'hover_highlight' && s.enabled);

console.log("graph_new.index::subCfg", subCfg)

// console.log("GraphNew::data", data);
// console.log("GraphNew::columns", columns);

    // data is restructured into: index, type, value.
    // index is X axis column's values.
    // type is either category column's values or Y axis column's display name or name.
    // const indexColumn = useMemo(() => columns.find(({xAxis}) => xAxis) || {}, [columns]);
    // const dataColumns = useMemo(() => columns.filter(({yAxis}) => yAxis) || [], [columns]);
    // const categoryColumn = useMemo(() => columns.find(({categorize}) => categorize) || {}, [columns]);

    // const graphData = useMemo(() => {
    //     const tmpData = [];
    //     const categories = new Set();

    //     data.forEach(row => {
    //         const index = row[indexColumn.name] && typeof row[indexColumn.name] !== 'object' && typeof row[indexColumn.name] !== 'string' ?
    //             row[indexColumn.name].toString() : row[indexColumn.name];
    //         dataColumns.forEach(dataColumn => {
    //             const value = row[dataColumn.normalName || dataColumn.name];
    //             const type = categoryColumn.name ? row[categoryColumn.name] : (dataColumn.customName || dataColumn.display_name || dataColumn.name);
    //             if (!strictNaN(value) && (index !== undefined) && type && (!display.isLog || value >= 0)) {
    //                 categories.add(type);
    //                 tmpData.push({
    //                     index: typeof index === "object" ? index.value : index,
    //                     type: typeof type === "object" ? type.value : type,
    //                     value: typeof value === "object" ? value.value : value,
    //                     // aggMethod: dataColumn.fn
    //                 });
    //             }
    //         })
    //     })

    //     if (display.useCustomXDomain && display.xDomain) {
    //         display.xDomain.forEach((domainIdx, i) => {
    //             if(!tmpData.some(d => d.index === domainIdx)) {
    //                 tmpData.splice(i, 0, { index: domainIdx, value: 0 });//, aggMethod: dataColumns[0]?.fn})
    //             }
    //         })

    //         return tmpData.filter(t => display.xDomain.some(tick => t.index === tick))
    //     }

    //     if (display.makeContinuousXDomain && (display.graphType === "LineGraph")) {

    //         const [min, max] = tmpData.reduce((a, c) => {
    //             const i = c.index;
    //             if (!strictNaN(i)) {
    //                 return [Math.min(a[0], i), Math.max(a[1], i)];
    //             }
    //             return a;
    //         }, [Infinity, -Infinity]);

    //         if ((min < Infinity) && (max > -Infinity)) {
    //             const range = d3range(min, max + 1).map(r => r.toString());
    //             const dataByType = d3groups(tmpData, d => d.type);

    //             for (const [type, data] of dataByType) {
    //                 const dataByIndex = data.reduce((a, c) => {
    //                     a[c.index] = c;
    //                     return a;
    //                 }, {});
    //                 for (const index of range) {
    //                     if (!(index in dataByIndex)) {
    //                         tmpData.push({ index, type, value: 0 })
    //                     }
    //                 }
    //             }

    //                 // .forEach((index, i) => {
    //                 //     if(!tmpData.some(d => d.index === domainIdx)) {
    //                 //         tmpData.push({ index, value: 0 })
    //                 //     }
    //                 // })
    //         }
    //     }
    //     return tmpData;
    //     // return tmpData.map(d => {
    //     //     return {
    //     //         index: typeof d.index === "object" ? d.index.value : d.index,
    //     //         type: typeof d.type === "object" ? d.type.value : d.type,
    //     //         value: typeof d.value === "object" ? d.value.value : d.value
    //     //     };
    //     // })
    // }, [indexColumn, dataColumns.length, categoryColumn, data, display.useCustomXDomain, display.xDomain, display.makeContinuousXDomain])

// console.log("GraphNew::graphData", graphData)

    // useEffect(() => {
    //     const newDomain = [...new Set(graphData.map(d => d.index))]
    //     if(!display.useCustomXDomain && !isEqual(display.xDomain, newDomain)){
    //         setState(draft => {
    //             draft.display.xDomain = newDomain;
    //         })
    //     }
    // }, [graphData]);

    // const colorPaletteSize = categoryColumn.name ? (new Set(data.map(item => item[categoryColumn.name]))).size : dataColumns.length

    // const colors = useMemo(() => ({
    //     type: "palette",
    //     value: [...getColorRange(colorPaletteSize < 20 ? colorPaletteSize : 20, "div7")]
    // }), [colorPaletteSize])

    // const indexTotals = graphData.reduce((acc, curr) => {
    //     acc[curr.index] = (acc[curr.index] || 0) + (+curr.value || 0);
    //     return acc;
    // },{})
    // const maxIndexValue = Math.max(...Object.values(indexTotals));
    // const stopPoints = [0.75, 0.5, 0.05];
    // const stopValues = stopPoints.map(p => maxIndexValue * p);

// console.log("graph::columns", columns);
// console.log("graph::data", data);
// console.log("graph::display", display);
// console.log("graph::controls", controls);
// console.log("graph::setState", setState);
// console.log("graph::isActive", isActive);
// console.log("graph::activeStyle", activeStyle);

    //console.log('graph data', graphData, columns, display)
    return (
        <>
            {
                // isEdit ? <div className={theme.headerWrapper}>
                //     {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                //         <div key={`controls-${i}`} className={theme.columnControlWrapper}>
                //             <TableHeaderCell
                //                 isEdit={isEdit}
                //                 attribute={attribute}
                //                 columns={columns}
                //                 display={display} controls={controls} setState={setState}
                //                 activeStyle={activeStyle}
                //             />
                //         </div>)}
                // </div> : null
            }
            {
                // display.showScaleFilter ?
                //     <div className={theme.scaleWrapper}>
                //         <div
                //             className={`${theme.scaleItem} ${!display?.upperLimit ? theme.scaleItemActive : theme.scaleItemInActive}`}
                //             onClick={() => setState(draft => {
                //                 draft.display.upperLimit = undefined
                //             })}>
                //             Max
                //         </div>
                //         {
                //             stopValues.map(stopValue => (
                //                 <div
                //                     key={stopValue}
                //                     className={`${theme.scaleItem} ${display?.upperLimit === stopValue ? theme.scaleItemActive : theme.scaleItemInActive}`}
                //                     onClick={() => setState(draft => {
                //                         draft.display.upperLimit = stopValue
                //                     })}>
                //                     {fnumIndex(stopValue, 0)}
                //                 </div>
                //             ))
                //         }
                //     </div> : null
            }
            <GraphComponent
                graphFormat={ mergeChartDefaults(theme?.chartDefaults, display) }
                graphType={ display.graphType }
                viewData={ data }
                columns={ columns }
                theme={theme}
            />
        </>
    )
}
