import React, {useContext, useEffect, useMemo} from "react";
import {isEqual} from "lodash-es";
import {CMSContext, ComponentContext} from "../../../../context";
import {fnumIndex} from "../../dataWrapper/utils/utils";
import {duplicateControl} from "../shared/utils";
import TableHeaderCell from "../../../../../../ui/components/table/components/TableHeaderCell";

import {getColorRange, GraphComponent} from "./GraphComponent";
import AppearanceControls from "./controls/AppearanceControls";
import {ThemeContext} from "../../../../../../ui/useTheme";

const NaNValues = ["", null]

const strictNaN = v => {
    if (NaNValues.includes(v)) return true;
    return isNaN(v);
}

export const graphTheme = ({
    text: 'font-regular text-[12px]',
    darkModeText: 'bg-transparent text-white',
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
    scaleWrapper: 'flex rounded-md p-1 divide-x border w-fit',
    scaleItem: 'font-semibold text-gray-500 hover:text-gray-700 px-2 py-1'
})

// export const graphTheme = ({
//     text: 'font-regular text-[12px] flex flex-row flex-row-reverse',
//     headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
//     columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
//
//     scaleWrapper: 'flex rounded-[8px] divide-x border w-fit border-[#E0EBF0] overflow-hidden',
//     scaleItem: 'px-[12px] py-[7px] font-[Oswald] font-medium text-[12px] text-[#2D3E4C] text-center leading-[100%] tracking-[0px] uppercase cursor-pointer',
//     scaleItemActive: 'bg-white',
//     scaleItemInActive: 'bg-[#F3F8F9]',
// })

const Graph = ({isEdit}) => {
    const {state:{columns, data, display}, setState, controls={}} = useContext(ComponentContext);
    const { theme = { graph: graphTheme } } = React.useContext(ThemeContext) || {};
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
            yAxisColumns={ dataColumns }/>
        </>
    )
}

const DefaultPalette = getColorRange(20, "div7");
const graphOptions = {
    graphType: 'BarGraph',
    groupMode: 'stacked',
    orientation: 'vertical',
    showAttribution: true,
    title: {
        title: "",
        position: "start",
        fontSize: 32,
        fontWeight: "bold"
    },
    description: "",
    bgColor: "#ffffff",
    textColor: "#000000",
    colors: {
        type: "palette",
        value: [...DefaultPalette]
    },
    height: 300,
    width: undefined,
    margins: {
        marginTop: 20,
        marginRight: 20,
        marginBottom: 50,
        marginLeft: 100
    },
    xAxis: {
        label: "",
        rotateLabels: false,
        showGridLines: false,
        tickSpacing: 1
    },
    yAxis: {
        label: "",
        showGridLines: true,
        tickFormat: "Integer"
    },
    legend: {
        show: true,
        label: "",
    },
    tooltip: {
        show: true,
        fontSize: 12
    }
}
const defaultState = {
    dataRequest: {},
    columns: [],
    data: [],
    display: graphOptions,
    sourceInfo: { columns: [] }
}

export default {
    "name": 'Graph',
    "type": 'Graph',
    "variables": [],
    useDataSource: true,
    fullDataLoad: true,
    useGetDataOnPageChange: false,
    showPagination: false,
    defaultState,
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn', disabled: ({attribute}) => !attribute.yAxis || !attribute.show,
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'toggle', label: 'X Axis', key: 'xAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.yAxis || attribute.categorize) return;

                    // turn off other xAxis columns
                    state.columns.forEach(column => {
                        // if xAxis true, for original column set to true. for others false.
                        column.xAxis = value ? column.name === attribute.name : value;
                        // if turning xAxis off, and not original column, check their category settings.
                        column.group = column.name === attribute.name ? value : column.categorize;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.categorize;
                    })

                }},
            {type: 'toggle', label: 'Y Axis', key: 'yAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.categorize) return;

                    // update default function and add Y Axis column to "show"
                    const defaultFn = state.columns[columnIdx].defaultFn?.toLowerCase();
                    state.columns[columnIdx].fn = value ? (['sum', 'count'].includes(defaultFn) ? defaultFn : 'count') : ''
                    state.columns[columnIdx].show = value;
                }},
            {type: 'toggle', label: 'Categorize', key: 'categorize', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.yAxis) return;

                    // turn off other Category columns
                    state.columns.forEach(column => {
                        // if Category true, for original column set to true. for others false.
                        column.categorize = value ? column.name === attribute.name : value;
                        // if turning Category off, and not original column, check their xAxis settings.
                        column.group = column.name === attribute.name ? value : column.xAxis;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.xAxis;
                    })
                }},

            {type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]},
            duplicateControl
        ],
        appearance: {Comp: AppearanceControls},
        inHeader: [
            {type: 'select', label: 'Sort', key: 'sort',
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated', value: 'comma'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                ]},
        ]
    },
    "EditComp": Graph,
    "ViewComp": Graph,
}