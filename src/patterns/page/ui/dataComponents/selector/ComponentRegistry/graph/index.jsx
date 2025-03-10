import React, {useContext, useEffect, useMemo} from "react";
import {getData} from "../shared/dataWrapper/utils";
import SpreadSheet, {ComponentContext} from "../shared/dataWrapper";
import TableHeaderCell from "../spreadsheet/components/TableHeaderCell";
import {get} from "lodash-es";
import {getColorRange, GraphComponent} from "./GraphComponent";

const NaNValues = ["", null]

const strictNaN = v => {
    if (NaNValues.includes(v)) return true;
    return isNaN(v);
}

const defaultTheme = ({
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`
})

const Graph = ({isEdit}) => {
    const {state:{columns, data, display}, setState} = useContext(ComponentContext);
    // data is restructured into: index, type, value.
    // index is X axis column's values.
    // type is either category column's values or Y axis column's display name or name.
    const indexColumn = useMemo(() => columns.find(({xAxis}) => xAxis) || {}, [columns]);
    const dataColumns = useMemo(() => columns.filter(({yAxis}) => yAxis) || [], [columns]);
    const categoryColumn = useMemo(() => columns.find(({categorize}) => categorize) || {}, [columns]);
    const {headerWrapper, columnControlWrapper} = defaultTheme;

    const graphData = useMemo(() => {
        const tmpData = [];
        data.forEach(row => {
            const index = row[indexColumn.name] && typeof row[indexColumn.name] !== 'object' && typeof row[indexColumn.name] !== 'string' ?
                            row[indexColumn.name].toString() : row[indexColumn.name];
            dataColumns.forEach(dataColumn => {
                const value = row[dataColumn.name];
                const type = categoryColumn.name ? row[categoryColumn.name] : (dataColumn.customName || dataColumn.display_name || dataColumn.name)

                if(!strictNaN(value) && type){
                    tmpData.push({index, type, value, aggMethod: dataColumn.fn});
                }
            })
        })
        return tmpData
        }, [indexColumn, dataColumns.length, categoryColumn, data])

    const colorPaletteSize = categoryColumn.name ? (new Set(data.map(item => item[categoryColumn.name]))).size : dataColumns.length

    const colors = useMemo(() => ({
        type: "palette",
        value: [...getColorRange(colorPaletteSize < 20 ? colorPaletteSize : 20, "div7")]
    }), [colorPaletteSize])


    return (
        <>
            {
                isEdit ? <div className={headerWrapper}>
                    {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                        <div key={`controls-${i}`} className={columnControlWrapper}>
                            <TableHeaderCell
                                isEdit={isEdit}
                                attribute={attribute}
                            />
                        </div>)}
                </div> : null
            }
            <GraphComponent
            graphFormat={ {...display, colors} }
            activeGraphType={{GraphComp: display.graphType} }
            viewData={ graphData }
            showCategories={ Boolean(categoryColumn.name) || (dataColumns.length > 1) }
            xAxisColumn={ indexColumn }
            yAxisColumns={ dataColumns }/>
        </>
    )
}

export default {
    "name": 'Graph',
    "type": 'Graph',
    "variables": [],
    getData,
    useDataSource: true,
    fullDataLoad: true,
    useGetDataOnPageChange: false,
    showPagination: false,
    "EditComp": Graph,
    "ViewComp": Graph,
}