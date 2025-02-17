
import {getData} from "../spreadsheet/utils/utils";
import SpreadSheet, {SpreadSheetContext} from "../spreadsheet";
import RenderInHeaderColumnControls from "../spreadsheet/components/RenderInHeaderColumnControls";
import React, {useContext, useMemo} from "react";
import get from "lodash/get";
import {getColorRange, GraphComponent} from "./GraphComponent";

const NaNValues = ["", null]

const strictNaN = v => {
    if (NaNValues.includes(v)) return true;
    return isNaN(v);
}

const defaultTheme = ({
    headerWrapper: 'flex gap-1',
    columnControlWrapper: `w-full font-semibold border bg-gray-50 text-gray-500`
})

export const Graph = ({isEdit}) => {
    const {state:{columns, data, display}} = useContext(SpreadSheetContext);
    // data is restructured into: index, type, value.
    // index is X axis column's values.
    // type is either category column's values or Y axis column's display name or name.
    const indexColumn = useMemo(() => columns.find(({xAxis}) => xAxis), [columns]);
    const dataColumns = useMemo(() => columns.filter(({yAxis}) => yAxis), [columns]);
    const categoryColumn = useMemo(() => columns.find(({categorize}) => categorize), [columns]);
    const {headerWrapper, columnControlWrapper} = defaultTheme;

    const graphData = useMemo(() => {
        const tmpData = [];
        data.forEach(row => {
            const index = row[indexColumn.name];
            dataColumns.forEach(dataColumn => {
                const value = row[dataColumn.name];
                if(!strictNaN(value)){
                    const type = categoryColumn ? row[categoryColumn.name] : (dataColumn.customName || dataColumn.display_name || dataColumn.name)
                    tmpData.push({index, type, value, aggMethod: dataColumn.fn});
                }
            })
        })
        return tmpData
        }, [indexColumn, dataColumns.length, categoryColumn, data])


    // const colorMap = React.useMemo(() => {
    //
    //     const colorType = get(initGraphFormat, ["colors", "type"]);
    //
    //     const isPalette = ((colorType === "palette") || (colorType === "custom"));
    //
    //     if (!isPalette) return {};
    //
    //     const types = graphData.reduce((a, c) => {
    //         const type = c.type;
    //         if (!a.includes(type)) {
    //             a.push(type);
    //         }
    //         return a;
    //     }, []).sort((a, b) => a.localeCompare(b));
    //
    //     const palette = get(initGraphFormat, ["colors", "value"], []);
    //
    //     return types.reduce((a, c, i) => {
    //         a[c] = palette[i % palette.length];
    //         return a;
    //     }, {});
    // }, [graphData, initGraphFormat]);
    return (
        <>
            {
                isEdit ? <div className={headerWrapper}>
                    {[indexColumn, ...dataColumns].filter(f => f).map((attribute, i) =>
                        <div key={`controls-${i}`} className={columnControlWrapper}>
                            <RenderInHeaderColumnControls
                                isEdit={isEdit}
                                attribute={attribute}
                            />
                        </div>)}
                </div> : null
            }
            <GraphComponent
            graphFormat={ display }
            activeGraphType={{GraphComp: display.graphType} }
            viewData={ graphData }
            showCategories={ Boolean(categoryColumn) || (dataColumns.length > 1) }
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
    "EditComp": props => <SpreadSheet.EditComp {...props} compType={'graph'}/>,
    "ViewComp": props => <SpreadSheet.ViewComp {...props} compType={'graph'}/>,
}