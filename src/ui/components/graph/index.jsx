import React, {useEffect, useMemo} from "react";
import { ThemeContext } from '../../useTheme';
import {isEqual} from "lodash-es";
import {
    getColorRange,
    GraphComponent
} from "./GraphComponent";
import TableHeaderCell from "../table/components/TableHeaderCell";
//import {fnumIndex} from "~/modules/dms/src/patterns/page/components/selector/dataWrapper/utils/utils";
import {strictNaN, fnumIndex} from "./utils";

export const graphTheme = ({
    text: 'font-regular text-[12px]',
    darkModeText: 'bg-transparent text-white',
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
    scaleWrapper: 'flex rounded-md p-1 divide-x border w-fit',
    scaleItem: 'font-semibold text-gray-500 hover:text-gray-700 px-2 py-1'
})

const demoColumns = [
    { "name": "month", "display_name": "Month", "type": "text", "xAxis": true, show: true },
    { "name": "sales", "display_name": "Sales ($)", "type": "number", "yAxis": true, fn: 'sum', show: true },
    { "name": "region", "display_name": "Region", "type": "text" }
];


const demoData = [
    { "month": "January", "sales": 12000, "region": "North" },
    { "month": "February", "sales": 15000, "region": "South" },
    { "month": "March", "sales": 13000, "region": "East" },
    { "month": "April", "sales": 17000, "region": "West" },
    { "month": "May", "sales": 16000, "region": "North" }
];

const demoDisplay = {
    "graphType": "BarGraph",
    "groupMode": "stacked",
    "orientation": "vertical",
    "showAttribution": true,
    "title": {
        "title": "",
        "position": "start",
        "fontSize": 32,
        "fontWeight": "bold"
    },
    "description": "",
    "bgColor": "#ffffff",
    "textColor": "#000000",
    // "colors": {
    //     "type": "palette",
    //     "value": [
    //         "#D72638",
    //         "#007F5F",
    //         "#F8A100",
    //         "#38BFA7",
    //         "#8F2D56",
    //         "#E2C044",
    //         "#6A4C93",
    //         "#A8C686",
    //         "#FF5D73",
    //         "#5296A5",
    //         "#CC5803",
    //         "#F4B6C2",
    //         "#6D597A",
    //         "#2E294E",
    //         "#D4A373",
    //         "#73C2FB",
    //         "#FFDD67",
    //         "#845EC2",
    //         "#F96167",
    //         "#4B88A2"
    //     ]
    // },
    "height": 300,
    "margins": {
        "marginTop": 20,
        "marginRight": 20,
        "marginBottom": 50,
        "marginLeft": 100
    },
    // "xAxis": {
    //     "label": "",
    //     "rotateLabels": false,
    //     "showGridLines": false,
    //     "tickSpacing": 1
    // },
    // "yAxis": {
    //     "label": "",
    //     "showGridLines": true,
    //     "tickFormat": "Integer"
    // },
    "legend": {
        "show": true,
        "label": ""
    },
    "tooltip": {
        "show": true,
        "fontSize": 12
    },
    // "readyToLoad": true,
    // "xDomain": [],
    // "totalLength": 5
}

export const docs = [
    {
        columns: demoColumns,
        data: demoData,
        display: demoDisplay
    }
]

export default function ({
    isEdit, columns=[], data=[], display={}, controls={}, setState=() => {}, isActive
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

    console.log('graph data', graphData, columns, display)
    return (
        <>
            {
                isEdit ? <div className={theme.graph.headerWrapper}>
                    {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                        <div key={`controls-${i}`} className={theme.graph.columnControlWrapper}>
                            <TableHeaderCell
                                isEdit={isEdit}
                                attribute={attribute}
                                columns={columns}
                                display={display} controls={controls} setState={setState}
                            />
                        </div>)}
                </div> : null
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