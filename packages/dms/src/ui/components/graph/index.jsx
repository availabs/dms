import React, {useEffect, useMemo} from "react";
import { ThemeContext } from '../../useTheme';
import {isEqual} from "lodash-es";
import {
    getColorRange,
    GraphComponent
} from "./GraphComponent";
//import TableHeaderCell from "../table/components/TableHeaderCell";
import {strictNaN, fnumIndex} from "./utils";


export default function ({
    isEdit, columns=[], data=[], display={}, controls={}, setState=() => {}, isActive, activeStyle
}) {
    const { theme: themeFromContext = {graph: graphTheme}} = React.useContext(ThemeContext) || {};
    const theme = {...themeFromContext, graph: {...graphTheme, ...(themeFromContext.graph || {})}};

    // data is restructured into: index, type, value.
    // index is X axis column's values.
    // type is either category column's values or Y axis column's display name or name.
    const indexColumn = useMemo(() => columns.find(({xAxis}) => xAxis) || {}, [columns]);
    const dataColumns = useMemo(() => columns.filter(({yAxis}) => yAxis) || [], [columns]);
    const categoryColumn = useMemo(() => columns.find(({categorize}) => categorize) || {}, [columns]);

    const graphData = useMemo(() => {
        const tmpData = [];
        data.forEach(row => {
            const index = row[indexColumn.name] && typeof row[indexColumn.name] !== 'object' && typeof row[indexColumn.name] !== 'string' ?
                row[indexColumn.name].toString() : row[indexColumn.name];
            dataColumns.forEach(dataColumn => {
                const value = row[dataColumn.normalName || dataColumn.name];
                const type = categoryColumn.name ? row[categoryColumn.name] : (dataColumn.customName || dataColumn.display_name || dataColumn.name)

                if(!strictNaN(value) && type && (!display.isLog || value > 0)){
                    tmpData.push({index, type, value, aggMethod: dataColumn.fn});
                }
            })
        })

        if(display.useCustomXDomain && display.xDomain){
            (display.xDomain)
                .forEach((domainIdx, i) => {
                    if(!tmpData.some(d => d.index === domainIdx)){
                        tmpData.splice(i, 0, {index: domainIdx, value: 0, aggMethod: dataColumns[0]?.fn})
                    }
                })

            return tmpData.filter(t => display.xDomain.some(tick => t.index === tick))
        }
        return tmpData
    }, [indexColumn, dataColumns.length, categoryColumn, data, display.useCustomXDomain, display.xDomain])

    useEffect(() => {
        const newDomain = [...new Set(graphData.map(d => d.index))]
        if(!display.useCustomXDomain && !isEqual(display.xDomain, newDomain)){
            setState(draft => {
                draft.display.xDomain = newDomain;
            })
        }
    }, [graphData]);

    const colorPaletteSize = categoryColumn.name ? (new Set(data.map(item => item[categoryColumn.name]))).size : dataColumns.length

    const colors = useMemo(() => ({
        type: "palette",
        value: [...getColorRange(colorPaletteSize < 20 ? colorPaletteSize : 20, "div7")]
    }), [colorPaletteSize])

    const indexTotals = graphData.reduce((acc, curr) => {
        acc[curr.index] = (acc[curr.index] || 0) + (+curr.value || 0);
        return acc;
    },{})
    const maxIndexValue = Math.max(...Object.values(indexTotals));
    const stopPoints = [0.75, 0.5, 0.05];
    const stopValues = stopPoints.map(p => maxIndexValue * p)

    //console.log('graph data', graphData, columns, display)
    return (
        <>
            {
                // isEdit ? <div className={theme.graph.headerWrapper}>
                //     {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                //         <div key={`controls-${i}`} className={theme.graph.columnControlWrapper}>
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
            {display.showScaleFilter ? <div className={theme.graph.scaleWrapper}>
                <div
                    className={`${theme.graph.scaleItem} ${!display?.upperLimit ? theme.graph.scaleItemActive : theme.graph.scaleItemInActive}`}
                    onClick={() => setState(draft => {
                        draft.display.upperLimit = undefined
                    })}>
                    Max
                </div>
                {
                    stopValues.map(stopValue => (
                        <div
                            key={stopValue}
                            className={`${theme.graph.scaleItem} ${display?.upperLimit === stopValue ? theme.graph.scaleItemActive : theme.graph.scaleItemInActive}`}
                            onClick={() => setState(draft => {
                                draft.display.upperLimit = stopValue
                            })}>
                            {fnumIndex(stopValue, 0)}
                        </div>
                    ))
                }
            </div> : null}
            <GraphComponent
                graphFormat={ {...display, colors} }
                activeGraphType={{GraphComp: display.graphType} }
                viewData={ graphData }
                showCategories={ Boolean(categoryColumn.name) || (dataColumns.length > 1) }
                xAxisColumn={ indexColumn }
                yAxisColumns={ dataColumns }
                theme={theme}
            />
        </>
    )
}
